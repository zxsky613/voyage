import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToYmdLocal,
  clampYmdToRange,
  planActivityDateShifts,
  ymdDiffDays,
} from "./shiftActivityDatesForTripRange.js";

test("ymdDiffDays and addDaysToYmdLocal stay on local calendar", () => {
  assert.equal(ymdDiffDays("2026-06-01", "2026-06-08"), 7);
  assert.equal(ymdDiffDays("2026-06-08", "2026-06-01"), -7);
  assert.equal(addDaysToYmdLocal("2026-06-01", 7), "2026-06-08");
  assert.equal(addDaysToYmdLocal("2026-06-01", -2), "2026-05-30");
});

test("clampYmdToRange clamps outside bounds", () => {
  assert.equal(clampYmdToRange("2026-05-30", "2026-06-01", "2026-06-07"), "2026-06-01");
  assert.equal(clampYmdToRange("2026-06-10", "2026-06-01", "2026-06-07"), "2026-06-07");
  assert.equal(clampYmdToRange("2026-06-03", "2026-06-01", "2026-06-07"), "2026-06-03");
});

test("planActivityDateShifts shifts with start delta then clamps to new end", () => {
  const shifts = planActivityDateShifts({
    prevStart: "2026-06-01",
    newStart: "2026-06-08",
    newEnd: "2026-06-12",
    activities: [
      { id: "a1", date: "2026-06-01", date_key: "2026-06-01" }, // day 1 → Jun 8
      { id: "a2", date: "2026-06-05", date_key: "2026-06-05" }, // → Jun 12
      { id: "a3", date: "2026-06-07", date_key: "2026-06-07" }, // → Jun 14 → clamp Jun 12
      { date: "2026-06-01" }, // no id → ignored
    ],
  });

  assert.deepEqual(shifts, [
    { id: "a1", from: "2026-06-01", to: "2026-06-08" },
    { id: "a2", from: "2026-06-05", to: "2026-06-12" },
    { id: "a3", from: "2026-06-07", to: "2026-06-12" },
  ]);
});

test("planActivityDateShifts clamps when only end shrinks (no start delta)", () => {
  const shifts = planActivityDateShifts({
    prevStart: "2026-06-01",
    newStart: "2026-06-01",
    newEnd: "2026-06-03",
    activities: [
      { id: "keep", date_key: "2026-06-02" },
      { id: "late", date_key: "2026-06-07" },
    ],
  });
  assert.deepEqual(shifts, [{ id: "late", from: "2026-06-07", to: "2026-06-03" }]);
});

test("planActivityDateShifts is a no-op when dates already inside unchanged range", () => {
  const shifts = planActivityDateShifts({
    prevStart: "2026-06-01",
    newStart: "2026-06-01",
    newEnd: "2026-06-07",
    activities: [{ id: "a1", date_key: "2026-06-03" }],
  });
  assert.deepEqual(shifts, []);
});
