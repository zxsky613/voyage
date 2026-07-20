/**
 * Destructive trip-level actions require an explicit owner match.
 * Missing legacy ownership data must fail closed.
 */
export function canCurrentUserDeleteTrip(session, trip) {
  const userId = String(session?.user?.id || "").trim();
  const ownerId = String(trip?.owner_id || "").trim();
  return Boolean(userId && ownerId && userId === ownerId);
}
