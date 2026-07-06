const CRLF = "\r\n";
const DEFAULT_APP_URL = "https://justtrip.fr";
const DEFAULT_DURATION_HOURS = 2;
const UID_DOMAIN = "justtrip.fr";

/** @param {string|null|undefined} value */
export function escapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * @param {string} dateYmd
 * @param {string} [timeHhmm]
 * @returns {string|null}
 */
export function formatIcsLocalDateTime(dateYmd, timeHhmm = "09:00") {
  const d = String(dateYmd || "").trim();
  const dm = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const tm = String(timeHhmm || "09:00").trim().match(/^(\d{1,2}):(\d{2})/);
  const hh = tm ? String(tm[1]).padStart(2, "0") : "09";
  const mm = tm ? tm[2] : "00";
  return `${dm[1]}${dm[2]}${dm[3]}T${hh}${mm}00`;
}

/**
 * @param {string} dtLocal YYYYMMDDTHHMMSS
 * @param {number} hours
 * @returns {string|null}
 */
export function addHoursToIcsLocalDateTime(dtLocal, hours) {
  const m = String(dtLocal || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const start = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0)
  );
  start.setTime(start.getTime() + Math.max(0, Number(hours) || 0) * 3600000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}` +
    `T${pad(start.getHours())}${pad(start.getMinutes())}${pad(start.getSeconds())}`
  );
}

/**
 * @param {string} dtLocal YYYYMMDDTHHMMSS
 * @param {number} minutes
 * @returns {string|null}
 */
export function addMinutesToIcsLocalDateTime(dtLocal, minutes) {
  const m = String(dtLocal || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const start = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0)
  );
  start.setTime(start.getTime() + Math.max(0, Number(minutes) || 0) * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}` +
    `T${pad(start.getHours())}${pad(start.getMinutes())}${pad(start.getSeconds())}`
  );
}

/** @returns {string} */
export function formatIcsUtcStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * @param {object} activity
 * @param {number} index
 */
export function buildActivityIcsUid(activity, index = 0) {
  const id = String(activity?.id || "").trim();
  if (id) return `${id}@${UID_DOMAIN}`;
  const fallback = `${activity?.date || ""}|${activity?.time || ""}|${activity?.title || ""}|${index}`;
  let hash = 2166136261;
  for (let i = 0; i < fallback.length; i += 1) {
    hash ^= fallback.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16);
  return `tmp-${hex}@${UID_DOMAIN}`;
}

/**
 * @param {object} activity
 * @param {string} [destination]
 * @param {string} [appUrl]
 */
export function buildActivityIcsDescription(activity, destination = "", appUrl = DEFAULT_APP_URL) {
  const parts = [];
  const desc = String(activity?.description || "").trim();
  if (desc) parts.push(desc);
  const price = Number(activity?.estimated_price_eur ?? activity?.estimatedPriceEur ?? activity?.cost);
  if (Number.isFinite(price) && price > 0) {
    parts.push(`Prix estimé : ~${Math.round(price)}€`);
  }
  const dest = String(destination || activity?.location || "").trim();
  if (dest) parts.push(`Destination : ${dest}`);
  parts.push(String(appUrl || DEFAULT_APP_URL).trim());
  return parts.join("\\n");
}

/**
 * @param {object} activity
 * @param {object} [opts]
 * @returns {string|null}
 */
export function buildVeventBlock(activity, opts = {}) {
  const dateYmd = String(activity?.date || activity?.date_key || activity?.activity_date || "").trim();
  const timeHhmm = String(activity?.time || "09:00").trim();
  const dtStart = formatIcsLocalDateTime(dateYmd, timeHhmm);
  if (!dtStart) return null;

  const durationMin = Number(activity?.duration_minutes ?? activity?.durationMinutes);
  const durationHours = Number(activity?.durationHours);
  let dtEnd;
  if (Number.isFinite(durationMin) && durationMin > 0) {
    dtEnd = addMinutesToIcsLocalDateTime(dtStart, durationMin) || dtStart;
  } else {
    const hours =
      Number.isFinite(durationHours) && durationHours > 0 ? durationHours : DEFAULT_DURATION_HOURS;
    dtEnd = addHoursToIcsLocalDateTime(dtStart, hours) || dtStart;
  }

  const destination = String(opts.destination || "").trim();
  const title = String(activity?.title || activity?.name || "Activité").trim();
  const locationParts = [String(activity?.location || "").trim(), destination].filter(Boolean);
  const location = [...new Set(locationParts)].join(", ");
  const uid = buildActivityIcsUid(activity, opts.index || 0);
  const description = buildActivityIcsDescription(activity, destination, opts.appUrl);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtcStamp()}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description.replace(/\\n/g, "\n"))}`);

  const reminderMin = Number(opts.reminderMinutes);
  if (Number.isFinite(reminderMin) && reminderMin > 0) {
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${Math.floor(reminderMin)}M`,
      "ACTION:DISPLAY",
      "DESCRIPTION:Activity reminder",
      "END:VALARM"
    );
  }

  lines.push("END:VEVENT");
  return lines.join(CRLF);
}

/**
 * @param {object} opts
 * @param {string} [opts.destination]
 * @param {object[]} [opts.activities]
 * @param {string} [opts.appUrl]
 * @returns {string}
 */
export function buildTripIcs({
  destination = "",
  activities = [],
  appUrl = DEFAULT_APP_URL,
  reminderMinutes = 60,
} = {}) {
  const dest = String(destination || "").trim();
  const reminder = Number(reminderMinutes);
  const events = (Array.isArray(activities) ? activities : [])
    .map((activity, index) =>
      buildVeventBlock(activity, {
        destination: dest,
        appUrl,
        index,
        reminderMinutes: Number.isFinite(reminder) ? reminder : 60,
      })
    )
    .filter(Boolean);

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//justtrip.fr//Justtrip Trip Export//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const footer = ["END:VCALENDAR"];
  return [...header, ...events, ...footer].join(CRLF) + CRLF;
}

/** @param {string} label */
export function sanitizeIcsFilename(label) {
  return String(label || "voyage")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .toLowerCase() || "voyage";
}
