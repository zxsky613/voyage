import { writePlaceEnrichmentCache } from "./_enrichCache.js";
import { placeHasCoords } from "../../lib/planner/coordsSource.js";
import {
  checkDestinationGeoOutlier,
} from "../../lib/planner/geoGuard.js";

/** @type {Map<string, { latitude: number, longitude: number }|null>} */
const destinationCenterCache = new Map();

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

/** Même pattern que le User-Agent Wikimedia (api/images/_headCheck.js). */
export const GEOCODER_USER_AGENT = "JustTrip/1.0 (https://justtrip.fr; contact@justtrip.fr)";

/** Politique d'usage Nominatim : 1 requête/seconde maximum. */
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const NOMINATIM_TIMEOUT_MS = 8000;

let lastNominatimCallAt = 0;
let nominatimQueue = Promise.resolve();

/** Sérialise les appels Nominatim avec un intervalle >= 1,1 s. */
function scheduleNominatim(task) {
  const run = nominatimQueue.then(async () => {
    const wait = lastNominatimCallAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimCallAt = Date.now();
    return task();
  });
  nominatimQueue = run.catch(() => {});
  return run;
}

/**
 * Une requête Nominatim, avec issue détaillée (les 429 ne doivent plus
 * tomber silencieusement en 'estimated').
 * @param {string} q
 * @returns {Promise<{ hit: { latitude: number, longitude: number, displayName: string }|null, reason: 'ok'|'no_result'|'throttled'|'http_error'|'timeout' }>}
 */
async function nominatimSearchOnce(q) {
  const url = `${NOMINATIM_SEARCH}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  return scheduleNominatim(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NOMINATIM_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": GEOCODER_USER_AGENT, Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (resp.status === 429 || resp.status === 503) {
        console.error(`[geocode] THROTTLED status=${resp.status} q=${JSON.stringify(q.slice(0, 100))}`);
        return { hit: null, reason: "throttled" };
      }
      if (!resp.ok) {
        console.error(`[geocode] HTTP ${resp.status} q=${JSON.stringify(q.slice(0, 100))}`);
        return { hit: null, reason: "http_error" };
      }
      const rows = await resp.json();
      const hit = Array.isArray(rows) ? rows[0] : null;
      const latitude = Number(hit?.lat);
      const longitude = Number(hit?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        console.info(`[geocode] MISS q=${JSON.stringify(q.slice(0, 100))}`);
        return { hit: null, reason: "no_result" };
      }
      return {
        hit: { latitude, longitude, displayName: String(hit?.display_name || "") },
        reason: "ok",
      };
    } catch (e) {
      const timedOut = e?.name === "AbortError";
      console.error(`[geocode] ${timedOut ? "TIMEOUT" : "ERROR"} q=${JSON.stringify(q.slice(0, 100))}`);
      return { hit: null, reason: timedOut ? "timeout" : "http_error" };
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * Variantes de requête pour un lieu : le searchName officiel (anglais/local,
 * fourni par la Pass 1) passe bien mieux sur Nominatim que le nom d'affichage
 * français (« Jardin botanique de … » ne matche pas « Jardín Botánico … »).
 * @param {{ name?: string, searchName?: string }} place
 * @param {string} city
 * @param {string} country
 * @returns {string[]}
 */
/** Mots d'activité (FR/EN) qui polluent la recherche Nominatim d'un TOPONYME. */
const ACTIVITY_NOISE_RE =
  /^(randonn[ée]e (?:sur|dans|vers|à|au|aux|c[ôo]ti[èe]re à)?|promenade (?:sur|dans|à|au|aux|la)?|balade (?:sur|dans|à)?|plage de(?: la| le| l')?|visite (?:du|de la|de l'|des|de)?|excursion (?:en bateau )?(?:aux|à|au|vers)?|d[ée]gustation de .*? (?:dans|à)|ascension (?:au|du|de la)?|centre historique de|historic centre of|historic center of|old town of|village de(?: la| le| l')?|ch[âa]teau de(?: la| le| l')?)\s+/i;
const ACTIVITY_NOISE_SUFFIX_RE = /\s+(hike|walk|boat trip|tour|visit|guided tour|village|viewpoint)$/i;

/** Nettoie un libellé d'activité en toponyme géocodable. */
export function toGeocodableName(raw) {
  let s = String(raw || "")
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(ACTIVITY_NOISE_RE, "").replace(ACTIVITY_NOISE_SUFFIX_RE, "").trim();
    if (next === s || next.length < 3) break;
    s = next;
  }
  return s;
}

export function buildNominatimQueries(place, city, country) {
  const name = toGeocodableName(place?.name);
  const searchName = toGeocodableName(place?.searchName);
  const suffixFr = [city, country].filter(Boolean).join(", ");
  // Nominatim résout souvent mieux l'orthographe EN de l'île/pays.
  const islandEn =
    /t[eé]n[eé]rife/i.test(String(city || "")) ? "Tenerife, Spain" : "";
  const queries = [];
  const push = (base, suffix) => {
    if (!base || base.length < 3) return;
    const q = suffix ? `${base}, ${suffix}` : base;
    if (!queries.includes(q)) queries.push(q);
  };
  // Variante EN de l'île en premier : Nominatim la résout mieux que « Ténérife, Espagne ».
  if (islandEn) {
    push(searchName, islandEn);
    push(name, islandEn);
  }
  push(searchName, suffixFr);
  push(name, suffixFr);
  return queries;
}

/**
 * Géocode « nom du lieu, ville, destination » via Nominatim/OSM.
 * @param {string} name
 * @param {string} city
 * @param {string} [country]
 * @returns {Promise<{ latitude: number, longitude: number, displayName: string }|null>}
 */
export async function geocodePlaceNominatim(name, city, country = "") {
  const q = [String(name || "").trim(), String(city || "").trim(), String(country || "").trim()]
    .filter(Boolean)
    .join(", ");
  if (!q) return null;
  const { hit } = await nominatimSearchOnce(q);
  return hit;
}

/**
 * Centre géographique de la destination (1 appel Nominatim, mis en cache process).
 * @param {string} city
 * @param {string} [country]
 * @returns {Promise<{ latitude: number, longitude: number }|null>}
 */
export async function resolveDestinationCenter(city, country = "") {
  const c = String(city || "").trim();
  if (!c) return null;
  const key = `${c.toLowerCase()}|${String(country || "").trim().toLowerCase()}`;
  if (destinationCenterCache.has(key)) return destinationCenterCache.get(key) ?? null;

  const q = [c, String(country || "").trim()].filter(Boolean).join(", ");
  const { hit } = await nominatimSearchOnce(q);
  const center =
    hit && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude)
      ? { latitude: hit.latitude, longitude: hit.longitude }
      : null;
  destinationCenterCache.set(key, center);
  return center;
}

/**
 * Étape 2 de la cascade : géocoder les lieux sans coords, dans l'ordre fourni
 * (mettre les mieux scorés en premier), avec un budget de requêtes HTTP borné.
 * Chaque lieu tente jusqu'à 2 variantes (searchName officiel d'abord, puis nom
 * d'affichage) ; un throttle est retenté une fois après pause.
 * Écrit chaque succès dans place_enrichment_cache (pas de re-géocodage ensuite).
 *
 * @param {object[]} places
 * @param {{ city: string, country?: string, maxRequests?: number, destinationCenter?: { latitude: number, longitude: number }|null, geoOutlierRejected?: { inc: () => void } }} options
 * @returns {Promise<{ places: object[], attempted: number, succeeded: number, failed: number, requests: number, reasons: Record<string, number>, geoOutlierRejected: number }>}
 */
export async function geocodeCoordlessPlaces(places, options) {
  const city = String(options?.city || "").trim();
  const country = String(options?.country || "").trim();
  const maxRequests = Math.max(0, Number(options?.maxRequests) || 20);
  const destinationCenter = options?.destinationCenter ?? null;
  const outlierCounter = options?.geoOutlierRejected;
  const out = [...(places || [])];
  let attempted = 0;
  let succeeded = 0;
  let requests = 0;
  let geoOutlierRejected = 0;
  /** @type {Record<string, number>} */
  const reasons = { no_result: 0, throttled: 0, http_error: 0, timeout: 0, geo_outlier: 0 };
  /** @type {{ id: string, name: string, reason: string }[]} */
  const failures = [];
  /** @type {Set<string>} */
  const attemptedIds = new Set();

  for (let i = 0; i < out.length; i += 1) {
    if (requests >= maxRequests) break;
    const p = out[i];
    if (!p || placeHasCoords(p)) continue;
    attempted += 1;
    const pid = String(p.id || "").trim();
    if (pid) attemptedIds.add(pid);

    const queries = buildNominatimQueries(p, city, country).slice(0, 2);
    let hit = null;
    let lastReason = "no_result";
    for (const q of queries) {
      if (requests >= maxRequests) break;
      requests += 1;
      let res = await nominatimSearchOnce(q);
      if (res.reason === "throttled" && requests < maxRequests) {
        // Un seul retry après pause — sinon le lieu tombait en 'estimated' sans trace.
        await new Promise((r) => setTimeout(r, 2000));
        requests += 1;
        res = await nominatimSearchOnce(q);
      }
      if (res.hit) {
        const { within } = checkDestinationGeoOutlier(destinationCenter, res.hit);
        if (within) {
          hit = res.hit;
          break;
        }
        geoOutlierRejected += 1;
        outlierCounter?.inc?.();
        lastReason = "geo_outlier";
        continue;
      }
      lastReason = res.reason;
    }

    if (!hit) {
      reasons[lastReason] = (reasons[lastReason] || 0) + 1;
      failures.push({
        id: pid || `idx${i}`,
        name: String(p.name || "").trim(),
        reason: lastReason,
      });
      continue;
    }
    succeeded += 1;
    const upgraded = {
      ...p,
      latitude: hit.latitude,
      longitude: hit.longitude,
      status: String(p.status || "") === "unverified" ? "partial" : p.status,
      source: "nominatim",
    };
    out[i] = upgraded;
    await writePlaceEnrichmentCache(p.name, city, upgraded);
  }

  return {
    places: out,
    attempted,
    succeeded,
    failed: attempted - succeeded,
    requests,
    reasons,
    failures,
    attemptedIds,
    geoOutlierRejected,
  };
}
