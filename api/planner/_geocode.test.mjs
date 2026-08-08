import assert from "node:assert/strict";
import test from "node:test";
import { buildNominatimQueries, toGeocodableName } from "./_geocode.js";

test("buildNominatimQueries skips mismatched searchName (cache-poison guard)", () => {
  const queries = buildNominatimQueries(
    { name: "Musée du Louvre", searchName: "McDonalds Champs Elysees" },
    "Paris",
    "France"
  );
  assert.ok(queries.some((q) => /Louvre/i.test(q)));
  assert.ok(
    queries.every((q) => !/McDonalds/i.test(q)),
    `mismatched searchName must not be queried: ${JSON.stringify(queries)}`
  );
});

test("buildNominatimQueries keeps matching EN searchName before FR display name", () => {
  const queries = buildNominatimQueries(
    { name: "Musée du Louvre", searchName: "Louvre Museum" },
    "Paris",
    "France"
  );
  assert.ok(queries.length >= 2);
  assert.match(queries[0], /Louvre Museum/i);
  assert.ok(queries.some((q) => /Musée du Louvre|Musee du Louvre/i.test(toGeocodableName(q)) || /Louvre/i.test(q)));
});

test("toGeocodableName strips activity noise prefixes", () => {
  assert.equal(toGeocodableName("Visite du Louvre"), "Louvre");
});
