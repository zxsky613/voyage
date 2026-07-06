/**
 * Run diagnostic Ténérife 8j×4 via le handler planner (sans dev server).
 * Usage:
 *   node scripts/run-tenerife-diag.mjs --provider groq --out scripts/tmp-diag-groq-ref.json
 *   node scripts/run-tenerife-diag.mjs --provider deepseek --out scripts/tmp-diag-deepseek-run.json
 *
 * FORCE_LLM_PROVIDER=groq force Groq (référence). Sans flag provider=deepseek utilise la chaîne DeepSeek→Groq→Gemini.
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

const args = process.argv.slice(2);
let provider = "default";
let outPath = path.join(root, "scripts", "tmp-diag-run.json");
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--provider" && args[i + 1]) provider = String(args[++i]).trim().toLowerCase();
  else if (args[i] === "--out" && args[i + 1]) outPath = path.resolve(root, args[++i]);
}

if (provider === "groq") process.env.FORCE_LLM_PROVIDER = "groq";
else if (provider === "deepseek") delete process.env.FORCE_LLM_PROVIDER;
else if (provider === "gemini") process.env.FORCE_LLM_PROVIDER = "gemini";

const payloadPath = path.join(root, "scripts", "tmp-diag-payload.json");
const body = JSON.parse(fs.readFileSync(payloadPath, "utf8"));

const res = {
  statusCode: 200,
  body: null,
  setHeader() {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(obj) {
    this.body = obj;
  },
};

const req = {
  method: "POST",
  body,
  query: { debug: "1" },
};

console.log(`Run Ténérife 8j×4 TA_ENRICHMENT=off provider=${provider} …`);
const t0 = Date.now();

const { handler } = await import("../api/planner/_generateItinerary.js");
await handler(req, res);

const ms = Date.now() - t0;
if (res.statusCode !== 200 || !res.body?.ok) {
  console.error(`FAIL HTTP ${res.statusCode} (${ms}ms):`, JSON.stringify(res.body).slice(0, 500));
  process.exit(1);
}

fs.writeFileSync(outPath, JSON.stringify(res.body, null, 2), "utf8");
const meta = res.body.data?.meta || {};
const perDay = (res.body.data?.dayIdeas || []).map((d) => (d.activities || []).length).join(",");
console.log(`OK ${ms}ms → ${outPath}`);
console.log(
  JSON.stringify(
    {
      llmProviders: meta.llmProviders,
      uniqueRatio: meta.uniqueRatio,
      clusterCompletionRounds: meta.clusterCompletionRounds,
      contractRelaxed: meta.contractRelaxed,
      funnel: meta.funnel,
      perDay,
      perDayTarget: meta.perDayTarget,
      coordsSource: meta.coordsSourceCounts,
      photoSource: meta.photoSourceCounts,
    },
    null,
    2
  )
);
