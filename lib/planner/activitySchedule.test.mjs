import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileDayActivityTimes,
  formatApproxTimeLabel,
  minutesToHHMM,
} from "./activitySchedule.js";

test("reconcileDayActivityTimes — croissant + battement 30 min", () => {
  const out = reconcileDayActivityTimes([
    { suggestedTime: "14:00", durationMinutes: 60, period: "afternoon" },
    { suggestedTime: "14:30", durationMinutes: 90, period: "afternoon" },
  ]);
  assert.equal(out[0].time, "14:00");
  assert.equal(out[1].time, "15:30");
});

test("reconcileDayActivityTimes — contrainte earliest jour 1", () => {
  const out = reconcileDayActivityTimes(
    [{ suggestedTime: "09:00", durationMinutes: 60 }],
    { earliestMinutes: 17 * 60 + 30 }
  );
  assert.equal(out[0].time, "17:30");
});

test("formatApproxTimeLabel", () => {
  assert.equal(formatApproxTimeLabel("09:30"), "9h30");
  assert.equal(formatApproxTimeLabel("09:00"), "9h");
});

test("minutesToHHMM", () => {
  assert.equal(minutesToHHMM(9 * 60 + 30), "09:30");
});
