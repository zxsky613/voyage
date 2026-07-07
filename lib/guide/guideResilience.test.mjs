import test from "node:test";
import assert from "node:assert/strict";
import { mergeMustSeePlaceCandidates } from "./mergeMustSeePlaces.js";
import { buildTransportLinkTip, getDestinationTransportProfile } from "./destinationTransport.js";

test("mergeMustSeePlaceCandidates never needs wiki geosearch — OSM + iconic", () => {
  const merged = mergeMustSeePlaceCandidates({
    osmNames: ["Knossos"],
    fsqNames: [],
    highlightsNames: [],
    iconicNames: ["Gorges de Samaria", "La Canée"],
  });
  assert.ok(merged.includes("Knossos"));
  assert.ok(merged.includes("Gorges de Samaria"));
});

test("Crete transport profile is island — no metro wording", () => {
  assert.equal(getDestinationTransportProfile("crete"), "island");
  const tip = buildTransportLinkTip("island", "Crete", "Knossos", "Chania", "fr");
  assert.ok(!/\b(métro|metro)\b/i.test(tip));
  assert.ok(/voiture|bus|ferry/i.test(tip));
});

test("Paris transport profile mentions metro", () => {
  assert.equal(getDestinationTransportProfile("paris"), "metro");
  const tip = buildTransportLinkTip("metro", "Paris", "Louvre", "Montmartre", "fr");
  assert.ok(/\bmétro\b/i.test(tip));
});
