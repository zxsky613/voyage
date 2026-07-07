/**
 * Recette Palerme — étape 0 verte si cathédrale / Chapelle Palatine / Quattro Canti
 * apparaissent dans les incontournables (pas micro-musées FSQ/OSM en tête).
 *
 * Usage: node scripts/verify-guide-palermo-recipe.mjs
 */
import { ICONIC_PLACES_CANONICAL } from "../iconicPlacesData.js";
import { mergeMustSeePlaceCandidates } from "../lib/guide/mergeMustSeePlaces.js";
import { sanitizeMustSeePlaces, pickPlacesListAfterScriptFilter } from "../placeGuards.js";

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function clampLikeUi(raw, city, uiLang = "fr") {
  const sanitized = sanitizeMustSeePlaces(raw, city);
  const filtered = pickPlacesListAfterScriptFilter(sanitized, uiLang);
  return filtered.slice(0, 7);
}

console.log("=== Recette guide Palerme (qualité incontournables) ===\n");

const iconic = ICONIC_PLACES_CANONICAL.palermo || [];
assert(iconic.length >= 5, "catalogue palermo emblématique");

/** Micro-musées / POI FSQ typiques qui ne doivent pas éclipser le catalogue */
const fsqNoise = [
  "Museo del Costume",
  "Museo delle Marionette",
  "Museo Archeologico Regionale",
  "Oratorio di San Lorenzo",
  "Chiesa di San Cataldo",
];
const osmNoise = ["Museo Civico", "Fontana Pretoria"];

const merged = mergeMustSeePlaceCandidates({
  iconicNames: iconic,
  highlightsNames: [],
  osmNames: osmNoise,
  fsqNames: fsqNoise,
  cap: 22,
});

const uiList = clampLikeUi(merged, "Palerme");
console.log("Incontournables UI (top 7):");
for (const p of uiList) console.log(`  • ${p}`);

const folded = uiList.map(fold).join(" | ");
assert(/cathedrale|cath[eé]drale de palerme/i.test(folded), "manque Cathédrale de Palerme");
assert(/chapelle palatine|palais des normands/i.test(folded), "manque Chapelle Palatine / Palais des Normands");
assert(/quattro canti/i.test(folded), "manque Quattro Canti");

const microOnly = uiList.every((p) => /^museo|museum|oratorio|chiesa/i.test(p));
assert(!microOnly, "liste entièrement micro-musées — merge priorité incorrecte");

console.log("\nOK — Palerme affiche les monuments iconiques attendus.");
