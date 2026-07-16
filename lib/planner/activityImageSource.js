/**
 * Priorité image activité : photos TripAdvisor (enrichissement) puis resolver.
 */

import { inferPhotoSourceFromPlace } from "./photoSource.js";

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

/**
 * Toutes les URLs photo valides d'une activité / lieu enrichi.
 * @param {object|null|undefined} activityOrMeta
 * @returns {string[]}
 */
export function collectActivityPhotoUrls(activityOrMeta) {
  if (!activityOrMeta || typeof activityOrMeta !== "object") return [];
  const fromPhotos = Array.isArray(activityOrMeta.photos) ? activityOrMeta.photos : [];
  const fromLegacy = Array.isArray(activityOrMeta.photo_urls) ? activityOrMeta.photo_urls : [];
  const out = [];
  const seen = new Set();
  for (const entry of [...fromPhotos, ...fromLegacy]) {
    const url = photoEntryToUrl(entry);
    if (!url.startsWith("http")) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  const direct = String(activityOrMeta.photoUrl || activityOrMeta.photo_url || "").trim();
  if (/^https?:\/\//i.test(direct) && !seen.has(direct.toLowerCase())) out.unshift(direct);
  return out;
}

/**
 * Photo résolue (TA, FSQ, Wikimedia ou photoUrl serveur).
 * @param {object|null|undefined} activityOrMeta
 * @returns {string}
 */
export function pickResolvedActivityPhoto(activityOrMeta) {
  const urls = collectActivityPhotoUrls(activityOrMeta);
  return urls[0] || "";
}

/** @param {object|null|undefined} activityOrMeta */
export function isActivityPhotoPlaceholder(activityOrMeta) {
  return String(activityOrMeta?.photoSource || activityOrMeta?.photo_source || "") === "placeholder";
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
  const direct = String(
    storedPhotoUrl || activityOrMeta?.photo_url || activityOrMeta?.image_url || ""
  ).trim();
  return pickResolvedActivityPhoto(activityOrMeta) || direct;
}

/**
 * URL photo persistée pour le planning (aligné sur getActivityImageUrl dans App.jsx).
 * @param {object|null|undefined} activity
 * @returns {string}
 */
export function pickPlannerActivityStoredPhotoUrl(activity) {
  return pickActivityDisplayPhotoUrl(
    activity,
    String(activity?.photo_url || activity?.image_url || "").trim()
  );
}

/** @param {object|null|undefined} activity */
export function hasPersistedActivityPhotoUrl(activity) {
  return /^https?:\/\//i.test(pickPlannerActivityStoredPhotoUrl(activity));
}

/**
 * Champs photo à persister en base depuis le meta itinéraire (modale) + cache mémoire.
 * @param {object|null|undefined} meta
 * @param {string} [modalCachedUrl]
 * @returns {{ photo_url: string, photo_source: string }}
 */
export function buildActivityPhotoFieldsForPersist(meta, modalCachedUrl = "") {
  if (isActivityPhotoPlaceholder(meta)) {
    return { photo_url: "", photo_source: "placeholder" };
  }
  const resolved = pickResolvedActivityPhoto(meta);
  const ta = pickTripAdvisorActivityPhoto(meta);
  const cached = String(modalCachedUrl || "").trim();
  let photo_url = "";
  if (resolved) photo_url = resolved;
  else if (ta) photo_url = ta;
  else if (/^https?:\/\//i.test(cached)) photo_url = cached;

  const explicit = String(meta?.photoSource || meta?.photo_source || "").trim();
  let photo_source = explicit;
  if (!photo_source || photo_source === "none") {
    if (photo_url) {
      photo_source = inferPhotoSourceFromPlace(meta);
      if (photo_source === "placeholder") {
        photo_source = isLikelyTripAdvisorPhotoUrl(photo_url) ? "tripadvisor" : "wikimedia";
      }
    } else {
      photo_source = "placeholder";
    }
  }
  if (!photo_url) photo_source = "placeholder";
  return { photo_url, photo_source };
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
