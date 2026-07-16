import { estimateItineraryLegMinutes } from "./itineraryTravelEstimate.js";

/**
 * @param {object} activity
 * @param {object|null|undefined} mapped
 * @param {number} fallbackOrder
 */
export function resolveTimelineOrderInDay(activity, mapped, fallbackOrder) {
  const fromMap = Number(mapped?.orderInDay);
  if (Number.isFinite(fromMap) && fromMap > 0) return fromMap;
  return fallbackOrder;
}

/**
 * @param {object} activity
 * @param {object|null|undefined} mapped
 * @returns {{ latitude: number, longitude: number }|null}
 */
export function resolveTimelineCoords(activity, mapped) {
  const lat = Number(activity?.latitude ?? mapped?.latitude);
  const lon = Number(activity?.longitude ?? mapped?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { latitude: lat, longitude: lon };
}

/**
 * @param {Array<object>} dayActivities — triées par heure
 * @param {Array<object>} plannerMapActivities — sortie buildPlannerMapActivities
 * @returns {Array<{ activity: object, orderInDay: number, coords: object|null, title: string, time: string, location: string }>}
 */
export function buildPlannerDayTimelineItems(dayActivities, plannerMapActivities = []) {
  const mapById = new Map(
    (plannerMapActivities || []).map((m) => [String(m?.id || ""), m]).filter(([id]) => id)
  );
  return (dayActivities || []).map((activity, index) => {
    const id = String(activity?.id || "");
    const mapped = mapById.get(id) || null;
    return {
      activity,
      orderInDay: resolveTimelineOrderInDay(activity, mapped, index + 1),
      coords: resolveTimelineCoords(activity, mapped),
      title: String(activity?.title || activity?.name || "").trim(),
      time: String(activity?.time || "").slice(0, 5),
      location: String(activity?.location || "").trim(),
    };
  });
}

/**
 * @param {Array<{ coords: object|null }>} items
 * @returns {Array<{ minutes: number, mode: 'walk'|'transit', km: number }|null>}
 */
export function buildTravelLegsForTimelineItems(items) {
  const legs = [];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]?.coords;
    const cur = items[i]?.coords;
    legs.push(prev && cur ? estimateItineraryLegMinutes(prev, cur) : null);
  }
  return legs;
}

/**
 * Lignes alternées activité / leg pour le rendu vertical.
 * @param {Array<object>} items
 * @returns {Array<{ type: 'activity', item: object, index: number }|{ type: 'leg', leg: object, beforeIndex: number }>}
 */
export function buildPlannerDayTimelineRows(items) {
  /** @type {Array<{ type: 'activity', item: object, index: number }|{ type: 'leg', leg: object, beforeIndex: number }>} */
  const rows = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      const prev = items[i - 1]?.coords;
      const cur = items[i]?.coords;
      const leg = prev && cur ? estimateItineraryLegMinutes(prev, cur) : null;
      if (leg) rows.push({ type: "leg", leg, beforeIndex: i });
    }
    rows.push({ type: "activity", item: items[i], index: i });
  }
  return rows;
}
