import {
  isLikelyOrbitalOrMapImagery,
  isLikelyWikiBrandOrLogoImage,
} from "../../lib/images/wikiImageFilters.js";
import { fetchCommonsFileCandidate } from "./_commonsClient.js";
import { fetchJsonWithRetry } from "./_fetchRetry.js";
import { commonsThumbUrl, wikiUserAgent } from "./_headCheck.js";

/** @param {string} wikitext */
function parsePageBannerFileName(wikitext) {
  const m = String(wikitext || "").match(/\{\{pagebanner\s*\|([^}\n]+)/i);
  if (!m) return "";
  const firstSegment = m[1].split("|")[0];
  return normalizePageBannerParam(firstSegment);
}

/** @param {string} param */
function normalizePageBannerParam(param) {
  let s = String(param || "")
    .trim()
    .replace(/^nocaption\s*=\s*yes\s*,?\s*/i, "")
    .replace(/^caption\s*=\s*[^,|]+,?\s*/i, "")
    .trim();
  if (!s || /^nocaption/i.test(s) || /^caption=/i.test(s)) return "";
  if (/^file:/i.test(s)) return s.replace(/^file:/i, "").trim();
  return s;
}

function passesHeroFilter(url, title, kind) {
  if (isLikelyWikiBrandOrLogoImage(url, title)) return false;
  if (kind === "hero" && isLikelyOrbitalOrMapImagery(url, title, "")) return false;
  return true;
}

/**
 * Bannière Wikivoyage ({{pagebanner|…}}) → fichier Commons.
 * @param {string} lang
 * @param {string} title
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind }} [options]
 */
export async function fetchWikivoyagePageBannerCandidate(lang, title, options = {}) {
  const t = String(title || "").trim();
  const l = String(lang || "en").slice(0, 2);
  if (!t) return null;

  const api =
    `https://${l}.wikivoyage.org/w/api.php?action=query&format=json&redirects=1&origin=*` +
    `&titles=${encodeURIComponent(t)}&prop=revisions&rvprop=content&rvlimit=1&rvslots=main`;

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut || !ok) return null;

  const page = Object.values(json?.query?.pages || {})[0];
  if (!page || page.missing) return null;
  const content = page.revisions?.[0]?.slots?.main?.["*"] || page.revisions?.[0]?.["*"] || "";
  const fileName = parsePageBannerFileName(content);
  if (!fileName) return null;

  const commons = await fetchCommonsFileCandidate(fileName, "wikivoyage", options);
  if (!commons?.url) return null;
  if (!passesHeroFilter(commons.url, fileName, options.kind)) return null;
  return { ...commons, source: /** @type {'wikivoyage'} */ ("wikivoyage"), score: (commons.score || 0) + 40 };
}

/**
 * Image de tête pageimages sur Wikivoyage.
 * @param {string} lang
 * @param {string} title
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind }} [options]
 */
export async function fetchWikivoyagePageImageCandidate(lang, title, options = {}) {
  const t = String(title || "").trim();
  const l = String(lang || "en").slice(0, 2);
  if (!t) return null;

  const api =
    `https://${l}.wikivoyage.org/w/api.php?action=query&format=json&redirects=1&origin=*` +
    `&titles=${encodeURIComponent(t)}&prop=pageimages&piprop=thumbnail&pithumbsize=1600`;

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(api, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut || !ok) return null;

  const page = Object.values(json?.query?.pages || {})[0];
  if (!page || page.missing) return null;
  const src = String(page.thumbnail?.source || "").trim();
  if (!src || !passesHeroFilter(src, t, options.kind)) return null;

  const tw = Number(page.thumbnail?.width || 0);
  const th = Number(page.thumbnail?.height || 0);
  return {
    url: commonsThumbUrl(src),
    source: /** @type {'wikivoyage'} */ ("wikivoyage"),
    sourceUrl: `https://${l}.wikivoyage.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`,
    width: tw,
    height: th,
    score: th > tw * 1.15 ? 55 : 75,
  };
}

/**
 * Candidats Wikivoyage pour une entité — pagebanner puis pageimages, par langue.
 * @param {{ wikivoyageSitelinks?: { lang: string, title: string }[], sitelinks?: { lang: string, title: string }[] }} entity
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind }} [options]
 * @param {string} [uiLang]
 */
export async function fetchWikivoyageCandidates(entity, options = {}, uiLang = "fr") {
  const lang = String(uiLang || "fr").slice(0, 2);
  /** @type {{ lang: string, title: string }[]} */
  const links = [];
  const seen = new Set();

  const add = (l, title) => {
    const t = String(title || "").trim();
    const key = `${l}:${t}`;
    if (!t || seen.has(key)) return;
    seen.add(key);
    links.push({ lang: l, title: t });
  };

  for (const row of entity?.wikivoyageSitelinks || []) {
    add(String(row.lang || "en").slice(0, 2), row.title);
  }
  if (!links.length) {
    for (const row of entity?.sitelinks || []) {
      add(String(row.lang || "en").slice(0, 2), row.title);
    }
  }

  const ordered = [];
  for (const l of [lang, "en", "fr", "de", "es", "it"]) {
    const hit = links.find((x) => x.lang === l);
    if (hit) ordered.push(hit);
  }
  for (const row of links) {
    if (!ordered.some((x) => x.lang === row.lang && x.title === row.title)) ordered.push(row);
  }

  /** @type {import('../../lib/images/types.js').ImageCandidate[]} */
  const out = [];
  for (const { lang: l, title } of ordered.slice(0, 4)) {
    const banner = await fetchWikivoyagePageBannerCandidate(l, title, options);
    if (banner) out.push(banner);
    const pageImg = await fetchWikivoyagePageImageCandidate(l, title, options);
    if (pageImg) out.push(pageImg);
  }
  return out;
}
