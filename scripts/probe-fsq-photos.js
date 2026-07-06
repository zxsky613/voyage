/**
 * Sonde photos FSQ — GET /places/{fsq_id}/photos
 * Usage: node scripts/probe-fsq-photos.js [fsq_id]
 */
import fs from "node:fs";
import { fetchFoursquarePlacePhotos } from "../api/foursquare/_placePhotos.js";
import { FOURSQUARE_PLACES_BASE, foursquarePlacesHeaders } from "../api/foursquare/_client.js";
import { getFoursquareKey } from "../api/_helpers.js";

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const fsqId = process.argv[2] || "7edd2e29899c4ccbeb647050";
const key = getFoursquareKey();
if (!key) {
  console.error("FAIL — FOURSQUARE_API_KEY absente");
  process.exit(2);
}

const url = `${FOURSQUARE_PLACES_BASE}/places/${encodeURIComponent(fsqId)}/photos?limit=5&sort=POPULAR`;
console.log("GET", url);

const resp = await fetch(url, { headers: foursquarePlacesHeaders("fr") });
const text = await resp.text();
console.log("HTTP", resp.status, resp.statusText);
console.log("Body preview:", text.slice(0, 800));

let json;
try {
  json = JSON.parse(text);
} catch {
  json = null;
}

if (Array.isArray(json)) {
  console.log("Array length:", json.length);
  if (json[0]) console.log("First photo keys:", Object.keys(json[0]).join(", "));
} else if (json && typeof json === "object") {
  console.log("Object keys:", Object.keys(json).join(", "));
  if (Array.isArray(json.results)) console.log("results length:", json.results.length);
}

const urls = await fetchFoursquarePlacePhotos(fsqId, "fr", 5);
console.log("fetchFoursquarePlacePhotos URLs:", urls.length);
for (const u of urls) console.log(" ", u);

process.exit(resp.ok && urls.length > 0 ? 0 : 1);
