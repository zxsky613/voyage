import test from "node:test";
import assert from "node:assert/strict";
import {
  HERO_REFERENCE_CASES,
  extractCommonsFileTitleFromUrl,
  isSubjectlessHeroFilename,
  scoreHeroSuspicion,
  shouldBlockHeroImage,
  shouldBlockOrbitalOrMapHeroImage,
} from "./heroQualityRules.js";
import { scoreScenicCommonsFile } from "./wikiImageFilters.js";

test("extractCommonsFileTitleFromUrl from thumb URL", () => {
  const url =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg/1280px-20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg";
  assert.equal(
    extractCommonsFileTitleFromUrl(url),
    "20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg"
  );
});

test("WC Besser restroom sign is hard-blocked", () => {
  const url =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Besser_is_das_restroom_sign.jpg/1280px-Besser_is_das_restroom_sign.jpg";
  assert.equal(shouldBlockHeroImage(url, "Besser_is_das_restroom_sign.jpg"), true);
  const { blocked, score } = scoreHeroSuspicion({ url, fileTitle: "Besser_is_das_restroom_sign.jpg" });
  assert.equal(blocked, true);
  assert.ok(score >= 999);
});

test("Crete Island_of satellite overview is blocked (orbital)", () => {
  const url =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Island_of_Crete%2C_Greece.JPG/1280px-Island_of_Crete%2C_Greece.JPG";
  assert.equal(shouldBlockOrbitalOrMapHeroImage(url, "Island_of_Crete,_Greece.JPG"), true);
  assert.equal(shouldBlockHeroImage(url, "Island_of_Crete,_Greece.JPG"), true);
});

test("Elounda panoramic featured hero stays low suspicion", () => {
  const url =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg/1280px-20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg";
  assert.equal(shouldBlockHeroImage(url), false);
  const { score, blocked } = scoreHeroSuspicion({
    url,
    heroSource: "commons-featured",
    width: 1280,
    height: 720,
  });
  assert.equal(blocked, false);
  assert.ok(score <= 25, `expected low suspicion, got ${score}`);
});

test("Panoramio raw photo gets penalty but not hard block", () => {
  const url =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/1512_2010_-_panoramio.jpg/1280px-1512_2010_-_panoramio.jpg";
  assert.equal(shouldBlockHeroImage(url, "1512_2010_-_panoramio.jpg"), false);
  const { score, blocked } = scoreHeroSuspicion({
    url,
    fileTitle: "1512_2010_-_panoramio.jpg",
    heroSource: "commons",
    width: 1280,
    height: 960,
  });
  assert.equal(blocked, false);
  assert.ok(score >= 40);
  assert.ok(score <= 120);
});

test("HERO_REFERENCE_CASES anti-regression matrix", () => {
  for (const ref of HERO_REFERENCE_CASES) {
    const input = {
      url: ref.url,
      fileTitle: ref.fileTitle || extractCommonsFileTitleFromUrl(ref.url),
      heroSource: ref.heroSource,
      width: 1280,
      height: 720,
    };
    const result = scoreHeroSuspicion(input);
    if (ref.mustBlock) {
      assert.equal(result.blocked, true, `${ref.id} must block`);
      assert.ok(result.score >= 999, `${ref.id} score`);
    }
    if (ref.maxSuspicion != null) {
      assert.ok(result.score <= ref.maxSuspicion, `${ref.id} score ${result.score} > ${ref.maxSuspicion}`);
    }
    if (ref.minSuspicion != null) {
      assert.ok(result.score >= ref.minSuspicion, `${ref.id} score ${result.score} < ${ref.minSuspicion}`);
    }
  }
});

test("2019_Annecy is subjectless; Lac d'Annecy scenic score wins", () => {
  assert.equal(isSubjectlessHeroFilename("2019_Annecy.jpg"), true);
  const bad = scoreScenicCommonsFile("2019_Annecy.jpg", "https://x/2019_Annecy.jpg", 1280, 720, {
    hero: true,
    heroSource: "commons",
  });
  const good = scoreScenicCommonsFile(
    "Lac_d'Annecy_et_le_massif_des_Arpilles.jpg",
    "https://x/Lac_d_Annecy.jpg",
    1280,
    720,
    {
      hero: true,
      heroSource: "commons-featured",
      emotionalCategory: "Featured pictures of Lake Annecy",
    }
  );
  assert.ok(bad < 0, `subjectless score should be negative, got ${bad}`);
  assert.ok(good > bad + 120, `lake photo ${good} must beat ${bad}`);
});
