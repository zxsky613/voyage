import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasMalformedUriEncoding,
  safeDecodeURIComponent,
} from "./commonsThumbUrl.js";
import {
  extractCommonsFileTitleFromUrl,
  shouldBlockHeroImage,
  scoreHeroSuspicion,
} from "./heroQualityRules.js";

const root = dirname(fileURLToPath(import.meta.url));
const POISONED = [
  "https://cdn.example.com/100%organic.jpg",
  "https://example.com/foo%",
  "https://example.com/foo%2",
  "https://example.com/foo%ZZ.jpg",
];

test("safeDecodeURIComponent never throws on malformed percent-encoding", () => {
  for (const url of POISONED) {
    assert.doesNotThrow(() => safeDecodeURIComponent(url));
    assert.equal(hasMalformedUriEncoding(url), true);
  }
  assert.equal(hasMalformedUriEncoding("https://example.com/ok%20name.jpg"), false);
  assert.equal(safeDecodeURIComponent("https://example.com/ok%20name.jpg"), "https://example.com/ok name.jpg");
});

test("heroQualityRules helpers never throw on malformed hero URLs", () => {
  for (const url of POISONED) {
    assert.doesNotThrow(() => extractCommonsFileTitleFromUrl(url));
    assert.doesNotThrow(() => shouldBlockHeroImage(url));
    assert.doesNotThrow(() => scoreHeroSuspicion({ url }));
  }
});

test("App.jsx destination hero helpers use safe decode (no bare decodeURIComponent)", () => {
  const appSource = readFileSync(join(root, "../../App.jsx"), "utf8");
  assert.match(appSource, /hasMalformedUriEncoding/);
  assert.match(appSource, /safeDecodeURIComponent/);
  assert.equal(
    (appSource.match(/decodeURIComponent\s*\(/g) || []).length,
    0,
    "App.jsx must not call bare decodeURIComponent (destinationHeroSrc / cache paths)"
  );
});
