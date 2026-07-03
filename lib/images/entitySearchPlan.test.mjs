import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEntitySearchAttempts,
  buildEntitySearchPlan,
  splitCityLabelForEntitySearch,
} from "./entitySearchPlan.js";
import { normalizeLabel } from "./normalizeLabel.js";

test("splitCityLabelForEntitySearch splits Ville, Région, Pays", () => {
  assert.deepEqual(splitCityLabelForEntitySearch("Ténérife, Canaries, Espagne"), {
    cityLabel: "Ténérife",
    geoContext: "Canaries, Espagne",
  });
});

test("Ténérife — wbsearch city only, ordered fr/en then unaccented", () => {
  const plan = buildEntitySearchPlan("Ténérife, Canaries, Espagne");
  assert.equal(plan.cityLabel, "Ténérife");
  assert.equal(plan.geoContext, "Canaries, Espagne");
  assert.deepEqual(plan.attempts, [
    { query: "Ténérife", language: "fr" },
    { query: "Ténérife", language: "en" },
    { query: "Tenerife", language: "en" },
    { query: "Tenerife", language: "fr" },
  ]);
  for (const attempt of plan.attempts) {
    assert.ok(!attempt.query.includes(","), "context must not appear in wbsearch query");
    assert.ok(!/canaries|espagne/i.test(attempt.query));
  }
});

test("Fréjus PACA — city segment + context separate", () => {
  const plan = buildEntitySearchPlan("Fréjus, Région PACA, France");
  assert.equal(plan.cityLabel, "Fréjus");
  assert.equal(plan.geoContext, "Région PACA, France");
  assert.deepEqual(plan.attempts.slice(0, 2), [
    { query: "Fréjus", language: "fr" },
    { query: "Fréjus", language: "en" },
  ]);
  assert.deepEqual(plan.attempts.slice(2), [
    { query: "Frejus", language: "en" },
    { query: "Frejus", language: "fr" },
  ]);
});

test("Tenerife bare — no unaccented duplicate when already ASCII", () => {
  assert.deepEqual(buildEntitySearchAttempts("Tenerife"), [
    { query: "Tenerife", language: "fr" },
    { query: "Tenerife", language: "en" },
  ]);
});

test("München — umlaut stripped in later attempts", () => {
  const plan = buildEntitySearchPlan("München, Bayern, Deutschland");
  assert.equal(plan.cityLabel, "München");
  assert.equal(plan.geoContext, "Bayern, Deutschland");
  assert.ok(plan.attempts.some((a) => a.query === "Munchen" && a.language === "en"));
  assert.ok(plan.attempts.every((a) => !a.query.includes("Bayern")));
});

test("cache key: accented label matches seed row tenerife|canaries, espagne", () => {
  const accented = normalizeLabel("Ténérife, Canaries, Espagne");
  const asciiCity = normalizeLabel("Tenerife, Canaries, Espagne");
  assert.equal(accented, "tenerife|canaries, espagne");
  assert.equal(asciiCity, accented);
});

test("cache key: Fréjus PACA normalizes accents on city and context", () => {
  assert.equal(
    normalizeLabel("Fréjus, Région PACA, France"),
    "frejus|region paca, france"
  );
});
