import { handleCors, sendJson, parseBody, getFoursquareKey } from "../_helpers.js";
import { searchFoursquarePlace } from "./_textSearch.js";
import { FOURSQUARE_PLACES_BASE, foursquarePlacesHeaders } from "./_client.js";
import { noteFoursquarePlacesCall } from "./_fsqMetrics.js";
import {
  fsqServerCacheKey,
  readFsqServerCache,
  writeFsqServerCache,
} from "./_guidePlacesCache.js";

/** Loisirs / culture / plein air — lieux « incontournables ». */
const FSQ_PRESET_POI = "10000,16000,12000";
/** Bars & restos — noms propres + palier prix (champ `price`) pour le guide. */
const FSQ_PRESET_RESTAURANTS = "13000";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const fsqKey = getFoursquareKey();
  if (!fsqKey) return sendJson(res, 503, { error: "FOURSQUARE_API_KEY non configurée sur le serveur." });

  const body = parseBody(req);
  const query = String(body.query || "").trim();
  const near = String(body.near || "").trim();
  const localeRaw = String(body.locale || body.language || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";

  /** Recherche texte nom + ville (identité + coords) — pas de géocodage Nominatim. */
  if (query.length >= 2 && near.length >= 2) {
    try {
      const hit = await searchFoursquarePlace(query, near, localeRaw);
      if (!hit) return sendJson(res, 404, { ok: false, error: "Aucun résultat Foursquare." });
      return sendJson(res, 200, { ok: true, result: hit });
    } catch (e) {
      return sendJson(res, 502, { error: String(e?.message || e) });
    }
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return sendJson(res, 400, { error: "lat/lon invalides ou manquants." });
  }
  const limit = Math.min(Number(body.limit) || 20, 50);
  const preset = String(body.preset || "poi").toLowerCase();
  const categoriesRaw = String(body.categories || "").trim();
  const categories =
    categoriesRaw ||
    (preset === "restaurants" || preset === "dining" || preset === "food" ? FSQ_PRESET_RESTAURANTS : FSQ_PRESET_POI);
  const fields = "name,location,categories,price,latitude,longitude,fsq_place_id";

  const simulate429 =
    process.env.FSQ_SIMULATE_429 === "1" ||
    String(req.headers?.["x-fsq-simulate-429"] || "").trim() === "1";
  if (simulate429) {
    noteFoursquarePlacesCall({ simulated: true });
    return sendJson(res, 429, {
      ok: false,
      error: "Foursquare quota exceeded (simulated)",
      quotaExceeded: true,
      results: [],
    });
  }

  const cacheKey = fsqServerCacheKey(lat, lon, localeRaw, categories);
  const cachedResults = readFsqServerCache(cacheKey);
  if (cachedResults) {
    noteFoursquarePlacesCall({ cached: true });
    return sendJson(res, 200, { ok: true, results: cachedResults, cached: true });
  }

  try {
    const params = new URLSearchParams({
      ll: `${lat},${lon}`,
      categories,
      fields,
      sort: "POPULARITY",
      limit: String(limit),
      radius: "10000",
    });
    const fsqResp = await fetch(`${FOURSQUARE_PLACES_BASE}/places/search?${params}`, {
      headers: foursquarePlacesHeaders(localeRaw),
    });
    noteFoursquarePlacesCall();
    if (!fsqResp.ok) {
      const errText = await fsqResp.text();
      const payload = {
        ok: false,
        error: `Foursquare ${fsqResp.status}: ${errText.slice(0, 300)}`,
        results: [],
      };
      if (fsqResp.status === 429) payload.quotaExceeded = true;
      return sendJson(res, fsqResp.status, payload);
    }
    const fsqJson = await fsqResp.json();
    const results = fsqJson.results || [];
    if (results.length) writeFsqServerCache(cacheKey, results);
    sendJson(res, 200, { ok: true, results, cached: false });
  } catch (e) {
    sendJson(res, 502, { error: String(e?.message || e) });
  }
}
