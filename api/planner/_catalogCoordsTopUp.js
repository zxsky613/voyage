import { geocodeCoordlessPlaces } from "./_geocode.js";
import { placeHasCoords } from "../../lib/planner/coordsSource.js";
import { applyGeoMismatchGuard, isGeoMismatchPlace } from "../../lib/planner/geoGuard.js";

/**
 * Fusionne le catalogue final avec les lieux enrichis coords (ordre préservé).
 * @param {object[]} catalog
 * @param {object[]} topped
 */
export function mergeCatalogWithCoordsTopUp(catalog, topped) {
  const byId = new Map(
    (Array.isArray(topped) ? topped : []).map((p) => [String(p?.id || "").trim(), p])
  );
  return (Array.isArray(catalog) ? catalog : []).map((p) => {
    const id = String(p?.id || "").trim();
    return (id && byId.get(id)) || p;
  });
}

/**
 * Applique la même garde geo-mismatch que la cascade pool principale.
 * @param {object[]} places
 */
export function stripMismatchCoordsFromPlaces(places) {
  return applyGeoMismatchGuard(places).map((p) => {
    if (!isGeoMismatchPlace(p)) return p;
    const src = String(p.source || "");
    if (src === "nominatim" || src === "llm_estimate" || src === "foursquare") {
      const { latitude, longitude, geoMismatchKm, ...rest } = p;
      return { ...rest, status: rest.status === "geo_mismatch" ? "partial" : rest.status };
    }
    return p;
  });
}

/**
 * Geocode top-up ADDITIF sur le placeCatalog final (après cluster, avant photos).
 *
 * @param {object[]} placeCatalog
 * @param {{
 *   destination: string,
 *   country?: string,
 *   estimateMissingCoordsWithLlm: (places: object[], destination: string, country?: string) => Promise<{ places: object[], estimated: number }>,
 * }} options
 */
export async function topUpPlaceCatalogCoords(placeCatalog, options) {
  const catalog = Array.isArray(placeCatalog) ? placeCatalog : [];
  const destination = String(options.destination || "").trim();
  const country = String(options.country || "").trim();
  const coordlessBefore = catalog.filter((p) => !placeHasCoords(p)).length;

  if (!catalog.length || !coordlessBefore) {
    return {
      places: catalog,
      geocodeStats: null,
      estimateStats: null,
      coordlessBefore,
      stillWithoutCoordsAtPhoto: catalog
        .filter((p) => !placeHasCoords(p))
        .map((p) => ({ id: String(p?.id || "").trim(), name: String(p?.name || "").trim() })),
    };
  }

  const geocodeStats = await geocodeCoordlessPlaces([...catalog], {
    city: destination,
    country,
    maxRequests: Math.max(2, catalog.length * 2),
  });

  let topped = geocodeStats.places;
  const estimateStats = await options.estimateMissingCoordsWithLlm(topped, destination, country);
  topped = stripMismatchCoordsFromPlaces(estimateStats.places);

  const merged = mergeCatalogWithCoordsTopUp(catalog, topped);
  const stillWithoutCoordsAtPhoto = merged
    .filter((p) => !placeHasCoords(p))
    .map((p) => ({ id: String(p?.id || "").trim(), name: String(p?.name || "").trim() }));

  return {
    places: merged,
    geocodeStats,
    estimateStats,
    coordlessBefore,
    stillWithoutCoordsAtPhoto,
  };
}
