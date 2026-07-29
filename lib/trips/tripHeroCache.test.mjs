import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

/** @type {Record<string, string>} */
const store = {};

before(() => {
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    },
  };
});

describe("tripHeroCache v2", () => {
  it("uses tp_trip_hero_v2_ prefix", async () => {
    const { tripHeroCacheKey, writeTripHeroCache, readTripHeroCache, clearTripHeroCache } = await import(
      "./tripHeroCache.js"
    );
    assert.equal(tripHeroCacheKey("abc-123"), "tp_trip_hero_v2_abc-123");
    writeTripHeroCache("abc-123", "https://example.com/hero.jpg");
    assert.equal(readTripHeroCache("abc-123"), "https://example.com/hero.jpg");
    clearTripHeroCache("abc-123");
    assert.equal(readTripHeroCache("abc-123"), "");
  });
});
