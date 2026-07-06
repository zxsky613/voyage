import { parseBody, sendJson, handleCors, resolveUiLanguage } from "../_helpers.js";
import {
  createTripAdvisorCallCounter,
} from "./_tripadvisorClient.js";
import { shouldUseEnrichmentCacheInVerify } from "../../lib/planner/taEnrichment.js";
import { readPlaceEnrichmentCache, writePlaceEnrichmentCache, normalizePlaceCacheKey } from "./_enrichCache.js";
import { searchFoursquarePlace } from "../foursquare/_textSearch.js";
import { resolveDestinationCenter } from "./_geocode.js";
import { applyGeoMismatchGuard, stripCoordsIfDestinationOutlier } from "../../lib/planner/geoGuard.js";

// 3000 ms provoquait des « partial/timeout » sans coords en masse au premier passage
// (le fetch TripAdvisor a lui-même un timeout de 12 s) — cause majeure du déficit de coords.
// 15 s : les appels Terra sont désormais espacés (limiteur global 350 ms), un lookup
// complet (recherche + détails + photos) peut légitimement dépasser 8 s.
const PLACE_LOOKUP_TIMEOUT_MS = 15000;

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
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<{ timedOut: true } | T>}
 * @template T
 */
async function withLookupTimeout(promise, ms) {
  let timerId;
  const timeout = new Promise((resolve) => {
    timerId = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * @param {string} name
 * @param {string} city
 * @param {string} near
 * @param {string} locale
 * @param {{ inc: () => void, get: () => number }} taCounter
 * @param {{ searchName?: string, category?: string, collectDebug?: boolean, fsqCounter?: { inc: () => void }, destinationCenter?: { latitude: number, longitude: number }|null, geoOutlierRejected?: { inc: () => void } }} [opts]
 */
async function enrichPlaceByNameRemote(name, city, near, locale, taCounter, opts = {}) {
  const placeName = String(name || "").trim();
  const cityNorm = String(city || "").trim();
  const searchName = String(opts.searchName || "").trim();
  /** @type {object|null} */
  let debugEntry = opts.collectDebug
    ? { name: placeName, searchName: searchName || placeName, city: cityNorm }
    : null;

  if (debugEntry) {
    debugEntry.reason = "ta_skipped_verify";
    debugEntry.taReason = "ta_enrichment_off";
  }

  opts.fsqCounter?.inc();
  const fsq = await searchFoursquarePlace(searchName || placeName, near || cityNorm, locale);
  if (fsq && (Number.isFinite(fsq.latitude) || Number.isFinite(fsq.longitude))) {
    let enrichment = {
      name: fsq.name || placeName,
      status: "partial",
      source: "foursquare",
      latitude: fsq.latitude,
      longitude: fsq.longitude,
      priceLevel: fsq.priceLevel,
      foursquareUrl: fsq.foursquareUrl,
      fsqId: fsq.fsqId,
      fsqCategories: fsq.fsqCategories,
    };
    enrichment = stripCoordsIfDestinationOutlier(enrichment, opts.destinationCenter, () =>
      opts.geoOutlierRejected?.inc?.()
    );
    const hasCoords =
      Number.isFinite(Number(enrichment.latitude)) && Number.isFinite(Number(enrichment.longitude));
    if (hasCoords) {
      await writePlaceEnrichmentCache(placeName, cityNorm, enrichment);
      if (debugEntry) debugEntry.reason = "partial_foursquare";
      return opts.collectDebug ? { ...enrichment, _debug: debugEntry } : enrichment;
    }
    if (debugEntry) debugEntry.reason = "geo_outlier_foursquare";
    const partialNoCoords = {
      name: fsq.name || placeName,
      status: "partial",
      source: "foursquare",
      priceLevel: fsq.priceLevel,
      foursquareUrl: fsq.foursquareUrl,
      fsqId: fsq.fsqId,
      fsqCategories: fsq.fsqCategories,
    };
    return opts.collectDebug ? { ...partialNoCoords, _debug: debugEntry } : partialNoCoords;
  }

  const unverified = { name: placeName, status: "unverified", source: "none" };
  await writePlaceEnrichmentCache(placeName, cityNorm, unverified);
  if (debugEntry && !debugEntry.reason) debugEntry.reason = "unverified";
  return opts.collectDebug ? { ...unverified, _debug: debugEntry } : unverified;
}

export async function enrichPlaceByName(name, city, near, locale, taCounter, opts = {}) {
  const placeName = String(name || "").trim();
  const cityNorm = String(city || "").trim();
  /** @type {object|null} */
  let debugEntry = opts.collectDebug
    ? {
        name: placeName,
        searchName: String(opts.searchName || "").trim() || placeName,
        city: cityNorm,
      }
    : null;

  if (!placeName) {
    const out = { status: "unverified", source: "none", name: placeName };
    if (debugEntry) debugEntry.reason = "empty_name";
    return opts.collectDebug ? { ...out, _debug: debugEntry } : out;
  }

  const cached = await readPlaceEnrichmentCache(placeName, cityNorm);
  if (cached && shouldUseEnrichmentCacheInVerify(cached.source)) {
    const stripped = stripCoordsIfDestinationOutlier(
      { ...cached, name: cached.name || placeName },
      opts.destinationCenter,
      () => opts.geoOutlierRejected?.inc?.()
    );
    if (debugEntry) {
      debugEntry.reason = "cache_hit";
      debugEntry.status = stripped.status;
      debugEntry.source = stripped.source;
      if (stripped.geoOutlierRejectedKm != null) debugEntry.geoOutlierRejectedKm = stripped.geoOutlierRejectedKm;
    }
    return opts.collectDebug ? { ...stripped, _debug: debugEntry } : stripped;
  }

  const raced = await withLookupTimeout(
    enrichPlaceByNameRemote(name, city, near, locale, taCounter, opts),
    PLACE_LOOKUP_TIMEOUT_MS
  );
  if (raced && typeof raced === "object" && raced.timedOut) {
    const partial = { name: placeName, status: "partial", source: "timeout" };
    if (debugEntry) debugEntry.reason = "lookup_timeout";
    return opts.collectDebug ? { ...partial, _debug: debugEntry } : partial;
  }
  return raced;
}

/**
 * @param {Array<{ id?: string, name: string, searchName?: string, category?: string }>} candidates
 * @param {{ city: string, near: string, locale: string, concurrency?: number, debug?: boolean }} options
 */
export async function verifyCandidatePlaces(candidates, options) {
  const taCounter = createTripAdvisorCallCounter();
  const fsqCounter = { n: 0, inc() { this.n += 1; } };
  const seen = new Set();
  const unique = [];
  /** @type {object[]} */
  const debugRows = [];

  for (const c of Array.isArray(candidates) ? candidates : []) {
    const name = String(c?.name || "").trim();
    if (!name) continue;
    const key = normalizePlaceCacheKey(name, options.city).place_name_normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      id: String(c?.id || "").trim() || `p${unique.length + 1}`,
      name,
      searchName: String(c?.searchName || "").trim(),
      category: c?.category,
      durationHours: c?.durationHours,
    });
  }

  const enriched = await mapPool(
    unique,
    async (c) => {
      const meta = await enrichPlaceByName(c.name, options.city, options.near, options.locale, taCounter, {
        searchName: c.searchName,
        category: c.category,
        collectDebug: Boolean(options.debug),
        fsqCounter,
        destinationCenter: options.destinationCenter,
        geoOutlierRejected: options.geoOutlierRejected,
      });
      if (options.debug && meta._debug) {
        meta._debug.status = meta.status;
        meta._debug.source = meta.source;
        meta._debug.hasCoords =
          Number.isFinite(Number(meta.latitude)) && Number.isFinite(Number(meta.longitude));
        meta._debug.taHttpCalls =
          (Array.isArray(meta._debug.taAttempts) ? meta._debug.taAttempts.length : 0) +
          (meta._debug.locationId ? 2 : 0);
        debugRows.push(meta._debug);
        delete meta._debug;
      }
      return {
        id: c.id,
        name: meta.name || c.name,
        // Conservé pour l'étape 2 de la cascade coords : Nominatim matche le nom
        // officiel anglais/local bien mieux que le nom d'affichage français.
        searchName: c.searchName,
        category: c.category,
        durationHours: c.durationHours,
        ...meta,
      };
    },
    options.concurrency || 6
  );

  const guarded = applyGeoMismatchGuard(enriched);

  return {
    places: guarded,
    tripAdvisorCalls: taCounter.get(),
    foursquareCalls: fsqCounter.n,
    geoOutlierRejected: options.geoOutlierRejected?.get?.() ?? 0,
    debug: options.debug ? debugRows : undefined,
  };
}

export async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const destination = String(body.destination || body.city || "").trim();
  const country = String(body.country || "").trim();
  const near = country ? `${destination}, ${country}` : destination;
  const locale = resolveUiLanguage(body);
  const debugMode = String(req.query?.debug || "").trim() === "1";
  const rawPlaces = Array.isArray(body.places) ? body.places : [];
  const candidates = rawPlaces.map((p, i) =>
    typeof p === "string"
      ? { id: `p${i + 1}`, name: p }
      : {
          id: p?.id,
          name: p?.name,
          searchName: p?.searchName,
          category: p?.category,
          durationHours: p?.durationHours,
        }
  );

  if (!destination) return sendJson(res, 400, { error: "destination requise" });
  if (!candidates.length) return sendJson(res, 400, { error: "places[] requis" });

  try {
    const destinationCenter = await resolveDestinationCenter(destination, country);
    const geoOutlierRejected = { n: 0, inc() { this.n += 1; }, get() { return this.n; } };
    const { places, tripAdvisorCalls, debug } = await verifyCandidatePlaces(candidates, {
      city: destination,
      near,
      locale,
      debug: debugMode,
      destinationCenter,
      geoOutlierRejected,
    });
    const payload = { ok: true, data: { places, tripAdvisorCalls, geoOutlierRejected: geoOutlierRejected.get() } };
    if (debugMode && debug) payload.debug = debug;
    sendJson(res, 200, payload);
  } catch (e) {
    sendJson(res, 502, { error: String(e?.message || e) });
  }
}
