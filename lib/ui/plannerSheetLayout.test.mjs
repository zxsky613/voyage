import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePlannerMapHeightPx,
  measurePlannerSheetSnaps,
} from "./plannerSheetLayout.js";

describe("plannerSheetLayout", () => {
  it("measurePlannerSheetSnaps returns 3 crans ordered", () => {
    const s = measurePlannerSheetSnaps(800);
    assert.ok(s.collapsed < s.mid && s.mid < s.full);
  });

  it("computePlannerMapHeightPx shrinks at full but never zero", () => {
    const snaps = measurePlannerSheetSnaps(844);
    const collapsed = computePlannerMapHeightPx("collapsed", snaps, 700);
    const mid = computePlannerMapHeightPx("mid", snaps, 700);
    const full = computePlannerMapHeightPx("full", snaps, 700);
    assert.ok(collapsed > mid);
    assert.ok(mid > full);
    assert.ok(full >= 120);
  });
});
