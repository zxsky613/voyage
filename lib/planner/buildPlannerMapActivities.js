/** @param {unknown} value */
function toYmdLoose(value) {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

/** @param {string} timeStr */
function parseActivityTimePeriod(timeStr) {
  const t = String(timeStr || "").trim();
  if (t.length < 2) return "";
  const h = Number(t.slice(0, 2));
  if (!Number.isFinite(h)) return "";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/** @param {string} startYmd @param {number} dayOffset */
function addDaysToYmd(startYmd, dayOffset) {
  const d = new Date(`${String(startYmd).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

/**
 * Activités voyage (base) → format TripMap (dayIndex, orderInDay, coords…).
 * @param {{ activities?: Array<object>, tripId?: string, tripStartYmd?: string }} opts
 * @returns {Array<object>}
 */
export function buildPlannerMapActivities({ activities = [], tripId = "", tripStartYmd = "" }) {
  const tid = String(tripId || "").trim();
  const start = String(tripStartYmd || "").slice(0, 10);
  if (!tid || !start) return [];

  const tripActs = (activities || [])
    .filter((a) => String(a?.trip_id || "").trim() === tid)
    .map((a) => ({
      raw: a,
      dateKey: toYmdLoose(a?.date_key || a?.date),
      time: String(a?.time || "").slice(0, 5),
    }))
    .filter((a) => a.dateKey)
    .sort((a, b) => {
      const dc = a.dateKey.localeCompare(b.dateKey);
      if (dc !== 0) return dc;
      return a.time.localeCompare(b.time);
    });

  const orderByDay = new Map();
  return tripActs.map(({ raw, dateKey, time }) => {
    const d0 = new Date(`${start}T12:00:00`);
    const d1 = new Date(`${dateKey}T12:00:00`);
    const dayIndex = Math.max(0, Math.round((d1.getTime() - d0.getTime()) / 86400000));
    const orderInDay = (orderByDay.get(dayIndex) || 0) + 1;
    orderByDay.set(dayIndex, orderInDay);
    const lat = Number(raw?.latitude);
    const lon = Number(raw?.longitude);
    return {
      id: String(raw.id),
      dayIndex,
      dayNum: dayIndex + 1,
      orderInDay,
      title: String(raw?.title || raw?.name || "").trim(),
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lon) ? lon : undefined,
      coordsSource: String(raw?.coords_source || raw?.coordsSource || ""),
      period: parseActivityTimePeriod(time),
      time,
      photoUrl: String(raw?.photo_url || raw?.image_url || "").trim(),
      dateKey,
    };
  });
}

/** @param {string} tripStartYmd @param {string} dateYmd */
export function plannerDayIndexForDate(tripStartYmd, dateYmd) {
  const start = String(tripStartYmd || "").slice(0, 10);
  const date = toYmdLoose(dateYmd);
  if (!start || !date) return 0;
  const d0 = new Date(`${start}T12:00:00`);
  const d1 = new Date(`${date}T12:00:00`);
  return Math.max(0, Math.round((d1.getTime() - d0.getTime()) / 86400000));
}

export { addDaysToYmd, toYmdLoose as plannerDateYmdLoose };
