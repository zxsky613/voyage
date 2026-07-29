const TRIP_HERO_LS_PREFIX = "tp_trip_hero_v2_";
const TRIP_HERO_LS_LEGACY_PREFIX = "tp_trip_hero_v1_";
const PURGE_LEGACY_LS_FLAG = "tp_trip_hero_purged_v1_once";

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
    window.localStorage.removeItem(`${TRIP_HERO_LS_LEGACY_PREFIX}${String(tripId || "").trim()}`);
  } catch {
    /* ignore */
  }
}

/** One-shot : supprime tp_trip_hero_v1_* (entrées instables, non relues en v2). */
export function purgeLegacyTripHeroLocalStorageOnce() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (window.localStorage.getItem(PURGE_LEGACY_LS_FLAG) === "1") return;
    const toRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(TRIP_HERO_LS_LEGACY_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
    window.localStorage.setItem(PURGE_LEGACY_LS_FLAG, "1");
  } catch {
    /* ignore */
  }
}

/** One-shot : purge tp_city_img_v3_* (cache partagé par ville — voyages homonymes identiques). */
export function purgeSharedCityHeroLocalStorageOnce() {
  const flag = "tp_city_img_v3_purged_once";
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (window.localStorage.getItem(flag) === "1") return;
    const prefixes = ["tp_city_img_v3_", "tp_city_img_v2_"];
    const toRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
    window.localStorage.setItem(flag, "1");
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  purgeLegacyTripHeroLocalStorageOnce();
  purgeSharedCityHeroLocalStorageOnce();
}
