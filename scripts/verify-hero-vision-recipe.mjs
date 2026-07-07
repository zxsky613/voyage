/**
 * Recette juge vision héros — 3 cas référence + démo bans auto (mock si pas de clé).
 *
 * Usage:
 *   node scripts/verify-hero-vision-recipe.mjs
 *   HERO_VISION_MOCK=1 node scripts/verify-hero-vision-recipe.mjs
 *   HERO_VISION_RECIPE=1 node scripts/verify-hero-vision-recipe.mjs  # skip cache vision
 */
import { loadEnvLocal } from "../lib/scripts/loadEnvLocal.mjs";
import {
  buildHeroColdSignals,
  coldSignalsConcordantWithReject,
  effectiveHeroVisionVerdict,
  resolveHeroVisionPolicy,
  HERO_VISION_REFERENCE_CASES,
} from "../lib/images/heroVisionJudge.js";
import { judgeHeroImage, isHeroVisionEnabled, getHeroVisionModel } from "../api/images/_heroVisionGate.js";
import { getGeminiKey } from "../api/_helpers.js";

loadEnvLocal();

const skipCache = process.env.HERO_VISION_RECIPE === "1";
const useMock = process.env.HERO_VISION_MOCK === "1" || !getGeminiKey();
if (useMock && !process.env.HERO_VISION_MOCK) {
  process.env.HERO_VISION_MOCK = "1";
}

console.log("=== Recette juge vision héros ===\n");
console.log(`Modèle vision: ${getHeroVisionModel()}`);
console.log(`Vision: ${isHeroVisionEnabled() ? (useMock ? "MOCK" : "LIVE") : "OFF"}\n`);

let fails = 0;

for (const ref of HERO_VISION_REFERENCE_CASES) {
  const judgment = await judgeHeroImage({
    url: ref.url,
    destinationLabel: ref.destination,
    fileTitle: ref.fileTitle,
    heroSource: ref.heroSource,
    skipCache,
  });
  const effective = effectiveHeroVisionVerdict(judgment.vision, judgment.cold);
  const ok = effective === ref.expectedVerdict;
  const policy = judgment.policy;
  console.log(`${ok ? "OK" : "FAIL"} ${ref.id}`);
  console.log(`  verdict IA: ${judgment.vision.verdict} → effectif: ${effective} (attendu ${ref.expectedVerdict})`);
  console.log(`  shows: ${judgment.vision.shows}`);
  console.log(`  policy: ${policy}`);
  console.log(`  cold concordant: ${coldSignalsConcordantWithReject(judgment.cold)}`);
  console.log(`  reasons: ${judgment.vision.reasons.join("; ") || "—"}\n`);
  if (!ok) fails += 1;
}

console.log("--- Politique bans auto (mock) ---\n");
const autoBanDemos = HERO_VISION_REFERENCE_CASES.filter((r) => r.expectedVerdict === "reject").slice(0, 3);
for (const ref of autoBanDemos) {
  const cold = { hardBlock: true, blocked: true, subjectless: ref.id.includes("annecy"), suspicionScore: 120 };
  const policy = resolveHeroVisionPolicy({ verdict: "reject" }, cold);
  const isAuto = policy === "auto_reject";
  console.log(`${isAuto ? "AUTO_BAN" : "REVIEW"} ${ref.id} → policy=${policy}`);
  if (!isAuto) fails += 1;
}

console.log(`\nRéférences: ${HERO_VISION_REFERENCE_CASES.length - fails}/${HERO_VISION_REFERENCE_CASES.length}`);
if (fails) {
  console.error(`\nFAIL — ${fails} échec(s)`);
  process.exit(1);
}
console.log("\nOK — recette vision passée");
