import { shouldBlockHeroImage } from "../images/heroQualityRules.js";
import {
  isLikelyNonScenicHeroImagery,
  isLikelyOrbitalOrMapImagery,
  isLikelyWikiBrandOrLogoImage,
  isLikelyWikiFlagOrSealThumb,
} from "../images/wikiImageFilters.js";

/**
 * decodeURIComponent throws URIError on lone/incomplete % sequences (e.g. "100%organic").
 * Those URLs must never crash Mes voyages / Planning / Budget render paths.
 * @param {string} s
 */
function safeDecodeURIComponent(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** @param {string} url */
export function isBlockedTripHeroUrl(url) {
  const s = String(url || "").trim();
  if (!s) return false;
  try {
    const decoded = safeDecodeURIComponent(s);
    if (isLikelyWikiFlagOrSealThumb(s)) return true;
    if (isLikelyOrbitalOrMapImagery(s, decoded)) return true;
    if (isLikelyWikiBrandOrLogoImage(s, decoded)) return true;
    if (isLikelyNonScenicHeroImagery(s, decoded)) return true;
    if (shouldBlockHeroImage(s)) return true;
    return false;
  } catch {
    // Quality helpers may still call decodeURIComponent on the raw URL.
    return true;
  }
}

/** @param {string} url */
export function isValidPersistedTripHeroUrl(url) {
  const s = String(url || "").trim();
  if (!/^https?:\/\//i.test(s)) return false;
  // Incomplete percent-encoding is unusable as a stable hero (and historically crashed render).
  try {
    decodeURIComponent(s);
  } catch {
    return false;
  }
  return !isBlockedTripHeroUrl(s);
}

/** @param {object} trip */
export function readTripHeroUrlFromTrip(trip) {
  const raw = String(trip?.hero_image_url || trip?.heroImageUrl || trip?.hero_url || "").trim();
  return isValidPersistedTripHeroUrl(raw) ? raw : "";
}
