import { parseBody, sendJson, handleCors, resolveUiLanguage } from "../_helpers.js";
import {
  createTripAdvisorCallCounter,
  getLocationDetails,
  getLocationPhotos,
  isTripAdvisorConfigured,
  searchLocation,
} from "./_tripadvisorClient.js";
import { readPlaceEnrichmentCache, writePlaceEnrichmentCache, normalizePlaceCacheKey } from "./_enrichCache.js";
import { searchFoursquarePlace } from "../foursquare/_textSearch.js";

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<unknown>} fn
 * @param {number} [concurrency]
 */
async function mapPool(items, fn, concurrency = 5) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, list.length || 1) }, async () => {
    while (cursor < list.length) {
      const idx = cursor++;
      results[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * @param {string} name
 * @param {string} city
 * @param {string} near
 * @param {string} locale
 * @param {{ inc: () => void, get: () => number }} taCounter
 */
export async function enrichPlaceByName(name, city, near, locale, taCounter) {
  const placeName = String(name || "").trim();
  const cityNorm = String(city || "").trim();
  if (!placeName) {
    return { status: "unverified", source: "none", name: placeName };
  }

  const cached = await readPlaceEnrichmentCache(placeName, cityNorm);
  if (cached) return { ...cached, name: cached.name || placeName };

  if (isTripAdvisorConfigured()) {
    taCounter.inc();
    const searchQ = cityNorm ? `${placeName}, ${cityNorm}` : placeName;
    const hit = await searchLocation(searchQ, { language: locale, category: "attractions" });
    if (hit?.locationId) {
      taCounter.inc();
      const details = await getLocationDetails(hit.locationId, locale);
      if (details) {
        taCounter.inc();
        const photos = await getLocationPhotos(hit.locationId, locale, 3);
        const enrichment = {
          ...details,
          name: details.name || hit.name || placeName,
          status: "verified",
          source: "tripadvisor",
          photos,
        };
        await writePlaceEnrichmentCache(placeName, cityNorm, enrichment);
        return enrichment;
      }
    }
  }

  const fsq = await searchFoursquarePlace(placeName, near || cityNorm, locale);
  if (fsq && (Number.isFinite(fsq.latitude) || Number.isFinite(fsq.longitude))) {
    const enrichment = {
      name: fsq.name || placeName,
      status: "partial",
      source: "foursquare",
      latitude: fsq.latitude,
      longitude: fsq.longitude,
      priceLevel: fsq.priceLevel,
      foursquareUrl: fsq.foursquareUrl,
      fsqId: fsq.fsqId,
    };
    await writePlaceEnrichmentCache(placeName, cityNorm, enrichment);
    return enrichment;
  }

  const unverified = { name: placeName, status: "unverified", source: "none" };
  await writePlaceEnrichmentCache(placeName, cityNorm, unverified);
  return unverified;
}

/**
 * @param {Array<{ id?: string, name: string }>} candidates
 * @param {{ city: string, near: string, locale: string, concurrency?: number }} options
 */
export async function verifyCandidatePlaces(candidates, options) {
  const taCounter = createTripAdvisorCallCounter();
  const seen = new Set();
  const unique = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const name = String(c?.name || "").trim();
    if (!name) continue;
    const key = normalizePlaceCacheKey(name, options.city).place_name_normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      id: String(c?.id || "").trim() || `p${unique.length + 1}`,
      name,
      category: c?.category,
      durationHours: c?.durationHours,
    });
  }

  const enriched = await mapPool(
    unique,
    async (c) => {
      const meta = await enrichPlaceByName(c.name, options.city, options.near, options.locale, taCounter);
      return {
        id: c.id,
        name: meta.name || c.name,
        category: c.category,
        durationHours: c.durationHours,
        ...meta,
      };
    },
    options.concurrency || 5
  );

  return { places: enriched, tripAdvisorCalls: taCounter.get() };
}

export async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const destination = String(body.destination || body.city || "").trim();
  const country = String(body.country || "").trim();
  const near = country ? `${destination}, ${country}` : destination;
  const locale = resolveUiLanguage(body);
  const rawPlaces = Array.isArray(body.places) ? body.places : [];
  const candidates = rawPlaces.map((p, i) =>
    typeof p === "string"
      ? { id: `p${i + 1}`, name: p }
      : { id: p?.id, name: p?.name, category: p?.category, durationHours: p?.durationHours }
  );

  if (!destination) return sendJson(res, 400, { error: "destination requise" });
  if (!candidates.length) return sendJson(res, 400, { error: "places[] requis" });

  try {
    const { places, tripAdvisorCalls } = await verifyCandidatePlaces(candidates, {
      city: destination,
      near,
      locale,
    });
    sendJson(res, 200, { ok: true, data: { places, tripAdvisorCalls } });
  } catch (e) {
    sendJson(res, 502, { error: String(e?.message || e) });
  }
}
