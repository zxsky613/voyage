const itineraryBulletImageCache = Object.create(null);
let itineraryBulletImageFetchChain = Promise.resolve();

/** Ne jamais mémoriser un échec / URL vide — re-tentative au prochain affichage. */
export function readItineraryBulletImageCache(key) {
  const u = String(itineraryBulletImageCache[key] || "").trim();
  if (!/^https?:\/\//i.test(u)) {
    if (itineraryBulletImageCache[key] != null) delete itineraryBulletImageCache[key];
    return "";
  }
  return u;
}

export function noteItineraryBulletImageCache(key, url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return;
  itineraryBulletImageCache[key] = u;
}

export function clearItineraryBulletImageCacheEntry(key) {
  if (itineraryBulletImageCache[key] != null) delete itineraryBulletImageCache[key];
}

export function buildPlannerActivityImageCacheKey(cityLabel, activityId, title) {
  return `planner-v1|${String(cityLabel || "").trim()}|${String(activityId || "")}|${String(title || "").trim()}`;
}

export function scheduleItineraryBulletImageFetch(task) {
  const run = itineraryBulletImageFetchChain.then(() => task());
  itineraryBulletImageFetchChain = run.catch(() => {});
  return run;
}
