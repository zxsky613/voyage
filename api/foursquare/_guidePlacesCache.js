/** Cache mémoire serveur — recherche POI guide par lat/lon (7 j). */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** @type {Map<string, { results: object[], ts: number }>} */
const store = new Map();

/** @param {number} lat @param {number} lon @param {string} locale @param {string} categories */
export function fsqServerCacheKey(lat, lon, locale, categories) {
  return `${Number(lat).toFixed(3)}|${Number(lon).toFixed(3)}|${String(locale || "fr").slice(0, 2)}|${categories || "poi"}`;
}

/** @param {string} key */
export function readFsqServerCache(key) {
  const row = store.get(String(key || ""));
  if (!row) return null;
  if (Date.now() - row.ts > TTL_MS) {
    store.delete(String(key));
    return null;
  }
  return row.results;
}

/** @param {string} key @param {object[]} results */
export function writeFsqServerCache(key, results) {
  store.set(String(key || ""), {
    results: Array.isArray(results) ? results : [],
    ts: Date.now(),
  });
}
