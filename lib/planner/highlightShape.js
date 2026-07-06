import { pickTripAdvisorActivityPhoto } from "./activityImageSource.js";
import {
  attachPricingToRegistryPlace,
  buildPass1CandidatePriceMap,
  clampActivityEstimatedPriceEur,
  readActivityEstimatedPriceEur,
} from "./activityPricing.js";
import { isGeoMismatchPlace } from "./geoGuard.js";
import { scoreAndSortPlaces } from "./scoring.js";

/**
 * @param {object} place
 * @param {string} [cityLabel]
 * @returns {object|null}
 */
export function placeToDestinationHighlight(place, cityLabel = "") {
  if (!place || typeof place !== "object") return null;
  const name = String(place.name || "").trim();
  if (!name) return null;
  if (isGeoMismatchPlace(place)) return null;
  const status = String(place.status || "").trim().toLowerCase();
  if (status === "unverified") return null;

  const estimatedPriceEur = readActivityEstimatedPriceEur(place);
  const photos = Array.isArray(place.photos) ? place.photos : [];
  const photoUrl = pickTripAdvisorActivityPhoto({ photos, photo_urls: photos });

  return {
    id: String(place.id || name).trim(),
    name,
    title: name,
    status,
    source: String(place.source || "").trim() || undefined,
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : undefined,
    numReviews: Number.isFinite(Number(place.numReviews)) ? Number(place.numReviews) : undefined,
    priceLevel: place.priceLevel,
    estimatedPriceEur,
    priceSource: String(place.priceSource || "estimate"),
    photos,
    photo_url: photoUrl,
    image_url: photoUrl,
    tripadvisorUrl: place.tripadvisorUrl || place.tripadvisor_url || "",
    latitude: Number.isFinite(Number(place.latitude)) ? Number(place.latitude) : undefined,
    longitude: Number.isFinite(Number(place.longitude)) ? Number(place.longitude) : undefined,
    location: String(place.location || cityLabel || "").trim(),
    category: place.category,
  };
}

/**
 * @param {object[]} verifiedPlaces
 * @param {object[]} rawCandidates
 * @param {{ cityLabel?: string, min?: number, max?: number, profile?: object }} [opts]
 * @returns {object[]}
 */
export function buildDestinationHighlightsFromVerified(
  verifiedPlaces,
  rawCandidates,
  opts = {}
) {
  const priceMap = buildPass1CandidatePriceMap(rawCandidates);
  const cityLabel = String(opts.cityLabel || "").trim();
  const max = Math.min(8, Math.max(6, Number(opts.max) || 8));
  const profile = opts.profile && typeof opts.profile === "object" ? opts.profile : {};

  const priced = (Array.isArray(verifiedPlaces) ? verifiedPlaces : []).map((p) => {
    const id = String(p?.id || "").trim();
    return attachPricingToRegistryPlace(p, priceMap.get(id));
  });

  const eligible = priced.filter((p) => !isGeoMismatchPlace(p) && String(p.status || "") !== "unverified");
  const sorted = scoreAndSortPlaces(eligible, profile);
  const highlights = [];
  for (const p of sorted) {
    const h = placeToDestinationHighlight(p, cityLabel);
    if (!h) continue;
    highlights.push(h);
    if (highlights.length >= max) break;
  }
  return highlights;
}

/** @param {object|null|undefined} highlight */
export function highlightToActivityChip(highlight) {
  if (!highlight || typeof highlight !== "object") {
    return { title: "", cost: 0, estimatedCostEur: 0 };
  }
  const price = readActivityEstimatedPriceEur(highlight);
  const photo =
    String(highlight.photo_url || highlight.image_url || "").trim() ||
    pickTripAdvisorActivityPhoto(highlight);
  return {
    ...highlight,
    title: String(highlight.name || highlight.title || "").trim(),
    name: String(highlight.name || highlight.title || "").trim(),
    estimatedCostEur: price,
    estimatedPriceEur: price,
    cost: price,
    photo_url: photo,
    image_url: photo,
  };
}

/** @param {object|null|undefined} highlight */
export function isTripAdvisorEnrichedPlace(highlight) {
  return String(highlight?.source || "").trim().toLowerCase() === "tripadvisor";
}

/**
 * Badge note TA — uniquement si enrichissement TA explicite en cache.
 * @param {object|null|undefined} highlight
 * @returns {boolean}
 */
export function highlightShowsRatingBadge(highlight) {
  if (!isTripAdvisorEnrichedPlace(highlight)) return false;
  const rating = Number(highlight?.rating);
  const reviews = Number(highlight?.numReviews);
  return Number.isFinite(rating) && rating > 0 && Number.isFinite(reviews) && reviews > 0;
}

/**
 * Badge neutre « vérifié » — existence attestée FSQ/Nominatim sans note TA.
 * @param {object|null|undefined} highlight
 * @returns {boolean}
 */
export function highlightShowsVerifiedBadge(highlight) {
  if (!highlight || typeof highlight !== "object") return false;
  if (highlightShowsRatingBadge(highlight)) return false;
  const status = String(highlight?.status || "").trim().toLowerCase();
  if (status === "unverified" || status === "geo_mismatch") return false;
  return status === "partial" || status === "verified";
}
