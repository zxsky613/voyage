/** Mapping profil app (TripPrefsModal) → clé trip_type TripAdvisor. null = pas de bonus. */
export const APP_TRAVELERS_TO_TA_TRIP_TYPE = {
  solo: "solo",
  couple: "couples",
  family: "family",
  friends: "friends",
};

/**
 * @param {string} [travelers]
 * @returns {string|null}
 */
export function mapAppTravelersToTripAdvisorType(travelers) {
  const k = String(travelers || "").trim().toLowerCase();
  if (!k) return null;
  return APP_TRAVELERS_TO_TA_TRIP_TYPE[k] ?? null;
}
