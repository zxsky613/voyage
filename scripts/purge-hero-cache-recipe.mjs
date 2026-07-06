/**
 * Purge cache héros des destinations recette (post hero v2).
 * Usage: node scripts/purge-hero-cache-recipe.mjs
 */
import { normalizeLabel } from "../lib/images/normalizeLabel.js";
import { resolveEntity } from "../api/images/_entityResolver.js";
import { purgeImageResolveCacheByLabels, purgeImageResolveCacheByEntity } from "../api/images/_cache.js";

/** @type {{ label: string, context?: string, uiLang?: string }[]} */
const CASES = [
  { label: "Crete, Greece", context: "", uiLang: "fr" },
  { label: "Annecy", context: "France", uiLang: "fr" },
  { label: "Split", context: "Croatia", uiLang: "en" },
  { label: "Ronda", context: "Spain", uiLang: "es" },
  { label: "Marseille", context: "France", uiLang: "fr" },
  { label: "Santorini", context: "Greece", uiLang: "en" },
];

console.log("=== Purge cache héros recette hero v2 ===\n");

let totalLabels = 0;
let totalEntities = 0;

for (const c of CASES) {
  const ctx = String(c.context || "").trim();
  const keys = [
    normalizeLabel(c.label, ctx),
    normalizeLabel(c.label.split(",")[0]?.trim() || c.label, ctx),
  ].filter(Boolean);
  const uniqueKeys = [...new Set(keys)];

  const byLabel = await purgeImageResolveCacheByLabels(uniqueKeys, "hero");
  totalLabels += byLabel.deleted || 0;
  console.log(`${c.label}: labels purged=${byLabel.deleted || 0} keys=${uniqueKeys.join(" | ")}`);

  const { searchLabel } = (await import("../lib/images/normalizeLabel.js")).splitResolveImageLabelContext(
    c.label,
    ctx
  );
  const entity = await resolveEntity(searchLabel, c.uiLang || "fr", "hero", ctx);
  if (entity?.qid) {
    const byEntity = await purgeImageResolveCacheByEntity(entity.qid, "hero");
    totalEntities += byEntity.deleted || 0;
    console.log(`  entity ${entity.qid} purged=${byEntity.deleted || 0}`);
  }
}

console.log(`\nTotal: ${totalLabels} by label, ${totalEntities} by entity`);
console.log("purge-hero-cache-recipe: OK");
