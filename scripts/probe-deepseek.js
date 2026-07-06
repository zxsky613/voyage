/**
 * Sonde DeepSeek — vérifie DEEPSEEK_API_KEY + modèle deepseek-v4-flash (JSON).
 * Usage: node scripts/probe-deepseek.js
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runDeepSeekJson } from "../api/_helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const key = String(process.env.DEEPSEEK_API_KEY || "").trim();
const model = String(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash").trim();

if (!key) {
  console.error("FAIL — DEEPSEEK_API_KEY absente (.env.local)");
  process.exit(1);
}

if (model === "deepseek-chat") {
  console.error("FAIL — DEEPSEEK_MODEL=deepseek-chat interdit (utiliser deepseek-v4-flash)");
  process.exit(1);
}

console.log(`Probe DeepSeek model=${model} …`);

try {
  const t0 = Date.now();
  const data = await runDeepSeekJson({
    key,
    model,
    systemPrompt: "Tu réponds uniquement avec un objet JSON valide.",
    prompt:
      'Réponds avec {"ok":true,"provider":"deepseek","sample":["Teide","Santa Cruz de Tenerife"]} — exactement ce schéma, sample = 2 lieux réels de Ténérife.',
    temperature: 0,
    maxTokens: 256,
  });
  const ms = Date.now() - t0;
  if (!data?.ok || !Array.isArray(data?.sample) || data.sample.length < 2) {
    console.error("FAIL — JSON inattendu:", JSON.stringify(data).slice(0, 400));
    process.exit(1);
  }
  console.log(`OK — ${ms}ms — sample=${data.sample.join(", ")}`);
  process.exit(0);
} catch (e) {
  console.error("FAIL —", e?.message || e);
  process.exit(1);
}
