import { createClient } from "@supabase/supabase-js";
import { cacheRawNameMatchesPlace, reasonableNameMatch } from "../../lib/planner/placeNameMatch.js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../_helpers.js";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UNVERIFIED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** @param {string} status */
function enrichmentQualityRank(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "verified") return 3;
  if (s === "partial") return 2;
  if (s === "unverified") return 1;
  return 0;
}

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
    return `table public.place_enrichment_cache does not exist — run supabase/sql/place_enrichment_cache.sql (${msg})`;
  }
  return msg || code || "unknown Supabase error";
}

function logCacheDisabled(reason) {
  cacheDisabledReason = reason;
  if (!loggedCacheDisabled) {
    loggedCacheDisabled = true;
    console.error(`[place-enrichment-cache] DISABLED: ${reason}`);
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

export function normalizePlaceCacheKey(name, city) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return {
    place_name_normalized: norm(name),
    city_normalized: norm(city),
  };
}

function cacheTtlForStatus(status) {
  return String(status || "").trim().toLowerCase() === "unverified"
    ? UNVERIFIED_CACHE_TTL_MS
    : CACHE_TTL_MS;
}

function mapRow(row) {
  if (!row) return null;
  const updated = row.updated_at ? Date.parse(String(row.updated_at)) : 0;
  const ttl = cacheTtlForStatus(row.status);
  if (updated && Date.now() - updated > ttl) return null;
  return {
    locationId: row.location_id || undefined,
    status: row.status,
    source: row.source,
    rating: row.rating != null ? Number(row.rating) : undefined,
    numReviews: row.num_reviews != null ? Number(row.num_reviews) : undefined,
    tripTypeScores: row.trip_types || undefined,
    priceLevel: row.price_level != null ? Number(row.price_level) : undefined,
    latitude: row.latitude != null ? Number(row.latitude) : undefined,
    longitude: row.longitude != null ? Number(row.longitude) : undefined,
    tripadvisorUrl: row.tripadvisor_url || undefined,
    photos: Array.isArray(row.photo_urls) ? row.photo_urls : [],
    name: row.raw_name || undefined,
    fsqId: row.fsq_place_id ? String(row.fsq_place_id) : undefined,
    cached: true,
  };
}

/**
 * @param {string} name
 * @param {string} city
 */
export async function readPlaceEnrichmentCache(name, city) {
  const db = getAdmin();
  const keys = normalizePlaceCacheKey(name, city);
  if (!db || !keys.place_name_normalized) return null;
  const { data, error } = await db
    .from("place_enrichment_cache")
    .select("*")
    .eq("place_name_normalized", keys.place_name_normalized)
    .eq("city_normalized", keys.city_normalized)
    .maybeSingle();
  if (error) {
    const formatted = formatSupabaseCacheError(error);
    const code = String(error.code || "").trim();
    if (code === "42P01" || /relation .* does not exist/i.test(formatted)) {
      logCacheDisabled(formatted);
    } else {
      console.error(`[place-enrichment-cache] read failed: ${formatted}`);
    }
    return null;
  }
  if (!data) return null;
  const placeName = String(name || "").trim();
  const rawName = String(data.raw_name || "").trim();
  // Poison / mismatch name↔searchName : ne pas servir ni garder l’entrée.
  if (rawName && !cacheRawNameMatchesPlace(placeName, rawName)) {
    console.warn(
      `[place-enrichment-cache] drop mismatched entry place=${JSON.stringify(placeName)} raw=${JSON.stringify(rawName)} city=${JSON.stringify(keys.city_normalized)}`
    );
    await db
      .from("place_enrichment_cache")
      .delete()
      .eq("place_name_normalized", keys.place_name_normalized)
      .eq("city_normalized", keys.city_normalized);
    return null;
  }
  return mapRow(data);
}

/**
 * @param {string} name
 * @param {string} city
 * @param {object} enrichment
 */
export async function writePlaceEnrichmentCache(name, city, enrichment) {
  const db = getAdmin();
  const keys = normalizePlaceCacheKey(name, city);
  if (!db || !keys.place_name_normalized) return false;

  const placeName = String(name || "").trim();
  const status = String(enrichment?.status || "unverified").trim().toLowerCase() || "unverified";
  const rawName = String(enrichment?.name || placeName).trim() || placeName;

  // Ne jamais enregistrer sous la clé « name » un résultat qui désigne un autre lieu
  // (ex. name=Louvre + searchName=McDonalds → Jardins des Champs-Élysées).
  if (status !== "unverified" && rawName && !reasonableNameMatch(placeName, rawName)) {
    console.warn(
      `[place-enrichment-cache] refuse mismatched write place=${JSON.stringify(placeName)} raw=${JSON.stringify(rawName)}`
    );
    return false;
  }

  // Ne pas dégrader une entrée meilleure (verified/partial) en unverified via l’API publique.
  if (status === "unverified") {
    const existing = await readPlaceEnrichmentCache(placeName, city);
    if (existing && enrichmentQualityRank(existing.status) > enrichmentQualityRank("unverified")) {
      return false;
    }
  }

  const row = {
    ...keys,
    location_id: enrichment.locationId || null,
    status,
    source: enrichment.source || "none",
    rating: enrichment.rating ?? null,
    num_reviews: enrichment.numReviews ?? null,
    trip_types: enrichment.tripTypeScores || null,
    price_level: enrichment.priceLevel ?? null,
    latitude: enrichment.latitude ?? null,
    longitude: enrichment.longitude ?? null,
    tripadvisor_url: enrichment.tripadvisorUrl || null,
    photo_urls: enrichment.photos?.length ? enrichment.photos : null,
    raw_name: rawName,
    updated_at: new Date().toISOString(),
  };
  const fsqId = String(enrichment.fsqId || enrichment.fsq_place_id || "").trim();
  if (fsqId) row.fsq_place_id = fsqId;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await db.from("place_enrichment_cache").upsert(row, {
      onConflict: "place_name_normalized,city_normalized",
    });
    if (!error) return true;
    const msg = String(error?.message || "");
    if (/fsq_place_id|column .* does not exist/i.test(msg) && Object.prototype.hasOwnProperty.call(row, "fsq_place_id")) {
      const { fsq_place_id: _drop, ...rest } = row;
      Object.assign(row, rest);
      delete row.fsq_place_id;
      continue;
    }
    logCacheDisabled(`upsert failed — ${formatSupabaseCacheError(error)}`);
    return false;
  }
  return false;
}

export function isPlaceEnrichmentCacheConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}
