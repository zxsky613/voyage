import {
  HERO_COMMONS_THUMB_WIDTH,
  toCommonsThumbUrl,
} from "../../lib/images/commonsThumbUrl.js";

export const WIKIMEDIA_USER_AGENT =
  "JustTrip/1.0 (https://justtrip.fr; contact@justtrip.fr)";

export function wikiUserAgent() {
  return WIKIMEDIA_USER_AGENT;
}

export { HERO_COMMONS_THUMB_WIDTH, toCommonsThumbUrl };

/** @param {string} url */
export function isWikimediaApiUrl(url) {
  try {
    const host = new URL(String(url || "")).hostname.toLowerCase();
    if (!host) return false;
    const roots = ["wikidata.org", "wikimedia.org", "wikipedia.org", "wikivoyage.org"];
    return roots.some((root) => host === root || host.endsWith(`.${root}`));
  } catch {
    return false;
  }
}

export function parseExtMetaValue(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (typeof raw === "object" && raw.value != null) {
    return String(raw.value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return String(raw).trim();
}

/** Normalise vers miniature Commons (originale ou thumb existante). */
export function commonsThumbUrl(url, width = HERO_COMMONS_THUMB_WIDTH) {
  return toCommonsThumbUrl(url, width);
}

/** HEAD puis GET partiel si HEAD refusé. */
export async function headCheckUrl(url, timeoutMs = 8000) {
  const u = String(url || "").trim();
  if (!u.startsWith("http")) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const wikiHeaders = isWikimediaApiUrl(u) ? { "User-Agent": wikiUserAgent() } : {};
  try {
    let r = await fetch(u, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "follow",
      headers: wikiHeaders,
    });
    if (r.ok) return true;
    if (r.status === 405 || r.status === 403) {
      r = await fetch(u, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "follow",
        headers: { ...wikiHeaders, Range: "bytes=0-0" },
      });
      return r.ok || r.status === 206;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * HEAD-check séquentiel — premier candidat valide.
 * @param {import('../../lib/images/types.js').ImageCandidate[]} candidates
 * @returns {Promise<import('../../lib/images/types.js').ImageCandidate|null>}
 */
export async function firstValidCandidate(candidates) {
  const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c?.url);
  for (const c of list) {
    if (await headCheckUrl(c.url)) return c;
  }
  return null;
}

/**
 * @param {import('../../lib/images/types.js').ImageCandidate} c
 */
export function candidateToResolved(c, entityId) {
  return {
    url: commonsThumbUrl(c.url),
    source: c.source,
    heroSource: c.heroSource,
    entityId: entityId || undefined,
    attribution: {
      author: c.author || undefined,
      license: c.license || undefined,
      licenseUrl: c.licenseUrl || undefined,
      sourceUrl: c.sourceUrl || undefined,
    },
  };
}
