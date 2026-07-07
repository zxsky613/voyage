/**
 * Audit de masse héros — score de suspicion + HEAD réel + TOP 30 suspects.
 *
 * Usage:
 *   node scripts/audit-heroes.mjs
 *   node scripts/audit-heroes.mjs --resolve-misses
 *   node scripts/audit-heroes.mjs --top 30
 *
 * Sortie: reports/audit-heroes-{date}.csv + .md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../lib/scripts/loadEnvLocal.mjs";
import { CITY_CATALOG } from "../cityCatalogData.js";
import { inferDefaultHeroResolveContext } from "../lib/images/normalizeLabel.js";
import { normalizeLabel } from "../lib/images/normalizeLabel.js";
import {
  extractCommonsFileTitleFromUrl,
  scoreHeroSuspicion,
  HERO_QUALITY,
} from "../lib/images/heroQualityRules.js";
import { resolveImage } from "../api/images/_resolveImage.js";
import { isCacheConfigured, listAllHeroCacheEntries, readCacheByLabel } from "../api/images/_cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const WIKI_UA = "JustTrip/1.0 (https://justtrip.fr) audit-heroes";
const EUROPEAN_AUDIT = Object.freeze([
  ["Paris", "France"], ["London", "United Kingdom"], ["Berlin", "Germany"], ["Rome", "Italy"],
  ["Madrid", "Spain"], ["Barcelona", "Spain"], ["Amsterdam", "Netherlands"], ["Vienna", "Austria"],
  ["Prague", "Czech Republic"], ["Budapest", "Hungary"], ["Warsaw", "Poland"], ["Copenhagen", "Denmark"],
  ["Stockholm", "Sweden"], ["Oslo", "Norway"], ["Helsinki", "Finland"], ["Dublin", "Ireland"],
  ["Lisbon", "Portugal"], ["Porto", "Portugal"], ["Brussels", "Belgium"], ["Zurich", "Switzerland"],
  ["Geneva", "Switzerland"], ["Munich", "Germany"], ["Hamburg", "Germany"], ["Frankfurt", "Germany"],
  ["Cologne", "Germany"], ["Marseille", "France"], ["Lyon", "France"], ["Nice", "France"],
  ["Bordeaux", "France"], ["Toulouse", "France"], ["Strasbourg", "France"], ["Montpellier", "France"],
  ["Lille", "France"], ["Nantes", "France"], ["Annecy", "France"], ["Edinburgh", "United Kingdom"],
  ["Manchester", "United Kingdom"], ["Glasgow", "United Kingdom"], ["Athens", "Greece"],
  ["Crete", "Greece"], ["Santorini", "Greece"], ["Mykonos", "Greece"], ["Rhodes", "Greece"],
  ["Thessaloniki", "Greece"], ["Split", "Croatia"], ["Dubrovnik", "Croatia"], ["Zagreb", "Croatia"],
  ["Ljubljana", "Slovenia"], ["Belgrade", "Serbia"], ["Bucharest", "Romania"], ["Sofia", "Bulgaria"],
  ["Tallinn", "Estonia"], ["Riga", "Latvia"], ["Vilnius", "Lithuania"], ["Krakow", "Poland"],
  ["Gdansk", "Poland"], ["Wroclaw", "Poland"], ["Seville", "Spain"], ["Valencia", "Spain"],
  ["Malaga", "Spain"], ["Granada", "Spain"], ["Bilbao", "Spain"], ["Palma", "Spain"],
  ["Ibiza", "Spain"], ["Tenerife", "Spain"], ["Milan", "Italy"], ["Florence", "Italy"],
  ["Venice", "Italy"], ["Naples", "Italy"], ["Turin", "Italy"], ["Verona", "Italy"],
  ["Bologna", "Italy"], ["Palermo", "Italy"], ["Reykjavik", "Iceland"], ["Bruges", "Belgium"],
  ["Antwerp", "Belgium"], ["Luxembourg", "Luxembourg"], ["Monaco", "Monaco"], ["Malta", "Malta"],
  ["Cyprus", "Cyprus"], ["Ronda", "Spain"], ["Salzburg", "Austria"], ["Innsbruck", "Austria"],
  ["Kraków", "Poland"], ["Tbilisi", "Georgia"], ["Istanbul", "Turkey"], ["Bergen", "Norway"],
  ["Bergamo", "Italy"], ["Como", "Italy"], ["Siena", "Italy"], ["Pisa", "Italy"],
  ["Cork", "Ireland"], ["Galway", "Ireland"], ["Rotterdam", "Netherlands"], ["Utrecht", "Netherlands"],
  ["Leipzig", "Germany"], ["Dresden", "Germany"], ["Stuttgart", "Germany"], ["Nantes", "France"],
  ["Biarritz", "France"], ["Corsica", "France"], ["Chamonix", "France"], ["Avignon", "France"],
  ["Cambridge", "United Kingdom"], ["Oxford", "United Kingdom"], ["Bath", "United Kingdom"],
  ["Tromsø", "Norway"], ["Bergen", "Norway"], ["Aarhus", "Denmark"], ["Odense", "Denmark"],
]);

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
  London: "United Kingdom",
  Barcelona: "Spain",
  Madrid: "Spain",
  Rome: "Italy",
  Milan: "Italy",
  Venise: "Italy",
  Berlin: "Germany",
  Amsterdam: "Netherlands",
  Prague: "Czech Republic",
  Vienne: "Austria",
  Budapest: "Hungary",
  Athènes: "Greece",
  Istanbul: "Turkey",
  Edinburgh: "United Kingdom",
  Warsaw: "Poland",
  Krakow: "Poland",
  Split: "Croatia",
  Porto: "Portugal",
  Lisbonne: "Portugal",
});

/** @param {string} url */
async function headStatus(url) {
  if (!url) return { status: 0, ok: false };
  const headers = { "User-Agent": WIKI_UA };
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", headers });
    if (r.ok) return { status: r.status, ok: true };
    if (r.status === 405 || r.status === 403) {
      r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { ...headers, Range: "bytes=0-0" },
      });
      return { status: r.status, ok: r.ok || r.status === 206 };
    }
    return { status: r.status, ok: r.ok };
  } catch {
    return { status: 0, ok: false };
  }
}

/** @param {string} labelNormalized */
function labelFromNormalized(labelNormalized) {
  return String(labelNormalized || "")
    .split("|")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(", ");
}

/** @param {string} [heroSource] @param {string} [source] */
function inferAuditHeroSource(heroSource, source) {
  if (heroSource) return String(heroSource);
  const s = String(source || "");
  if (s === "wikidata-commons") return "p18";
  if (s === "wikipedia") return "pageimage";
  if (s === "wikivoyage") return "wikivoyage";
  if (s === "commons-category") return "commons";
  return "commons";
}

/**
 * @param {string} label
 * @param {string} [context]
 */
function addDestination(map, label, context = "") {
  const ctx = context || inferDefaultHeroResolveContext(label) || GEO_SUFFIX[label] || "";
  const key = normalizeLabel(label, ctx);
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, { label: ctx ? `${label}, ${ctx}` : label, context: ctx, key });
  }
}

function parseArgs(argv) {
  const opts = { top: 30, resolveMisses: false, limit: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--top" && argv[i + 1]) {
      opts.top = Number(argv[++i]) || 30;
    } else if (argv[i] === "--resolve-misses") {
      opts.resolveMisses = true;
    } else if (argv[i] === "--limit" && argv[i + 1]) {
      opts.limit = Number(argv[++i]) || 0;
    }
  }
  return opts;
}

loadEnvLocal();

const opts = parseArgs(process.argv.slice(2));

/** @type {Map<string, { label: string, context: string, key: string }>} */
const destinations = new Map();

for (const city of CITY_CATALOG) {
  addDestination(destinations, city, GEO_SUFFIX[city] || inferDefaultHeroResolveContext(city));
}
for (const [label, context] of EUROPEAN_AUDIT) {
  addDestination(destinations, label, context);
}

if (isCacheConfigured()) {
  const cached = await listAllHeroCacheEntries(5000);
  for (const row of cached) {
    if (!row.labelNormalized) continue;
    if (!destinations.has(row.labelNormalized)) {
      destinations.set(row.labelNormalized, {
        key: row.labelNormalized,
        label: labelFromNormalized(row.labelNormalized),
        context: "",
      });
    }
  }
}

let destList = [...destinations.values()];
if (opts.limit > 0) destList = destList.slice(0, opts.limit);

console.log(`=== Audit héros — ${destList.length} destination(s) ===\n`);
console.log(`Cache: ${isCacheConfigured() ? "ON" : "OFF"} | resolve-misses: ${opts.resolveMisses}\n`);

/** @type {Array<Record<string, unknown>>} */
const rows = [];
let processed = 0;

for (const dest of destList) {
  processed += 1;
  if (processed % 25 === 0) {
    process.stdout.write(`  … ${processed}/${destList.length}\r`);
  }

  let url = "";
  let heroSource = "fallback";
  let width = 0;
  let height = 0;
  let cacheHit = false;

  const cached = await readCacheByLabel(dest.key, "hero");
  if (cached.entry?.url) {
    url = cached.entry.url;
    heroSource = inferAuditHeroSource(cached.entry.heroSource, cached.entry.source);
    width = cached.entry.width || 0;
    height = cached.entry.height || 0;
    cacheHit = true;
  }

  if (!url && opts.resolveMisses) {
    const outcome = await resolveImage({
      kind: "hero",
      label: dest.label,
      context: dest.context,
      uiLang: "en",
    });
    url = String(outcome.image?.url || "");
    heroSource = String(outcome.heroSource || outcome.image?.heroSource || "fallback");
    width = outcome.image?.width || 0;
    height = outcome.image?.height || 0;
  }

  if (!url) {
    rows.push({
      destination: dest.label,
      key: dest.key,
      heroSource: "none",
      url: "",
      httpStatus: "",
      width: "",
      height: "",
      suspicion: 0,
      reasons: "no-url",
      cache: cacheHit ? "hit-empty" : "miss",
    });
    continue;
  }

  const thumbMatch = url.match(/\/(\d+)px-/i);
  if (!width && thumbMatch) width = Number(thumbMatch[1]) || 0;

  const head = await headStatus(url);
  const fileTitle = extractCommonsFileTitleFromUrl(url);
  const { score, reasons, blocked } = scoreHeroSuspicion({
    url,
    fileTitle,
    heroSource,
    width,
    height,
  });

  rows.push({
    destination: dest.label,
    key: dest.key,
    heroSource,
    url,
    httpStatus: head.status || (head.ok ? 200 : 0),
    width: width || "",
    height: height || "",
    suspicion: blocked ? 999 : score,
    reasons: reasons.join("; ") || "",
    cache: cacheHit ? "hit" : opts.resolveMisses ? "resolved" : "miss",
  });
}

rows.sort((a, b) => Number(b.suspicion) - Number(a.suspicion));

const stamp = new Date().toISOString().slice(0, 10);
const reportsDir = path.join(root, "reports");
fs.mkdirSync(reportsDir, { recursive: true });

const csvPath = path.join(reportsDir, `audit-heroes-${stamp}.csv`);
const mdPath = path.join(reportsDir, `audit-heroes-${stamp}.md`);

const csvHeader = "destination,key,heroSource,suspicion,httpStatus,width,height,cache,reasons,url\n";
const csvBody = rows
  .map((r) =>
    [
      `"${String(r.destination).replace(/"/g, '""')}"`,
      r.key,
      r.heroSource,
      r.suspicion,
      r.httpStatus,
      r.width,
      r.height,
      r.cache,
      `"${String(r.reasons).replace(/"/g, '""')}"`,
      `"${String(r.url).replace(/"/g, '""')}"`,
    ].join(",")
  )
  .join("\n");
fs.writeFileSync(csvPath, csvHeader + csvBody + "\n", "utf8");

const topN = rows.slice(0, opts.top);
const mdLines = [
  `# Audit héros ${stamp}`,
  "",
  `Destinations: ${destList.length} | Seuil revue: ${HERO_QUALITY.SUSPICION_REVIEW_THRESHOLD}`,
  "",
  `## TOP ${opts.top} suspects (revue visuelle)`,
  "",
  "| # | Destination | Score | heroSource | HTTP | URL |",
  "|---:|---|---:|---|---:|---|",
];

topN.forEach((r, i) => {
  const link = r.url ? `[ouvrir](${r.url})` : "—";
  mdLines.push(
    `| ${i + 1} | ${r.destination} | **${r.suspicion}** | ${r.heroSource} | ${r.httpStatus} | ${link} |`
  );
  if (r.reasons) mdLines.push(`| | _${r.reasons}_ | | | | |`);
});

mdLines.push("", "## Toutes les destinations", "", "Voir CSV pour la liste complète triée.", "", `Fichier: \`${csvPath}\``);
fs.writeFileSync(mdPath, mdLines.join("\n") + "\n", "utf8");

console.log(`\nRapports:\n  ${csvPath}\n  ${mdPath}\n`);
console.log(`=== TOP ${opts.top} suspects ===\n`);

topN.forEach((r, i) => {
  console.log(`${String(i + 1).padStart(2, " ")}. [${r.suspicion}] ${r.destination}`);
  console.log(`    heroSource: ${r.heroSource} | HTTP ${r.httpStatus} | ${r.reasons || "—"}`);
  if (r.url) console.log(`    ${r.url}`);
  console.log("");
});

const high = rows.filter((r) => Number(r.suspicion) >= HERO_QUALITY.SUSPICION_REVIEW_THRESHOLD).length;
console.log(`Suspects ≥ ${HERO_QUALITY.SUSPICION_REVIEW_THRESHOLD}: ${high}/${rows.length}`);
