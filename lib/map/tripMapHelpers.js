import { BRAND_BLUE, BRAND_BLUE_DEEP, BRAND_BLUE_TINT } from "../brandColors.js";
import { measurePlannerSheetSnaps } from "../ui/plannerSheetLayout.js";
import { activityBalloonImageId, dayPinImageId } from "./activityBalloonMarker.js";

export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** @param {string} [override] */
export function getMapStyleUrl(override) {
  const custom = String(override || import.meta.env?.VITE_MAP_STYLE_URL || "").trim();
  return custom || DEFAULT_MAP_STYLE_URL;
}

/** Couleurs pastilles jour (header + marqueurs vue d'ensemble) — index 0 = jour 1. */
export const DAY_MARKER_PALETTE = ["#142F5D", "#4A90D9", "#8A9BB5", "#64748B", "#93C5FD", "#7BA3CC"];

/** Couleur pastille header / liste — teinte par index jour. */
export function dayMarkerColor(dayIndex, _selectedDayIndex) {
  const idx = Math.abs(Number(dayIndex) || 0);
  return DAY_MARKER_PALETTE[idx % DAY_MARKER_PALETTE.length];
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
        icon: activityBalloonImageId(a.orderInDay ?? 1),
        iconSel: activityBalloonImageId(a.orderInDay ?? 1, true),
        dayIndex: Number(a.dayIndex) || 0,
        title: String(a.title || ""),
        estimated: String(a.coordsSource || "") === "estimated",
      },
      geometry: {
        type: "Point",
        coordinates: [Number(a.longitude), Number(a.latitude)],
      },
    }));
  return { type: "FeatureCollection", features };
}

/**
 * Tous les marqueurs activité (vue « tout le voyage » planning) — couleur par jour.
 * @param {Array<{ id: string, latitude: number, longitude: number, dayIndex: number, orderInDay: number, title?: string, coordsSource?: string }>} activities
 * @param {number} selectedDayIndex
 */
export function activitiesToOverviewPointGeoJSON(activities, selectedDayIndex) {
  const features = (activities || [])
    .filter(
      (a) =>
        Number.isFinite(Number(a?.latitude))
        && Number.isFinite(Number(a?.longitude))
        && String(a?.id || "").trim()
    )
    .map((a) => {
      const dayIndex = Number(a.dayIndex) || 0;
      return {
        type: "Feature",
        properties: {
          id: String(a.id),
          label: String(a.orderInDay ?? ""),
          dayIndex,
          title: String(a.title || ""),
          color: dayMarkerColor(dayIndex, selectedDayIndex),
          estimated: String(a.coordsSource || "") === "estimated",
        },
        geometry: {
          type: "Point",
          coordinates: [Number(a.longitude), Number(a.latitude)],
        },
      };
    });
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
  const dayColor = dayMarkerColor(selectedDayIndex, selectedDayIndex);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { color: dayColor },
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
        icon: dayPinImageId(c.dayIndex, c.dayNum ?? c.dayIndex + 1),
        iconSel: dayPinImageId(c.dayIndex, c.dayNum ?? c.dayIndex + 1, true),
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

/** Hauteur approx. des overlays carte (légende jours + « Voir tout le voyage »). */
export const DAY_VIEW_MAP_OVERLAY_TOP_PX = 100;
/** Marge latérale fitBounds vue jour. */
export const DAY_VIEW_MAP_SIDE_PADDING_PX = 40;
/** Débordement vertical des gouttes activité au-dessus de l’ancre (px). */
export const DAY_VIEW_BALLOON_CLEARANCE_PX = 52;
/** Demi-taille marqueur-jour rond (~44px) — marge autour du centroïde. */
export const DAY_MARKER_MAP_CLEARANCE_PX = 24;
/** Plafond zoom fitBounds vue d'ensemble (city-trip serré). */
export const TRIP_OVERVIEW_MAX_ZOOM = 13;

/** Durée fitBounds animé entre jours (vue jour planning), ms. */
export const MAP_DAY_FLY_DURATION_MS = 700;

/** Easing ease-out cubic — glisse douce entre deux cadrages jour. */
export function mapDayFlyEasing(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return 1 - (1 - x) ** 3;
}

/** @param {{ mode?: string, sheetSnap?: string, vh?: number, mapH?: number }} sheetOpts */
function plannerMapBottomPadding(sheetOpts = {}) {
  const mode = sheetOpts.mode ?? "modal";
  const sheetSnap = sheetOpts.sheetSnap ?? "mid";
  const vh = Math.max(320, Number(sheetOpts.vh) || 844);
  const mapH = Math.max(0, Number(sheetOpts.mapH) || 0);
  let bottom = 48;

  if (mode === "planner") {
    const snaps = measurePlannerSheetSnaps(vh);
    const sheetH = snaps[sheetSnap] ?? snaps.mid;
    if (sheetSnap === "collapsed") bottom = Math.max(40, Math.round(sheetH * 0.55));
    else if (sheetSnap === "full") bottom = 32;
    else bottom = Math.max(56, Math.round(sheetH * 0.14));
    if (mapH > 0 && mapH < 220) {
      bottom = Math.min(bottom, Math.max(20, Math.round(mapH * 0.22)));
    }
  }

  return bottom;
}

/**
 * Padding asymétrique fitBounds vue jour — overlays haut + sheet mobile.
 * @param {{ mode?: 'modal'|'trip'|'planner', sheetSnap?: 'collapsed'|'mid'|'full', viewportHeight?: number, mapHeightPx?: number, showTopOverlay?: boolean }} [opts]
 */
export function computeDayViewFitPadding(opts = {}) {
  const mode = opts.mode ?? "modal";
  const sheetSnap = opts.sheetSnap ?? "mid";
  const showTopOverlay = opts.showTopOverlay !== false;
  const vh = Math.max(320, Number(opts.viewportHeight) || (typeof window !== "undefined" ? window.innerHeight : 844));
  const mapH = Math.max(0, Number(opts.mapHeightPx) || 0);

  const side = DAY_VIEW_MAP_SIDE_PADDING_PX;
  let overlayTop = showTopOverlay ? DAY_VIEW_MAP_OVERLAY_TOP_PX : 16;
  let balloonClearance = DAY_VIEW_BALLOON_CLEARANCE_PX;
  if (mapH > 0 && mapH < 220) {
    balloonClearance = Math.min(
      DAY_VIEW_BALLOON_CLEARANCE_PX,
      Math.max(8, mapH - overlayTop - 40)
    );
  }
  const top = overlayTop + balloonClearance;
  const bottom = plannerMapBottomPadding({ mode, sheetSnap, vh, mapH });

  return { top, bottom, left: side, right: side };
}

/**
 * Padding asymétrique fitBounds vue d'ensemble (tous les centroïdes-jour).
 * @param {{ mode?: 'modal'|'trip'|'planner', sheetSnap?: 'collapsed'|'mid'|'full', viewportHeight?: number, mapHeightPx?: number, hasLegendOverlay?: boolean }} [opts]
 */
export function computeTripOverviewFitPadding(opts = {}) {
  const mode = opts.mode ?? "modal";
  const sheetSnap = opts.sheetSnap ?? "mid";
  const hasLegendOverlay = opts.hasLegendOverlay !== false;
  const vh = Math.max(320, Number(opts.viewportHeight) || (typeof window !== "undefined" ? window.innerHeight : 844));
  const mapH = Math.max(0, Number(opts.mapHeightPx) || 0);
  const side = DAY_VIEW_MAP_SIDE_PADDING_PX;

  let markerClearance = DAY_MARKER_MAP_CLEARANCE_PX;
  if (mapH > 0 && mapH < 220) {
    markerClearance = Math.min(DAY_MARKER_MAP_CLEARANCE_PX, Math.max(8, Math.round(mapH * 0.12)));
  }
  let top = (hasLegendOverlay ? DAY_VIEW_MAP_OVERLAY_TOP_PX : 16) + markerClearance;
  let bottom = plannerMapBottomPadding({ mode, sheetSnap, vh, mapH }) + markerClearance;
  let left = side + markerClearance;
  let right = side + markerClearance;

  if (mapH > 0 && mapH < 220) {
    const boost = Math.round((220 - mapH) * 0.4);
    top += boost;
    bottom += boost;
    left += boost;
    right += boost;
  }

  return { top, bottom, left, right };
}

/**
 * Réduit le padding pour qu'il reste de la place au contenu dans le canvas (snap mid = bande courte).
 * @param {import('maplibre-gl').Map} map
 * @param {{ top: number, bottom: number, left: number, right: number }} paddingObj
 * @param {number} [minContentPx]
 */
function clampFitPadding(map, paddingObj, minContentPx = 28) {
  const el = map.getContainer?.();
  const h = Math.max(1, el?.clientHeight || 1);
  const w = Math.max(1, el?.clientWidth || 1);
  let top = Math.max(0, Number(paddingObj.top) || 0);
  let bottom = Math.max(0, Number(paddingObj.bottom) || 0);
  let left = Math.max(0, Number(paddingObj.left) || 0);
  let right = Math.max(0, Number(paddingObj.right) || 0);

  const maxVerticalPad = Math.max(0, h - minContentPx);
  const maxHorizontalPad = Math.max(0, w - minContentPx);
  const verticalSum = top + bottom;
  const horizontalSum = left + right;

  if (verticalSum > maxVerticalPad && verticalSum > 0) {
    const scale = maxVerticalPad / verticalSum;
    top *= scale;
    bottom *= scale;
  }
  if (horizontalSum > maxHorizontalPad && horizontalSum > 0) {
    const scale = maxHorizontalPad / horizontalSum;
    left *= scale;
    right *= scale;
  }

  return { top, bottom, left, right };
}

/**
 * @param {{ padding?: number, paddingInsets?: { top: number, bottom: number, left: number, right: number }, uniformPadding?: boolean }} paddingOpts
 */
function resolveFitPadding(paddingOpts = {}) {
  if (
    paddingOpts.paddingInsets
    && Number.isFinite(Number(paddingOpts.paddingInsets.top))
    && Number.isFinite(Number(paddingOpts.paddingInsets.bottom))
    && Number.isFinite(Number(paddingOpts.paddingInsets.left))
    && Number.isFinite(Number(paddingOpts.paddingInsets.right))
  ) {
    return {
      top: Number(paddingOpts.paddingInsets.top),
      bottom: Number(paddingOpts.paddingInsets.bottom),
      left: Number(paddingOpts.paddingInsets.left),
      right: Number(paddingOpts.paddingInsets.right),
    };
  }
  const padding = paddingOpts.padding ?? 72;
  return paddingOpts.uniformPadding
    ? { top: padding, bottom: padding, left: padding, right: padding }
    : { top: padding, bottom: padding + 48, left: padding, right: padding };
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {Array<{ latitude: number, longitude: number }>} activities
 * @param {{ padding?: number, paddingInsets?: { top: number, bottom: number, left: number, right: number }, animate?: boolean, maxZoom?: number, uniformPadding?: boolean, markerRadiusPx?: number, duration?: number, easing?: (t: number) => number }} [opts]
 */
export function fitMapToActivities(map, activities, opts = {}) {
  const pts = (activities || []).filter(
    (a) => Number.isFinite(Number(a?.latitude)) && Number.isFinite(Number(a?.longitude))
  );
  if (!pts.length || !map) return;
  let paddingObj = resolveFitPadding(opts);
  const markerR = Math.max(0, Number(opts.markerRadiusPx) || 0);
  if (markerR > 0) {
    paddingObj = {
      top: paddingObj.top + markerR,
      bottom: paddingObj.bottom + markerR,
      left: paddingObj.left + markerR,
      right: paddingObj.right + markerR,
    };
  }
  paddingObj = clampFitPadding(map, paddingObj);
  const animate = opts.animate !== false;
  const duration = animate ? (opts.duration ?? MAP_DAY_FLY_DURATION_MS) : 0;
  const easing = opts.easing;
  const containerH = Math.max(1, map.getContainer?.()?.clientHeight || 1);
  const maxZoom =
    opts.maxZoom ??
    (containerH < 160 ? 11 : containerH < 220 ? 12 : containerH < 260 ? 14 : 15);
  const fitOpts = {
    padding: paddingObj,
    maxZoom,
    duration,
    ...(easing ? { easing } : {}),
  };

  if (pts.length === 1) {
    const lon = Number(pts[0].longitude);
    const lat = Number(pts[0].latitude);
    const delta = 0.007;
    map.fitBounds(
      [
        [lon - delta, lat - delta],
        [lon + delta, lat + delta],
      ],
      { ...fitOpts, maxZoom: Math.min(maxZoom, 14) }
    );
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
    fitOpts
  );
}

export { BRAND_BLUE, BRAND_BLUE_DEEP, BRAND_BLUE_TINT };
