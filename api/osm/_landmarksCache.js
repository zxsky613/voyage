/** Cache mémoire serveur landmarks Overpass (24 h). */

const TTL_MS = 24 * 60 * 60 * 1000;
/** @type {Map<string, { names: string[], ts: number }>} */
const store = new Map();

/** @param {number} lat @param {number} lon @param {number} radius @param {string} locale */
export function osmLandmarksServerCacheKey(lat, lon, radius, locale) {
  return `${Number(lat).toFixed(3)}|${Number(lon).toFixed(3)}|${Math.round(Number(radius) || 11000)}|${String(locale || "fr").slice(0, 2)}`;
}

/** @param {string} key */
export function readOsmLandmarksServerCache(key) {
  const row = store.get(String(key || ""));
  if (!row) return null;
  if (Date.now() - row.ts > TTL_MS) {
    store.delete(String(key));
    return null;
  }
  return row.names;
}

/** @param {string} key @param {string[]} names */
export function writeOsmLandmarksServerCache(key, names) {
  store.set(String(key || ""), {
    names: Array.isArray(names) ? names : [],
    ts: Date.now(),
  });
}
