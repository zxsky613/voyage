/** Types de dépense liées au budget voyage (trip_expenses.source_type). */
export const EXPENSE_SOURCE = {
  ACTIVITY: "activity",
  LODGING: "lodging",
  MANUAL: "manual",
};

const LEGACY_ACTIVITY_PREFIX = "[Planning]";
const LEGACY_LODGING_PREFIX = "[Logement]";

export function expenseCategory(expense) {
  const st = String(expense?.source_type || "").toLowerCase();
  if (st === EXPENSE_SOURCE.ACTIVITY) return EXPENSE_SOURCE.ACTIVITY;
  if (st === EXPENSE_SOURCE.LODGING) return EXPENSE_SOURCE.LODGING;
  const title = String(expense?.title || "");
  if (title.startsWith(LEGACY_ACTIVITY_PREFIX)) return EXPENSE_SOURCE.ACTIVITY;
  if (title.startsWith(LEGACY_LODGING_PREFIX)) return EXPENSE_SOURCE.LODGING;
  return EXPENSE_SOURCE.MANUAL;
}

export function findExpenseForActivity(expenses, activityId) {
  const aid = String(activityId || "");
  if (!aid) return null;
  return (
    (expenses || []).find(
      (e) =>
        String(e?.source_type || "").toLowerCase() === EXPENSE_SOURCE.ACTIVITY &&
        String(e?.source_id || "") === aid
    ) || null
  );
}

export function filterExpensesForTrip(expenses, tripId) {
  const tid = String(tripId || "");
  if (!tid) return [];
  return (expenses || []).filter((e) => String(e?.trip_id || "") === tid);
}

/** Totaux unifiés : dépenses enregistrées + activités du planning pas encore synchronisées. */
export function computeTripBudgetSummary(groupExpenses, activities) {
  const syncedActivityIds = new Set();
  let lodging = 0;
  let activity = 0;
  let manual = 0;

  for (const e of groupExpenses || []) {
    const amt = Number(e?.amount) || 0;
    if (amt <= 0) continue;
    const cat = expenseCategory(e);
    if (cat === EXPENSE_SOURCE.LODGING) lodging += amt;
    else if (cat === EXPENSE_SOURCE.ACTIVITY) {
      activity += amt;
      if (e?.source_id) syncedActivityIds.add(String(e.source_id));
    } else manual += amt;
  }

  let unsyncedActivity = 0;
  for (const a of activities || []) {
    if (syncedActivityIds.has(String(a?.id || ""))) continue;
    const c = Number(a?.cost) || 0;
    if (c > 0) unsyncedActivity += c;
  }

  const totalSynced = lodging + activity + manual;
  return {
    totalTrip: totalSynced + unsyncedActivity,
    lodging,
    activity,
    manual,
    unsyncedActivity,
    syncedActivityIds,
  };
}
