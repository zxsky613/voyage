/** Cache client guide Foursquare — une destination ≈ un fetch / 7 jours max. */

export const FSQ_GUIDE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LS_KEY = "tp_fsq_guide_cache_v1";

/** @param {number} lat @param {number} lon @param {string} locale */
export function fsqGuideCacheKey(lat, lon, locale = "fr") {
  const la = Number(lat);
  const lo = Number(lon);
  const lang = String(locale || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return "";
  return `${la.toFixed(3)}|${lo.toFixed(3)}|${lang}`;
}

function readStore() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(obj) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(obj || {}));
  } catch {
    /* quota */
  }
}

/**
 * @param {string} key
 * @returns {{ places: string[], activities: object[], ts: number, source?: string }|null}
 */
export function readFsqGuideCache(key) {
  const k = String(key || "").trim();
  if (!k) return null;
  const store = readStore();
  const row = store[k];
  if (!row || typeof row !== "object") return null;
  const ts = Number(row.ts) || 0;
  if (!ts || Date.now() - ts > FSQ_GUIDE_CACHE_TTL_MS) return null;
  return {
    places: Array.isArray(row.places) ? row.places : [],
    activities: Array.isArray(row.activities) ? row.activities : [],
    ts,
    source: row.source ? String(row.source) : "cache",
  };
}

/**
 * @param {string} key
 * @param {{ places?: string[], activities?: object[], source?: string }} data
 */
export function writeFsqGuideCache(key, data) {
  const k = String(key || "").trim();
  if (!k) return;
  const store = readStore();
  store[k] = {
    places: Array.isArray(data?.places) ? data.places : [],
    activities: Array.isArray(data?.activities) ? data.activities : [],
    source: data?.source ? String(data.source) : "live",
    ts: Date.now(),
  };
  writeStore(store);
}
