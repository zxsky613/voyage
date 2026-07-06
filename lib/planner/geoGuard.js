import { haversineKm } from "./geoCluster.js";

/** Distance max (km) entre un lieu vérifié et le centroïde du lot destination. */
export const GEO_MISMATCH_MAX_KM = 300;

/** Rayon max (km) autour du centre destination pour accepter FSQ/Nominatim (excursions proches). */
export const GEO_OUTLIER_MAX_KM = 60;

/** @returns {number} */
export function getGeoOutlierMaxKm() {
  const n = Number(process.env.GEO_OUTLIER_MAX_KM);
  return Number.isFinite(n) && n > 0 ? n : GEO_OUTLIER_MAX_KM;
}

/**
 * Vérifie qu'un point est dans le rayon destination (garde-fou anti-homonyme).
 * @param {{ latitude: number, longitude: number }|null|undefined} center
 * @param {{ latitude?: number|null, longitude?: number|null }} point
 * @param {number} [maxKm]
 * @returns {{ within: boolean, distKm: number|null }}
 */
export function checkDestinationGeoOutlier(center, point, maxKm = getGeoOutlierMaxKm()) {
  const lat = Number(point?.latitude);
  const lon = Number(point?.longitude);
  if (!center || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { within: true, distKm: null };
  }
  const distKm = haversineKm(center, { latitude: lat, longitude: lon });
  return { within: distKm <= maxKm, distKm };
}

/**
 * Retire lat/lon si hors rayon destination ; incrémente le compteur si fourni.
 * @param {object|null|undefined} place
 * @param {{ latitude: number, longitude: number }|null|undefined} center
 * @param {() => void} [onRejected]
 * @returns {object|null|undefined}
 */
export function stripCoordsIfDestinationOutlier(place, center, onRejected) {
  if (!place || typeof place !== "object") return place;
  const { within, distKm } = checkDestinationGeoOutlier(center, place);
  if (within) return place;
  onRejected?.();
  const { latitude, longitude, ...rest } = place;
  if (Number.isFinite(distKm)) rest.geoOutlierRejectedKm = Math.round(distKm);
  return rest;
}

/**
 * @param {Array<{ latitude?: number|null, longitude?: number|null }>} places
 * @returns {{ latitude: number, longitude: number }|null}
 */
export function computePlacesCentroid(places) {
  const pts = (Array.isArray(places) ? places : []).filter(
    (p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude))
  );
  if (!pts.length) return null;
  const lat = pts.reduce((s, p) => s + Number(p.latitude), 0) / pts.length;
  const lon = pts.reduce((s, p) => s + Number(p.longitude), 0) / pts.length;
  return { latitude: lat, longitude: lon };
}

/**
 * Marque status=geo_mismatch les lieux trop éloignés du centroïde des coords du lot.
 * Nécessite au moins 2 points géolocalisés pour calculer un centroïde fiable.
 *
 * @param {object[]} places
 * @param {number} [maxKm]
 * @returns {object[]}
 */
export function applyGeoMismatchGuard(places, maxKm = GEO_MISMATCH_MAX_KM) {
  const list = Array.isArray(places) ? places : [];
  const withCoords = list.filter(
    (p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude))
  );
  if (withCoords.length < 2) return list;

  const sortedLat = [...withCoords].sort((a, b) => Number(a.latitude) - Number(b.latitude));
  const sortedLon = [...withCoords].sort((a, b) => Number(a.longitude) - Number(b.longitude));
  const mid = Math.floor(sortedLat.length / 2);
  const medianCenter = {
    latitude: Number(sortedLat[mid].latitude),
    longitude: Number(sortedLon[mid].longitude),
  };

  const core = withCoords.filter((p) => haversineKm(p, medianCenter) <= maxKm);
  const centroid = computePlacesCentroid(core.length >= 2 ? core : withCoords);
  if (!centroid) return list;

  return list.map((p) => {
    const lat = Number(p?.latitude);
    const lon = Number(p?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return p;
    const distKm = haversineKm({ latitude: lat, longitude: lon }, centroid);
    if (distKm <= maxKm) return p;
    return {
      ...p,
      status: "geo_mismatch",
      geoMismatchKm: Math.round(distKm),
    };
  });
}

/**
 * @param {object|null|undefined} place
 * @returns {boolean}
 */
export function isPlanningEligiblePlace(place) {
  const status = String(place?.status || "").trim();
  return status === "verified" || status === "partial";
}

/**
 * @param {object|null|undefined} place
 * @returns {boolean}
 */
export function isGeoMismatchPlace(place) {
  return String(place?.status || "").trim() === "geo_mismatch";
}
