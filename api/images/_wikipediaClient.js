import {
  isHeroLandscapeDimensions,
  isLikelyNonScenicHeroImagery,
  isLikelyOrbitalOrMapImagery,
  isLikelyWikiBrandOrLogoImage,
} from "../../lib/images/wikiImageFilters.js";
import { fetchJsonWithRetry } from "./_fetchRetry.js";
import { commonsThumbUrl, wikiUserAgent } from "./_headCheck.js";

/**
 * @param {string} lang
 * @param {string} title
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind }} [options]
 * @returns {Promise<import('../../lib/images/types.js').ImageCandidate|null>}
 */
export async function fetchWikipediaPageCandidate(lang, title, options = {}) {
  const t = String(title || "").trim();
  const l = String(lang || "en").slice(0, 2);
  if (!t) return null;
  const api =
    `https://${l}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&origin=*` +
    `&titles=${encodeURIComponent(t)}&prop=pageimages&piprop=original|thumbnail&pithumbsize=1920`;
  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut || !ok) return null;
  const page = Object.values(json?.query?.pages || {})[0];
  if (!page || page.missing) return null;

  const original = page.original;
  const thumb = page.thumbnail;
  let src = "";
  let tw = 0;
  let th = 0;
  if (original?.source) {
    src = String(original.source).trim();
    tw = Number(original.width || 0);
    th = Number(original.height || 0);
  } else if (thumb?.source) {
    src = String(thumb.source).trim();
    tw = Number(thumb.width || 0);
    th = Number(thumb.height || 0);
  }
  if (!src || isLikelyWikiBrandOrLogoImage(src, t)) return null;
  if (options.kind === "hero") {
    if (isLikelyOrbitalOrMapImagery(src, t)) return null;
    if (isLikelyNonScenicHeroImagery(src, t)) return null;
    if (!isHeroLandscapeDimensions(tw, th)) return null;
  }

  return {
    url: commonsThumbUrl(src, 1920),
    source: "wikipedia",
    heroSource: "pageimage",
    sourceUrl: `https://${l}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`,
    width: tw,
    height: th,
    score: th > tw * 1.15 ? 50 : 90,
  };
}

/**
 * @param {{ lang: string, title: string }[]} sitelinks
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind, uiLang?: string }} [options]
 */
export async function fetchWikipediaCandidates(sitelinks, options = {}) {
  const links = Array.isArray(sitelinks) ? sitelinks : [];
  const uiLang = String(options.uiLang || "en").slice(0, 2);
  const order = [uiLang, "en", "fr", "de", "es", "it", "zh"];
  const byLang = Object.fromEntries(links.map(({ lang, title }) => [String(lang || "").slice(0, 2), { lang, title }]));
  /** @type {import('../../lib/images/types.js').ImageCandidate[]} */
  const out = [];
  for (const l of order) {
    const link = byLang[l];
    if (!link) continue;
    const c = await fetchWikipediaPageCandidate(link.lang, link.title, options);
    if (c) out.push(c);
  }
  return out;
}
