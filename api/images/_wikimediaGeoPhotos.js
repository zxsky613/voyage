import {
  isLikelyOrbitalOrMapImagery,
  isLikelyWikiBrandOrLogoImage,
  isVectorWikiImageOrigin,
  scoreScenicCommonsFile,
} from "../../lib/images/wikiImageFilters.js";
import { commonsThumbUrl, parseExtMetaValue, wikiUserAgent } from "./_headCheck.js";
import { fetchJsonWithRetry } from "./_fetchRetry.js";
import {
  isCacheConfigured,
  readCacheByLabel,
  writeCache,
  noteCacheStatusAtResolveStart,
} from "./_cache.js";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const GEO_RADIUS_M = 250;
const GEO_GSLIMIT = 24;
const GEO_THUMB_WIDTH = 800;
const GEO_COORD_DECIMALS = 4;

/** @param {number} value */
function roundGeoCoord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** GEO_COORD_DECIMALS;
  return Math.round(n * f) / f;
}

/**
 * Clé cache image_resolve_cache — coords arrondies, jamais re-fetch si hit.
 * @param {number} lat
 * @param {number} lon
 */
export function geoPhotoCacheLabel(lat, lon, radiusM = GEO_RADIUS_M) {
  const la = roundGeoCoord(lat);
  const lo = roundGeoCoord(lon);
  if (!la && !lo) return "";
  return `geo@${la},${lo}@${radiusM}`;
}

const EXCLUDED_MIME_RE = /^(image\/svg\+xml|application\/pdf|image\/gif)$/i;
const EXCLUDED_KEYWORD_RE =
  /\b(map|maps|plan|plans|logo|logos|locator|location[_\s-]?map|carte|karte|mappa|mapa|schema|diagram|blueprint|floor[_\s-]?plan|site[_\s-]?plan|logo[_\s-]?type|wordmark|emblem|seal|flag|drapeau|blason|coat[_\s-]?of[_\s-]?arms|openstreetmap|osm[_-])\b/i;

/** @param {string} name */
function placeNameTokens(name) {
  const stop = new Set([
    "the",
    "le",
    "la",
    "les",
    "de",
    "du",
    "des",
    "del",
    "los",
    "las",
    "and",
    "et",
    "park",
    "parque",
    "plage",
    "beach",
    "museum",
    "musee",
    "museo",
  ]);
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[\s,./\-–—()]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 3 && !stop.has(w));
}

/**
 * @param {string} fileTitle
 * @param {string} description
 * @param {string[]} tokens
 */
function scorePlaceNameMatch(fileTitle, description, tokens) {
  if (!tokens.length) return 0;
  const hay = `${fileTitle} ${description}`.toLowerCase().replace(/_/g, " ");
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
  }
  if (hits >= 2) return 80;
  if (hits === 1) return 35;
  return 0;
}

/**
 * @param {string} fileTitle
 * @param {string} url
 * @param {string} mime
 * @param {string} description
 */
function isExcludedGeoPhoto(fileTitle, url, mime, description) {
  if (EXCLUDED_MIME_RE.test(String(mime || ""))) return true;
  if (isVectorWikiImageOrigin(url, fileTitle)) return true;
  if (isLikelyWikiBrandOrLogoImage(url, fileTitle)) return true;
  if (isLikelyOrbitalOrMapImagery(url, fileTitle, description)) return true;
  const hay = `${fileTitle} ${description}`.replace(/_/g, " ");
  if (EXCLUDED_KEYWORD_RE.test(hay)) return true;
  return false;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} [limit]
 */
async function fetchCommonsGeoSearchTitles(lat, lon, limit = GEO_GSLIMIT) {
  const la = roundGeoCoord(lat);
  const lo = roundGeoCoord(lon);
  const api =
    `${COMMONS_API}?action=query&format=json&origin=*` +
    `&list=geosearch&gscoord=${la}|${lo}` +
    `&gsradius=${GEO_RADIUS_M}&gsnamespace=6&gslimit=${Math.min(limit, 50)}`;

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
    timeoutMs: 12000,
  });
  if (throttled || timedOut || !ok) return { titles: [], throttled: throttled || timedOut };
  const list = Array.isArray(json?.query?.geosearch) ? json.query.geosearch : [];
  const titles = list
    .map((item) => String(item?.title || "").trim())
    .filter((t) => t.startsWith("File:"));
  return { titles, throttled: false };
}

/**
 * @param {string[]} titles — File:…
 */
async function fetchCommonsImageInfoBatch(titles) {
  const list = (Array.isArray(titles) ? titles : []).filter(Boolean).slice(0, 24);
  if (!list.length) return [];

  const api =
    `${COMMONS_API}?action=query&format=json&redirects=1&origin=*` +
    `&prop=imageinfo&iiprop=url|extmetadata|size|mime` +
    `&iiurlwidth=${GEO_THUMB_WIDTH}` +
    `&titles=${list.map((t) => encodeURIComponent(t)).join("%7C")}`;

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
    timeoutMs: 12000,
  });
  if (throttled || timedOut || !ok) return [];

  /** @type {import('../../lib/images/types.js').ImageCandidate[]} */
  const out = [];
  for (const page of Object.values(json?.query?.pages || {})) {
    const title = String(page?.title || "");
    const info = page?.imageinfo?.[0];
    if (!info) continue;
    const mime = String(info?.mime || "");
    const url = String(info?.thumburl || info?.url || "").trim();
    const meta = info?.extmetadata || {};
    const description =
      parseExtMetaValue(meta.ImageDescription) ||
      parseExtMetaValue(meta.ObjectName) ||
      "";
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (isExcludedGeoPhoto(title, url, mime, description)) continue;

    const w = Number(info?.width || 0);
    const h = Number(info?.height || 0);
    if (w > 0 && w < 400) continue;

    out.push({
      url: commonsThumbUrl(url, GEO_THUMB_WIDTH),
      source: /** @type {import('../../lib/images/types.js').ImageSource} */ ("wikidata-commons"),
      author:
        parseExtMetaValue(meta.Artist) ||
        parseExtMetaValue(meta.Credit) ||
        parseExtMetaValue(meta.Attribution) ||
        undefined,
      license: parseExtMetaValue(meta.LicenseShortName) || parseExtMetaValue(meta.UsageTerms) || undefined,
      licenseUrl: parseExtMetaValue(meta.LicenseUrl) || undefined,
      sourceUrl: String(info?.descriptionurl || "").trim() || undefined,
      width: w,
      height: h,
      score: scoreScenicCommonsFile(title, url, w, h, { hero: false }),
      fileTitle: title,
      description,
    });
  }
  return out;
}

/**
 * Wikimedia Commons geosearch par coordonnées + cache image_resolve_cache.
 *
 * @param {{ latitude: number, longitude: number, placeName?: string, logContext?: string }} params
 * @returns {Promise<{ url: string, cached: boolean, throttled?: boolean }>}
 */
export async function resolveWikimediaGeoPhoto(params) {
  const lat = Number(params.latitude);
  const lon = Number(params.longitude);
  const placeName = String(params.placeName || "").trim();
  const logContext = String(params.logContext || "").trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { url: "", cached: false };
  }

  const cacheLabel = geoPhotoCacheLabel(lat, lon);
  noteCacheStatusAtResolveStart();
  if (isCacheConfigured() && cacheLabel) {
    const cached = await readCacheByLabel(cacheLabel, "activity");
    if (cached.cache === "hit" && cached.entry?.url) {
      console.info(`[photos-cascade] geo cache hit ${logContext} key=${cacheLabel}`);
      return { url: cached.entry.url, cached: true };
    }
  }

  const { titles, throttled } = await fetchCommonsGeoSearchTitles(lat, lon);
  if (throttled) {
    console.info(`[photos-cascade] geo throttled ${logContext} key=${cacheLabel}`);
    return { url: "", cached: false, throttled: true };
  }
  if (!titles.length) {
    console.info(`[photos-cascade] geo miss empty ${logContext} key=${cacheLabel}`);
    return { url: "", cached: false };
  }

  const candidates = await fetchCommonsImageInfoBatch(titles);
  if (!candidates.length) {
    console.info(`[photos-cascade] geo miss filtered ${logContext} key=${cacheLabel} raw=${titles.length}`);
    return { url: "", cached: false };
  }

  const tokens = placeNameTokens(placeName);
  const ranked = candidates
    .map((c) => {
      const nameBoost = scorePlaceNameMatch(c.fileTitle || "", c.description || "", tokens);
      return { ...c, score: (c.score || 0) + nameBoost };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const best = ranked[0];
  if (!best?.url) return { url: "", cached: false };

  if (isCacheConfigured() && cacheLabel) {
    const { fileTitle: _ft, description: _d, ...candidate } = best;
    await writeCache({
      labelNormalized: cacheLabel,
      kind: "activity",
      candidate,
    });
  }

  console.info(
    `[photos-cascade] geo hit ${logContext} key=${cacheLabel} score=${best.score} title="${String(best.fileTitle || "").slice(0, 60)}"`
  );
  return { url: best.url, cached: false };
}
