import { fetchWithRetry } from "../images/_fetchRetry.js";

const TERRA_BASE = "https://terra.tripadvisor.com/api";

/** Préfixes descriptifs FR à retirer avant recherche catalogue. */
const DESCRIPTIVE_PREFIX_RE =
  /^(vieux|ancien|nouveau|grand|petite?|quartier|visite|d[eé]couverte|promenade|balade|monument|site|centre|tour|ch[aâ]teau|fort|palais|jardin|jardins|mus[eé]e|mus[eé]e d['']|mus[eé]e de l['']|mus[eé]e des |mus[eé]e du |église|cathedrale|cath[eé]drale|basilique|place|march[eé]|port|plage|parc|mont|colline|panorama|vue sur|vue d[''])\s+/i;

const DESCRIPTIVE_TYPE_DE_RE =
  /^(port|place|quartier|jardin|jardins|mus[eé]e|[eé]glise|cathedrale|cath[eé]drale|ch[aâ]teau|fort|palais|march[eé]|parc)\s+(de|du|des|de la|de l[''])\s+/i;

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
 * Retire les tournures descriptives françaises (« Vieux port de … », « Musée de … »).
 * @param {string} name
 */
export function stripDescriptivePlaceName(name) {
  let s = String(name || "").trim();
  if (!s) return "";
  for (let i = 0; i < 4; i++) {
    const strippedPrefix = s.replace(DESCRIPTIVE_PREFIX_RE, "").trim();
    const strippedType = strippedPrefix.replace(DESCRIPTIVE_TYPE_DE_RE, "").trim();
    const next = strippedType || strippedPrefix;
    if (next === s) break;
    s = next;
  }
  return s.trim() || String(name || "").trim();
}

/**
 * @param {string} path
 * @param {URLSearchParams} params
 * @param {string} key
 */
async function terraGet(path, params, key) {
  params.set("version", "1");
  const url = `${TERRA_BASE}${path}?${params}`;
  const { response, throttled, timedOut } = await fetchWithRetry(
    url,
    { headers: terraHeaders(key) },
    { timeoutMs: 12000 }
  );
  if (throttled || timedOut || !response) {
    return {
      ok: false,
      status: timedOut ? 408 : 429,
      json: null,
      body: timedOut ? "timeout" : "throttled",
    };
  }
  const status = response.status;
  const body = await response.text().catch(() => "");
  if (!response.ok) {
    return { ok: false, status, json: null, body };
  }
  try {
    return { ok: true, status, json: body ? JSON.parse(body) : null, body: "" };
  } catch {
    return { ok: false, status, json: null, body };
  }
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

function normalizeTokens(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchScore(query, name) {
  const qTokens = normalizeTokens(query).split(" ").filter((w) => w.length > 2);
  const nTokens = new Set(normalizeTokens(name).split(" ").filter((w) => w.length > 2));
  if (!qTokens.length || !nTokens.size) return 0;
  let hit = 0;
  for (const t of qTokens) if (nTokens.has(t)) hit += 1;
  return hit / qTokens.length;
}

/**
 * @param {string} query
 * @param {string} name
 */
export function reasonableNameMatch(query, name) {
  const score = nameMatchScore(query, name);
  if (score >= 0.35) return true;
  const q = normalizeTokens(query);
  const n = normalizeTokens(name);
  if (!q || !n) return false;
  if (q.length >= 4 && n.includes(q)) return true;
  if (n.length >= 4 && q.includes(n)) return true;
  return score >= 0.25;
}

/**
 * @param {object[]} hits
 * @param {string} query
 */
function pickBestCatalogHit(hits, query) {
  const list = (Array.isArray(hits) ? hits : []).filter(Boolean);
  if (!list.length) return null;

  const matched = list.filter((h) => reasonableNameMatch(query, h.name));
  const pool = matched.length ? matched : list;

  return (
    pool
      .map((h) => {
        const reviews = Number(h.numReviews) || 0;
        const match = nameMatchScore(query, h.name);
        return { h, score: reviews * (0.35 + match * 0.65) + match * 500 };
      })
      .sort((a, b) => b.score - a.score)[0]?.h || pool[0]
  );
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
 * @param {string} category
 */
function terraCategoryParam(category) {
  const c = String(category || "").trim().toLowerCase();
  if (c === "attractions" || c === "attraction" || c === "museum" || c === "landmark" || c === "park" || c === "viewpoint" || c === "neighborhood") {
    return "ATTRACTION";
  }
  if (c === "restaurants" || c === "restaurant") {
    return "RESTAURANT";
  }
  return "";
}

/**
 * @param {string} query
 * @param {{ geoName?: string, locale?: string, category?: string }} opts
 * @param {string} key
 */
async function catalogSearchRaw(query, opts, key) {
  const params = new URLSearchParams({
    query,
    locale: opts.locale || "fr-FR",
    limit: "8",
  });
  if (opts.geoName) params.set("geo_name", opts.geoName);
  const cat = terraCategoryParam(opts.category || "");
  if (cat) params.set("category", cat);

  const { ok, status, json, body } = await terraGet("/catalog/locations/search", params, key);
  const rows = ok && Array.isArray(json?.data) ? json.data : [];
  const hits = rows
    .map((row) => catalogHitToSearchResult(row?.location || row, opts.locale || "fr-FR"))
    .filter(Boolean);

  return {
    ok,
    status,
    body,
    hits,
    firstResult: hits[0]?.name || "",
    count: hits.length,
    queryUsed: query,
    geoName: opts.geoName || "",
    category: cat || "",
  };
}

function logTaMiss(query, status, count, firstResult, extra = "") {
  console.error(
    `[ta-verify] MISS query=${JSON.stringify(String(query || "").slice(0, 120))} status=${status} results=${count} firstResult=${JSON.stringify(String(firstResult || "").slice(0, 80))}${extra ? ` ${extra}` : ""}`
  );
}

function logTaHttpError(query, status, body) {
  const snippet = String(body || "")
    .replace(/\s+/g, " ")
    .slice(0, 200);
  console.error(
    `[ta-verify] HTTP query=${JSON.stringify(String(query || "").slice(0, 80))} status=${status} body=${JSON.stringify(snippet)}`
  );
}

/**
 * @param {string} searchQuery
 * @param {{ latLong?: string, geoName?: string, language?: string, category?: string, searchName?: string, debug?: boolean }} [options]
 * @returns {Promise<{ hit: object|null, trace?: object }>}
 */
export async function searchLocationDetailed(searchQuery, options = {}) {
  const key = getKey();
  const { query, geoName: parsedGeo } = parseSearchParts(searchQuery, options);
  const locale = toTerraLocale(options.language);
  const geoName = String(options.geoName || parsedGeo || "").trim();
  const primary = String(options.searchName || query).trim() || query;

  /** @type {object} */
  const trace = {
    query: primary,
    geoName,
    locale,
    attempts: [],
    reason: "",
  };

  if (!key || primary.length < 2) {
    trace.reason = "missing_key_or_query";
    return { hit: null, trace };
  }

  const queryVariants = [...new Set([primary, stripDescriptivePlaceName(primary), query].filter((s) => s.length >= 2))];
  const geoVariants = geoName ? [geoName, ""] : [""];
  const categories = [...new Set([options.category || "", "attraction", ""].filter((v) => v !== undefined))];

  for (const q of queryVariants) {
    for (const geo of geoVariants) {
      for (const category of categories) {
        const raw = await catalogSearchRaw(q, { geoName: geo, locale, category }, key);
        trace.attempts.push({
          query: q,
          geoName: geo,
          category: category || "(any)",
          status: raw.status,
          results: raw.count,
          firstResult: raw.firstResult,
        });

        if (!raw.ok) {
          logTaHttpError(q, raw.status, raw.body);
          continue;
        }

        const hit = pickBestCatalogHit(raw.hits, q);
        if (hit?.locationId) {
          if (!reasonableNameMatch(q, hit.name) && raw.count > 0) {
            trace.reason = "weak_match_accepted";
          }
          return { hit, trace };
        }

        logTaMiss(q, raw.status, raw.count, raw.firstResult, geo ? `geo=${geo}` : "");
      }
    }
  }

  trace.reason = "no_results";
  return { hit: null, trace };
}

/**
 * @param {string} searchQuery
 * @param {{ latLong?: string, geoName?: string, language?: string, category?: string, searchName?: string }} [options]
 */
export async function searchLocation(searchQuery, options = {}) {
  const { hit } = await searchLocationDetailed(searchQuery, options);
  return hit;
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
  const { ok, json, status, body } = await terraGet(`/locations/${encodeURIComponent(id)}`, params, key);
  if (!ok) {
    logTaHttpError(`location:${id}`, status, body);
    return null;
  }

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
  const { ok, json } = await terraGet(
    `/locations/${encodeURIComponent(id)}/photos`,
    params,
    key
  );
  if (!ok) return [];

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
