const UA = "Justtrip/1.0 (image-resolve; travel-planner)";

export function wikiUserAgent() {
  return UA;
}

export function parseExtMetaValue(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (typeof raw === "object" && raw.value != null) {
    return String(raw.value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return String(raw).trim();
}

/** Upgrade thumb Commons vers largeur cible. */
export function commonsThumbUrl(url, width = 1920) {
  const u = String(url || "").trim();
  if (!u.includes("/thumb/")) return u;
  const q = u.indexOf("?");
  const base = q > 0 ? u.slice(0, q) : u;
  return base.replace(/\/\d+px-([^/?#]+)$/i, `/${width}px-$1`);
}

/** HEAD puis GET partiel si HEAD refusé. */
export async function headCheckUrl(url, timeoutMs = 8000) {
  const u = String(url || "").trim();
  if (!u.startsWith("http")) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let r = await fetch(u, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    if (r.ok) return true;
    if (r.status === 405 || r.status === 403) {
      r = await fetch(u, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "follow",
        headers: { Range: "bytes=0-0" },
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
    url: c.url,
    source: c.source,
    entityId: entityId || undefined,
    attribution: {
      author: c.author || undefined,
      license: c.license || undefined,
      licenseUrl: c.licenseUrl || undefined,
      sourceUrl: c.sourceUrl || undefined,
    },
  };
}
