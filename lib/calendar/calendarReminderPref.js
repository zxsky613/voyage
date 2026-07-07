import { buildTripIcs, sanitizeIcsFilename } from "./buildTripIcs.js";

/** @returns {number} minutes before event; 0 = no alarm */
export function readCalendarReminderMinutes() {
  try {
    const raw = String(window.localStorage.getItem("tp_calendar_reminder_minutes_v1") || "").trim();
    if (raw === "0" || raw === "none") return 0;
    const n = Number(raw);
    if (n === 0) return 0;
    if (n === 120) return 120;
    return 60;
  } catch (_e) {
    return 60;
  }
}

/** @param {number} minutes */
export function writeCalendarReminderMinutes(minutes) {
  try {
    const n = Number(minutes);
    window.localStorage.setItem(
      "tp_calendar_reminder_minutes_v1",
      n === 0 ? "0" : n === 120 ? "120" : "60"
    );
  } catch (_e) {
    /* ignore */
  }
}
