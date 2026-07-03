/**
 * Pré-chauffe image_resolve_cache pour ~30 villes catalogue (dev/ops uniquement).
 *
 * ⚠️ Lancer UNIQUEMENT APRÈS déploiement du fix User-Agent Wikimedia et vérification
 * que POST /api/images/resolve ne renvoie plus wikidata_throttled en systématique.
 *
 * Usage:
 *   npm run warmup:image-cache
 *   node scripts/warmup-image-resolve-top-cities.mjs --limit 30 --delay 500
 */
import fs from "node:fs";
import { CITY_CATALOG } from "../cityCatalogData.js";
import { inferDefaultHeroResolveContext } from "../lib/images/normalizeLabel.js";
import { resolveImage } from "../api/images/_resolveImage.js";

/** Contexte géo explicite quand le stem seul est ambigu. */
const GEO_SUFFIX = Object.freeze({
  Paris: "France",
  Lyon: "France",
  Marseille: "France",
  Nice: "France",
  Monaco: "Monaco",
  Bordeaux: "France",
  Toulouse: "France",
  Lille: "France",
  Nantes: "France",
  Tokyo: "Japan",
  Kyoto: "Japan",
  Osaka: "Japan",
  Seoul: "South Korea",
  Bangkok: "Thailand",
  Singapore: "Singapore",
  Bali: "Indonesia",
  Jakarta: "Indonesia",
  Beijing: "China",
  Shanghai: "China",
  Guangzhou: "China",
  "New York": "United States",
  "Los Angeles": "United States",
  "San Francisco": "United States",
  Miami: "United States",
  Chicago: "United States",
  Toronto: "Canada",
  Vancouver: "Canada",
  London: "United Kingdom",
  Barcelona: "Spain",
  Madrid: "Spain",
  Rome: "Italy",
  Milan: "Italy",
  Venise: "Italy",
  Berlin: "Germany",
  Amsterdam: "Netherlands",
});

function loadEnvLocal() {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = 30;
  let delayMs = 500;
  let uiLang = "fr";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) limit = Math.max(1, Number(args[++i]) || 30);
    else if (args[i] === "--delay" && args[i + 1]) delayMs = Math.max(200, Number(args[++i]) || 500);
    else if (args[i] === "--lang" && args[i + 1]) uiLang = String(args[++i] || "fr");
  }
  return { limit, delayMs, uiLang };
}

function heroLabelForCity(city) {
  const ctx = GEO_SUFFIX[city] || inferDefaultHeroResolveContext(city);
  return ctx ? `${city}, ${ctx}` : city;
}

loadEnvLocal();

const { limit, delayMs, uiLang } = parseArgs();
const cities = CITY_CATALOG.slice(0, limit);

console.log(
  `warmup-image-resolve-top-cities: ${cities.length} ville(s), delay=${delayMs}ms, lang=${uiLang}`
);
console.log("Assurez-vous que le fix User-Agent est déployé avant de lancer ce script.\n");

let ok = 0;
let fail = 0;
/** @type {Array<{ label: string, reason: string, cache: string }>} */
const failures = [];

for (let i = 0; i < cities.length; i++) {
  const city = cities[i];
  const label = heroLabelForCity(city);
  const outcome = await resolveImage({ kind: "hero", label, context: "", uiLang });

  if (outcome.image?.url) {
    ok += 1;
    console.log(
      `[${i + 1}/${cities.length}] OK ${label} cache=${outcome.cache} entity=${outcome.image.entityId || "-"}`
    );
  } else {
    fail += 1;
    const reason = outcome.reason || "not_found";
    failures.push({ label, reason, cache: outcome.cache || "miss" });
    console.log(`[${i + 1}/${cities.length}] FAIL ${label} reason=${reason} cache=${outcome.cache || "miss"}`);
  }

  if (i < cities.length - 1) await sleep(delayMs);
}

console.log(`\nRésumé: ${ok} OK, ${fail} FAIL sur ${cities.length}`);
if (failures.length) {
  console.log("Échecs:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.reason} (${f.cache})`);
}

process.exit(fail > cities.length / 2 ? 1 : 0);
