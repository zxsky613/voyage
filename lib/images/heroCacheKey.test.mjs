import test from "node:test";
import assert from "node:assert/strict";
import {
  HERO_CACHE_KEY_REVISION,
  heroCacheLabelKey,
  isSupersededHeroCacheEntry,
} from "./heroCacheKey.js";

test("heroCacheLabelKey inclut la révision cascade", () => {
  const key = heroCacheLabelKey("Faro", "Portugal");
  assert.match(key, /\|hero-cascade-v3$/);
  assert.equal(HERO_CACHE_KEY_REVISION, "hero-cascade-v3");
});

test("isSupersededHeroCacheEntry ignore commons-category legacy", () => {
  assert.equal(isSupersededHeroCacheEntry({ url: "https://x", source: "commons-category" }), true);
  assert.equal(isSupersededHeroCacheEntry({ url: "https://x", source: "wikipedia" }), false);
  assert.equal(isSupersededHeroCacheEntry(null), false);
});
