import test from "node:test";
import assert from "node:assert/strict";
import { buildPlannerTripDayGroups } from "./buildPlannerTripDayGroups.js";

test("buildPlannerTripDayGroups groups and sorts by day", () => {
  const groups = buildPlannerTripDayGroups({
    tripId: "t1",
    tripStartYmd: "2026-07-24",
    tripEndYmd: "2026-07-26",
    cityLabel: "Cassis",
    activities: [
      { id: "b", trip_id: "t1", date: "2026-07-25", time: "10:00", title: "Plage", location: "Plage" },
      { id: "a", trip_id: "t1", date: "2026-07-24", time: "14:00", title: "Calanques", location: "Port" },
      { id: "c", trip_id: "t1", date: "2026-07-24", time: "09:00", title: "Port", location: "Port" },
      { id: "x", trip_id: "other", date: "2026-07-24", time: "08:00", title: "Skip" },
    ],
  });

  assert.equal(groups.length, 2);
  assert.equal(groups[0].dayNum, 1);
  assert.equal(groups[0].dateKey, "2026-07-24");
  assert.equal(groups[0].activities.length, 2);
  assert.equal(groups[0].activities[0].id, "c");
  assert.equal(groups[0].zoneLabel, "Port");
  assert.equal(groups[1].dayNum, 2);
  assert.equal(groups[1].zoneLabel, "Plage");
});
