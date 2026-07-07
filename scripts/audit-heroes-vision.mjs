/**
 * Audit héros avec juge vision Gemini — rapport HTML + bans automatiques.
 *
 * Usage:
 *   node scripts/audit-heroes-vision.mjs
 *   node scripts/audit-heroes-vision.mjs --limit 20
 *   node scripts/audit-heroes-vision.mjs --references-only
 *   node scripts/audit-heroes-vision.mjs --no-auto-ban
 *   node scripts/audit-heroes-vision.mjs --resolve-misses
 *
 * Sortie: reports/audit-heroes-vision-{date}.html
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../lib/scripts/loadEnvLocal.mjs";
import { CITY_CATALOG } from "../cityCatalogData.js";
import { inferDefaultHeroResolveContext, normalizeLabel } from "../lib/images/normalizeLabel.js";
import {
  extractCommonsFileTitleFromUrl,
  HERO_QUALITY,
  scoreHeroSuspicion,
} from "../lib/images/heroQualityRules.js";
import {
  HERO_VISION_REFERENCE_CASES,
  coldSignalsConcordantWithReject,
  effectiveHeroVisionVerdict,
} from "../lib/images/heroVisionJudge.js";
import { resolveImage } from "../api/images/_resolveImage.js";
import { isCacheConfigured, listAllHeroCacheEntries, purgeImageResolveCacheByLabels, readCacheByLabel } from "../api/images/_cache.js";
import { banHeroUrl, isHeroOverridesConfigured } from "../api/images/_heroOverrides.js";
import {
  getHeroVisionCallsSession,
  getHeroVisionModel,
  isHeroVisionEnabled,
  judgeHeroImage,
} from "../api/images/_heroVisionGate.js";
import { getGeminiKey } from "../api/_helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** @type {typeof import('../scripts/audit-heroes.mjs')} */
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
  ["Como", "Italy"], ["Siena", "Italy"], ["Pisa", "Italy"], ["Biarritz", "France"],
  ["Corsica", "France"], ["Chamonix", "France"], ["Avignon", "France"],
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
  Berlin: "Germany",
  Amsterdam: "Netherlands",
  Prague: "Czech Republic",
  Vienne: "Austria",
  Vienna: "Austria",
  Annecy: "France",
  Crete: "Greece",
});

function parseArgs(argv) {
  const opts = {
    limit: 0,
    resolveMisses: false,
    referencesOnly: false,
    noAutoBan: false,
    demoBans: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) opts.limit = Number(argv[++i]) || 0;
    else if (a === "--resolve-misses") opts.resolveMisses = true;
    else if (a === "--references-only") opts.referencesOnly = true;
    else if (a === "--no-auto-ban") opts.noAutoBan = true;
    else if (a === "--demo-bans") opts.demoBans = true;
  }
  return opts;
}

function addDestination(map, label, context = "") {
  const ctx = context || inferDefaultHeroResolveContext(label) || GEO_SUFFIX[label] || "";
  const key = normalizeLabel(label, ctx);
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, { label: ctx ? `${label}, ${ctx}` : label, context: ctx, key });
  }
}

function labelFromNormalized(key) {
  const parts = String(key || "").split("|").filter(Boolean);
  return parts[0] || key;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function banCommand(destination, url) {
  return `npm run hero:set -- "${destination}" --ban "${url}"`;
}

function verdictClass(v) {
  if (v === "excellent") return "excellent";
  if (v === "reject") return "reject";
  return "acceptable";
}

/**
 * @param {{ label: string, context: string, key: string }} dest
 * @param {boolean} resolveMisses
 */
async function loadHeroUrl(dest, resolveMisses) {
  const cached = await readCacheByLabel(dest.key, "hero");
  if (cached.entry?.url) {
    return {
      url: cached.entry.url,
      heroSource: cached.entry.heroSource || cached.entry.source || "cache",
      width: cached.entry.width || 0,
      height: cached.entry.height || 0,
      fromCache: true,
    };
  }
  if (!resolveMisses) return { url: "", heroSource: "none", width: 0, height: 0, fromCache: false };
  const outcome = await resolveImage({
    kind: "hero",
    label: dest.label,
    context: dest.context,
    uiLang: "en",
  });
  return {
    url: String(outcome.image?.url || ""),
    heroSource: String(outcome.heroSource || outcome.image?.heroSource || "fallback"),
    width: outcome.image?.width || 0,
    height: outcome.image?.height || 0,
    fromCache: false,
  };
}

/**
 * @param {{ label: string, key: string, context: string }} dest
 * @param {boolean} autoBan
 */
async function auditDestination(dest, autoBan) {
  const destinationLabel = dest.context ? `${dest.label}, ${dest.context}` : dest.label;
  let hero = await loadHeroUrl(dest, true);
  const autoBans = /** @type {Array<Record<string, unknown>>} */ ([]);
  let loops = 0;

  while (hero.url && loops < 3) {
    loops += 1;
    const fileTitle = extractCommonsFileTitleFromUrl(hero.url);
    const coldScore = scoreHeroSuspicion({
      url: hero.url,
      fileTitle,
      heroSource: hero.heroSource,
      width: hero.width,
      height: hero.height,
    });
    const judgment = await judgeHeroImage({
      url: hero.url,
      destinationLabel,
      fileTitle,
      heroSource: hero.heroSource,
      width: hero.width,
      height: hero.height,
    });

    const row = {
      destination: dest.label,
      key: dest.key,
      destinationLabel,
      url: hero.url,
      thumbUrl: judgment.thumbUrl || hero.url,
      heroSource: hero.heroSource,
      verdict: judgment.vision.verdict,
      shows: judgment.vision.shows,
      visionReasons: judgment.vision.reasons,
      coldScore: coldScore.score,
      coldReasons: coldScore.reasons,
      coldConcordant: coldSignalsConcordantWithReject(judgment.cold),
      policy: judgment.policy,
      fromCache: hero.fromCache,
      banCommand: banCommand(destinationLabel, hero.url),
    };

    if (judgment.policy === "auto_reject" && autoBan && isHeroOverridesConfigured()) {
      await banHeroUrl(dest.key, hero.url);
      await purgeImageResolveCacheByLabels([dest.key], "hero");
      autoBans.push({ ...row, action: "auto_ban" });
      const outcome = await resolveImage({
        kind: "hero",
        label: dest.label,
        context: dest.context,
        uiLang: "en",
      });
      hero = {
        url: String(outcome.image?.url || ""),
        heroSource: String(outcome.heroSource || "fallback"),
        width: outcome.image?.width || 0,
        height: outcome.image?.height || 0,
        fromCache: false,
      };
      continue;
    }

    return { row, autoBans };
  }

  return {
    row: hero.url
      ? {
          destination: dest.label,
          key: dest.key,
          destinationLabel,
          url: hero.url,
          thumbUrl: hero.url,
          heroSource: hero.heroSource,
          verdict: "reject",
          shows: "other",
          visionReasons: ["exhausted-candidates"],
          coldScore: 0,
          coldReasons: [],
          coldConcordant: false,
          policy: "review_reject",
          fromCache: hero.fromCache,
          banCommand: banCommand(destinationLabel, hero.url),
        }
      : {
          destination: dest.label,
          key: dest.key,
          destinationLabel,
          url: "",
          thumbUrl: "",
          heroSource: "none",
          verdict: "reject",
          shows: "other",
          visionReasons: ["no-url"],
          coldScore: 0,
          coldReasons: [],
          coldConcordant: false,
          policy: "review_reject",
          fromCache: false,
          banCommand: "",
        },
    autoBans,
  };
}

function renderRowCard(r, extraClass = "") {
  const thumb = r.thumbUrl
    ? `<a href="${esc(r.url)}" target="_blank"><img src="${esc(r.thumbUrl)}" alt="" loading="lazy"/></a>`
    : `<div class="no-thumb">—</div>`;
  return `<article class="card ${extraClass} ${verdictClass(r.verdict)}">
  <div class="thumb">${thumb}</div>
  <div class="meta">
    <h3>${esc(r.destination)}</h3>
    <p><strong>Verdict IA:</strong> <span class="badge ${verdictClass(r.verdict)}">${esc(r.verdict)}</span>
       · <strong>shows:</strong> ${esc(r.shows)} · <strong>policy:</strong> ${esc(r.policy)}</p>
    <p><strong>IA:</strong> ${esc((r.visionReasons || []).join("; ") || "—")}</p>
    <p><strong>Froid:</strong> score ${r.coldScore} ${r.coldConcordant ? "(concordant)" : ""} — ${esc((r.coldReasons || []).join("; ") || "—")}</p>
    <p><strong>Source:</strong> ${esc(r.heroSource)}</p>
    ${r.banCommand ? `<pre class="cmd">${esc(r.banCommand)}</pre>` : ""}
  </div>
</article>`;
}

function buildHtml({ stamp, model, refs, autoBanRows, reviewRows, excellentCount, total, visionCalls }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>Audit héros vision ${stamp}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1.5rem; background: #f6f7f9; color: #1a1a1a; }
  h1, h2 { margin: 0 0 0.75rem; }
  .summary { background: #fff; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
  .card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); display: flex; flex-direction: column; }
  .card.reject { border-left: 4px solid #c62828; }
  .card.excellent { border-left: 4px solid #2e7d32; }
  .card.acceptable { border-left: 4px solid #f9a825; }
  .thumb img { width: 100%; height: 180px; object-fit: cover; display: block; background: #ddd; }
  .no-thumb { height: 180px; display: flex; align-items: center; justify-content: center; background: #eee; }
  .meta { padding: 0.75rem 1rem 1rem; font-size: 0.9rem; }
  .meta h3 { margin: 0 0 0.5rem; font-size: 1rem; }
  .meta p { margin: 0.35rem 0; line-height: 1.35; }
  .badge { padding: 0.1rem 0.45rem; border-radius: 4px; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; }
  .badge.excellent { background: #e8f5e9; color: #2e7d32; }
  .badge.reject { background: #ffebee; color: #c62828; }
  .badge.acceptable { background: #fff8e1; color: #f57f17; }
  .cmd { background: #263238; color: #eceff1; padding: 0.5rem 0.65rem; border-radius: 4px; font-size: 0.78rem; overflow-x: auto; margin-top: 0.5rem; }
  .ref-ok { color: #2e7d32; font-weight: 600; }
  .ref-fail { color: #c62828; font-weight: 600; }
  section { margin-bottom: 2rem; }
</style>
</head>
<body>
<h1>Audit héros — juge vision</h1>
<div class="summary">
  <p><strong>Date:</strong> ${esc(stamp)} · <strong>Modèle:</strong> ${esc(model)} · <strong>Vision:</strong> ${isHeroVisionEnabled() ? "ON" : "OFF/mock"}</p>
  <p><strong>Destinations:</strong> ${total} · <strong>Excellent/OK:</strong> ${excellentCount} · <strong>À revoir:</strong> ${reviewRows.length} · <strong>Bans auto:</strong> ${autoBanRows.length}</p>
  <p><strong>Appels vision (session):</strong> ${visionCalls} · Seuil froid revue: ${HERO_QUALITY.SUSPICION_REVIEW_THRESHOLD}</p>
</div>

<section>
<h2>Cas de référence</h2>
<ul>
${refs
  .map(
    (r) =>
      `<li class="${r.ok ? "ref-ok" : "ref-fail"}">${esc(r.id)} — attendu <code>${esc(r.expected)}</code> → obtenu <code>${esc(r.got)}</code> ${r.ok ? "✓" : "✗"}</li>`
  )
  .join("\n")}
</ul>
</section>

<section>
<h2>Bans automatiques (${autoBanRows.length})</h2>
<p>reject IA + signal froid concordant → ban + re-résolution (max 3 candidats).</p>
<div class="grid">
${autoBanRows.map((r) => renderRowCard(r, "auto-ban")).join("\n") || "<p>Aucun ban auto sur cette passe.</p>"}
</div>
</section>

<section>
<h2>À revoir — tranchage humain (${reviewRows.length})</h2>
<div class="grid">
${reviewRows.map((r) => renderRowCard(r)).join("\n") || "<p>Aucun cas limite.</p>"}
</div>
</section>
</body>
</html>`;
}

loadEnvLocal();
if (!getGeminiKey() && process.env.HERO_VISION_MOCK !== "0") {
  process.env.HERO_VISION_MOCK = "1";
  console.log("(pas de GEMINI_API_KEY — mode HERO_VISION_MOCK=1)\n");
}
const opts = parseArgs(process.argv.slice(2));

console.log(`=== Audit héros vision ===`);
console.log(`Modèle vision: ${getHeroVisionModel()} | Vision: ${isHeroVisionEnabled() ? "ON" : "OFF"}`);
console.log(`Auto-ban: ${opts.noAutoBan ? "NON" : "OUI"}\n`);

/** @type {Array<{ id: string, expected: string, got: string, ok: boolean }>} */
const refResults = [];

for (const ref of HERO_VISION_REFERENCE_CASES) {
  const judgment = await judgeHeroImage({
    url: ref.url,
    destinationLabel: ref.destination,
    fileTitle: ref.fileTitle,
    heroSource: ref.heroSource,
    skipCache: process.env.HERO_VISION_RECIPE === "1",
  });
  const got = effectiveHeroVisionVerdict(judgment.vision, judgment.cold);
  const ok = got === ref.expectedVerdict;
  refResults.push({ id: ref.id, expected: ref.expectedVerdict, got, ok });
  console.log(`[ref] ${ref.id}: IA=${judgment.vision.verdict} effectif=${got} (attendu ${ref.expectedVerdict}) ${ok ? "OK" : "FAIL"}`);
}

if (opts.referencesOnly) {
  const fails = refResults.filter((r) => !r.ok).length;
  process.exit(fails ? 1 : 0);
}

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
if (opts.demoBans) {
  const demoKeys = ["annecy|france", "crete|greece", "brussels|belgium"];
  const demo = demoKeys.map((key) => destinations.get(key)).filter(Boolean);
  const rest = destList.filter((d) => !demoKeys.includes(d.key));
  destList = [...demo, ...rest];
}
if (opts.limit > 0) destList = destList.slice(0, opts.limit);

/** @type {Array<Record<string, unknown>>} */
const allRows = [];
/** @type {Array<Record<string, unknown>>} */
const autoBanRows = [];
/** @type {Array<Record<string, unknown>>} */
const reviewRows = [];
let excellentCount = 0;
let processed = 0;

for (const dest of destList) {
  processed += 1;
  if (processed % 10 === 0) process.stdout.write(`  … ${processed}/${destList.length}\r`);
  if (processed > 1 && isHeroVisionEnabled() && !process.env.HERO_VISION_MOCK) {
    await new Promise((r) => setTimeout(r, Number(process.env.HERO_VISION_DELAY_MS) || 13_000));
  }

  const { row, autoBans } = await auditDestination(dest, !opts.noAutoBan);
  allRows.push(row);
  for (const b of autoBans) autoBanRows.push(b);

  if (row.verdict === "excellent" || row.policy === "accept") excellentCount += 1;
  else if (row.policy === "review_reject" || row.policy === "review" || row.verdict === "acceptable") {
    reviewRows.push(row);
  }
}

const stamp = new Date().toISOString().slice(0, 10);
const reportsDir = path.join(root, "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const htmlPath = path.join(reportsDir, `audit-heroes-vision-${stamp}.html`);
const html = buildHtml({
  stamp,
  model: getHeroVisionModel(),
  refs: refResults,
  autoBanRows,
  reviewRows,
  excellentCount,
  total: destList.length,
  visionCalls: getHeroVisionCallsSession(),
});
fs.writeFileSync(htmlPath, html, "utf8");

console.log(`\nRapport HTML: ${htmlPath}`);
console.log(`Références: ${refResults.filter((r) => r.ok).length}/${refResults.length} OK`);
console.log(`Bans auto: ${autoBanRows.length} | À revoir: ${reviewRows.length}`);
console.log(`Appels vision: ${getHeroVisionCallsSession()}`);

const refFails = refResults.filter((r) => !r.ok).length;
process.exit(refFails ? 1 : 0);
