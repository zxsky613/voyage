/** Bande carte visible au snap « full » (jamais démontée). */
export const PLANNER_MAP_FULL_BAND_MIN = 120;
export const PLANNER_MAP_FULL_BAND_MAX = 168;
export const PLANNER_MAP_FULL_BAND_VH = 0.18;

export const PLANNER_SHEET_TRANSITION = "height 0.32s cubic-bezier(0.32, 0.72, 0, 1)";

/** @param {number} [viewportHeight] */
export function measurePlannerSheetSnaps(viewportHeight = 844) {
  const vh = Math.max(320, Number(viewportHeight) || 844);
  return {
    collapsed: 72,
    mid: Math.round(Math.min(vh * 0.48, 420)),
    full: Math.round(Math.min(vh * 0.88, vh - 72)),
  };
}

/**
 * Hauteur carte selon le cran sheet (peek / mid / full).
 * @param {'collapsed'|'mid'|'full'} snap
 * @param {{ collapsed: number, mid: number, full: number }} snaps
 * @param {number} containerHeightPx
 */
export function computePlannerMapHeightPx(snap, snaps, containerHeightPx) {
  const container = Math.max(240, Number(containerHeightPx) || 600);
  const sheetH = snaps[snap] ?? snaps.mid;
  if (snap === "full") {
    return Math.round(
      Math.min(
        PLANNER_MAP_FULL_BAND_MAX,
        Math.max(PLANNER_MAP_FULL_BAND_MIN, container * PLANNER_MAP_FULL_BAND_VH)
      )
    );
  }
  return Math.max(PLANNER_MAP_FULL_BAND_MIN, container - sheetH);
}

/** @param {'collapsed'|'mid'|'full'} snap @param {{ collapsed: number, mid: number, full: number }} snaps */
export function plannerSheetHeightPx(snap, snaps) {
  return snaps[snap] ?? snaps.mid;
}
