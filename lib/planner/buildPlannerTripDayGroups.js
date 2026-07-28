import { addDaysToYmd, plannerDayIndexForDate, plannerDateYmdLoose } from "./buildPlannerMapActivities.js";
import { resolvePlannerDayZoneLabel } from "./resolvePlannerDayZoneLabel.js";

/**
 * Regroupe les activités d'un voyage par jour (ordre chronologique).
 * @param {{
 *   activities?: Array<object>,
 *   tripId?: string,
 *   tripStartYmd?: string,
 *   tripEndYmd?: string,
 *   cityLabel?: string,
 * }} opts
 * @returns {Array<{ dayIndex: number, dayNum: number, dateKey: string, zoneLabel: string, activities: Array<object> }>}
 */
export function buildPlannerTripDayGroups({
  activities = [],
  tripId = "",
  tripStartYmd = "",
  tripEndYmd = "",
  cityLabel = "",
}) {
  const tid = String(tripId || "").trim();
  const start = String(tripStartYmd || "").slice(0, 10);
  const end = String(tripEndYmd || tripStartYmd || "").slice(0, 10);
  if (!tid || !start) return [];

  /** @type {Map<number, { dayIndex: number, dayNum: number, dateKey: string, activities: Array<object> }>} */
  const byDay = new Map();

  for (const a of activities || []) {
    if (String(a?.trip_id || "").trim() !== tid) continue;
    const dateKey = plannerDateYmdLoose(a?.date_key || a?.date);
    if (!dateKey || dateKey < start || (end && dateKey > end)) continue;

    const dayIndex = plannerDayIndexForDate(start, dateKey);
    const cur =
      byDay.get(dayIndex)
      || { dayIndex, dayNum: dayIndex + 1, dateKey, activities: [] };
    cur.activities.push(a);
    byDay.set(dayIndex, cur);
  }

  const city = String(cityLabel || "").trim();

  return [...byDay.values()]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((group) => {
      const sorted = [...group.activities].sort((a, b) =>
        String(a?.time || "").localeCompare(String(b?.time || ""))
      );
      const zoneLabel = resolvePlannerDayZoneLabel({ activities: sorted, cityLabel: city });
      return {
        dayIndex: group.dayIndex,
        dayNum: group.dayNum,
        dateKey: group.dateKey,
        zoneLabel,
        activities: sorted,
      };
    });
}

export { addDaysToYmd };
