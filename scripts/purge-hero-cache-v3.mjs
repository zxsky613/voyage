/**
 * Purge cache héros cascade v3 (Faro / Split / Palerme + contrôles).
 * Usage: node scripts/purge-hero-cache-v3.mjs
 */
import { heroCacheLabelKey } from "../lib/images/heroCacheKey.js";
import { normalizeLabel } from "../lib/images/normalizeLabel.js";
import { resolveEntity } from "../api/images/_entityResolver.js";
import { purgeImageResolveCacheByLabels, purgeImageResolveCacheByEntity } from "../api/images/_cache.js";

/** @type {{ label: string, context?: string, uiLang?: string }[]} */
const CASES = [
  { label: "Faro", context: "Portugal", uiLang: "pt" },
  { label: "Split", context: "Croatia", uiLang: "en" },
  { label: "Palermo", context: "Italy", uiLang: "it" },
  { label: "Annecy", context: "France", uiLang: "fr" },
  { label: "Zanzibar City", context: "Tanzania", uiLang: "en" },
];

console.log("=== Purge cache héros hero-cascade-v3 ===\n");

let totalLabels = 0;
let totalEntities = 0;

for (const c of CASES) {
  const ctx = String(c.context || "").trim();
  const legacyKeys = [
    normalizeLabel(c.label, ctx),
    normalizeLabel(c.label.split(",")[0]?.trim() || c.label, ctx),
  ].filter(Boolean);
  const v3Keys = [
    heroCacheLabelKey(c.label, ctx),
    heroCacheLabelKey(c.label.split(",")[0]?.trim() || c.label, ctx),
  ].filter(Boolean);
  const uniqueKeys = [...new Set([...legacyKeys, ...v3Keys])];

  const byLabel = await purgeImageResolveCacheByLabels(uniqueKeys, "hero");
  totalLabels += byLabel.deleted || 0;
  console.log(`${c.label}: labels purged=${byLabel.deleted || 0}`);

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
console.log("purge-hero-cache-v3: OK");
