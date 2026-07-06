/**
 * Sonde rapide Terra TripAdvisor — vérifie si la clé répond (200) ou est
 * rate-limitée (429) avant une recette generate-itinerary.
 *
 * Usage:
 *   node scripts/probe-tripadvisor.js
 *   node scripts/probe-tripadvisor.js "Loro Parque"
 *   node scripts/probe-tripadvisor.js "Teide" --geo Tenerife
 *
 * Code de sortie : 0 = OK, 1 = 429 (quota / rate limit), 2 = autre erreur.
 */
import fs from "node:fs";

if (fs.existsSync(".env.local")) {
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

const args = process.argv.slice(2);
let query = "Teide";
let geoName = "";
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--geo" && args[i + 1]) {
    geoName = String(args[++i]).trim();
  } else if (!args[i].startsWith("-")) {
    query = String(args[i]).trim();
  }
}

const key = String(process.env.TRIPADVISOR_API_KEY || "").trim();
if (!key) {
  console.error("FAIL: TRIPADVISOR_API_KEY absent (.env.local ou env)");
  process.exit(2);
}

const params = new URLSearchParams({
  query,
  locale: "fr-FR",
  limit: "1",
  version: "1",
});
if (geoName) params.set("geo_name", geoName);

const url = `https://terra.tripadvisor.com/api/catalog/locations/search?${params}`;
const t0 = Date.now();

let resp;
try {
  resp = await fetch(url, {
    headers: { Accept: "application/json", "X-API-KEY": key },
  });
} catch (e) {
  console.error(`FAIL: réseau — ${e?.message || e}`);
  process.exit(2);
}

const ms = Date.now() - t0;
const body = await resp.text();
let results = -1;
try {
  const json = JSON.parse(body);
  results = Array.isArray(json?.data) ? json.data.length : 0;
} catch {
  /* ignore */
}

const retryAfter = resp.headers.get("retry-after") || "";
console.log(
  `probe-tripadvisor: query=${JSON.stringify(query)} geo=${JSON.stringify(geoName || "(none)")} ` +
    `status=${resp.status} ms=${ms} results=${results}` +
    (retryAfter ? ` retry-after=${retryAfter}` : "")
);

if (!resp.ok) {
  const snippet = body.replace(/\s+/g, " ").slice(0, 200);
  console.error(`body: ${snippet}`);
  process.exit(resp.status === 429 ? 1 : 2);
}

if (results > 0) {
  try {
    const first = JSON.parse(body).data[0]?.location?.names?.[0]?.value || "";
    if (first) console.log(`firstResult: ${first}`);
  } catch {
    /* ignore */
  }
}

console.log("OK: Terra répond — recette generate-itinerary possible côté TA.");
process.exit(0);
