/**
 * Diagnostic héros Crète — trace chaque étage du resolver + purge cache optionnelle.
 * Usage:
 *   node scripts/debug-crete.mjs
 *   node scripts/debug-crete.mjs --purge
 */
import { normalizeLabel } from "../lib/images/normalizeLabel.js";
import { isLikelyNonScenicHeroImagery } from "../lib/images/wikiImageFilters.js";
import { resolveEntity } from "../api/images/_entityResolver.js";
import { fetchP18Candidates, fetchCommonsCategoryScenicCandidates } from "../api/images/_commonsClient.js";
import { fetchWikipediaCandidates } from "../api/images/_wikipediaClient.js";
import { resolveImage } from "../api/images/_resolveImage.js";
import { purgeImageResolveCacheByLabels, purgeImageResolveCacheByEntity, readCacheByLabel } from "../api/images/_cache.js";

const LABEL = "Crete, Greece";
const CONTEXT = "";
const UI_LANG = "fr";
const purge = process.argv.includes("--purge");

const labelKeys = [
  normalizeLabel("Crete"),
  normalizeLabel("Crete", "Greece"),
  normalizeLabel("Crete, Greece"),
  normalizeLabel("Crète"),
  normalizeLabel("Crète", "Grèce"),
];

console.log("=== Diagnostic héros Crète ===\n");
console.log("Clés cache image_resolve_cache:", labelKeys.join(" | "));

for (const key of labelKeys) {
  const cached = await readCacheByLabel(key, "hero");
  if (cached.cache === "hit" && cached.entry?.url) {
    const url = cached.entry.url;
    const blocked = isLikelyNonScenicHeroImagery(url, decodeURIComponent(url));
    console.log(`\n[cache hit] ${key}`);
    console.log(`  url: ${url.slice(0, 120)}`);
    console.log(`  source: ${cached.entry.source}`);
    console.log(`  blockedByNonScenicFilter: ${blocked}`);
    if (/besser|toilet|wc|restroom/i.test(decodeURIComponent(url))) {
      console.log("  >>> CAUSE PROBABLE: entrée cache WC/hors-sujet (commons-category historique)");
    }
  }
}

const entity = await resolveEntity("Crete", UI_LANG, "hero", "Greece");

if (purge) {
  const byLabel = await purgeImageResolveCacheByLabels(labelKeys, "hero");
  const byEntity = entity?.qid ? await purgeImageResolveCacheByEntity(entity.qid, "hero") : { deleted: 0 };
  console.log(
    `\n[purge] labels deleted=${byLabel.deleted}${byLabel.error ? ` error=${byLabel.error}` : ""} entity deleted=${byEntity.deleted}`
  );
  console.log("Purge aussi le localStorage navigateur: clés tp_city_img_v3_* contenant « crete ».");
}

console.log("\n[entity]", entity?.qid || "null", entity?.commonsCategory || "");

if (entity) {
  const p18 = await fetchP18Candidates(entity.p18Filenames || [], { kind: "hero" });
  console.log("\n[P18]", p18.length ? p18[0].url.slice(0, 100) : "aucun candidat valide");

  const wiki = await fetchWikipediaCandidates(entity.sitelinks || [], { kind: "hero", uiLang: UI_LANG });
  console.log("[pageimage]", wiki[0]?.url?.slice(0, 100) || "aucun");

  const commons = await fetchCommonsCategoryScenicCandidates(entity.commonsCategory || "", {
    kind: "hero",
    destinationTokens: ["crete", "greece"],
  });
  console.log("[commons-category top]", commons[0]?.url?.slice(0, 100) || "aucun");
  if (commons[0]?.url && /besser|toilet|wc/i.test(decodeURIComponent(commons[0].url))) {
    console.log("  >>> WC toujours en tête du scoring Commons — filtres à renforcer");
  }
}

const result = await resolveImage({
  kind: "hero",
  label: LABEL,
  context: CONTEXT,
  uiLang: UI_LANG,
});

console.log("\n[resolveImage final]");
if (!result.image?.url) {
  console.log("null", result.reason || "", result.heroSource || "fallback");
} else {
  console.log(
    JSON.stringify(
      {
        url: result.image.url,
        source: result.image.source,
        heroSource: result.heroSource,
        entityId: result.image.entityId,
        cached: result.image.cached,
      },
      null,
      2
    )
  );
}

console.log("\n=== Fin diagnostic ===");
