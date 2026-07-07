import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHeroColdSignals,
  buildHeroVisionJudgePrompt,
  coldSignalsConcordantWithReject,
  effectiveHeroVisionVerdict,
  mockHeroVisionVerdictFromFileTitle,
  parseHeroVisionVerdict,
  resolveHeroVisionPolicy,
  HERO_VISION_REFERENCE_CASES,
} from "./heroVisionJudge.js";

test("parseHeroVisionVerdict normalizes verdict and shows", () => {
  const v = parseHeroVisionVerdict({
    verdict: "EXCELLENT",
    shows: "beach",
    reasons: ["nice view"],
  });
  assert.equal(v.verdict, "excellent");
  assert.equal(v.shows, "beach");
  assert.deepEqual(v.reasons, ["nice view"]);
});

test("parseHeroVisionVerdict invalid verdict → acceptable", () => {
  const v = parseHeroVisionVerdict({ verdict: "maybe", shows: "unknown_thing" });
  assert.equal(v.verdict, "acceptable");
  assert.equal(v.shows, "other");
});

test("resolveHeroVisionPolicy — reject + cold concordant → auto_reject", () => {
  const cold = buildHeroColdSignals({
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Besser_is_das_restroom_sign.jpg/1280px-Besser_is_das_restroom_sign.jpg",
    fileTitle: "Besser_is_das_restroom_sign.jpg",
  });
  assert.equal(coldSignalsConcordantWithReject(cold), true);
  assert.equal(resolveHeroVisionPolicy({ verdict: "reject" }, cold), "auto_reject");
});

test("resolveHeroVisionPolicy — reject IA seul → review_reject", () => {
  const cold = buildHeroColdSignals({
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Some_city.jpg/1280px-Some_city.jpg",
    fileTitle: "Some_city.jpg",
    heroSource: "commons-featured",
  });
  assert.equal(resolveHeroVisionPolicy({ verdict: "reject" }, cold), "review_reject");
});

test("resolveHeroVisionPolicy — excellent → accept", () => {
  const cold = buildHeroColdSignals({
    fileTitle: "Lake_Annecy_sunset.jpg",
    heroSource: "commons-featured",
  });
  assert.equal(resolveHeroVisionPolicy({ verdict: "excellent" }, cold), "accept");
});

test("resolveHeroVisionPolicy — subjectless + acceptable → auto_reject", () => {
  const cold = buildHeroColdSignals({
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/2019_Annecy.jpg/1280px-2019_Annecy.jpg",
    fileTitle: "2019_Annecy.jpg",
  });
  assert.equal(cold.subjectless, true);
  assert.equal(resolveHeroVisionPolicy({ verdict: "acceptable" }, cold), "auto_reject");
});

test("effectiveHeroVisionVerdict — Annecy subjectless → reject", () => {
  const cold = buildHeroColdSignals({ fileTitle: "2019_Annecy.jpg" });
  assert.equal(effectiveHeroVisionVerdict({ verdict: "acceptable" }, cold), "reject");
});

test("buildHeroVisionJudgePrompt includes expected country when provided", () => {
  const p = buildHeroVisionJudgePrompt("Palermo, Italy", "Italie");
  assert.match(p, /Italie/);
  assert.match(p, /PAYS ATTENDU/i);
});

test("mock verdicts match reference case filenames", () => {
  for (const ref of HERO_VISION_REFERENCE_CASES) {
    const mock = mockHeroVisionVerdictFromFileTitle(ref.fileTitle || "");
    assert.equal(
      mock.verdict,
      ref.expectedVerdict,
      `${ref.id}: mock ${mock.verdict} !== expected ${ref.expectedVerdict}`
    );
  }
});
