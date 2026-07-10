import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(root, "App.jsx"), "utf8");

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return source.slice(start, end);
}

test("createTrip treats activity persistence failure as trip creation failure", () => {
  const createTripBlock = sliceBetween(
    appSource,
    "const createTrip = async (payload) => {",
    "const formatSupabaseClientError ="
  );

  const failureBranchIndex = createTripBlock.indexOf("if (!activitiesInsertOk)");
  const inviteIndex = createTripBlock.indexOf("let inviteErrorMsg");
  const optimisticTripIndex = createTripBlock.indexOf("const optimisticTrip");

  assert.notEqual(failureBranchIndex, -1, "missing activitiesInsertOk failure branch");
  assert.notEqual(inviteIndex, -1, "missing invite handling");
  assert.notEqual(optimisticTripIndex, -1, "missing optimistic trip state update");
  assert.ok(
    failureBranchIndex < inviteIndex,
    "activity insert failures must stop before sending trip invites"
  );
  assert.ok(
    failureBranchIndex < optimisticTripIndex,
    "activity insert failures must stop before optimistic trip selection"
  );

  const failureBranch = createTripBlock.slice(failureBranchIndex, inviteIndex);
  assert.match(
    failureBranch,
    /supabase\.from\("trips"\)\.delete\(\)\.eq\("id", newTripId\)/,
    "failed activity insert should roll back the just-created trip row"
  );
  assert.match(
    failureBranch,
    /return false;/,
    "failed activity insert should make onCreateTrip report failure"
  );
});
