import { fetchJsonWithRetry } from "../images/_fetchRetry.js";

const TERRA_BASE = "https://terra.tripadvisor.com/api";

function getKey() {
  return String(process.env.TRIPADVISOR_API_KEY || "").trim();
}

/** Terra exige des locales factuelles (fr-FR, en-US…). */
export function toTerraLocale(language = "fr") {
  const code = String(language || "fr").toLowerCase().split("-")[0];
  const map = {
    fr: "fr-FR",
    en: "en-US",
    de: "de-DE",
    es: "es-ES",
    it: "it-IT",
    zh: "zh-CN",
    ja: "ja-JP",
    pt: "pt-BR",
    nl: "nl-NL",
  };
  return map[code] || "en-US";
}

function terraHeaders(key) {
  return {
    Accept: "application/json",
    "X-API-KEY": key,
  };
}

/**
 * @param {string} path
 * @param {URLSearchParams} params
 * @param {string} key
 */
async function terraGet(path, params, key) {
  params.set("version", "1");
  return fetchJsonWithRetry(`${TERRA_BASE}${path}?${params}`, {
    headers: terraHeaders(key),
  });
}

/**
 * @param {Array<{ language?: string, value?: string, primary?: boolean }>} names
 * @param {string} locale
 */
function pickLocalizedName(names, locale) {
  const list = Array.isArray(names) ? names : [];
  const lang = String(locale || "fr-FR").split("-")[0];
  return (
    list.find((n) => n?.language === lang && n?.primary)?.value ||
    list.find((n) => n?.language === lang)?.value ||
    list.find((n) => n?.primary)?.value ||
    list[0]?.value ||
    ""
  );
}

/**
 * @param {string} searchQuery
 * @param {{ geoName?: string, language?: string, category?: string }} [options]
 */
function parseSearchParts(searchQuery, options = {}) {
  const raw = String(searchQuery || "").trim();
  const explicitGeo = String(options.geoName || "").trim();
  if (explicitGeo) return { query: raw, geoName: explicitGeo };
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      query: parts.slice(0, -1).join(", "),
      geoName: parts[parts.length - 1],
    };
  }
  return { query: raw, geoName: "" };
}

function nameMatchScore(query, name) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const qTokens = norm(query).split(" ").filter((w) => w.length > 2);
  const nTokens = new Set(norm(name).split(" ").filter((w) => w.length > 2));
  if (!qTokens.length || !nTokens.size) return 0;
  let hit = 0;
  for (const t of qTokens) if (nTokens.has(t)) hit += 1;
  return hit / qTokens.length;
}

/**
 * @param {object[]} hits
 * @param {string} query
 */
function pickBestCatalogHit(hits, query) {
  const list = (Array.isArray(hits) ? hits : []).filter(Boolean);
  if (!list.length) return null;
  return list
    .map((h) => {
      const reviews = Number(h.numReviews) || 0;
      const match = nameMatchScore(query, h.name);
      return { h, score: reviews * (0.35 + match * 0.65) + match * 500 };
    })
    .sort((a, b) => b.score - a.score)[0]?.h || list[0];
}

/**
 * @param {object} location
 * @param {string} locale
 */
function catalogHitToSearchResult(location, locale) {
  if (!location?.id) return null;
  const name = pickLocalizedName(location.names, locale);
  const addr = Array.isArray(location.addresses)
    ? String(location.addresses[0]?.formatted || location.addresses[0]?.value || "").trim()
    : "";
  return {
    locationId: String(location.id),
    name: name || String(location.names?.[0]?.value || "").trim(),
    address: addr,
    rating: location.overall_rating?.rating != null ? Number(location.overall_rating.rating) : undefined,
    numReviews: location.overall_rating?.count != null ? Number(location.overall_rating.count) : undefined,
    latitude: location.coordinates?.latitude != null ? Number(location.coordinates.latitude) : undefined,
    longitude: location.coordinates?.longitude != null ? Number(location.coordinates.longitude) : undefined,
  };
}

/**
 * @param {string} searchQuery
 * @param {{ latLong?: string, geoName?: string, language?: string, category?: string }} [options]
 */
export async function searchLocation(searchQuery, options = {}) {
  const key = getKey();
  const { query, geoName } = parseSearchParts(searchQuery, options);
  if (!key || query.length < 2) return null;

  const locale = toTerraLocale(options.language);
  const params = new URLSearchParams({
    query,
    locale,
    limit: "5",
  });
  if (geoName) params.set("geo_name", geoName);

  const category = String(options.category || "").trim().toLowerCase();
  if (category === "attractions" || category === "attraction") {
    params.set("category", "ATTRACTION");
  } else if (category === "restaurants" || category === "restaurant") {
    params.set("category", "RESTAURANT");
  }

  const { ok, json, throttled, timedOut } = await terraGet("/catalog/locations/search", params, key);
  if (throttled || timedOut || !ok) return null;

  const rows = Array.isArray(json?.data) ? json.data : [];
  const hits = rows
    .map((row) => catalogHitToSearchResult(row?.location || row, locale))
    .filter(Boolean);
  return pickBestCatalogHit(hits, query);
}

/**
 * @param {object} loc
 * @param {string} locale
 */
function mapTerraLocationDetails(loc, locale) {
  if (!loc?.id) return null;

  /** @type {Record<string, number>} */
  const tripTypeScores = {};
  const tripTypes = loc?.trip_types || loc?.review_rating_count || loc?.traveler_types;
  if (tripTypes && typeof tripTypes === "object" && !Array.isArray(tripTypes)) {
    for (const [k, v] of Object.entries(tripTypes)) {
      const n = Number(v);
      if (Number.isFinite(n)) tripTypeScores[String(k).toLowerCase()] = n;
    }
  }

  const overall = loc?.traveler_ratings?.overall || loc?.overall_rating || {};
  const urls = loc?.urls?.tripadvisor || loc?.urls || {};

  return {
    locationId: String(loc.id),
    name: pickLocalizedName(loc.names, locale) || String(loc.names?.[0]?.value || "").trim(),
    rating: overall.rating != null ? Number(overall.rating) : undefined,
    numReviews: overall.count != null ? Number(overall.count) : undefined,
    tripTypeScores,
    priceLevel: loc?.price_level != null ? Number(loc.price_level) : undefined,
    latitude: loc?.coordinates?.latitude != null ? Number(loc.coordinates.latitude) : undefined,
    longitude: loc?.coordinates?.longitude != null ? Number(loc.coordinates.longitude) : undefined,
    tripadvisorUrl: String(urls?.main || urls?.tripadvisor || loc?.web_url || "").trim() || undefined,
    ranking: loc?.ranking?.ranking_string || loc?.ranking_data?.ranking_string || undefined,
  };
}

/**
 * @param {string} locationId
 * @param {string} [language]
 */
export async function getLocationDetails(locationId, language = "fr") {
  const key = getKey();
  const id = String(locationId || "").trim();
  if (!key || !id) return null;

  const locale = toTerraLocale(language);
  const params = new URLSearchParams({ locale });
  const { ok, json, throttled, timedOut } = await terraGet(`/locations/${encodeURIComponent(id)}`, params, key);
  if (throttled || timedOut || !ok) return null;

  const loc = json?.data || json;
  return mapTerraLocationDetails(loc, locale);
}

/**
 * @param {string} locationId
 * @param {string} [language]
 * @param {number} [limit]
 */
export async function getLocationPhotos(locationId, language = "fr", limit = 5) {
  const key = getKey();
  const id = String(locationId || "").trim();
  if (!key || !id) return [];

  const locale = toTerraLocale(language);
  const params = new URLSearchParams({
    locale,
    size: String(Math.min(5, Math.max(1, limit))),
  });
  const { ok, json, throttled, timedOut } = await terraGet(
    `/locations/${encodeURIComponent(id)}/photos`,
    params,
    key
  );
  if (throttled || timedOut || !ok) return [];

  const data = Array.isArray(json?.data) ? json.data : [];
  return data
    .map((p) =>
      String(
        p?.photo?.original_size_url ||
          p?.photo?.large_url ||
          p?.photo?.url ||
          p?.images?.large?.url ||
          p?.url ||
          ""
      ).trim()
    )
    .filter(Boolean)
    .slice(0, 5);
}

export function isTripAdvisorConfigured() {
  return Boolean(getKey());
}

/** Compteur d'appels TripAdvisor par requête generate-itinerary. */
export function createTripAdvisorCallCounter() {
  let count = 0;
  return {
    inc() {
      count += 1;
    },
    get() {
      return count;
    },
  };
}
