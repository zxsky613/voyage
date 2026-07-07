/**
 * Vérifie les constantes de jalons de progression génération.
 * Usage: node scripts/verify-generation-progress.mjs
 */
import {
  GENERATION_PHASE_ORDER,
  GENERATION_PHASE_PERCENT,
  creepCapPercent,
  tickSimulatedProgress,
  parseGenerationProgressLine,
} from "../lib/planner/generationProgress.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log("=== generation progress constants ===\n");

assert(GENERATION_PHASE_ORDER.length === 6, "6 phases attendues");
assert(GENERATION_PHASE_PERCENT.candidates === 15, "candidates 15%");
assert(GENERATION_PHASE_PERCENT.verification === 40, "verification 40%");
assert(GENERATION_PHASE_PERCENT.positions === 60, "positions 60%");
assert(GENERATION_PHASE_PERCENT.photos === 75, "photos 75%");
assert(GENERATION_PHASE_PERCENT.composition === 95, "composition 95%");
assert(GENERATION_PHASE_PERCENT.ready === 100, "ready 100%");

assert(creepCapPercent(15) === 38, "creep cap après 15% = 38%");
assert(creepCapPercent(95) === 98, "creep cap après 95% = 98%");

let display = 15;
for (let i = 0; i < 200; i += 1) {
  display = tickSimulatedProgress(display, 15, creepCapPercent(15));
}
assert(display <= 38 && display > 15, "simulation ne dépasse pas le cap");

const evt = parseGenerationProgressLine(
  JSON.stringify({ type: "progress", phase: "verification", percent: 40 })
);
assert(evt?.phase === "verification" && evt.percent === 40, "parse NDJSON ligne");

console.log("  Phases:", GENERATION_PHASE_ORDER.join(" → "));
console.log("\n✅ Jalons + simulation monotone OK.");
