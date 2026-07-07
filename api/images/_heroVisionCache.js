import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../_helpers.js";

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

export function isHeroVisionCacheConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

/**
 * @param {string} imageUrl
 * @param {string} destinationLabel
 */
export function heroVisionCacheKey(imageUrl, destinationLabel) {
  const url = String(imageUrl || "").trim();
  const dest = String(destinationLabel || "").trim().toLowerCase();
  return `${dest}::${url}`;
}

/**
 * @param {string} imageUrl
 * @param {string} destinationLabel
 */
export async function readHeroVisionCache(imageUrl, destinationLabel) {
  const db = getAdmin();
  if (!db || !imageUrl) return null;
  const key = heroVisionCacheKey(imageUrl, destinationLabel);
  const { data, error } = await db
    .from("hero_vision_cache")
    .select("*")
    .eq("cache_key", key)
    .maybeSingle();
  if (error) {
    if (String(error.code) === "42P01") return null;
    console.error(`[hero-vision-cache] read failed: ${error.message}`);
    return null;
  }
  if (!data) return null;
  const reasons = Array.isArray(data.reasons) ? data.reasons.map(String) : [];
  return {
    vision: {
      verdict: String(data.verdict || "acceptable"),
      shows: String(data.shows || "other"),
      reasons,
    },
    cold: {
      suspicionScore: Number(data.cold_suspicion) || 0,
    },
    policy: String(data.policy || "accept"),
    model: data.model ? String(data.model) : "",
    cached: true,
    judgedAt: data.judged_at,
  };
}

/**
 * @param {Object} p
 * @param {string} p.imageUrl
 * @param {string} p.destinationLabel
 * @param {{ verdict?: string, shows?: string, reasons?: string[] }} p.vision
 * @param {{ suspicionScore?: number }} [p.cold]
 * @param {string} [p.policy]
 * @param {string} [p.model]
 */
export async function writeHeroVisionCache({
  imageUrl,
  destinationLabel,
  vision,
  cold,
  policy,
  model,
}) {
  const db = getAdmin();
  if (!db || !imageUrl) return { ok: false, error: "not_configured" };
  const cacheKey = heroVisionCacheKey(imageUrl, destinationLabel);
  const row = {
    cache_key: cacheKey,
    image_url: String(imageUrl),
    destination_label: String(destinationLabel || ""),
    verdict: String(vision?.verdict || "acceptable"),
    shows: vision?.shows ? String(vision.shows) : null,
    reasons: Array.isArray(vision?.reasons) ? vision.reasons : [],
    cold_suspicion: Number(cold?.suspicionScore) || 0,
    policy: policy ? String(policy) : null,
    model: model ? String(model) : null,
    judged_at: new Date().toISOString(),
  };
  const { error } = await db.from("hero_vision_cache").upsert(row, { onConflict: "cache_key" });
  if (error) {
    if (String(error.code) === "42P01") return { ok: false, error: "table_missing" };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
