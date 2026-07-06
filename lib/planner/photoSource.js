import { pickTripAdvisorActivityPhoto } from "./activityImageSource.js";

/** @typedef {'tripadvisor'|'foursquare'|'wikimedia'|'wikimedia_geo'|'placeholder'} ActivityPhotoSource */

/**
 * @param {string} resolverSource
 * @returns {ActivityPhotoSource|null}
 */
export function mapResolverSourceToPhotoSource(resolverSource) {
  const s = String(resolverSource || "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("wiki") || s.includes("commons") || s === "wikidata-commons") return "wikimedia";
  return "wikimedia";
}

/**
 * @param {object|null|undefined} place
 * @returns {ActivityPhotoSource}
 */
export function inferPhotoSourceFromPlace(place) {
  if (pickTripAdvisorActivityPhoto(place)) return "tripadvisor";
  const explicit = String(place?.photoSource || "").trim();
  if (explicit === "tripadvisor" || explicit === "foursquare" || explicit === "wikimedia" || explicit === "wikimedia_geo" || explicit === "placeholder") {
    return explicit;
  }
  const src = String(place?.source || "").trim().toLowerCase();
  if (src === "foursquare" && Array.isArray(place?.photos) && place.photos.length) return "foursquare";
  return "placeholder";
}
