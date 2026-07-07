/** Cache client landmarks OSM — 24 h (Overpass fragile). */

export const OSM_LANDMARKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LS_KEY = "tp_osm_landmarks_cache_v1";

/** @param {number} lat @param {number} lon @param {string} locale */
export function osmLandmarksCacheKey(lat, lon, locale = "fr") {
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

/** @param {string} key @returns {string[]|null} */
export function readOsmLandmarksCache(key) {
  const k = String(key || "").trim();
  if (!k) return null;
  const store = readStore();
  const row = store[k];
  if (!row || typeof row !== "object") return null;
  const ts = Number(row.ts) || 0;
  if (!ts || Date.now() - ts > OSM_LANDMARKS_CACHE_TTL_MS) return null;
  return Array.isArray(row.names) ? row.names.map(String).filter(Boolean) : [];
}

/** @param {string} key @param {string[]} names */
export function writeOsmLandmarksCache(key, names) {
  const k = String(key || "").trim();
  if (!k) return;
  const store = readStore();
  store[k] = { names: Array.isArray(names) ? names : [], ts: Date.now() };
  writeStore(store);
}
