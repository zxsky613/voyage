import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../_helpers.js";
import { ensureStoredHeroImageUrl } from "../../lib/images/commonsThumbUrl.js";

let supabaseAdmin = null;

function getAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;
  supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAdmin;
}

export function isHeroOverridesConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

/**
 * @param {string} labelNormalized
 * @param {import('../../lib/images/types.js').ImageKind} [kind]
 */
export async function readHeroOverride(labelNormalized, kind = "hero") {
  const db = getAdmin();
  if (!db || !labelNormalized) return null;
  const { data, error } = await db
    .from("hero_overrides")
    .select("*")
    .eq("label_normalized", labelNormalized)
    .eq("kind", kind)
    .maybeSingle();
  if (error) {
    if (String(error.code) === "42P01") return null;
    console.error(`[hero-overrides] read failed: ${error.message}`);
    return null;
  }
  if (!data) return null;
  const banned = Array.isArray(data.banned_urls)
    ? data.banned_urls.map(String).filter(Boolean)
    : [];
  return {
    labelNormalized: String(data.label_normalized),
    kind: String(data.kind || kind),
    forcedImageUrl: data.forced_image_url ? String(data.forced_image_url).trim() : "",
    bannedUrls: banned,
    note: data.note ? String(data.note) : "",
  };
}

/**
 * @param {string} url
 * @param {string[]} bannedUrls
 */
export function isHeroUrlBanned(url, bannedUrls) {
  const u = String(url || "").trim();
  if (!u) return false;
  const list = Array.isArray(bannedUrls) ? bannedUrls : [];
  return list.some((b) => {
    const ban = String(b || "").trim();
    return ban && (u === ban || u.includes(ban) || ban.includes(u));
  });
}

/**
 * @param {Object} p
 * @param {string} p.labelNormalized
 * @param {import('../../lib/images/types.js').ImageKind} [p.kind]
 * @param {string} [p.forcedImageUrl]
 * @param {string[]} [p.bannedUrls]
 * @param {string} [p.note]
 */
export async function upsertHeroOverride({ labelNormalized, kind = "hero", forcedImageUrl, bannedUrls, note }) {
  const db = getAdmin();
  if (!db || !labelNormalized) return { ok: false, error: "not_configured" };

  const existing = await readHeroOverride(labelNormalized, kind);
  const row = {
    label_normalized: labelNormalized,
    kind,
    forced_image_url: forcedImageUrl != null ? forcedImageUrl || null : existing?.forcedImageUrl || null,
    banned_urls: bannedUrls != null ? bannedUrls : existing?.bannedUrls || [],
    note: note != null ? note || null : existing?.note || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from("hero_overrides").upsert(row, {
    onConflict: "label_normalized,kind",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * @param {string} labelNormalized
 * @param {string} banUrl
 * @param {import('../../lib/images/types.js').ImageKind} [kind]
 */
export async function banHeroUrl(labelNormalized, banUrl, kind = "hero") {
  const existing = (await readHeroOverride(labelNormalized, kind)) || {
    bannedUrls: [],
    forcedImageUrl: "",
  };
  const next = [...new Set([...(existing.bannedUrls || []), String(banUrl || "").trim()].filter(Boolean))];
  return upsertHeroOverride({
    labelNormalized,
    kind,
    forcedImageUrl: existing.forcedImageUrl,
    bannedUrls: next,
  });
}

/**
 * @param {string} labelNormalized
 * @param {import('../../lib/images/types.js').ImageKind} [kind]
 */
export async function clearHeroOverride(labelNormalized, kind = "hero") {
  const db = getAdmin();
  if (!db) return { ok: false, error: "not_configured" };
  const { error } = await db
    .from("hero_overrides")
    .delete()
    .eq("label_normalized", labelNormalized)
    .eq("kind", kind);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** @param {import('../../lib/images/types.js').ImageKind} [kind] @param {number} [limit] */
export async function listHeroOverrides(kind = "hero", limit = 500) {
  const db = getAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("hero_overrides")
    .select("*")
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

/**
 * @param {string} labelNormalized
 * @param {import('../../lib/images/types.js').ImageKind} kind
 * @param {import('../../lib/images/types.js').ResolvedImage} image
 */
export function buildForcedHeroResolved(labelNormalized, kind, image) {
  const url = ensureStoredHeroImageUrl(String(image.url || ""), kind);
  return {
    url,
    source: /** @type {import('../../lib/images/types.js').ImageSource} */ ("commons-category"),
    heroSource: /** @type {import('../../lib/images/types.js').HeroSource} */ ("override"),
    cached: false,
    attribution: image.attribution,
  };
}
