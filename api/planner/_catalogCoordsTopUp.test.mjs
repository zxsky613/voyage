import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeCatalogWithCoordsTopUp,
  stripMismatchCoordsFromPlaces,
  topUpPlaceCatalogCoords,
} from "./_catalogCoordsTopUp.js";

test("mergeCatalogWithCoordsTopUp preserves order and merges coords by id", () => {
  const catalog = [
    { id: "c2", name: "B" },
    { id: "c1", name: "A" },
  ];
  const topped = [
    { id: "c1", name: "A", latitude: 43.21, longitude: 5.53, source: "nominatim" },
    { id: "c2", name: "B" },
  ];
  const out = mergeCatalogWithCoordsTopUp(catalog, topped);
  assert.equal(out[0].id, "c2");
  assert.equal(out[1].latitude, 43.21);
});

test("stripMismatchCoordsFromPlaces removes far coords when guard marks mismatch", () => {
  const places = [
    { id: "c0", name: "Cassis centre", latitude: 43.215, longitude: 5.539, source: "nominatim" },
    {
      id: "c1",
      name: "Far",
      latitude: 48.8566,
      longitude: 2.3522,
      source: "nominatim",
    },
  ];
  const guarded = stripMismatchCoordsFromPlaces(places);
  const far = guarded.find((p) => p.id === "c1");
  assert.equal(far?.latitude, undefined);
  assert.equal(far?.status, "partial");
});

test("topUpPlaceCatalogCoords no-op early return preserves catalog after itinerary sync", async () => {
  const placeCatalog = [
    { id: "c1", name: "Plage A", latitude: 43.2128, longitude: 5.5378 },
    { id: "c2", name: "Plage B", latitude: 43.213, longitude: 5.531 },
  ];
  const beforeLen = placeCatalog.length;

  const topUp = await topUpPlaceCatalogCoords(placeCatalog, {
    destination: "Cassis",
    country: "France",
    estimateMissingCoordsWithLlm: async (places) => ({ places, estimated: 0 }),
  });

  assert.equal(topUp.coordlessBefore, 0);
  assert.notEqual(topUp.places, placeCatalog, "early return must not alias input catalog");

  const toppedPlaces = topUp.places === placeCatalog ? [...topUp.places] : topUp.places;
  placeCatalog.length = 0;
  placeCatalog.push(...toppedPlaces);

  assert.equal(placeCatalog.length, beforeLen);
  assert.equal(placeCatalog[0].id, "c1");
  assert.equal(placeCatalog[1].id, "c2");
});
