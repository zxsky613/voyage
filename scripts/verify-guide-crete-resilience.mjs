/**
 * Recette guide Crète — résilience FSQ 429 simulé, pas de geosearch brut, conseils sans métro.
 * Usage:
 *   node scripts/verify-guide-crete-resilience.mjs
 *   FSQ_SIMULATE_429=1 node scripts/verify-guide-crete-resilience.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICONIC_PLACES_CANONICAL } from "../iconicPlacesData.js";
import { mergeMustSeePlaceCandidates } from "../lib/guide/mergeMustSeePlaces.js";
import { resolveTravelTips } from "../travelTipsData.js";
import { sanitizeMustSeePlaces } from "../placeGuards.js";
import placesHandler from "../api/foursquare/places.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvLocal() {
  const fp = path.join(root, ".env.local");
  if (!fs.existsSync(fp)) return;
  for (const line of fs.readFileSync(fp, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log("=== Recette guide Crète (résilience FSQ/OSM) ===\n");

const iconic = ICONIC_PLACES_CANONICAL.crete || [];
assert(iconic.length >= 5, "catalogue crete emblématique");

const merged = mergeMustSeePlaceCandidates({
  osmNames: [],
  fsqNames: [],
  highlightsNames: [],
  iconicNames: iconic,
});
assert(merged.length >= 5, "merge avec repli iconic");

const sanitized = sanitizeMustSeePlaces(merged, "Crete");
assert(sanitized.length >= 3, "sanitize must-see Crete");
for (const p of sanitized) {
  assert(!/parking|wc|toilet|bus stop/i.test(p), `POI absurde rejeté: ${p}`);
}

const tips = resolveTravelTips("crete", "Crete", iconic, "fr");
assert(tips.do.length >= 3, "conseils crete");
const tipsJoined = tips.do.join(" ");
assert(!/\b(métro|metro)\b/i.test(tipsJoined), "pas de métro pour Crète");
assert(/voiture|bus|ferry|KTEL|Samaria/i.test(tipsJoined), "conseils transport île");

/** Simule handler FSQ 429 */
process.env.FSQ_SIMULATE_429 = "1";
const mockRes = {
  statusCode: 0,
  headers: {},
  setHeader() {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(obj) {
    this.body = obj;
    return this;
  },
  end() {},
};
await placesHandler(
  {
    method: "POST",
    headers: {},
    body: JSON.stringify({ lat: 35.3387, lon: 25.1442, limit: 20, locale: "fr" }),
  },
  mockRes
);
assert(mockRes.statusCode === 429, "FSQ simulate 429");
assert(mockRes.body?.quotaExceeded === true, "quotaExceeded flag");

delete process.env.FSQ_SIMULATE_429;

console.log("OK — iconic fallback, tips sans métro, FSQ 429 simulé proprement.");
console.log(`  Lieux catalogue: ${iconic.slice(0, 3).join(", ")}…`);
console.log(`  Conseil 1: ${tips.do[0].slice(0, 72)}…`);
