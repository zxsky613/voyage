import test from "node:test";
import assert from "node:assert/strict";
import { buildHeroResolveLabel } from "./heroResolveLabel.js";

test("buildHeroResolveLabel keeps comma label unchanged", () => {
  assert.equal(
    buildHeroResolveLabel("Ténérife, Canaries, Espagne"),
    "Ténérife, Canaries, Espagne"
  );
});

test("buildHeroResolveLabel composes city + region + country from guide", () => {
  assert.equal(
    buildHeroResolveLabel("Ténérife", { city: "Ténérife", adminRegion: "Canaries", country: "Espagne" }),
    "Ténérife, Canaries, Espagne"
  );
});

test("buildHeroResolveLabel falls back to destination alone", () => {
  assert.equal(buildHeroResolveLabel("Crete", null), "Crete");
});
