import { shouldBlockHeroImage } from "../images/heroQualityRules.js";
import {
  isLikelyNonScenicHeroImagery,
  isLikelyOrbitalOrMapImagery,
  isLikelyWikiBrandOrLogoImage,
  isLikelyWikiFlagOrSealThumb,
} from "../images/wikiImageFilters.js";

/** @param {string} url */
export function isBlockedTripHeroUrl(url) {
  const s = String(url || "").trim();
  if (!s) return false;
  const decoded = decodeURIComponent(s);
  if (isLikelyWikiFlagOrSealThumb(s)) return true;
  if (isLikelyOrbitalOrMapImagery(s, decoded)) return true;
  if (isLikelyWikiBrandOrLogoImage(s, decoded)) return true;
  if (isLikelyNonScenicHeroImagery(s, decoded)) return true;
  if (shouldBlockHeroImage(s)) return true;
  return false;
}

/** @param {string} url */
export function isValidPersistedTripHeroUrl(url) {
  const s = String(url || "").trim();
  return /^https?:\/\//i.test(s) && !isBlockedTripHeroUrl(s);
}

/** @param {object} trip */
export function readTripHeroUrlFromTrip(trip) {
  const raw = String(trip?.hero_image_url || trip?.heroImageUrl || trip?.hero_url || "").trim();
  return isValidPersistedTripHeroUrl(raw) ? raw : "";
}
