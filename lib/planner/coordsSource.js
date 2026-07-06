/**
 * Source des coordonnées d'une activité générée :
 * - 'tripadvisor' : coords précises du catalogue TripAdvisor (vérifié)
 * - 'foursquare'  : Places API Foursquare (fsq_id + coords)
 * - 'geocoded'    : géocodage Nominatim/OSM
 * - 'estimated'   : estimation LLM, marquée comme telle (marqueur atténué sur la carte)
 */

export function placeHasCoords(p) {
  return Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude));
}

/**
 * @param {{ source?: string, latitude?: number, longitude?: number }} place
 * @returns {'tripadvisor'|'foursquare'|'geocoded'|'estimated'|undefined}
 */
export function coordsSourceForPlace(place) {
  if (!placeHasCoords(place)) return undefined;
  const src = String(place?.source || "").trim().toLowerCase();
  if (src === "tripadvisor") return "tripadvisor";
  if (src === "foursquare") return "foursquare";
  if (src === "llm_estimate") return "estimated";
  if (src === "nominatim") return "geocoded";
  // cache historique avec coords sans source précise
  return "geocoded";
}
