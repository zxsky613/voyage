import { EXPENSE_SOURCE } from "./expenseSources.js";

function toYMD(value) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Payload trip_expenses pour une activité du planning (coût > 0). */
export function buildActivityExpensePayload(activity, lineTitle) {
  const cost = Number(activity?.cost) || 0;
  const tripId = String(activity?.trip_id || "").trim();
  const activityId = String(activity?.id || "").trim();
  if (cost <= 0 || !tripId || !activityId) return null;
  const title =
    String(lineTitle || "").trim() ||
    String(activity?.title || activity?.name || "Activité").trim() ||
    "Activité";
  return {
    trip_id: tripId,
    title,
    amount: cost,
    paid_by: "Moi",
    split_between: [],
    expense_date: toYMD(activity?.date || activity?.date_key || activity?.activity_date),
    source_type: EXPENSE_SOURCE.ACTIVITY,
    source_id: activityId,
  };
}

/** Payload trip_expenses pour un logement enregistré depuis l’onglet Logement. */
export function buildLodgingExpensePayload({ tripId, title, amount, checkIn, paidBy = "Moi" }) {
  const tid = String(tripId || "").trim();
  const amt = Number(amount);
  if (!tid || !Number.isFinite(amt) || amt <= 0) return null;
  const label = String(title || "").trim() || "Hébergement";
  return {
    trip_id: tid,
    title: label,
    amount: amt,
    paid_by: String(paidBy || "Moi"),
    split_between: [],
    expense_date: toYMD(checkIn),
    source_type: EXPENSE_SOURCE.LODGING,
    source_id: "",
  };
}
