import { getAppDateLocale } from "../../i18n/dateLocale.js";

/** Affichage date voyage (aligné sur formatDate App.jsx). */
export function formatTripDate(value) {
  const s = String(value || "");
  if (!s) return "-";
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.slice(0, 10));
  const d = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0)
    : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(getAppDateLocale(), { day: "2-digit", month: "short", year: "numeric" });
}
