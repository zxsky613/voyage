/**
 * 3 runs consécutifs Ténérife 8j×4 — stabilité contrat + funnel.
 * Usage: node scripts/run-tenerife-stability.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const fp = path.join(root, ".env.local");
  if (!fs.existsSync(fp)) return;
  for (const line of fs.readFileSync(fp, "utf8").split(/\r?\n/)) {
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

loadEnvLocal();
process.env.TA_ENRICHMENT = "off";
delete process.env.DISABLE_TRIPADVISOR;
delete process.env.FORCE_LLM_PROVIDER;

const payloadPath = path.join(root, "scripts", "tmp-diag-payload.json");
const body = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
const { handler } = await import("../api/planner/_generateItinerary.js");

const EDITORIAL_RE =
  /\b(restaurant|resto|brasserie|bistro|caf[eé]|coffee\s?shop|shopping|boutique|magasin|mall|centre\s?commercial)\b/i;

/** @type {object[]} */
const runs = [];

for (let run = 1; run <= 3; run += 1) {
  console.log(`\n=== Run ${run}/3 ===`);
  const res = {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(o) {
      this.body = o;
    },
  };
  const t0 = Date.now();
  await handler({ method: "POST", body, query: { debug: "1" } }, res);
  const ms = Date.now() - t0;

  if (res.statusCode !== 200 || !res.body?.ok) {
    console.error(`Run ${run} FAIL`, res.statusCode, JSON.stringify(res.body).slice(0, 300));
    process.exit(1);
  }

  const meta = res.body.data?.meta || {};
  const acts = (res.body.data?.dayIdeas || []).flatMap((d) => d.activities || []);
  const perDay = (res.body.data?.dayIdeas || []).map((d) => (d.activities || []).length);
  const badEditorial = acts.filter((a) => EDITORIAL_RE.test(`${a.name || ""} ${a.description || ""}`));
  const estimated = meta.coordsSourceCounts?.estimated || 0;
  const placeholder = meta.photoSourceCounts?.placeholder || 0;
  const wiki =
    (meta.photoSourceCounts?.wikimedia || 0) + (meta.photoSourceCounts?.wikimedia_geo || 0);

  const row = {
    run,
    ms,
    perDay: perDay.join(","),
    total: acts.length,
    minDay: Math.min(...perDay),
    clusterCompletionRounds: meta.clusterCompletionRounds,
    contractRelaxed: meta.contractRelaxed || [],
    funnel: meta.funnel,
    estimatedPct: acts.length ? Math.round((estimated / acts.length) * 100) : 0,
    placeholderPct: acts.length ? Math.round((placeholder / acts.length) * 100) : 0,
    wikiPct: acts.length ? Math.round((wiki / acts.length) * 100) : 0,
    editorialBad: badEditorial.map((a) => a.name),
  };
  runs.push(row);
  console.log(JSON.stringify(row, null, 2));

  fs.writeFileSync(
    path.join(root, "scripts", `tmp-stability-run-${run}.json`),
    JSON.stringify(res.body, null, 2),
    "utf8"
  );
}

console.log("\n=== Synthèse 3 runs ===");
console.log(
  JSON.stringify(
    runs.map((r) => ({
      run: r.run,
      perDay: r.perDay,
      total: r.total,
      minDay: r.minDay,
      clusterCompletionRounds: r.clusterCompletionRounds,
      contractRelaxed: r.contractRelaxed,
      funnel: r.funnel,
      estimatedPct: r.estimatedPct,
      placeholderPct: r.placeholderPct,
    })),
    null,
    2
  )
);

const all32 = runs.every((r) => r.total === 32 && r.minDay >= 4);
if (!all32) {
  console.error("ÉCHEC stabilité : au moins un run ≠ 32 activités ou jour < 4");
  process.exit(1);
}
console.log("OK — 3/3 runs : 32 activités, min 4/jour");
