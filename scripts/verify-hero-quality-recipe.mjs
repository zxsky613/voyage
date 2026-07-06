/**
 * Recette qualité héros — Crète + hors catalogue + régression catalogue (resolve API).
 * Usage: node scripts/verify-hero-quality-recipe.mjs
 */
import { resolveImage } from "../api/images/_resolveImage.js";
import { isLikelyNonScenicHeroImagery } from "../lib/images/wikiImageFilters.js";

/** @type {{ label: string, context?: string, uiLang?: string }[]} */
const CASES = [
  { label: "Crete, Greece", context: "", uiLang: "fr" },
  { label: "Annecy", context: "France", uiLang: "fr" },
  { label: "Split", context: "Croatia", uiLang: "en" },
  { label: "Ronda", context: "Spain", uiLang: "es" },
  { label: "Paris", context: "France", uiLang: "fr" },
  { label: "Barcelona", context: "Spain", uiLang: "es" },
];

console.log("=== Recette hero-quality (resolve API) ===\n");
console.log("| Destination | heroSource | status | URL (trunc) |");
console.log("|-------------|------------|--------|-------------|");

let failed = 0;

for (const c of CASES) {
  const outcome = await resolveImage({
    kind: "hero",
    label: c.label,
    context: c.context || "",
    uiLang: c.uiLang || "fr",
  });
  const url = String(outcome.image?.url || "");
  const heroSource = String(outcome.heroSource || outcome.image?.heroSource || "fallback");
  const bad =
    (url && isLikelyNonScenicHeroImagery(url, decodeURIComponent(url))) ||
    /besser|toilet|wc|restroom|lavatory/i.test(decodeURIComponent(url));
  const status = bad ? "FAIL" : url ? "OK" : "fallback";
  if (bad) failed += 1;
  console.log(`| ${c.label} | ${heroSource} | ${status} | ${url ? url.slice(0, 72) : "—"} |`);
}

console.log("");
if (failed) {
  console.error(`verify-hero-quality-recipe: ${failed} échec(s)`);
  process.exit(1);
}
console.log("verify-hero-quality-recipe: OK");
