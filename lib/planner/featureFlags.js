/** Pipeline itinéraire vérifié (TripAdvisor + Foursquare + clustering). */
export function isVerifiedPlannerEnabled() {
  return import.meta.env.VITE_USE_VERIFIED_PLANNER === "true";
}
