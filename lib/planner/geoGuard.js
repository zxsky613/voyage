import { haversineKm } from "./geoCluster.js";

/** Distance max (km) entre un lieu vérifié et le centroïde du lot destination. */
export const GEO_MISMATCH_MAX_KM = 300;

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
