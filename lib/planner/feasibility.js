const FULL_DAY_CATEGORIES = new Set([
  "national_park",
  "hiking",
  "trek",
  "excursion",
  "day_trip",
  "parc national",
  "randonnée",
]);

/**
 * @param {string} category
 * @param {number} rawHours
 */
export function clampDurationHours(category, rawHours) {
  const cat = String(category || "").toLowerCase();
  let h = Number(rawHours);
  if (!Number.isFinite(h)) h = 2;
  if (FULL_DAY_CATEGORIES.has(cat) || /parc national|randonn|hike|trek|excursion/i.test(cat)) {
    return Math.min(8, Math.max(5, h));
  }
  return Math.min(8, Math.max(1, h));
}

/**
 * @param {object[]} dayPlaces
 * @returns {boolean}
 */
export function dayFeasible(dayPlaces) {
  const list = Array.isArray(dayPlaces) ? dayPlaces : [];
  if (!list.length) return false;
  const fullDay = list.some((p) => {
    const cat = String(p?.category || "").toLowerCase();
    return FULL_DAY_CATEGORIES.has(cat) || clampDurationHours(cat, p?.durationHours) >= 5;
  });
  if (fullDay && list.length > 1) return false;
  const totalHours = list.reduce((s, p) => s + clampDurationHours(p?.category, p?.durationHours), 0);
  const travelBuffer = Math.max(0, list.length - 1) * 0.5;
  return totalHours + travelBuffer <= 9;
}

/**
 * @param {object[]} places
 * @param {number} maxPerDay
 */
export function capPlacesPerDay(places, maxPerDay = 3) {
  const list = Array.isArray(places) ? places : [];
  const out = [];
  for (const p of list) {
    const cat = String(p?.category || "").toLowerCase();
    const isFull = FULL_DAY_CATEGORIES.has(cat) || clampDurationHours(cat, p?.durationHours) >= 5;
    if (isFull) {
      out.push({ ...p, durationHours: clampDurationHours(cat, p.durationHours) });
      continue;
    }
    if (out.filter((x) => !FULL_DAY_CATEGORIES.has(String(x.category || "").toLowerCase())).length >= maxPerDay) {
      continue;
    }
    out.push({ ...p, durationHours: clampDurationHours(cat, p.durationHours) });
  }
  return out;
}
