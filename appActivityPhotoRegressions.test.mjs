import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

function extractUpdateActivityBlock() {
  const start = source.indexOf("const updateActivity = async (activity) => {");
  const end = source.indexOf("const deleteActivity", start);
  assert.ok(start >= 0 && end > start, "updateActivity block should be present");
  return source.slice(start, end);
}

test("activity edits preserve the stored display photo", () => {
  const block = extractUpdateActivityBlock();
  assert.match(block, /const existingPhoto = getActivityImageUrl\(activity\);/);
  assert.doesNotMatch(block, /resolveActivityPlaceImage\(/);
});
