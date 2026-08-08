import assert from "node:assert/strict";
import test from "node:test";
import {
  cacheRawNameMatchesPlace,
  reasonableNameMatch,
} from "./placeNameMatch.js";

test("reasonableNameMatch — Louvre variants", () => {
  assert.equal(reasonableNameMatch("Musée du Louvre", "Louvre Museum"), true);
  assert.equal(reasonableNameMatch("Musée du Louvre", "Jardins des Champs-Élysées"), false);
  assert.equal(reasonableNameMatch("Tour Eiffel", "Eiffel Tower"), true);
});

test("cacheRawNameMatchesPlace — rejects poisoned enrichment raw_name", () => {
  assert.equal(cacheRawNameMatchesPlace("Musée du Louvre", "Jardins des Champs-Élysées"), false);
  assert.equal(cacheRawNameMatchesPlace("Musée du Louvre", "Louvre Museum"), true);
  assert.equal(cacheRawNameMatchesPlace("Musée du Louvre", ""), true);
});
