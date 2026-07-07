import test from "node:test";
import assert from "node:assert/strict";
import { mergeMustSeePlaceCandidates } from "./mergeMustSeePlaces.js";
import { buildTransportLinkTip, getDestinationTransportProfile } from "./destinationTransport.js";

test("mergeMustSeePlaceCandidates prioritizes wikidata sitelinks over FSQ/OSM noise", () => {
  const merged = mergeMustSeePlaceCandidates({
    iconicNames: [],
    highlightsNames: [],
    wikidataNames: ["palais de Dioclétien", "cathédrale Saint-Domnius de Split"],
    osmNames: ["Museo Civico", "Golden Gate"],
    fsqNames: ["Museo delle Marionette"],
  });
  assert.equal(merged[0], "palais de Dioclétien");
  assert.ok(merged.indexOf("palais de Dioclétien") < merged.indexOf("Museo delle Marionette"));
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
