import { persistTripHeroAfterCreate } from "./persistTripHeroUrl.js";

/**
 * URL héro candidate depuis le guide destination — jamais insérée directement en colonne.
 * @param {object} [payload]
 */
export function readGuideHeroCandidate(payload) {
  return String(payload?.guideHeroCandidateUrl || "").trim();
}

/**
 * Après INSERT trip — tente set_trip_hero (garde qualité SQL, appartenance).
 * @param {string} tripId
 * @param {object} [payload]
 */
export async function applyCreateTripHeroCandidate(tripId, payload) {
  const id = String(tripId || "").trim();
  const candidate = readGuideHeroCandidate(payload);
  if (!id || !candidate) return false;
  return persistTripHeroAfterCreate(id, candidate);
}
