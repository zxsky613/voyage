import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDestinationHeroSubtitle,
  resolveDestinationHeroFallbackBackground,
} from "./placeholder.js";

test("resolveDestinationHeroFallbackBackground is deterministic", () => {
  const a = resolveDestinationHeroFallbackBackground("Les Îles Canaries|Espagne");
  const b = resolveDestinationHeroFallbackBackground("Les Îles Canaries|Espagne");
  assert.equal(a, b);
  assert.match(a, /repeating-linear-gradient/);
  assert.match(a, /linear-gradient\(135deg/);
});

test("formatDestinationHeroSubtitle uses middle dot", () => {
  assert.equal(formatDestinationHeroSubtitle("Canaries", "Espagne"), "Canaries · Espagne");
  assert.equal(formatDestinationHeroSubtitle("", "Espagne"), "Espagne");
});
