import { handleCors, sendJson, parseBody } from "../_helpers.js";
import { fetchWikidataNotablePlaceNames } from "../../lib/guide/wikidataNotablePlaces.js";
import { sanitizeMustSeePlaces, pickPlacesListAfterScriptFilter } from "../../placeGuards.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return sendJson(res, 400, { ok: false, error: "lat/lon invalides ou manquants." });
  }

  const locale = String(body.locale || body.language || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  const cityHint = String(body.cityHint || body.destination || "").trim();

  try {
    const raw = await fetchWikidataNotablePlaceNames(lat, lon, locale);
    const cleaned = sanitizeMustSeePlaces(raw, cityHint || "destination");
    const names = pickPlacesListAfterScriptFilter(cleaned, locale);
    sendJson(res, 200, { ok: true, names, count: names.length, source: "wikidata-sitelinks" });
  } catch (e) {
    sendJson(res, 502, { ok: false, error: String(e?.message || e), names: [] });
  }
}
