/**
 * Recette wbsearch entité — articles en repli + Canaries + villes à article intégré.
 * Usage: node scripts/verify-entity-search-articles.mjs
 */
import { resolveEntity } from "../api/images/_entityResolver.js";
import { resolveImage } from "../api/images/_resolveImage.js";
import { buildEntitySearchPhases } from "../lib/images/entitySearchPlan.js";

/** @type {{ label: string, context?: string, uiLang?: string, expectQid?: string, mustResolve?: boolean }[]} */
const CASES = [
  { label: "Les Îles Canaries", context: "Espagne", uiLang: "fr", expectQid: "Q5813", mustResolve: true },
  { label: "Le Havre", context: "France", uiLang: "fr", expectQid: "Q42810", mustResolve: true },
  { label: "La Rochelle", context: "France", uiLang: "fr", expectQid: "Q82185", mustResolve: true },
  { label: "Los Angeles", context: "United States", uiLang: "en", expectQid: "Q65", mustResolve: true },
  { label: "The Hague", context: "Netherlands", uiLang: "en", expectQid: "Q36600", mustResolve: true },
  { label: "La Paz", context: "Bolivia", uiLang: "es", expectQid: "Q1491", mustResolve: true },
];

console.log("=== Recette entity search — articles repli + Canaries ===\n");

let failed = 0;

for (const c of CASES) {
  const phases = buildEntitySearchPhases(c.label, c.context || "");
  const entity = await resolveEntity(c.label, c.uiLang || "fr", "hero", c.context || "");
  const hero = await resolveImage({
    kind: "hero",
    label: c.label,
    context: c.context || "",
    uiLang: c.uiLang || "fr",
  });

  const qid = entity?.qid || "";
  const okEntity = c.mustResolve ? Boolean(qid) : true;
  const okQid = !c.expectQid || qid === c.expectQid;
  const ok = okEntity && okQid;

  if (!ok) failed += 1;

  console.log(`${ok ? "OK" : "FAIL"} | ${c.label} | entity=${qid || "NULL"} | hero=${hero.heroSource}`);
  console.log(`  phases: ${phases.join(" → ")}`);
  if (hero.image?.url) console.log(`  ${hero.image.url.slice(0, 88)}...`);
  console.log("");
}

if (failed) {
  console.error(`verify-entity-search-articles: ${failed} échec(s)`);
  process.exit(1);
}
console.log("verify-entity-search-articles: OK");
