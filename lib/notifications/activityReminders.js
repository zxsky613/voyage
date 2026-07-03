import { Capacitor } from "@capacitor/core";
import { isTripRemindersEnabled } from "./tripRemindersPref.js";

let permissionHintShown = false;

/** @returns {boolean} */
export function isNativeRemindersAvailable() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/**
 * @param {string} activityId
 * @returns {{ dayBefore: number, twoHours: number }}
 */
export function activityReminderNotificationIds(activityId) {
  const raw = String(activityId || "").trim();
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const base = (hash >>> 0) % 900000000;
  return { dayBefore: 100000000 + base * 2, twoHours: 100000001 + base * 2 };
}

/**
 * @param {object} activity
 * @returns {Date|null}
 */
export function getActivityStartDate(activity) {
  const dateYmd = String(activity?.date || activity?.date_key || activity?.activity_date || "").trim();
  const dm = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const tm = String(activity?.time || "09:00").trim().match(/^(\d{1,2}):(\d{2})/);
  const hh = tm ? Number(tm[1]) : 9;
  const mm = tm ? Number(tm[2]) : 0;
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), hh, mm, 0, 0);
}

/** @param {object} activity */
export function isFutureActivity(activity) {
  const start = getActivityStartDate(activity);
  return Boolean(start && start.getTime() > Date.now());
}

/**
 * @param {(key: string, vars?: object) => string} [onPermissionHint]
 * @returns {Promise<boolean>}
 */
export async function ensureActivityRemindersPermission(onPermissionHint) {
  if (!isNativeRemindersAvailable()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  if (!permissionHintShown && typeof onPermissionHint === "function") {
    onPermissionHint("planner.remindersPermissionHint");
    permissionHintShown = true;
  }
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

/** @param {string} activityId */
export async function cancelActivityReminders(activityId) {
  if (!isNativeRemindersAvailable() || !String(activityId || "").trim()) return;
  const ids = activityReminderNotificationIds(activityId);
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.cancel({
    notifications: [{ id: ids.dayBefore }, { id: ids.twoHours }],
  });
}

/**
 * @param {object} activity
 * @param {object} opts
 * @param {string} [opts.tripId]
 * @param {(key: string, vars?: object) => string} opts.t
 * @param {(key: string) => void} [opts.onPermissionHint]
 */
export async function scheduleActivityReminders(activity, { tripId, t, onPermissionHint }) {
  if (!isNativeRemindersAvailable() || typeof t !== "function") return;
  if (!activity?.id || !isFutureActivity(activity)) return;
  if (tripId && !isTripRemindersEnabled(tripId)) return;

  const granted = await ensureActivityRemindersPermission(onPermissionHint);
  if (!granted) return;

  await cancelActivityReminders(activity.id);

  const start = getActivityStartDate(activity);
  if (!start) return;

  const title = String(activity?.title || activity?.name || "").trim() || t("planner.reminderFallbackTitle");
  const timeLabel = String(activity?.time || "").slice(0, 5) || "09:00";
  const ids = activityReminderNotificationIds(activity.id);
  const now = Date.now();
  const notifications = [];

  const dayBefore = new Date(start);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(18, 0, 0, 0);
  if (dayBefore.getTime() > now) {
    notifications.push({
      id: ids.dayBefore,
      title: t("planner.reminderAppName"),
      body: t("planner.reminderDayBefore", { title, time: timeLabel }),
      schedule: { at: dayBefore },
    });
  }

  const twoHoursBefore = new Date(start.getTime() - 2 * 60 * 60 * 1000);
  if (twoHoursBefore.getTime() > now) {
    notifications.push({
      id: ids.twoHours,
      title: t("planner.reminderAppName"),
      body: t("planner.reminderTwoHours", { title }),
      schedule: { at: twoHoursBefore },
    });
  }

  if (notifications.length === 0) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.schedule({ notifications });
}

/**
 * @param {object[]} activities
 * @param {object} opts
 */
export async function scheduleActivityRemindersBatch(activities, opts) {
  if (!isNativeRemindersAvailable()) return;
  const list = Array.isArray(activities) ? activities : [];
  for (const activity of list) {
    await scheduleActivityReminders(activity, opts);
  }
}
