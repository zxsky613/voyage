import test from "node:test";
import assert from "node:assert/strict";
import { buildHeroResolveLabel } from "./heroResolveLabel.js";
import { normalizeLabel } from "./normalizeLabel.js";

test("buildHeroResolveLabel keeps comma label unchanged", () => {
  assert.equal(
    buildHeroResolveLabel("Ténérife, Canaries, Espagne"),
    "Ténérife, Canaries, Espagne"
  );
});

test("buildHeroResolveLabel composes stable stem + inferred geo for Crete guide", () => {
  assert.equal(
    buildHeroResolveLabel("Crete", { city: "Région Crète", adminRegion: "", country: "Grèce" }),
    "Crete, Greece"
  );
});

test("buildHeroResolveLabel maps localized UI city to cache key crete|greece", () => {
  const label = buildHeroResolveLabel("Crete", {
    city: "Région Crète",
    country: "Grèce",
  });
  assert.equal(label, "Crete, Greece");
  assert.equal(normalizeLabel(label), "crete|greece");
});

test("buildHeroResolveLabel falls back to destination alone when no geo", () => {
  assert.equal(buildHeroResolveLabel("Paris", { city: "Paris", country: "France" }), "Paris, France");
});
