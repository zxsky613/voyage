import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEntityGeoAnchor,
  checkImageCategoryToponymLock,
  checkImageGeoAnchor,
  forbiddenToponymsForAnchor,
  IMAGE_GEO_MISMATCH_MAX_KM,
  passesEntityImageGuards,
  resetImageGeoMismatchLog,
  getImageGeoMismatchLogCount,
} from "./imageEntityGuard.js";
import { buildEmotionalCommonsCategoriesFromEntity } from "../../api/images/_heroEmotionalCommons.js";

describe("imageEntityGuard", () => {
  it("forbiddenToponymsForAnchor blocks Buenos Aires when Italy expected", () => {
    const forbidden = forbiddenToponymsForAnchor("italy", ["palermo", "sicily", "italy"]);
    assert.ok(forbidden.some((t) => t.includes("buenos aires")));
  });

  it("checkImageCategoryToponymLock rejects Buenos Aires categories for Sicily anchor", () => {
    const geoAnchor = {
      allowedToponyms: ["palermo", "sicily", "italy"],
      forbiddenToponyms: forbiddenToponymsForAnchor("italy", ["palermo", "sicily"]),
    };
    const bad = checkImageCategoryToponymLock(
      "featured pictures palermo buenos aires argentina neighborhoods",
      geoAnchor
    );
    assert.equal(bad.ok, false);
    const good = checkImageCategoryToponymLock("featured pictures palermo sicily italy cathedral", geoAnchor);
    assert.equal(good.ok, true);
  });

  it("checkImageGeoAnchor rejects image > 100km from P625", () => {
    resetImageGeoMismatchLog();
    const entityCoords = { lat: 38.1157, lon: 13.3615 };
    const candidate = {
      url: "https://example.com/x.jpg",
      imageLat: -34.5875,
      imageLon: -58.425,
    };
    const result = checkImageGeoAnchor(candidate, entityCoords);
    assert.equal(result.ok, false);
    assert.ok((result.km || 0) > IMAGE_GEO_MISMATCH_MAX_KM);
    assert.equal(getImageGeoMismatchLogCount(), 1);
  });

  it("passesEntityImageGuards rejects Palermo BA categories for Italian geoAnchor", () => {
    const ok = passesEntityImageGuards(
      {
        url: "https://upload.wikimedia.org/x/Palermo_Buenos_Aires.jpg",
        categories: "palermo buenos aires argentina",
      },
      {
        qid: "Q2656",
        coordinates: { lat: 38.1157, lon: 13.3615 },
        forbiddenToponyms: forbiddenToponymsForAnchor("italy", ["sicily", "italy"]),
      },
      "hero"
    );
    assert.equal(ok, false);
  });

  it("buildEmotionalCommonsCategoriesFromEntity uses P373 not free text", () => {
    const cats = buildEmotionalCommonsCategoriesFromEntity({ commonsCategory: "Palermo" });
    assert.equal(cats.length, 4);
    assert.match(cats[0].name, /^Featured pictures of Palermo$/);
  });

  it("buildEmotionalCommonsCategoriesFromEntity empty without P373", () => {
    assert.deepEqual(buildEmotionalCommonsCategoriesFromEntity({ commonsCategory: "" }), []);
  });

  it("buildEntityGeoAnchor extracts country labels from geoLabelMap", () => {
    const ent = {
      id: "Q2656",
      labels: { en: { value: "Palermo" } },
      claims: {
        P17: [{ mainsnak: { datavalue: { value: { id: "Q38" } } } }],
        P625: [{ mainsnak: { datavalue: { value: { latitude: 38.11, longitude: 13.36 } } } }],
      },
    };
    const anchor = buildEntityGeoAnchor(ent, { Q38: ["Italy", "Italie"] });
    assert.equal(anchor.qid, "Q2656");
    assert.equal(anchor.countryLabels[0], "Italy");
    assert.ok(anchor.forbiddenToponyms.some((t) => t.includes("buenos aires")));
  });
});
