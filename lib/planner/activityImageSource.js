/**
 * Priorité image activité : photos TripAdvisor (enrichissement) puis resolver.
 */

/**
 * @param {unknown} entry
 * @returns {string}
 */
function photoEntryToUrl(entry) {
  if (typeof entry === "string") return entry.trim();
  if (entry && typeof entry === "object") {
    const o = /** @type {Record<string, unknown>} */ (entry);
    return String(
      o.url ||
        o.photoUrl ||
        o.original_size_url ||
        o.large_url ||
        (o.photo && typeof o.photo === "object"
          ? /** @type {Record<string, unknown>} */ (o.photo).original_size_url ||
            /** @type {Record<string, unknown>} */ (o.photo).large_url ||
            /** @type {Record<string, unknown>} */ (o.photo).url
          : "") ||
        (o.images && typeof o.images === "object"
          ? /** @type {Record<string, unknown>} */ (
              /** @type {Record<string, unknown>} */ (o.images).large
            )?.url
          : "") ||
        ""
    ).trim();
  }
  return "";
}

/**
 * Première URL photo TripAdvisor valide (photos[] ou photo_urls legacy).
 * @param {object|null|undefined} activityOrMeta
 * @returns {string}
 */
export function pickTripAdvisorActivityPhoto(activityOrMeta) {
  if (!activityOrMeta || typeof activityOrMeta !== "object") return "";
  const fromPhotos = Array.isArray(activityOrMeta.photos) ? activityOrMeta.photos : [];
  const fromLegacy = Array.isArray(activityOrMeta.photo_urls) ? activityOrMeta.photo_urls : [];
  for (const entry of [...fromPhotos, ...fromLegacy]) {
    const url = photoEntryToUrl(entry);
    if (url.startsWith("http")) return url;
  }
  return "";
}

/** @param {string} url */
export function isLikelyTripAdvisorPhotoUrl(url) {
  return /tripadvisor\.com|media-cdn\.tripadvisor/i.test(String(url || "").trim());
}

/**
 * @param {object|null|undefined} activityOrMeta
 * @returns {boolean}
 */
export function hasTripAdvisorActivityPhoto(activityOrMeta) {
  return Boolean(pickTripAdvisorActivityPhoto(activityOrMeta));
}

/**
 * @param {object|null|undefined} activityOrMeta
 * @param {string} [storedPhotoUrl]
 * @returns {string}
 */
export function pickActivityDisplayPhotoUrl(activityOrMeta, storedPhotoUrl = "") {
  return pickTripAdvisorActivityPhoto(activityOrMeta) || String(storedPhotoUrl || "").trim();
}

/**
 * Badge TripAdvisor requis quand la photo affichée provient de TA.
 * @param {object|null|undefined} activityOrMeta
 * @param {string} displayUrl
 * @returns {boolean}
 */
export function shouldShowTripAdvisorAttribution(activityOrMeta, displayUrl) {
  const u = String(displayUrl || "").trim();
  if (!u) return false;
  const ta = pickTripAdvisorActivityPhoto(activityOrMeta);
  if (ta && ta === u) return true;
  return isLikelyTripAdvisorPhotoUrl(u);
}
