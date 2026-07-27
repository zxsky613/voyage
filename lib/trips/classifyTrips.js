function getTodayStr() {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const da = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function toYMD(value, fallback) {
  const s = String(value || "");
  if (!s) return String(fallback || getTodayStr());
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Classe les voyages : en cours / à venir / souvenirs.
 * @param {object[]} list
 */
export function classifyTrips(list) {
  const now = [];
  const upcoming = [];
  const memories = [];
  const sortByChronology = (a, b) => {
    const aStart = toYMD(a?.start_date, "9999-12-31");
    const bStart = toYMD(b?.start_date, "9999-12-31");
    if (aStart !== bStart) return aStart.localeCompare(bStart);

    const aEnd = toYMD(a?.end_date, "9999-12-31");
    const bEnd = toYMD(b?.end_date, "9999-12-31");
    if (aEnd !== bEnd) return aEnd.localeCompare(bEnd);

    return String(a?.title || "").localeCompare(String(b?.title || ""));
  };

  (list || []).forEach((trip) => {
    const start = toYMD(trip?.start_date, "");
    const end = toYMD(trip?.end_date, "");
    const today = getTodayStr();
    if (start && end && start <= today && end >= today) now.push(trip);
    else if (start && start > today) upcoming.push(trip);
    else memories.push(trip);
  });
  now.sort(sortByChronology);
  upcoming.sort(sortByChronology);
  memories.sort(sortByChronology);
  return { now, upcoming, memories };
}
