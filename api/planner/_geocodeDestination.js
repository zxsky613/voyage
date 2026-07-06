import { handleCors, sendJson, parseBody } from "../_helpers.js";
import { readPlaceEnrichmentCache, writePlaceEnrichmentCache } from "./_enrichCache.js";
import { geocodePlaceNominatim } from "./_geocode.js";

/**
 * Géocode une destination (ville) — cache place_enrichment_cache, 1 appel Nominatim à vie.
 */
export async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const destination = String(body.destination || body.city || "").trim();
  const country = String(body.country || "").trim();
  if (!destination) return sendJson(res, 400, { error: "destination requise" });

  try {
    const cached = await readPlaceEnrichmentCache(destination, destination);
    if (
      cached
      && Number.isFinite(Number(cached.latitude))
      && Number.isFinite(Number(cached.longitude))
    ) {
      return sendJson(res, 200, {
        ok: true,
        data: {
          lat: Number(cached.latitude),
          lon: Number(cached.longitude),
          cached: true,
        },
      });
    }

    const hit = await geocodePlaceNominatim(destination, destination, country);
    if (!hit) {
      console.info(`[geocode-destination] MISS destination=${JSON.stringify(destination.slice(0, 80))}`);
      return sendJson(res, 404, { ok: false, error: "geocode_miss" });
    }

    await writePlaceEnrichmentCache(destination, destination, {
      status: "verified",
      source: "geocoded",
      latitude: hit.latitude,
      longitude: hit.longitude,
      name: destination,
    });

    return sendJson(res, 200, {
      ok: true,
      data: {
        lat: hit.latitude,
        lon: hit.longitude,
        cached: false,
      },
    });
  } catch (e) {
    console.error(`[geocode-destination] ERROR ${String(e?.message || e)}`);
    return sendJson(res, 502, { error: String(e?.message || e) });
  }
}
