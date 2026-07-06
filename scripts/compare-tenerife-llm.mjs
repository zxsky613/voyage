/**
 * Extrait les métriques d'un run generate-itinerary pour comparaison LLM.
 * Usage: node scripts/compare-tenerife-llm.mjs <groq-ref.json> <deepseek-run.json>
 */
import { readFileSync } from "node:fs";

function load(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return raw?.data || raw;
}

function metrics(data, label) {
  const days = Array.isArray(data?.dayIdeas) ? data.dayIdeas : [];
  const acts = days.flatMap((d) => (Array.isArray(d?.activities) ? d.activities : []));
  const perDay = days.map((d) => (Array.isArray(d?.activities) ? d.activities.length : 0));
  const meta = data?.meta || {};
  const coords = meta.coordsSourceCounts || {};
  const photos = meta.photoSourceCounts || {};
  return {
    label,
    llmProviders: meta.llmProviders || [],
    uniqueRatio: meta.uniqueRatio ?? null,
    completionRounds: meta.completionRounds ?? null,
    perDay: perDay.join(","),
    perDayTarget: meta.perDayTarget ?? null,
    totalActivities: acts.length,
    coordsSource: coords,
    photoSource: photos,
    tripAdvisorDisabled: meta.tripAdvisorDisabled ?? null,
    timings: data?.timings || null,
  };
}

function fmtCounts(obj) {
  if (!obj || typeof obj !== "object") return "(n/a)";
  return Object.entries(obj)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
}

const groqPath = process.argv[2];
const deepPath = process.argv[3];
if (!groqPath || !deepPath) {
  console.error("Usage: node scripts/compare-tenerife-llm.mjs <groq-ref.json> <deepseek-run.json>");
  process.exit(1);
}

const groq = metrics(load(groqPath), "Groq ref");
const deep = metrics(load(deepPath), "DeepSeek");

console.log("\n=== Comparaison Ténérife 8j×4 (DISABLE_TRIPADVISOR=1) ===\n");
console.log("| Métrique | Groq ref | DeepSeek |");
console.log("|----------|----------|----------|");
console.log(`| llmProviders | ${groq.llmProviders.join("+") || "?"} | ${deep.llmProviders.join("+") || "?"} |`);
console.log(`| uniqueRatio | ${groq.uniqueRatio} | ${deep.uniqueRatio} |`);
console.log(`| completionRounds | ${groq.completionRounds} | ${deep.completionRounds} |`);
console.log(`| perDay (cible ${groq.perDayTarget ?? 4}) | ${groq.perDay} | ${deep.perDay} |`);
console.log(`| totalActivities | ${groq.totalActivities} | ${deep.totalActivities} |`);
console.log(`| coordsSource | ${fmtCounts(groq.coordsSource)} | ${fmtCounts(deep.coordsSource)} |`);
console.log(`| photoSource | ${fmtCounts(groq.photoSource)} | ${fmtCounts(deep.photoSource)} |`);
console.log(`| totalMs | ${groq.timings?.totalMs ?? "?"} | ${deep.timings?.totalMs ?? "?"} |`);
console.log("");

const perDayOk = (m) => {
  const parts = String(m.perDay || "").split(",").map(Number);
  const target = Number(m.perDayTarget) || 4;
  return parts.length === 8 && parts.every((n) => n === target);
};

const checks = [
  ["Contrat perDay 4×8", perDayOk(groq), perDayOk(deep)],
  ["uniqueRatio ≥ 0.9", (groq.uniqueRatio ?? 0) >= 0.9, (deep.uniqueRatio ?? 0) >= 0.9],
  ["100% coords (no none)", !(groq.coordsSource?.none > 0), !(deep.coordsSource?.none > 0)],
];

for (const [name, gOk, dOk] of checks) {
  console.log(`${name}: Groq ${gOk ? "✓" : "✗"} | DeepSeek ${dOk ? "✓" : "✗"}`);
}
