import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../_helpers.js";
import { ensureStoredHeroImageUrl } from "../../lib/images/commonsThumbUrl.js";

/** @typedef {'hit' | 'miss' | 'disabled'} ImageCacheField */

let supabaseAdmin = null;
let cacheDisabledReason = null;
let loggedCacheDisabled = false;

/**
 * @param {import('@supabase/supabase-js').PostgrestError | { message?: string, code?: string } | null | undefined} error
 */
function formatSupabaseCacheError(error) {
  if (!error) return "unknown Supabase error";
  const code = String(error.code || "").trim();
  const msg = String(error.message || error).trim();
  if (code === "42P01" || /relation .* does not exist/i.test(msg)) {
    return `table public.image_resolve_cache does not exist — run supabase/sql/image_resolve_cache.sql (${msg})`;
  }
  return msg || code || "unknown Supabase error";
}

function logCacheDisabled(reason) {
  cacheDisabledReason = reason;
  if (!loggedCacheDisabled) {
    loggedCacheDisabled = true;
    console.error(`[image-cache] DISABLED: ${reason}`);
  }
}

function getAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) {
    logCacheDisabled(
      !key
        ? "SUPABASE_SERVICE_ROLE_KEY missing (set in .env.local and Vercel Production)"
        : "SUPABASE_URL missing"
    );
    return null;
  }
  supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAdmin;
}

/** Appelé au début de chaque résolution — log une fois si le cache est indisponible. */
export function noteCacheStatusAtResolveStart() {
  if (!isCacheConfigured()) {
    getAdmin();
    return /** @type {ImageCacheField} */ ("disabled");
  }
  if (cacheDisabledReason) {
    return /** @type {ImageCacheField} */ ("disabled");
  }
  return /** @type {ImageCacheField} */ ("miss");
}

/**
 * @param {string} labelNormalized
 * @param {import('../../lib/images/types.js').ImageKind} kind
 * @returns {Promise<{ entry: import('../../lib/images/types.js').ResolvedImage|null, cache: ImageCacheField }>}
 */
export async function readCacheByLabel(labelNormalized, kind) {
  const db = getAdmin();
  if (!db || !labelNormalized || !kind) {
    return { entry: null, cache: "disabled" };
  }
  const { data, error } = await db
    .from("image_resolve_cache")
    .select("*")
    .eq("label_normalized", labelNormalized)
    .eq("kind", kind)
    .maybeSingle();
  if (error) {
    const formatted = formatSupabaseCacheError(error);
    const code = String(error.code || "").trim();
    if (code === "42P01" || /relation .* does not exist/i.test(formatted)) {
      logCacheDisabled(formatted);
      return { entry: null, cache: "disabled" };
    }
    console.error(`[image-cache] read failed (label): ${formatted}`);
    return { entry: null, cache: "miss" };
  }
  if (!data?.image_url) {
    return { entry: null, cache: "miss" };
  }
  return { entry: mapRow(data), cache: "hit" };
}

/**
 * @param {string} entityId
 * @param {import('../../lib/images/types.js').ImageKind} kind
 * @returns {Promise<{ entry: import('../../lib/images/types.js').ResolvedImage|null, cache: ImageCacheField }>}
 */
export async function readCacheByEntity(entityId, kind) {
  const db = getAdmin();
  if (!db || !entityId || !kind) {
    return { entry: null, cache: "disabled" };
  }
  const { data, error } = await db
    .from("image_resolve_cache")
    .select("*")
    .eq("entity_id", entityId)
    .eq("kind", kind)
    .limit(1)
    .maybeSingle();
  if (error) {
    const formatted = formatSupabaseCacheError(error);
    const code = String(error.code || "").trim();
    if (code === "42P01" || /relation .* does not exist/i.test(formatted)) {
      logCacheDisabled(formatted);
      return { entry: null, cache: "disabled" };
    }
    console.error(`[image-cache] read failed (label): ${formatted}`);
    return { entry: null, cache: "miss" };
  }
  if (!data?.image_url) {
    return { entry: null, cache: "miss" };
  }
  return { entry: mapRow(data), cache: "hit" };
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
    image_url: ensureStoredHeroImageUrl(candidate.url, kind),
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
  if (error) {
    logCacheDisabled(`upsert failed — ${formatSupabaseCacheError(error)}`);
    return false;
  }
  return true;
}

export function isCacheConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

/**
 * @param {string[]} labelNormalizedList
 * @param {import('../../lib/images/types.js').ImageKind} [kind]
 */
export async function purgeImageResolveCacheByLabels(labelNormalizedList, kind = "hero") {
  const db = getAdmin();
  if (!db) return { deleted: 0, error: "cache_disabled" };
  const labels = (Array.isArray(labelNormalizedList) ? labelNormalizedList : []).filter(Boolean);
  if (!labels.length) return { deleted: 0 };
  const { error, count } = await db
    .from("image_resolve_cache")
    .delete({ count: "exact" })
    .eq("kind", kind)
    .in("label_normalized", labels);
  if (error) return { deleted: 0, error: formatSupabaseCacheError(error) };
  return { deleted: count || 0 };
}

/**
 * @param {string} entityId
 * @param {import('../../lib/images/types.js').ImageKind} [kind]
 */
export async function purgeImageResolveCacheByEntity(entityId, kind = "hero") {
  const db = getAdmin();
  if (!db || !entityId) return { deleted: 0, error: "cache_disabled" };
  const { error, count } = await db
    .from("image_resolve_cache")
    .delete({ count: "exact" })
    .eq("kind", kind)
    .eq("entity_id", entityId);
  if (error) return { deleted: 0, error: formatSupabaseCacheError(error) };
  return { deleted: count || 0 };
}
