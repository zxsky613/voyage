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
export const HERO_GEO_RADIUS_M = 8000;
const HERO_GEO_LIMIT = 28;

/**
 * Catégories Commons « émotion » ancrées sur P373 de l'entité Wikidata (pas le nom texte seul).
 * @param {{ commonsCategory?: string }} entity
 */
export function buildEmotionalCommonsCategoriesFromEntity(entity) {
  const p373 = String(entity?.commonsCategory || "").trim();
  if (!p373) return [];
  return [
    { name: `Featured pictures of ${p373}`, heroSource: /** @type {const} */ ("commons-featured") },
    { name: `Quality images of ${p373}`, heroSource: /** @type {const} */ ("commons-quality") },
    { name: `Views of ${p373}`, heroSource: /** @type {const} */ ("commons") },
    { name: `Landscapes of ${p373}`, heroSource: /** @type {const} */ ("commons") },
  ];
}

/**
 * @param {{ commonsCategory?: string }} entity
 * @returns {Array<{ name: string, heroSource: import('../../lib/images/types.js').HeroSource }>}
 */
export function buildHeroFeaturedQualitySteps(entity) {
  const p373 = String(entity?.commonsCategory || "").trim();
  if (!p373) return [];
  return [
    { name: `Featured pictures of ${p373}`, heroSource: /** @type {const} */ ("commons-featured") },
    { name: `Quality images of ${p373}`, heroSource: /** @type {const} */ ("commons-quality") },
  ];
}

/**
 * @param {{ commonsCategory?: string }} entity
 * @returns {Array<{ name: string, heroSource: import('../../lib/images/types.js').HeroSource }>}
 */
export function buildHeroViewsLandscapesSteps(entity) {
  const p373 = String(entity?.commonsCategory || "").trim();
  if (!p373) return [];
  return [
    { name: `Views of ${p373}`, heroSource: /** @type {const} */ ("commons") },
    { name: `Landscapes of ${p373}`, heroSource: /** @type {const} */ ("commons") },
  ];
}

/**
 * @param {{ commonsCategory?: string }} entity
 * @returns {Array<{ name: string, heroSource: import('../../lib/images/types.js').HeroSource }>}
 */
export function buildHeroSequentialCommonsSteps(entity) {
  return [...buildHeroFeaturedQualitySteps(entity), ...buildHeroViewsLandscapesSteps(entity)];
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
    .map((item) => ({
      title: String(item?.title || "").trim(),
      distM: Number(item?.dist) || 0,
    }))
    .filter((item) => item.title.startsWith("File:"));
}

/**
 * @param {Array<{ title: string, distM?: number }>} geoItems
 * @param {{ destinationTokens?: string[] }} options
 */
async function fetchGeoHeroCandidates(geoItems, options = {}) {
  const list = (Array.isArray(geoItems) ? geoItems : []).filter((x) => x?.title).slice(0, HERO_GEO_LIMIT);
  if (!list.length) return [];

  const api =
    `${COMMONS_API}?action=query&format=json&redirects=1&origin=*` +
    `&prop=imageinfo&iiprop=url|thumburl|extmetadata|size|mime|coordinates` +
    `&iiurlwidth=${HERO_COMMONS_THUMB_WIDTH}` +
    `&titles=${list.map((x) => encodeURIComponent(x.title)).join("%7C")}`;

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
    timeoutMs: 12000,
  });
  if (throttled || timedOut || !ok) return [];

  const distByTitle = Object.fromEntries(list.map((x) => [x.title, Number(x.distM) || 0]));

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

    const coord = Array.isArray(info?.coordinates) ? info.coordinates[0] : null;
    const imageLat = Number(coord?.lat);
    const imageLon = Number(coord?.lon);

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
      categories: categoriesRaw,
      extmetadata: meta,
      geosearchDistM: distByTitle[`File:${title}`] || distByTitle[title] || 0,
      imageLat: Number.isFinite(imageLat) ? imageLat : undefined,
      imageLon: Number.isFinite(imageLon) ? imageLon : undefined,
    });
  }
  return out.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Une catégorie Commons P373 (étape séquentielle hero).
 * @param {string} categoryName
 * @param {import('../../lib/images/types.js').HeroSource} heroSource
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind, uiLang?: string, destinationTokens?: string[] }} options
 */
export async function fetchHeroCommonsCategoryCandidates(categoryName, heroSource, options = {}) {
  const heroOpts = { ...options, kind: /** @type {'hero'} */ ("hero") };
  const batch = await fetchCommonsCategoryScenicCandidates(categoryName, {
    ...heroOpts,
    emotionalCategory: categoryName,
    minHeroScore: 45,
  });
  return batch.map((c) => ({ ...c, heroSource }));
}

/**
 * Geosearch Commons 8 km — dernier recours hero (P625 entité).
 * @param {NonNullable<Awaited<ReturnType<import('./_entityResolver.js').resolveEntity>>>} entity
 * @param {{ destinationTokens?: string[] }} [options]
 */
export async function fetchHeroGeosearchCandidates(entity, options = {}) {
  const coords = entity?.coordinates;
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) {
    return [];
  }
  const geoItems = await fetchGeoSearchFileTitles(coords.lat, coords.lon);
  return fetchGeoHeroCandidates(geoItems, options);
}

/**
 * @deprecated Cascade fusionnée — ne plus utiliser pour hero (conservé pour scripts legacy).
 */
export async function fetchHeroEmotionalCandidates(entity, searchLabel, options = {}) {
  const heroOpts = { ...options, kind: /** @type {'hero'} */ ("hero") };
  /** @type {import('../../lib/images/types.js').ImageCandidate[]} */
  const merged = [];

  for (const cat of buildEmotionalCommonsCategoriesFromEntity(entity)) {
    const batch = await fetchHeroCommonsCategoryCandidates(cat.name, cat.heroSource, heroOpts);
    merged.push(...batch);
  }

  merged.push(...(await fetchHeroGeosearchCandidates(entity, heroOpts)));

  return merged.sort((a, b) => (b.score || 0) - (a.score || 0));
}
