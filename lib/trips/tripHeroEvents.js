/** @param {string} tripId @param {string} url */
export function notifyTripHeroPersisted(tripId, url) {
  if (typeof window === "undefined" || !tripId || !url) return;
  window.dispatchEvent(new CustomEvent("trip-hero-persisted", { detail: { tripId, url } }));
}
