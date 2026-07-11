import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./TripMap.jsx", import.meta.url), "utf8");

test("TripMap clears stale load errors after a late successful initialization", () => {
  const finishInitMatch = source.match(
    /const finishMapInit = \(useBalloons\) => \{(?<body>[\s\S]*?)\n    \};/
  );
  assert.ok(finishInitMatch?.groups?.body, "finishMapInit should be present");
  assert.match(
    finishInitMatch.groups.body,
    /window\.clearTimeout\(initWatchdog\);\s+setLoadError\(false\);/,
    "successful layer setup must remove any watchdog error overlay"
  );
});

test("TripMap does not show a blocking load error after layers are ready", () => {
  const onErrorMatch = source.match(/const onError = \(e\) => \{(?<body>[\s\S]*?)\n      \};/);
  assert.ok(onErrorMatch?.groups?.body, "onError handler should be present");
  assert.match(
    onErrorMatch.groups.body,
    /if \(!layersReady && \/style\|sprite\|glyph\|tile\/i\.test\(msg\)\) setLoadError\(true\);/,
    "post-initialization tile/glyph errors should not cover an already working map"
  );
});
