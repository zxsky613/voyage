import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./TripMap.jsx", import.meta.url), "utf8");

test("TripMap clears a transient load error once layer setup succeeds", () => {
  const start = source.indexOf("const finishMapInit = (useBalloons) => {");
  const end = source.indexOf("const beginLayerSetup = () => {", start);
  assert.ok(start >= 0 && end > start, "finishMapInit block should be present");
  const block = source.slice(start, end);
  assert.match(block, /setLoadError\(false\);[\s\S]*setMapReady\(true\);/);
});

test("TripMap does not show load errors after the map is already usable", () => {
  const start = source.indexOf("const onError = (e) => {");
  const end = source.indexOf("map.on(\"error\", onError);", start);
  assert.ok(start >= 0 && end > start, "onError block should be present");
  const block = source.slice(start, end);
  assert.match(block, /if \(cancelled \|\| layersReady\) return;/);
});
