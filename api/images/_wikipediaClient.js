import { isLikelyOrbitalOrMapImagery, isLikelyWikiBrandOrLogoImage } from "../../lib/images/wikiImageFilters.js";
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
    `&titles=${encodeURIComponent(t)}&prop=pageimages&pithumbsize=1920`;
  const r = await fetch(api, { headers: { "User-Agent": wikiUserAgent() } });
  if (!r.ok) return null;
  const j = await r.json();
  const page = Object.values(j?.query?.pages || {})[0];
  if (!page || page.missing) return null;
  const src = String(page.thumbnail?.source || "").trim();
  if (!src || isLikelyWikiBrandOrLogoImage(src, t)) return null;
  if (options.kind === "hero" && isLikelyOrbitalOrMapImagery(src, t)) return null;
  const tw = Number(page.thumbnail?.width || 0);
  const th = Number(page.thumbnail?.height || 0);
  return {
    url: commonsThumbUrl(src, 1920),
    source: "wikipedia",
    sourceUrl: `https://${l}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`,
    width: tw,
    height: th,
    score: th > tw * 1.15 ? 50 : 80,
  };
}

/**
 * @param {{ lang: string, title: string }[]} sitelinks
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind }} [options]
 */
export async function fetchWikipediaCandidates(sitelinks, options = {}) {
  const links = Array.isArray(sitelinks) ? sitelinks : [];
  const results = await Promise.all(
    links.slice(0, 5).map(({ lang, title }) => fetchWikipediaPageCandidate(lang, title, options))
  );
  return results.filter(Boolean);
}
