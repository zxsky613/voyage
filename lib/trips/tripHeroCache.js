const TRIP_HERO_LS_PREFIX = "tp_trip_hero_v1_";

/** @param {string} tripId */
export function tripHeroCacheKey(tripId) {
  const id = String(tripId || "").trim();
  return id ? `${TRIP_HERO_LS_PREFIX}${id}` : "";
}

/** @param {string} tripId */
export function readTripHeroCache(tripId) {
  const key = tripHeroCacheKey(tripId);
  if (!key || typeof window === "undefined") return "";
  try {
    const url = String(window.localStorage.getItem(key) || "").trim();
    return /^https?:\/\//i.test(url) ? url : "";
  } catch {
    return "";
  }
}

/** @param {string} tripId @param {string} url */
export function writeTripHeroCache(tripId, url) {
  const key = tripHeroCacheKey(tripId);
  const u = String(url || "").trim();
  if (!key || !/^https?:\/\//i.test(u)) return;
  try {
    window.localStorage.setItem(key, u);
  } catch {
    /* ignore */
  }
}

/** @param {string} tripId */
export function clearTripHeroCache(tripId) {
  const key = tripHeroCacheKey(tripId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
