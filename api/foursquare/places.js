import { handleCors, sendJson, parseBody, getFoursquareKey } from "../_helpers.js";

/** Loisirs / culture / plein air — lieux « incontournables ». */
const FSQ_PRESET_POI = "10000,16000,12000";
/** Bars & restos — noms propres + palier prix (champ `price`) pour le guide. */
const FSQ_PRESET_RESTAURANTS = "13000";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const fsqKey = getFoursquareKey();
  if (!fsqKey) return sendJson(res, 503, { error: "FOURSQUARE_API_KEY non configurée sur le serveur." });

  const body = parseBody(req);
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return sendJson(res, 400, { error: "lat/lon invalides ou manquants." });
  }
  const limit = Math.min(Number(body.limit) || 20, 50);
  const localeRaw = String(body.locale || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  const acceptLanguage = localeRaw === "zh" ? "zh-CN" : localeRaw;
  const preset = String(body.preset || "poi").toLowerCase();
  const categoriesRaw = String(body.categories || "").trim();
  const categories =
    categoriesRaw ||
    (preset === "restaurants" || preset === "dining" || preset === "food" ? FSQ_PRESET_RESTAURANTS : FSQ_PRESET_POI);
  /** Champs utiles : prix relatif 1–4 (indicatif). */
  const fields = "name,location,categories,price";

  try {
    const fsqUrl =
      `https://api.foursquare.com/v3/places/search` +
      `?ll=${lat},${lon}` +
      `&categories=${categories}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&sort=POPULARITY&limit=${limit}&radius=10000`;
    const fsqResp = await fetch(fsqUrl, {
      headers: {
        Authorization: fsqKey,
        Accept: "application/json",
        "Accept-Language": acceptLanguage,
      },
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
