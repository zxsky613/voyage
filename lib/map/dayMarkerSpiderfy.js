import { dayMarkerColor } from "./tripMapHelpers.js";
import { dayPinImageId } from "./activityBalloonMarker.js";

/** Jours très proches géographiquement (city-trip) → spiderfy même si le zoom les sépare en px. */
export const DAY_MARKER_TIGHT_CLUSTER_KM = 4;

/**
 * @param {{ latitude: number, longitude: number }} a
 * @param {{ latitude: number, longitude: number }} b
 * @returns {number}
 */
export function haversineKm(a, b) {
  const lat1 = (Number(a.latitude) * Math.PI) / 180;
  const lat2 = (Number(b.latitude) * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((Number(b.longitude) - Number(a.longitude)) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * @param {Array<{ latitude: number, longitude: number }>} centroids
 * @returns {number}
 */
export function maxCentroidSpreadKm(centroids) {
  const pts = centroids || [];
  let max = 0;
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      max = Math.max(max, haversineKm(pts[i], pts[j]));
    }
  }
  return max;
}

/** Séparation min. entre centres d'épingles-jour (px écran, ~largeur épingle + marge). */
export const DAY_MARKER_MIN_SEPARATION_PX = 72;

/** Rayon de l'éventail spiderfy autour du centroïde moyen (px). */
export const DAY_MARKER_SPIDER_RADIUS_PX = 52;

/**
 * @param {number} n
 * @returns {number[]}
 */
function initParent(n) {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * @param {number[]} parent
 * @param {number} i
 * @returns {number}
 */
function findRoot(parent, i) {
  let r = i;
  while (parent[r] !== r) {
    parent[r] = parent[parent[r]];
    r = parent[r];
  }
  return r;
}

/**
 * Regroupe les indices dont les positions px se chevauchent.
 * @param {Array<{ x: number, y: number }>} points
 * @param {number} minSeparationPx
 * @returns {number[][]}
 */
export function clusterIndicesByPixelOverlap(points, minSeparationPx) {
  const n = points.length;
  if (n <= 1) return n ? [[0]] : [];

  const parent = initParent(n);
  const unite = (a, b) => {
    const ra = findRoot(parent, a);
    const rb = findRoot(parent, b);
    if (ra !== rb) parent[rb] = ra;
  };

  const minSep = Number(minSeparationPx) || DAY_MARKER_MIN_SEPARATION_PX;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (Math.hypot(dx, dy) < minSep) unite(i, j);
    }
  }

  /** @type {Map<number, number[]>} */
  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = findRoot(parent, i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  return [...groups.values()];
}

/**
 * Éventail horizontal au-dessus du centroïde (city-trip, bande carte basse).
 * @param {number} cx
 * @param {number} cy
 * @param {number} count
 * @param {number} [radiusPx]
 * @returns {Array<{ x: number, y: number }>}
 */
export function spiderfyHorizontalPositions(cx, cy, count, radiusPx = DAY_MARKER_SPIDER_RADIUS_PX) {
  if (count <= 0) return [];
  if (count === 1) return [{ x: cx, y: cy }];
  const lift = radiusPx + 8;
  const y = cy - lift;
  const gap = Math.max(38, Math.min(radiusPx * 1.35, 52));
  const totalW = gap * (count - 1);
  const startX = cx - totalW / 2;
  return Array.from({ length: count }, (_, idx) => ({
    x: startX + gap * idx,
    y,
  }));
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} count
 * @param {number} [radiusPx]
 * @param {{ fanArc?: 'full' | 'upper' }} [opts]
 * @returns {Array<{ x: number, y: number }>}
 */
export function spiderfyPixelPositions(cx, cy, count, radiusPx = DAY_MARKER_SPIDER_RADIUS_PX, opts = {}) {
  if (count <= 0) return [];
  if (count === 1) return [{ x: cx, y: cy }];
  const radius = radiusPx + (count > 3 ? (count - 3) * 6 : 0);
  const fanArc = opts.fanArc === "upper" ? "upper" : "full";
  return Array.from({ length: count }, (_, idx) => {
    let angle;
    if (fanArc === "upper") {
      const arcSpan = Math.PI;
      const start = -Math.PI;
      angle = start + (arcSpan * (idx + 0.5)) / count;
    } else {
      angle = (2 * Math.PI * idx) / count - Math.PI / 2;
    }
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

/**
 * Marqueurs-jour + traits d'ancrage pour vue « trip » (spiderfy adaptatif px).
 * @param {Array<{ dayIndex: number, dayNum?: number, latitude: number, longitude: number }>} centroids
 * @param {number} selectedDayIndex
 * @param {(lon: number, lat: number) => { x: number, y: number }} project
 * @param {(x: number, y: number) => { lng: number, lat: number }} unproject
 * @param {{ minSeparationPx?: number, spiderRadiusPx?: number }} [opts]
 */
export function buildDayMarkerSpiderLayout(
  centroids,
  selectedDayIndex,
  project,
  unproject,
  opts = {}
) {
  const list = (centroids || []).filter(
    (c) => Number.isFinite(Number(c?.latitude)) && Number.isFinite(Number(c?.longitude))
  );
  if (!list.length) {
    return {
      markers: { type: "FeatureCollection", features: [] },
      leaderLines: { type: "FeatureCollection", features: [] },
      spiderfied: false,
    };
  }

  const minSep = opts.minSeparationPx ?? DAY_MARKER_MIN_SEPARATION_PX;
  const spiderR = opts.spiderRadiusPx ?? DAY_MARKER_SPIDER_RADIUS_PX;
  const tightKm = opts.tightClusterKm ?? DAY_MARKER_TIGHT_CLUSTER_KM;
  const spreadKm = maxCentroidSpreadKm(list);
  const forceSpiderfy = list.length > 1 && spreadKm > 0 && spreadKm < tightKm;

  const projected = list.map((c) => {
    const p = project(Number(c.longitude), Number(c.latitude));
    return { centroid: c, x: p.x, y: p.y };
  });

  const groups = forceSpiderfy
    ? [projected.map((_, i) => i)]
    : clusterIndicesByPixelOverlap(projected, minSep);
  /** @type {object[]} */
  const markerFeatures = [];
  /** @type {object[]} */
  const lineFeatures = [];

  for (const indices of groups) {
    const members = indices.map((i) => projected[i]).sort(
      (a, b) => a.centroid.dayIndex - b.centroid.dayIndex
    );

    if (members.length === 1 && !forceSpiderfy) {
      const c = members[0].centroid;
      markerFeatures.push({
        type: "Feature",
        properties: {
          dayIndex: c.dayIndex,
          label: String(c.dayNum ?? c.dayIndex + 1),
          color: dayMarkerColor(c.dayIndex, selectedDayIndex),
          icon: dayPinImageId(c.dayIndex, c.dayNum ?? c.dayIndex + 1),
          iconSel: dayPinImageId(c.dayIndex, c.dayNum ?? c.dayIndex + 1, true),
          spiderfied: false,
        },
        geometry: {
          type: "Point",
          coordinates: [Number(c.longitude), Number(c.latitude)],
        },
      });
      continue;
    }

    const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
    const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
    const fanRadius = forceSpiderfy
      ? Math.max(spiderR, 48 + members.length * 8)
      : spiderR + (members.length > 3 ? (members.length - 3) * 6 : 0);
    const fan = forceSpiderfy
      ? spiderfyHorizontalPositions(cx, cy, members.length, fanRadius)
      : spiderfyPixelPositions(cx, cy, members.length, fanRadius, {
          fanArc: members.length > 1 ? "upper" : "full",
        });

    members.forEach((member, idx) => {
      const c = member.centroid;
      const display = unproject(fan[idx].x, fan[idx].y);
      const displayLon = Number(display.lng);
      const displayLat = Number(display.lat);
      const anchorLon = Number(c.longitude);
      const anchorLat = Number(c.latitude);
      const color = dayMarkerColor(c.dayIndex, selectedDayIndex);

      markerFeatures.push({
        type: "Feature",
        properties: {
          dayIndex: c.dayIndex,
          label: String(c.dayNum ?? c.dayIndex + 1),
          color,
          icon: dayPinImageId(c.dayIndex, c.dayNum ?? c.dayIndex + 1),
          iconSel: dayPinImageId(c.dayIndex, c.dayNum ?? c.dayIndex + 1, true),
          spiderfied: true,
        },
        geometry: {
          type: "Point",
          coordinates: [displayLon, displayLat],
        },
      });

      lineFeatures.push({
        type: "Feature",
        properties: { color, dayIndex: c.dayIndex },
        geometry: {
          type: "LineString",
          coordinates: [
            [displayLon, displayLat],
            [anchorLon, anchorLat],
          ],
        },
      });
    });
  }

  return {
    markers: { type: "FeatureCollection", features: markerFeatures },
    leaderLines: { type: "FeatureCollection", features: lineFeatures },
    spiderfied: lineFeatures.length > 0,
  };
}
