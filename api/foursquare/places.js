import { handleCors, sendJson, parseBody, getFoursquareKey } from "../_helpers.js";
import { searchFoursquarePlace } from "./_textSearch.js";
import { FOURSQUARE_PLACES_BASE, foursquarePlacesHeaders } from "./_client.js";

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
    if (!fsqResp.ok) {
      const errText = await fsqResp.text();
      return sendJson(res, fsqResp.status, { error: `Foursquare ${fsqResp.status}: ${errText.slice(0, 300)}` });
    }
    const fsqJson = await fsqResp.json();
    sendJson(res, 200, { ok: true, results: fsqJson.results || [] });
  } catch (e) {
    sendJson(res, 502, { error: String(e?.message || e) });
  }
}
