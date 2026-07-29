/** Types de dépense liées au budget voyage (trip_expenses.source_type). */
export const EXPENSE_SOURCE = {
  ACTIVITY: "activity",
  LODGING: "lodging",
  MANUAL: "manual",
};

const LEGACY_ACTIVITY_PREFIX = "[Planning]";
const LEGACY_LODGING_PREFIX = "[Logement]";

/** Préfixes i18n de `budget.importLineTitle` (avant le nom d'activité). */
const ACTIVITY_IMPORT_TITLE_RE =
  /^(?:\[Planning\]|Planning\s*:|Planner\s*:|Planer\s*:|Planificador\s*:|日程\s*[：:])/i;

/**
 * @param {string} title
 * @returns {boolean}
 */
export function isActivityImportExpenseTitle(title) {
  return ACTIVITY_IMPORT_TITLE_RE.test(String(title || "").trim());
}

export function expenseCategory(expense) {
  const st = String(expense?.source_type || "").toLowerCase();
  if (st === EXPENSE_SOURCE.ACTIVITY) return EXPENSE_SOURCE.ACTIVITY;
  if (st === EXPENSE_SOURCE.LODGING) return EXPENSE_SOURCE.LODGING;
  const title = String(expense?.title || "");
  if (title.startsWith(LEGACY_ACTIVITY_PREFIX) || isActivityImportExpenseTitle(title)) {
    return EXPENSE_SOURCE.ACTIVITY;
  }
  if (title.startsWith(LEGACY_LODGING_PREFIX)) return EXPENSE_SOURCE.LODGING;
  return EXPENSE_SOURCE.MANUAL;
}

/**
 * Retrouve la dépense liée à une activité (source_id, sinon repli titre si colonnes source absentes).
 * @param {Array<object>} expenses
 * @param {string} activityId
 * @param {{ tripId?: string, lineTitle?: string, activityTitle?: string }} [opts]
 */
export function findExpenseForActivity(expenses, activityId, opts = {}) {
  const aid = String(activityId || "");
  if (!aid) return null;
  const list = expenses || [];
  const bySource = list.find(
    (e) =>
      String(e?.source_type || "").toLowerCase() === EXPENSE_SOURCE.ACTIVITY &&
      String(e?.source_id || "") === aid
  );
  if (bySource) return bySource;

  const tripId = String(opts.tripId || "").trim();
  const lineTitle = String(opts.lineTitle || "").trim();
  const activityTitle = String(opts.activityTitle || "").trim();
  if (!tripId) return null;

  if (lineTitle) {
    const byExactTitle = list.find(
      (e) =>
        String(e?.trip_id || "") === tripId &&
        String(e?.title || "").trim() === lineTitle &&
        expenseCategory(e) === EXPENSE_SOURCE.ACTIVITY
    );
    if (byExactTitle) return byExactTitle;
  }

  if (activityTitle) {
    return (
      list.find((e) => {
        if (String(e?.trip_id || "") !== tripId) return false;
        if (expenseCategory(e) !== EXPENSE_SOURCE.ACTIVITY) return false;
        if (String(e?.source_id || "").trim()) return false;
        const et = String(e?.title || "");
        return et.includes(activityTitle);
      }) || null
    );
  }

  return null;
}

export function filterExpensesForTrip(expenses, tripId) {
  const tid = String(tripId || "");
  if (!tid) return [];
  return (expenses || []).filter((e) => String(e?.trip_id || "") === tid);
}

/**
 * True si une dépense activité orpheline (sans source_id) couvre déjà ce titre.
 * @param {Array<object>} groupExpenses
 * @param {string} activityTitle
 */
export function orphanActivityExpenseCoversTitle(groupExpenses, activityTitle) {
  const actTitle = String(activityTitle || "").trim();
  if (!actTitle) return false;
  return (groupExpenses || []).some((e) => {
    if (expenseCategory(e) !== EXPENSE_SOURCE.ACTIVITY) return false;
    if (String(e?.source_id || "").trim()) return false;
    return String(e?.title || "").includes(actTitle);
  });
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
    if (c <= 0) continue;
    const actTitle = String(a?.title || a?.name || "").trim();
    if (orphanActivityExpenseCoversTitle(groupExpenses, actTitle)) continue;
    unsyncedActivity += c;
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
