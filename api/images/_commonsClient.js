import {
  HERO_MIN_LANDSCAPE_WIDTH,
  HERO_MIN_WIDTH,
  isHeroLandscapeDimensions,
  isLikelyNonScenicHeroImagery,
  isLikelyOrbitalOrMapImagery,
  isLikelyWikiBrandOrLogoImage,
  isOrbitalCommonsCategoryName,
  scoreScenicCommonsFile,
} from "../../lib/images/wikiImageFilters.js";
import { commonsThumbUrl, parseExtMetaValue, wikiUserAgent } from "./_headCheck.js";
import { fetchJsonWithRetry } from "./_fetchRetry.js";

/**
 * @param {string} fileTitle
 * @param {import('../../lib/images/types.js').ImageSource} [source]
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind }} [options]
 * @returns {Promise<import('../../lib/images/types.js').ImageCandidate|null>}
 */
export async function fetchCommonsFileCandidate(fileTitle, source = "wikidata-commons", options = {}) {
  const title = String(fileTitle || "").trim();
  if (!title) return null;
  const hero = options.kind === "hero";
  if (hero && isLikelyOrbitalOrMapImagery("", title)) return null;

  const filePage = title.startsWith("File:") ? title : `File:${title}`;
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1" +
    `&titles=${encodeURIComponent(filePage)}` +
    "&prop=imageinfo&iiprop=url|thumburl|extmetadata|size";

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut || !ok) return null;
  const j = json;
  const page = Object.values(j?.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  const url = String(info?.thumburl || info?.url || "").trim();
  if (!url || isLikelyWikiBrandOrLogoImage(url, title)) return null;
  if (hero && isLikelyOrbitalOrMapImagery(url, title)) return null;
  if (hero && isLikelyNonScenicHeroImagery(url, title)) return null;

  const meta = info?.extmetadata || {};
  const categoriesRaw = String(parseExtMetaValue(meta.Categories) || "").toLowerCase();
  if (hero && isLikelyOrbitalOrMapImagery(url, title, categoriesRaw)) return null;
  if (hero && isLikelyNonScenicHeroImagery(url, title, categoriesRaw)) return null;
  const w = Number(info?.width || 0);
  const h = Number(info?.height || 0);
  if (hero && (!isHeroLandscapeDimensions(w, h) || w < HERO_MIN_LANDSCAPE_WIDTH)) return null;
  if (source === "commons-category" && w < HERO_MIN_WIDTH) return null;

  return {
    url: commonsThumbUrl(url),
    source: /** @type {import('../../lib/images/types.js').ImageSource} */ (source),
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
    score: scoreScenicCommonsFile(title, url, w, h, { hero, categories: categoriesRaw, destinationTokens: options.destinationTokens }),
  };
}

/**
 * @param {string[]} filenames
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind }} [options]
 */
export async function fetchP18Candidates(filenames, options = {}) {
  const hero = options.kind === "hero";
  const list = (Array.isArray(filenames) ? filenames : [])
    .slice(0, 4)
    .filter((f) => !(hero && isLikelyOrbitalOrMapImagery("", String(f || ""))));
  const results = await Promise.all(
    list.map((f) => fetchCommonsFileCandidate(f, "wikidata-commons", options))
  );
  return results.filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Liste fichiers d'une catégorie Commons P373, score scénique, retourne candidats triés.
 * @param {string} categoryName — sans préfixe « Category: »
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind, destinationTokens?: string[] }} [options]
 */
export async function fetchCommonsCategoryScenicCandidates(categoryName, options = {}) {
  const cat = String(categoryName || "").trim();
  if (!cat) return [];
  if (options.kind === "hero" && isOrbitalCommonsCategoryName(cat)) return [];

  const listApi =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    `&list=categorymembers&cmtitle=${encodeURIComponent(`Category:${cat}`)}` +
    "&cmtype=file&cmlimit=40&cmnamespace=6";

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(listApi, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut || !ok) return [];
  const lj = json;
  const members = Array.isArray(lj?.query?.categorymembers) ? lj.query.categorymembers : [];
  const titles = members
    .map((m) => String(m?.title || "").replace(/^File:/i, ""))
    .filter(Boolean)
    .slice(0, 24);

  const batchSize = 6;
  /** @type {import('../../lib/images/types.js').ImageCandidate[]} */
  const all = [];
  for (let i = 0; i < titles.length; i += batchSize) {
    const chunk = titles.slice(i, i + batchSize);
    const chunkResults = await Promise.all(
      chunk.map((t) => fetchCommonsFileCandidate(t, "commons-category", options))
    );
    for (const c of chunkResults) {
      if (!c) continue;
      const minScore = options.kind === "hero" ? 60 : 0;
      if ((c.score || 0) >= minScore) all.push(c);
    }
  }
  return all.sort((a, b) => (b.score || 0) - (a.score || 0));
}
