import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../../api/_helpers.js";
import { normalizeKeyPart } from "../images/normalizeLabel.js";

export const HIGHLIGHTS_LIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * @param {string} destinationLabel
 * @param {string} [uiLang]
 */
export function normalizeDestinationHighlightsKey(destinationLabel, uiLang = "fr") {
  const dest = normalizeKeyPart(destinationLabel);
  const lang = normalizeKeyPart(String(uiLang || "fr").slice(0, 2));
  return `${dest}|${lang}`;
}

/**
 * @param {string} destinationLabel
 * @param {string} uiLang
 */
export async function readDestinationHighlightsCache(destinationLabel, uiLang = "fr") {
  const db = getAdmin();
  const cacheKey = normalizeDestinationHighlightsKey(destinationLabel, uiLang);
  if (!db || !cacheKey) return null;
  const { data, error } = await db
    .from("destination_highlights_cache")
    .select("*")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  const updated = data.updated_at ? Date.parse(String(data.updated_at)) : 0;
  if (updated && Date.now() - updated > HIGHLIGHTS_LIST_TTL_MS) return null;
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  return {
    highlights,
    tripAdvisorCalls: Number(data.trip_advisor_calls) || 0,
    cached: true,
  };
}

/**
 * Lecture cache highlights même périmé — repli guide quand FSQ/OSM en panne.
 * @param {string} destinationLabel
 * @param {string} uiLang
 */
export async function readDestinationHighlightsCacheStale(destinationLabel, uiLang = "fr") {
  const db = getAdmin();
  const cacheKey = normalizeDestinationHighlightsKey(destinationLabel, uiLang);
  if (!db || !cacheKey) return null;
  const { data, error } = await db
    .from("destination_highlights_cache")
    .select("*")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  if (!highlights.length) return null;
  return {
    highlights,
    tripAdvisorCalls: Number(data.trip_advisor_calls) || 0,
    cached: true,
    stale: true,
  };
}

/**
 * @param {string} destinationLabel
 * @param {string} uiLang
 * @param {object[]} highlights
 * @param {number} tripAdvisorCalls
 */
export async function writeDestinationHighlightsCache(
  destinationLabel,
  uiLang,
  highlights,
  tripAdvisorCalls = 0
) {
  const db = getAdmin();
  const cacheKey = normalizeDestinationHighlightsKey(destinationLabel, uiLang);
  if (!db || !cacheKey) return false;
  const { error } = await db.from("destination_highlights_cache").upsert(
    {
      cache_key: cacheKey,
      destination_label: String(destinationLabel || "").trim(),
      ui_lang: String(uiLang || "fr").slice(0, 2),
      highlights: Array.isArray(highlights) ? highlights : [],
      trip_advisor_calls: Math.max(0, Number(tripAdvisorCalls) || 0),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cache_key" }
  );
  if (error) {
    console.warn("[destination-highlights-cache] write failed:", error.message || error);
    return false;
  }
  return true;
}
