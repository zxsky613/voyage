import test from "node:test";
import assert from "node:assert/strict";
import { pluralKey, pluralSuffix } from "./pluralKey.js";

test("pluralSuffix — singulier à 1 et -1", () => {
  assert.equal(pluralSuffix(1), "_one");
  assert.equal(pluralSuffix(-1), "_one");
  assert.equal(pluralSuffix(0), "_other");
  assert.equal(pluralSuffix(3), "_other");
});

test("pluralKey — concatène la base et le suffixe", () => {
  assert.equal(pluralKey("toasts.syncPlannerDone", 1), "toasts.syncPlannerDone_one");
  assert.equal(pluralKey("toasts.syncPlannerDone", 5), "toasts.syncPlannerDone_other");
});
