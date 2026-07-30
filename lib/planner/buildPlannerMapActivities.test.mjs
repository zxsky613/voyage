import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlannerMapActivities,
  plannerDayIndexForDate,
  addDaysToYmd,
} from "./buildPlannerMapActivities.js";

test("buildPlannerMapActivities assigns dayIndex and orderInDay", () => {
  const rows = buildPlannerMapActivities({
    tripId: "trip-1",
    tripStartYmd: "2026-07-24",
    activities: [
      { id: "a1", trip_id: "trip-1", date: "2026-07-24", time: "09:00", title: "One", latitude: 43.2, longitude: 5.4 },
      { id: "a2", trip_id: "trip-1", date: "2026-07-24", time: "14:00", title: "Two", latitude: 43.3, longitude: 5.5 },
      { id: "a3", trip_id: "trip-1", date: "2026-07-25", time: "10:00", title: "Three", latitude: 43.1, longitude: 5.3 },
    ],
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].orderInDay, 1);
  assert.equal(rows[1].orderInDay, 2);
  assert.equal(rows[0].dayIndex, 0);
  assert.equal(rows[2].dayIndex, 1);
});

test("plannerDayIndexForDate and addDaysToYmd", () => {
  assert.equal(plannerDayIndexForDate("2026-07-24", "2026-07-26"), 2);
  assert.equal(addDaysToYmd("2026-07-24", 2), "2026-07-26");
});

test("addDaysToYmd keeps local calendar day under NZDT (UTC+13)", () => {
  // July tests can pass under Pacific/Auckland (NZST UTC+12); Dec uses NZDT UTC+13
  // where toISOString().slice(0,10) wrongly shifts local noon to the previous UTC date.
  const prev = process.env.TZ;
  process.env.TZ = "Pacific/Auckland";
  try {
    assert.equal(addDaysToYmd("2026-12-15", 0), "2026-12-15");
    assert.equal(addDaysToYmd("2026-12-15", 2), "2026-12-17");
    assert.equal(addDaysToYmd("2026-01-01", 0), "2026-01-01");
    assert.equal(plannerDayIndexForDate("2026-12-15", "2026-12-17"), 2);
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
});
