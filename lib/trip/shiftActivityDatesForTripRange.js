/**
 * When trip start/end dates change, keep activities visible in the planner
 * by shifting with the start-date delta, then clamping into the new range.
 *
 * Uses local calendar arithmetic (noon local + getFullYear/Month/Date), not
 * `toISOString().slice(0, 10)`, so UTC+13/+14 zones stay correct.
 */

/** @param {unknown} value */
function toYmdStrict(value) {
  const s = String(value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** Inclusive day delta from `fromYmd` to `toYmd` (local calendar). */
export function ymdDiffDays(fromYmd, toYmd) {
  const a = toYmdStrict(fromYmd);
  const b = toYmdStrict(toYmd);
  if (!a || !b) return 0;
  const t0 = Date.parse(`${a}T12:00:00`);
  const t1 = Date.parse(`${b}T12:00:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return 0;
  return Math.round((t1 - t0) / 86400000);
}

/** @param {string} startYmd @param {number} dayOffset */
export function addDaysToYmdLocal(startYmd, dayOffset) {
  const s = toYmdStrict(startYmd);
  if (!s) return "";
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(dayOffset || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {string} ymd @param {string} startYmd @param {string} endYmd */
export function clampYmdToRange(ymd, startYmd, endYmd) {
  let d = toYmdStrict(ymd);
  const start = toYmdStrict(startYmd);
  const end = toYmdStrict(endYmd) || start;
  if (!d) return start || "";
  if (start && d < start) d = start;
  if (end && d > end) d = end;
  return d;
}

/**
 * @param {{
 *   activities?: Array<{ id?: unknown, date?: unknown, date_key?: unknown, activity_date?: unknown }>,
 *   prevStart?: string,
 *   newStart?: string,
 *   newEnd?: string,
 * }} opts
 * @returns {Array<{ id: string, from: string, to: string }>}
 */
export function planActivityDateShifts({
  activities = [],
  prevStart = "",
  newStart = "",
  newEnd = "",
} = {}) {
  const start = toYmdStrict(newStart);
  const end = toYmdStrict(newEnd) || start;
  if (!start) return [];

  const delta = ymdDiffDays(prevStart, start);
  /** @type {Array<{ id: string, from: string, to: string }>} */
  const out = [];

  for (const a of activities || []) {
    const id = String(a?.id ?? "").trim();
    if (!id) continue;
    const from = toYmdStrict(a?.date_key ?? a?.date ?? a?.activity_date);
    if (!from) continue;
    const shifted = addDaysToYmdLocal(from, delta);
    const to = clampYmdToRange(shifted || from, start, end);
    if (to && to !== from) out.push({ id, from, to });
  }

  return out;
}
