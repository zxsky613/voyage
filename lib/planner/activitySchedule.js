/** @param {string|null|undefined} hhmm */
export function normalizeHHMM(hhmm) {
  const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** @param {string|null|undefined} hhmm */
export function hhmmToMinutes(hhmm) {
  const n = normalizeHHMM(hhmm);
  if (!n) return null;
  const [h, m] = n.split(":").map(Number);
  return h * 60 + m;
}

/** @param {number} mins */
export function minutesToHHMM(mins) {
  const total = Math.max(0, Math.floor(Number(mins) || 0));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Affichage badge « ≈ 9h30 » */
export function formatApproxTimeLabel(hhmm) {
  const n = normalizeHHMM(hhmm);
  if (!n) return "";
  const [h, m] = n.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

export const SCHEDULE_GAP_MINUTES = 30;
export const DEFAULT_ACTIVITY_DURATION_MINUTES = 90;

/**
 * Recale les heures d'un jour : croissant, durée + battement 30 min.
 * @param {object[]} activities
 * @param {{ earliestMinutes?: number|null, latestEndMinutes?: number|null }} [opts]
 */
export function reconcileDayActivityTimes(activities, opts = {}) {
  const list = Array.isArray(activities) ? [...activities] : [];
  if (!list.length) return list;

  const earliest = opts.earliestMinutes ?? null;
  const latestEnd = opts.latestEndMinutes ?? null;
  let prevEnd =
    earliest != null ? earliest : hhmmToMinutes(list[0]?.suggestedTime || list[0]?.time) ?? 9 * 60 + 30;

  return list.map((a, i) => {
    const rawDur = Number(a?.durationMinutes ?? a?.duration_minutes);
    const dur = Math.max(
      15,
      Math.min(480, Number.isFinite(rawDur) && rawDur > 0 ? Math.floor(rawDur) : DEFAULT_ACTIVITY_DURATION_MINUTES)
    );

    let start =
      hhmmToMinutes(a?.suggestedTime || a?.suggested_time || a?.time) ??
      (a?.period === "afternoon" || a?.period === "evening"
        ? 14 * 60 + 15
        : a?.period === "evening"
          ? 19 * 60
          : 9 * 60 + 30);

    if (i === 0 && earliest != null) start = Math.max(start, earliest);
    if (i > 0) start = Math.max(start, prevEnd + SCHEDULE_GAP_MINUTES);

    let end = start + dur;
    if (latestEnd != null && i === list.length - 1 && end > latestEnd) {
      start = Math.max(
        i > 0 ? prevEnd + SCHEDULE_GAP_MINUTES : earliest ?? 9 * 60,
        latestEnd - dur
      );
      end = Math.min(latestEnd, start + dur);
    }

    prevEnd = start + (end - start);
    const finalDur = end - start;
    const time = minutesToHHMM(start);
    return {
      ...a,
      time,
      suggestedTime: time,
      durationMinutes: finalDur,
      duration_minutes: finalDur,
    };
  });
}
