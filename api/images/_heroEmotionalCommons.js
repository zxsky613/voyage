import { HERO_COMMONS_THUMB_WIDTH } from "../../lib/images/commonsThumbUrl.js";
import {
  isHeroLandscapeDimensions,
  isLikelyOrbitalOrMapImagery,
  scoreScenicCommonsFile,
} from "../../lib/images/wikiImageFilters.js";
import { fetchCommonsCategoryScenicCandidates } from "./_commonsClient.js";
import { commonsThumbUrl, parseExtMetaValue, wikiUserAgent } from "./_headCheck.js";
import { fetchJsonWithRetry } from "./_fetchRetry.js";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const HERO_GEO_RADIUS_M = 8000;
const HERO_GEO_LIMIT = 28;

/** @param {string} searchLabel */
function englishCommonsPlaceName(searchLabel) {
  const head = String(searchLabel || "")
    .trim()
    .split(",")[0]
    ?.trim();
  if (!head) return "";
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/**
 * Catégories Commons « émotion » — ordre de priorité.
 * @param {string} placeName
 */
export function buildEmotionalCommonsCategories(placeName) {
  const p = englishCommonsPlaceName(placeName);
  if (!p) return [];
  return [
    { name: `Featured pictures of ${p}`, heroSource: /** @type {const} */ ("commons-featured") },
    { name: `Quality images of ${p}`, heroSource: /** @type {const} */ ("commons-quality") },
    { name: `Views of ${p}`, heroSource: /** @type {const} */ ("commons") },
    { name: `Landscapes of ${p}`, heroSource: /** @type {const} */ ("commons") },
  ];
}

/**
 * @param {number} lat
 * @param {number} lon
 */
async function fetchGeoSearchFileTitles(lat, lon) {
  const api =
    `${COMMONS_API}?action=query&format=json&origin=*` +
    `&list=geosearch&gscoord=${lat}|${lon}` +
    `&gsradius=${HERO_GEO_RADIUS_M}&gsnamespace=6&gslimit=${HERO_GEO_LIMIT}`;

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
    timeoutMs: 12000,
  });
  if (throttled || timedOut || !ok) return [];
  return (Array.isArray(json?.query?.geosearch) ? json.query.geosearch : [])
    .map((item) => String(item?.title || "").trim())
    .filter((t) => t.startsWith("File:"));
}

/**
 * @param {string[]} titles
 * @param {{ destinationTokens?: string[] }} options
 */
async function fetchGeoHeroCandidates(titles, options = {}) {
  const list = (Array.isArray(titles) ? titles : []).filter(Boolean).slice(0, HERO_GEO_LIMIT);
  if (!list.length) return [];

  const api =
    `${COMMONS_API}?action=query&format=json&redirects=1&origin=*` +
    `&prop=imageinfo&iiprop=url|thumburl|extmetadata|size|mime` +
    `&iiurlwidth=${HERO_COMMONS_THUMB_WIDTH}` +
    `&titles=${list.map((t) => encodeURIComponent(t)).join("%7C")}`;

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
    timeoutMs: 12000,
  });
  if (throttled || timedOut || !ok) return [];

  /** @type {import('../../lib/images/types.js').ImageCandidate[]} */
  const out = [];
  for (const page of Object.values(json?.query?.pages || {})) {
    const title = String(page?.title || "").replace(/^File:/i, "");
    const info = page?.imageinfo?.[0];
    if (!info) continue;
    const url = String(info?.thumburl || info?.url || "").trim();
    if (!url) continue;
    const meta = info?.extmetadata || {};
    const categoriesRaw = String(parseExtMetaValue(meta.Categories) || "").toLowerCase();
    if (isLikelyOrbitalOrMapImagery(url, title, categoriesRaw)) continue;

    const w = Number(info?.width || 0);
    const h = Number(info?.height || 0);
    if (!isHeroLandscapeDimensions(w, h)) continue;

    const score = scoreScenicCommonsFile(title, url, w, h, {
      hero: true,
      categories: categoriesRaw,
      destinationTokens: options.destinationTokens,
    });
    if (score < 50) continue;

    out.push({
      url: commonsThumbUrl(url),
      source: /** @type {import('../../lib/images/types.js').ImageSource} */ ("commons-category"),
      heroSource: /** @type {const} */ ("geosearch"),
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
      score,
    });
  }
  return out.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Étape émotion — Featured/Quality/Views/Landscapes + geosearch filtré.
 * @param {NonNullable<Awaited<ReturnType<import('./_entityResolver.js').resolveEntity>>>} entity
 * @param {string} searchLabel
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind, uiLang?: string, destinationTokens?: string[] }} options
 */
export async function fetchHeroEmotionalCandidates(entity, searchLabel, options = {}) {
  const heroOpts = { ...options, kind: /** @type {'hero'} */ ("hero") };
  const placeName = englishCommonsPlaceName(searchLabel);
  /** @type {import('../../lib/images/types.js').ImageCandidate[]} */
  const merged = [];

  for (const cat of buildEmotionalCommonsCategories(placeName)) {
    const batch = await fetchCommonsCategoryScenicCandidates(cat.name, {
      ...heroOpts,
      emotionalCategory: cat.name,
      minHeroScore: 45,
    });
    for (const c of batch) {
      merged.push({ ...c, heroSource: cat.heroSource });
    }
  }

  const coords = entity?.coordinates;
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
    const titles = await fetchGeoSearchFileTitles(coords.lat, coords.lon);
    const geo = await fetchGeoHeroCandidates(titles, heroOpts);
    merged.push(...geo);
  }

  return merged.sort((a, b) => (b.score || 0) - (a.score || 0));
}
