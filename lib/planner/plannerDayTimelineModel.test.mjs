import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlannerDayTimelineItems,
  buildPlannerDayTimelineRows,
  buildTravelLegsForTimelineItems,
  resolveTimelineOrderInDay,
} from "./plannerDayTimelineModel.js";
import { WALK_THRESHOLD_KM } from "./itineraryTravelEstimate.js";

test("resolveTimelineOrderInDay prefers map order", () => {
  assert.equal(resolveTimelineOrderInDay({}, { orderInDay: 3 }, 1), 3);
  assert.equal(resolveTimelineOrderInDay({}, null, 2), 2);
});

test("buildPlannerDayTimelineItems preserves time sort order", () => {
  const dayActivities = [
    { id: "b", title: "Musée", time: "14:00", latitude: 43.21, longitude: 5.54 },
    { id: "a", title: "Plage", time: "09:00", latitude: 43.2, longitude: 5.53 },
  ].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const mapActs = [
    { id: "a", orderInDay: 1, latitude: 43.2, longitude: 5.53 },
    { id: "b", orderInDay: 2, latitude: 43.21, longitude: 5.54 },
  ];
  const items = buildPlannerDayTimelineItems(dayActivities, mapActs);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Plage");
  assert.equal(items[0].orderInDay, 1);
  assert.equal(items[1].orderInDay, 2);
});

test("buildTravelLegsForTimelineItems — walk under threshold", () => {
  const items = [
    { coords: { latitude: 43.2148, longitude: 5.5382 } },
    { coords: { latitude: 43.218, longitude: 5.542 } },
  ];
  const legs = buildTravelLegsForTimelineItems(items);
  assert.equal(legs.length, 1);
  assert.ok(legs[0]);
  assert.equal(legs[0].mode, "walk");
  assert.ok(legs[0].km <= WALK_THRESHOLD_KM);
});

test("buildPlannerDayTimelineRows alternates leg and activity", () => {
  const items = buildPlannerDayTimelineItems(
    [
      { id: "1", title: "A", time: "09:00", latitude: 43.21, longitude: 5.53 },
      { id: "2", title: "B", time: "14:00", latitude: 43.22, longitude: 5.55 },
    ],
    []
  );
  const rows = buildPlannerDayTimelineRows(items);
  assert.equal(rows[0].type, "activity");
  assert.equal(rows[1].type, "leg");
  assert.equal(rows[2].type, "activity");
});
