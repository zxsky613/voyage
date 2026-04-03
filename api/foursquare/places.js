import { handleCors, sendJson, parseBody, getFoursquareKey } from "../_helpers.js";

const FSQ_CATEGORIES = "10000,16000,12000";

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

  try {
    const fsqUrl =
      `https://api.foursquare.com/v3/places/search` +
      `?ll=${lat},${lon}&categories=${FSQ_CATEGORIES}&sort=POPULARITY&limit=${limit}&radius=10000`;
    const fsqResp = await fetch(fsqUrl, {
      headers: { Authorization: fsqKey, Accept: "application/json" },
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
