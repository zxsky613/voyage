import test from "node:test";
import assert from "node:assert/strict";
import {
  finalizeDayZoneLabels,
  formatDayCalendarEventTitle,
  inferZoneLabelFromPlaces,
  relaxedZoneLabel,
  sanitizeZoneLabel,
} from "./dayZoneLabel.js";

test("sanitizeZoneLabel caps at 4 words", () => {
  assert.equal(sanitizeZoneLabel("  Vieille ville de Chania historique  "), "Vieille ville de Chania");
});

test("relaxedZoneLabel is broad not a fake quarter", () => {
  assert.equal(relaxedZoneLabel("Palerme, Italie", "fr"), "Palerme et environs");
  assert.equal(relaxedZoneLabel("Palermo, Italy", "en"), "Palermo and surrounding area");
});

test("inferZoneLabelFromPlaces prefers neighborhood category", () => {
  const zone = inferZoneLabelFromPlaces(
    [
      { name: "Musée X", category: "museum" },
      { name: "Quartier de la Kalsa", category: "neighborhood" },
    ],
    "Palerme, Italie"
  );
  assert.equal(zone, "Quartier de la Kalsa");
});

test("inferZoneLabelFromPlaces relaxed uses city environs", () => {
  assert.equal(
    inferZoneLabelFromPlaces([{ name: "Lieu A" }, { name: "Lieu B" }], "Palerme", { contractRelaxed: true, lang: "fr" }),
    "Palerme et environs"
  );
});

test("finalizeDayZoneLabels applies relaxed override", () => {
  const out = finalizeDayZoneLabels(
    [{ day: 2, title: "T", zone_label: "Faux quartier précis" }],
    [[{ name: "A" }, { name: "B" }]],
    "Palerme",
    [2],
    "fr"
  );
  assert.equal(out[0].zone_label, "Palerme et environs");
});

test("formatDayCalendarEventTitle with zone", () => {
  const title = formatDayCalendarEventTitle(3, "Kalsa", "Visite du marché", (k, v) =>
    k === "destination.itineraryDay" ? `Jour ${v.n}` : k
  );
  assert.equal(title, "Jour 3 · Kalsa — Visite du marché");
});
