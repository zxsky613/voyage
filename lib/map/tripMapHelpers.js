import { BRAND_BLUE, BRAND_BLUE_DEEP, BRAND_BLUE_TINT } from "../brandColors.js";

export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** @param {string} [override] */
export function getMapStyleUrl(override) {
  const custom = String(override || import.meta.env?.VITE_MAP_STYLE_URL || "").trim();
  return custom || DEFAULT_MAP_STYLE_URL;
}

/** Couleur marqueur : jour actif = brand-blue, autres = déclinaisons brand/slate. */
export function dayMarkerColor(dayIndex, selectedDayIndex) {
  if (dayIndex === selectedDayIndex) return BRAND_BLUE;
  const palette = ["#64748B", "#93C5FD", "#94A3B8", "#BFDBFE", "#CBD5E1", "#60A5FA"];
  return palette[Math.abs(dayIndex) % palette.length];
}

/**
 * @param {Array<{ id: string, latitude: number, longitude: number, dayIndex: number, orderInDay: number, title?: string }>} activities
 * @param {number} selectedDayIndex
 */
export function activitiesToPointGeoJSON(activities, selectedDayIndex) {
  const features = (activities || [])
    .filter(
      (a) =>
        Number.isFinite(Number(a?.latitude))
        && Number.isFinite(Number(a?.longitude))
        && String(a?.id || "").trim()
    )
    .map((a) => ({
      type: "Feature",
      properties: {
        id: String(a.id),
        label: String(a.orderInDay ?? ""),
        dayIndex: Number(a.dayIndex) || 0,
        color: dayMarkerColor(Number(a.dayIndex) || 0, selectedDayIndex),
        title: String(a.title || ""),
      },
      geometry: {
        type: "Point",
        coordinates: [Number(a.longitude), Number(a.latitude)],
      },
    }));
  return { type: "FeatureCollection", features };
}

/**
 * Ligne du parcours pour le jour sélectionné (ordre des activités mappées).
 * @param {Array<{ latitude: number, longitude: number, dayIndex: number }>} activities
 * @param {number} selectedDayIndex
 */
export function activitiesToRouteGeoJSON(activities, selectedDayIndex) {
  const coords = (activities || [])
    .filter(
      (a) =>
        Number(a?.dayIndex) === selectedDayIndex
        && Number.isFinite(Number(a?.latitude))
        && Number.isFinite(Number(a?.longitude))
    )
    .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
    .map((a) => [Number(a.longitude), Number(a.latitude)]);
  if (coords.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      },
    ],
  };
}

/**
 * Centroïde des activités géolocalisées de chaque jour (jours sans coords absents).
 * @param {Array<{ latitude: number, longitude: number, dayIndex: number, dayNum?: number }>} activities
 * @returns {Array<{ dayIndex: number, dayNum: number, latitude: number, longitude: number, count: number }>}
 */
export function computeDayCentroids(activities) {
  const byDay = new Map();
  for (const a of activities || []) {
    const lat = Number(a?.latitude);
    const lon = Number(a?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const dayIndex = Number(a?.dayIndex) || 0;
    const cur =
      byDay.get(dayIndex)
      || { dayIndex, dayNum: Number(a?.dayNum) || dayIndex + 1, latSum: 0, lonSum: 0, count: 0 };
    cur.latSum += lat;
    cur.lonSum += lon;
    cur.count += 1;
    byDay.set(dayIndex, cur);
  }
  return [...byDay.values()]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((c) => ({
      dayIndex: c.dayIndex,
      dayNum: c.dayNum,
      latitude: c.latSum / c.count,
      longitude: c.lonSum / c.count,
      count: c.count,
    }));
}

/**
 * Marqueurs-jours (vue voyage entier) : un point numéroté par jour au centroïde.
 * @param {ReturnType<typeof computeDayCentroids>} centroids
 * @param {number} selectedDayIndex
 */
export function dayCentroidsToPointGeoJSON(centroids, selectedDayIndex) {
  return {
    type: "FeatureCollection",
    features: (centroids || []).map((c) => ({
      type: "Feature",
      properties: {
        dayIndex: c.dayIndex,
        label: String(c.dayNum ?? c.dayIndex + 1),
        color: dayMarkerColor(c.dayIndex, selectedDayIndex),
      },
      geometry: {
        type: "Point",
        coordinates: [Number(c.longitude), Number(c.latitude)],
      },
    })),
  };
}

/**
 * Ligne d'itinéraire reliant les jours dans l'ordre chronologique (vue voyage).
 * Un segment par paire de jours consécutifs géolocalisés, coloré par le jour d'origine ;
 * les jours sans coords sont absents des centroïdes donc sautés naturellement.
 * @param {ReturnType<typeof computeDayCentroids>} centroids
 * @param {number} selectedDayIndex
 */
export function dayCentroidsToRouteGeoJSON(centroids, selectedDayIndex) {
  const pts = centroids || [];
  const features = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    features.push({
      type: "Feature",
      properties: { color: dayMarkerColor(pts[i].dayIndex, selectedDayIndex) },
      geometry: {
        type: "LineString",
        coordinates: [
          [Number(pts[i].longitude), Number(pts[i].latitude)],
          [Number(pts[i + 1].longitude), Number(pts[i + 1].latitude)],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {Array<{ latitude: number, longitude: number }>} activities
 * @param {{ padding?: number, animate?: boolean, maxZoom?: number }} [opts]
 */
export function fitMapToActivities(map, activities, opts = {}) {
  const pts = (activities || []).filter(
    (a) => Number.isFinite(Number(a?.latitude)) && Number.isFinite(Number(a?.longitude))
  );
  if (!pts.length || !map) return;
  const padding = opts.padding ?? 72;
  if (pts.length === 1) {
    map.easeTo({
      center: [Number(pts[0].longitude), Number(pts[0].latitude)],
      zoom: Math.max(map.getZoom(), 13),
      duration: opts.animate === false ? 0 : 650,
    });
    return;
  }
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const p of pts) {
    const lon = Number(p.longitude);
    const lat = Number(p.latitude);
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    {
      padding: { top: padding, bottom: padding + 48, left: padding, right: padding },
      maxZoom: opts.maxZoom ?? 15,
      duration: opts.animate === false ? 0 : 700,
    }
  );
}

export { BRAND_BLUE, BRAND_BLUE_DEEP, BRAND_BLUE_TINT };
