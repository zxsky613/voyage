import { handleCors, sendJson, parseBody } from "../_helpers.js";
import { fetchLandmarkNamesFromOverpass } from "./overpassLandmarks.js";
import { sanitizeMustSeePlaces } from "../../placeGuards.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return sendJson(res, 400, { ok: false, error: "lat/lon invalides ou manquants." });
  }
  const radius = Math.min(Math.max(Number(body.radius) || 11000, 2000), 25000);

  try {
    const locale = String(body.locale || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
    const raw = await fetchLandmarkNamesFromOverpass(lat, lon, radius, locale);
    const hint = String(body.cityHint || body.destination || "").trim();
    const names = sanitizeMustSeePlaces(raw, hint || "destination");
    sendJson(res, 200, { ok: true, names, count: names.length });
  } catch (e) {
    sendJson(res, 502, { ok: false, error: String(e?.message || e), names: [] });
  }
}
