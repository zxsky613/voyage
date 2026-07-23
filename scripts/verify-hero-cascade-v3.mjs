/**
 * Recette hero cascade v3 — pageimage → P18 → Commons curatées → WV → geosearch.
 * Usage: node scripts/verify-hero-cascade-v3.mjs
 */
import { resolveImage } from "../api/images/_resolveImage.js";
import { HERO_CACHE_KEY_REVISION } from "../lib/images/heroCacheKey.js";

/** @type {{ label: string, context?: string, uiLang?: string, expectSource?: string }[]} */
const CASES = [
  { label: "Faro", context: "Portugal", uiLang: "fr", expectSource: "pageimage" },
  { label: "Split", context: "Croatia", uiLang: "en", expectSource: "pageimage" },
  { label: "Palermo", context: "Italy", uiLang: "it", expectSource: "pageimage" },
  { label: "Annecy", context: "France", uiLang: "fr" },
  { label: "Zanzibar City", context: "Tanzania", uiLang: "en" },
];

console.log(`=== Hero cascade ${HERO_CACHE_KEY_REVISION} ===\n`);

/** @type {{ label: string, heroSource: string, url: string, entityId?: string }[]} */
const heroes = [];

for (const c of CASES) {
  const outcome = await resolveImage({
    kind: "hero",
    label: c.label,
    context: c.context || "",
    uiLang: c.uiLang || "fr",
  });
  const url = String(outcome.image?.url || "");
  const heroSource = String(outcome.heroSource || outcome.image?.heroSource || "fallback");
  const entityId = outcome.image?.entityId || "";

  console.log(`${c.label} | ${heroSource} | cache=${outcome.cache}`);
  console.log(`  ${url || "(fallback)"}\n`);

  if (c.expectSource && heroSource !== c.expectSource) {
    console.error(`  ATTENDU heroSource=${c.expectSource}, obtenu ${heroSource}`);
  }

  heroes.push({ label: c.label, heroSource, url, entityId });
}

console.log("--- 5 héros AVANT merge ---");
for (const h of heroes) {
  console.log(`${h.label}: [${h.heroSource}]`);
  console.log(h.url || "(vide)");
  console.log("");
}

const badGeosearchFirst = heroes.filter(
  (h) =>
    ["Faro", "Split", "Palermo"].includes(h.label.split(",")[0]) && h.heroSource === "geosearch"
);
if (badGeosearchFirst.length) {
  console.error("verify-hero-cascade-v3: geosearch gagne encore sur cas recette");
  process.exit(1);
}

console.log("verify-hero-cascade-v3: OK");
