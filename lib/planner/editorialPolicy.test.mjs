import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEditorialExclusion,
  filterEditorialPlaces,
  resolveEditorialPolicy,
} from "./editorialPolicy.js";

test("restaurant excluded by default", () => {
  const v = evaluateEditorialExclusion({
    candidate: { category: "restaurant", name: "Le Bistrot" },
    place: { name: "Le Bistrot" },
    prefs: {},
  });
  assert.equal(v.excluded, true);
});

test("museum allowed by default", () => {
  const v = evaluateEditorialExclusion({
    candidate: { category: "museum", name: "Musée du Teide" },
    place: { name: "Musée du Teide" },
    prefs: {},
  });
  assert.equal(v.excluded, false);
});

test("gastronomy profile allows restaurant category", () => {
  const policy = resolveEditorialPolicy({ styles: ["gastronomy"] });
  assert.ok(!policy.excludedLlmCategories.includes("restaurant"));
});

test("filterEditorialPlaces counts exclusions", () => {
  const { places, excluded } = filterEditorialPlaces(
    [
      { id: "c1", name: "Plage de las Teresitas", category: "beach" },
      { id: "c2", name: "Restaurant El Cine", category: "restaurant" },
    ],
    [
      { id: "c1", category: "beach" },
      { id: "c2", category: "restaurant" },
    ],
    {}
  );
  assert.equal(places.length, 1);
  assert.equal(excluded.length, 1);
});
