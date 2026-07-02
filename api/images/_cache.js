import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../_helpers.js";

let supabaseAdmin = null;
let warnedMissingServiceKey = false;

function getAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) {
    if (!warnedMissingServiceKey) {
      warnedMissingServiceKey = true;
      console.warn(
        "[image-resolve-cache] SUPABASE_SERVICE_ROLE_KEY absente — cache Supabase désactivé ; " +
          "le resolver Wikidata/Commons risque d’être rate-limité (429). Ajoutez la clé service-role " +
          "en local (.env) et sur Vercel."
      );
    }
    return null;
  }
  supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAdmin;
}

/**
 * @param {string} labelNormalized
 * @param {import('../../lib/images/types.js').ImageKind} kind
 */
export async function readCacheByLabel(labelNormalized, kind) {
  const db = getAdmin();
  if (!db || !labelNormalized || !kind) return null;
  const { data, error } = await db
    .from("image_resolve_cache")
    .select("*")
    .eq("label_normalized", labelNormalized)
    .eq("kind", kind)
    .maybeSingle();
  if (error || !data?.image_url) return null;
  return mapRow(data);
}

/**
 * @param {string} entityId
 * @param {import('../../lib/images/types.js').ImageKind} kind
 */
export async function readCacheByEntity(entityId, kind) {
  const db = getAdmin();
  if (!db || !entityId || !kind) return null;
  const { data, error } = await db
    .from("image_resolve_cache")
    .select("*")
    .eq("entity_id", entityId)
    .eq("kind", kind)
    .limit(1)
    .maybeSingle();
  if (error || !data?.image_url) return null;
  return mapRow(data);
}

function mapRow(row) {
  /** @type {import('../../lib/images/types.js').ResolvedImage} */
  return {
    url: String(row.image_url || "").trim(),
    source: /** @type {import('../../lib/images/types.js').ImageSource} */ (row.source || "fallback"),
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    cached: true,
    attribution: {
      author: row.author || undefined,
      license: row.license || undefined,
      licenseUrl: row.license_url || undefined,
      sourceUrl: row.source_url || undefined,
    },
  };
}

/**
 * @param {Object} p
 * @param {string} p.labelNormalized
 * @param {import('../../lib/images/types.js').ImageKind} p.kind
 * @param {string} [p.entityId]
 * @param {import('../../lib/images/types.js').ImageCandidate} p.candidate
 */
export async function writeCache({ labelNormalized, kind, entityId, candidate }) {
  const db = getAdmin();
  if (!db) return false;
  const row = {
    label_normalized: labelNormalized,
    kind,
    entity_id: entityId || null,
    image_url: candidate.url,
    source: candidate.source,
    author: candidate.author || null,
    license: candidate.license || null,
    license_url: candidate.licenseUrl || null,
    source_url: candidate.sourceUrl || null,
    width: candidate.width || null,
    height: candidate.height || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("image_resolve_cache").upsert(row, {
    onConflict: "label_normalized,kind",
  });
  return !error;
}

export function isCacheConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}
