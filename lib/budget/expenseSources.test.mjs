import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPENSE_SOURCE,
  computeTripBudgetSummary,
  expenseCategory,
  findExpenseForActivity,
  isActivityImportExpenseTitle,
  orphanActivityExpenseCoversTitle,
} from "./expenseSources.js";

describe("isActivityImportExpenseTitle", () => {
  it("matches legacy and i18n import prefixes", () => {
    assert.equal(isActivityImportExpenseTitle("[Planning] Foo"), true);
    assert.equal(isActivityImportExpenseTitle("Planning : Louvre"), true);
    assert.equal(isActivityImportExpenseTitle("Planner: Louvre"), true);
    assert.equal(isActivityImportExpenseTitle("Planer: Louvre"), true);
    assert.equal(isActivityImportExpenseTitle("Planificador: Louvre"), true);
    assert.equal(isActivityImportExpenseTitle("日程：卢浮宫"), true);
    assert.equal(isActivityImportExpenseTitle("Taxi airport"), false);
  });
});

describe("expenseCategory", () => {
  it("classifies i18n planning titles as activity even without source_type", () => {
    assert.equal(
      expenseCategory({ title: "Planning : Louvre", amount: 20 }),
      EXPENSE_SOURCE.ACTIVITY
    );
    assert.equal(
      expenseCategory({ title: "Taxi", amount: 20 }),
      EXPENSE_SOURCE.MANUAL
    );
  });
});

describe("findExpenseForActivity", () => {
  it("matches by source_id first", () => {
    const expenses = [
      { id: "e1", trip_id: "t1", title: "Planning : A", source_type: "activity", source_id: "a1" },
      { id: "e2", trip_id: "t1", title: "Planning : A", source_type: "activity", source_id: "a2" },
    ];
    assert.equal(findExpenseForActivity(expenses, "a2")?.id, "e2");
  });

  it("falls back to exact line title when source_id missing (stripped schema)", () => {
    const expenses = [
      { id: "e1", trip_id: "t1", title: "Planning : Louvre", source_type: "", source_id: "" },
    ];
    const hit = findExpenseForActivity(expenses, "a99", {
      tripId: "t1",
      lineTitle: "Planning : Louvre",
    });
    assert.equal(hit?.id, "e1");
  });

  it("falls back to activity title contained in orphan expense title", () => {
    const expenses = [
      { id: "e1", trip_id: "t1", title: "Planner: Louvre Museum", source_type: "", source_id: "" },
    ];
    const hit = findExpenseForActivity(expenses, "a99", {
      tripId: "t1",
      activityTitle: "Louvre Museum",
    });
    assert.equal(hit?.id, "e1");
  });
});

describe("computeTripBudgetSummary", () => {
  it("does not double-count orphan planning expenses without source_id", () => {
    const activities = [{ id: "a1", title: "Louvre", cost: 25 }];
    const expenses = [
      { title: "Planning : Louvre", amount: 25, source_type: "", source_id: "" },
    ];
    const summary = computeTripBudgetSummary(expenses, activities);
    assert.equal(summary.activity, 25);
    assert.equal(summary.unsyncedActivity, 0);
    assert.equal(summary.totalTrip, 25);
  });

  it("counts unsynced activity cost when no matching expense", () => {
    const activities = [{ id: "a1", title: "Louvre", cost: 25 }];
    const summary = computeTripBudgetSummary([], activities);
    assert.equal(summary.unsyncedActivity, 25);
    assert.equal(summary.totalTrip, 25);
  });

  it("dedupes via source_id when present", () => {
    const activities = [{ id: "a1", title: "Louvre", cost: 25 }];
    const expenses = [
      { title: "Planning : Louvre", amount: 25, source_type: "activity", source_id: "a1" },
    ];
    const summary = computeTripBudgetSummary(expenses, activities);
    assert.equal(summary.unsyncedActivity, 0);
    assert.equal(summary.totalTrip, 25);
  });
});

describe("orphanActivityExpenseCoversTitle", () => {
  it("detects orphan coverage", () => {
    assert.equal(
      orphanActivityExpenseCoversTitle(
        [{ title: "Planning : Louvre", source_id: "" }],
        "Louvre"
      ),
      true
    );
    assert.equal(
      orphanActivityExpenseCoversTitle(
        [{ title: "Planning : Louvre", source_type: "activity", source_id: "a1" }],
        "Louvre"
      ),
      false
    );
  });
});
