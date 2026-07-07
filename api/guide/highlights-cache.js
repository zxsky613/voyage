import { handleCors, sendJson, parseBody } from "../_helpers.js";
import { readDestinationHighlightsCacheStale } from "../../lib/planner/highlightsListCache.js";
import { highlightObjectsToPlaceNames } from "../../lib/guide/mergeMustSeePlaces.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const destination = String(body.destination || body.city || "").trim();
  const locale = String(body.locale || body.language || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";

  if (!destination) return sendJson(res, 400, { ok: false, error: "destination requise" });

  try {
    const cached = await readDestinationHighlightsCacheStale(destination, locale);
    if (!cached?.highlights?.length) {
      return sendJson(res, 200, { ok: true, names: [], highlights: [], stale: false });
    }
    const names = highlightObjectsToPlaceNames(cached.highlights);
    return sendJson(res, 200, {
      ok: true,
      names,
      highlights: cached.highlights,
      stale: Boolean(cached.stale),
      count: names.length,
    });
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: String(e?.message || e), names: [] });
  }
}
