import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeCatalogWithCoordsTopUp,
  stripMismatchCoordsFromPlaces,
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
