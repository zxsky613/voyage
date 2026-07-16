import { haversineKm } from "./geoCluster.js";

/** Vitesse marche ~12 min/km (5 km/h). */
const WALK_KMH = 5;
/** Au-delà de ce seuil : mode transit (~3× plus rapide que la marche). */
export const WALK_THRESHOLD_KM = 1;
const TRANSIT_SPEED_FACTOR = 3;
const ROUND_STEP_MIN = 5;

/**
 * Estimation v1 offline : haversine × vitesse marche, arrondi 5 min.
 * Au-delà de {@link WALK_THRESHOLD_KM} : mode transit.
 * @param {{ latitude?: number, longitude?: number }} from
 * @param {{ latitude?: number, longitude?: number }} to
 * @returns {{ minutes: number, mode: 'walk'|'transit', km: number }|null}
 */
export function estimateItineraryLegMinutes(from, to) {
  const km = haversineKm(from, to);
  if (!Number.isFinite(km) || km === Infinity || km < 0.04) return null;
  const walkMinutes = (km / WALK_KMH) * 60;
  const round = (m) => Math.max(ROUND_STEP_MIN, Math.round(m / ROUND_STEP_MIN) * ROUND_STEP_MIN);
  if (km > WALK_THRESHOLD_KM) {
    return { minutes: round(walkMinutes / TRANSIT_SPEED_FACTOR), mode: "transit", km };
  }
  return { minutes: round(walkMinutes), mode: "walk", km };
}
