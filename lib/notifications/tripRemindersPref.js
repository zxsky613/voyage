const KEY_PREFIX = "tp_trip_reminders_";

/** @param {string} tripId */
export function tripRemindersStorageKey(tripId) {
  return `${KEY_PREFIX}${String(tripId || "").trim()}`;
}

/** @param {string} tripId @returns {boolean} */
export function isTripRemindersEnabled(tripId) {
  if (typeof window === "undefined" || !String(tripId || "").trim()) return true;
  try {
    const raw = window.localStorage.getItem(tripRemindersStorageKey(tripId));
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

/** @param {string} tripId @param {boolean} enabled */
export function setTripRemindersEnabled(tripId, enabled) {
  if (typeof window === "undefined" || !String(tripId || "").trim()) return;
  try {
    window.localStorage.setItem(tripRemindersStorageKey(tripId), enabled ? "1" : "0");
  } catch {
    /* ignore quota */
  }
}
