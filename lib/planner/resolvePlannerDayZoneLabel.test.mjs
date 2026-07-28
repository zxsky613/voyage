import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlannerDayZoneLabel } from "./resolvePlannerDayZoneLabel.js";

test("resolvePlannerDayZoneLabel picks most common location prefix", () => {
  assert.equal(
    resolvePlannerDayZoneLabel({
      cityLabel: "Cassis",
      activities: [
        { location: "Port, Cassis" },
        { location: "Calanques, Cassis" },
        { location: "Port, Cassis" },
      ],
    }),
    "Port"
  );
});

test("resolvePlannerDayZoneLabel falls back to city", () => {
  assert.equal(
    resolvePlannerDayZoneLabel({
      cityLabel: "Marseille",
      activities: [{ title: "Vieux-Port" }],
    }),
    "Marseille"
  );
});
