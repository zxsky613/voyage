import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { heroCacheEntryPassesEntityGuards } from "../../api/images/_resolveImage.js";
import { forbiddenToponymsForAnchor } from "./imageEntityGuard.js";

const palermoItalyEntity = {
  qid: "Q2656",
  geoAnchor: {
    qid: "Q2656",
    coordinates: { lat: 38.1157, lon: 13.3615 },
    forbiddenToponyms: forbiddenToponymsForAnchor("italy", ["palermo", "sicily", "italy"]),
  },
};

describe("heroCacheEntryPassesEntityGuards", () => {
  it("rejects cached hero URLs that contain forbidden homonym toponyms", () => {
    const cached = {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Palermo_Buenos_Aires.jpg/1280px-Palermo_Buenos_Aires.jpg",
      source: "commons-category",
      entityId: "Q2656",
      attribution: {},
    };

    assert.equal(heroCacheEntryPassesEntityGuards(cached, palermoItalyEntity, "hero"), false);
  });

  it("rejects cached heroes from a different resolved entity", () => {
    const cached = {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Palermo_Cathedral.jpg/1280px-Palermo_Cathedral.jpg",
      source: "commons-category",
      entityId: "Q1010212",
      attribution: {},
    };

    assert.equal(heroCacheEntryPassesEntityGuards(cached, palermoItalyEntity, "hero"), false);
  });

  it("allows cached heroes that match the resolved destination entity", () => {
    const cached = {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Palermo_Cathedral.jpg/1280px-Palermo_Cathedral.jpg",
      source: "commons-category",
      entityId: "Q2656",
      attribution: {},
    };

    assert.equal(heroCacheEntryPassesEntityGuards(cached, palermoItalyEntity, "hero"), true);
  });
});
