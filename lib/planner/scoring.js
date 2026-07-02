import { mapAppTravelersToTripAdvisorType } from "./tripTypeMap.js";

/**
 * @param {Record<string, number>|null|undefined} tripTypes
 * @param {string|null} userTripType
 * @returns {number} bonus 0..0.35
 */
export function tripTypeMatchBonus(tripTypes, userTripType) {
  if (!userTripType || !tripTypes || typeof tripTypes !== "object") return 0;
  const score = Number(tripTypes[userTripType]);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(0.35, score / 100);
}

/**
 * @param {object} place
 * @param {{ travelers?: string, budget?: string }} [profile]
 */
export function scoreEnrichedPlace(place, profile = {}) {
  const rating = Number(place?.rating) || 0;
  const reviews = Math.max(0, Number(place?.numReviews) || 0);
  let score = rating * Math.log(reviews + 1);
  if (place?.status === "verified") score *= 1.15;
  else if (place?.status === "partial") score *= 0.85;
  else score *= 0.25;

  const taType = mapAppTravelersToTripAdvisorType(profile.travelers);
  score *= 1 + tripTypeMatchBonus(place?.tripTypeScores, taType);

  const budget = String(profile.budget || "").toLowerCase();
  const priceLevel = Number(place?.priceLevel);
  if (budget === "low" && Number.isFinite(priceLevel) && priceLevel >= 3) {
    score *= 0.55;
  }
  if (rating >= 4.5 && reviews >= 500) score *= 1.1;

  return score;
}

/**
 * @param {object[]} places
 * @param {{ travelers?: string, budget?: string }} profile
 */
export function scoreAndSortPlaces(places, profile) {
  return (Array.isArray(places) ? places : [])
    .map((p) => ({ ...p, score: scoreEnrichedPlace(p, profile) }))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
}
