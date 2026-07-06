import test from "node:test";
import assert from "node:assert/strict";
import {
  computePerDayTargets,
  partialDayTargetFromTime,
  parseTimeToMinutes,
  earliestFirstActivityMinutes,
  latestActivityEndMinutes,
} from "./paceContract.js";

test("computePerDayTargets — sans heures = uniforme", () => {
  assert.deepEqual(computePerDayTargets(7, 4, "", ""), [4, 4, 4, 4, 4, 4, 4]);
  assert.deepEqual(computePerDayTargets(7, 4, null, null), [4, 4, 4, 4, 4, 4, 4]);
});

test("computePerDayTargets — arrivée 16h / départ 11h sur 8 j (4/j)", () => {
  const t = computePerDayTargets(8, 4, "16:00", "11:00");
  assert.deepEqual(t, [1, 4, 4, 4, 4, 4, 4, 1]);
});

test("partialDayTargetFromTime — arrivée", () => {
  assert.equal(partialDayTargetFromTime(parseTimeToMinutes("10:00"), "arrival", 4), 4);
  assert.equal(partialDayTargetFromTime(parseTimeToMinutes("14:00"), "arrival", 4), 2);
  assert.equal(partialDayTargetFromTime(parseTimeToMinutes("16:00"), "arrival", 4), 1);
  assert.equal(partialDayTargetFromTime(parseTimeToMinutes("18:00"), "arrival", 4), 1);
});

test("partialDayTargetFromTime — départ", () => {
  assert.equal(partialDayTargetFromTime(parseTimeToMinutes("10:00"), "departure", 4), 1);
  assert.equal(partialDayTargetFromTime(parseTimeToMinutes("14:00"), "departure", 4), 2);
  assert.equal(partialDayTargetFromTime(parseTimeToMinutes("19:00"), "departure", 4), 4);
});

test("buffers arrivée / départ", () => {
  assert.equal(earliestFirstActivityMinutes("16:00"), 16 * 60 + 90);
  assert.equal(latestActivityEndMinutes("11:00"), 11 * 60 - 120);
});
