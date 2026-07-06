/**
 * Sonde Foursquare — teste les deux formats d'authentification (Places API
 * 2025 vs legacy v3) avec la clé FOURSQUARE_API_KEY de .env.local.
 *
 * Usage:
 *   node scripts/probe-foursquare.js
 *   node scripts/probe-foursquare.js "Loro Parque" "Puerto de la Cruz"
 *
 * Code de sortie : 0 = au moins une variante 200, 2 = toutes en échec.
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
const query = String(args[0] || "Loro Parque").trim();
const near = String(args[1] || "Puerto de la Cruz").trim();
const key = String(process.env.FOURSQUARE_API_KEY || "").trim();

if (!key) {
  console.error("FAIL: FOURSQUARE_API_KEY absent (.env.local ou env)");
  process.exit(2);
}

const PLACES_API_VERSION = "2025-06-17";

/** @param {string} label */
async function probeVariant(label, url, headers) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const body = await resp.text();
    let json = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch {
      /* ignore */
    }
    console.log(`${label}: status=${resp.status} ms=${Date.now() - t0}`);
    if (!resp.ok) {
      console.log(`  body: ${body.replace(/\s+/g, " ").slice(0, 220)}`);
    }
    return { label, status: resp.status, json, body };
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e?.name === "AbortError";
    console.log(`${label}: status=0 ms=${Date.now() - t0} error=${timedOut ? "timeout" : e?.message || e}`);
    return { label, status: 0, json: null, body: "" };
  }
}

const params = new URLSearchParams({ query, near, limit: "3" });

const newUrl = `https://places-api.foursquare.com/places/search?${params}`;
const legacyUrl = `https://api.foursquare.com/v3/places/search?${params}&fields=name,geocodes,link,fsq_id`;

console.log(`probe-foursquare: query=${JSON.stringify(query)} near=${JSON.stringify(near)}`);
console.log(`key: ${key.slice(0, 8)}… (${key.length} chars)\n`);

const newFmt = await probeVariant(
  "a) places-api (Bearer + X-Places-Api-Version)",
  newUrl,
  {
    Authorization: `Bearer ${key}`,
    "X-Places-Api-Version": PLACES_API_VERSION,
  }
);

const legacyFmt = await probeVariant(
  "b) legacy v3 (Authorization sans Bearer)",
  legacyUrl,
  { Authorization: key }
);

function extractFirstHit(json) {
  const rows = Array.isArray(json?.results) ? json.results : [];
  const hit = rows[0];
  if (!hit) return null;
  const fsqId = String(hit.fsq_id || hit.fsq_place_id || hit.place_id || hit.id || "").trim();
  const lat = Number(hit?.geocodes?.main?.latitude ?? hit?.latitude ?? hit?.location?.latitude);
  const lon = Number(hit?.geocodes?.main?.longitude ?? hit?.longitude ?? hit?.location?.longitude);
  return {
    name: String(hit.name || "").trim(),
    fsqId,
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
  };
}

let winner = null;
if (newFmt.status === 200) winner = { variant: "new", hit: extractFirstHit(newFmt.json) };
else if (legacyFmt.status === 200) winner = { variant: "legacy", hit: extractFirstHit(legacyFmt.json) };

console.log("");
if (winner?.hit?.fsqId) {
  console.log(
    `OK: variante ${winner.variant} — fsq_id=${winner.hit.fsqId} name=${JSON.stringify(winner.hit.name)}` +
      (winner.hit.lat != null ? ` lat=${winner.hit.lat} lon=${winner.hit.lon}` : "")
  );
  process.exit(0);
}

if (newFmt.status === 200 || legacyFmt.status === 200) {
  console.error("WARN: 200 mais aucun fsq_id extrait — vérifier le schéma JSON de la réponse.");
  process.exit(0);
}

console.error("FAIL: aucune variante en 200.");
process.exit(2);
