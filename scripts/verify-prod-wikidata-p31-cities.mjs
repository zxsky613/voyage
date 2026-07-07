/**
 * Recette prod P31 — Palerme + ville froide (Bologne), sans stade/université.
 * Usage: node scripts/verify-prod-wikidata-p31-cities.mjs
 */
const BASE = process.env.PROD_BASE_URL || "https://www.justtrip.fr";

const FORBIDDEN = [
  /\bstadio\b/i,
  /\bstadium\b/i,
  /renzo\s*barbera/i,
  /\buniversit/i,
  /\buniversity\b/i,
  /\bhospital\b/i,
  /\bh[oô]pital\b/i,
  /\bgare\b/i,
  /\brailway\s+station\b/i,
];

const CITIES = [
  { label: "Palerme", lat: 38.1157, lon: 13.3615, minNames: 4 },
  { label: "Bologne", lat: 44.4949, lon: 11.3426, minNames: 4 },
];

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function post(body) {
  const resp = await fetch(`${BASE}/api/guide/wikidata-landmarks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, bypassCache: true, purgeCache: true }),
  });
  const json = await resp.json().catch(() => ({}));
  return { status: resp.status, json };
}

console.log(`=== Prod Wikidata P31 cities @ ${BASE} ===\n`);

let allOk = true;
for (const city of CITIES) {
  try {
    const { status, json } = await post({
      lat: city.lat,
      lon: city.lon,
      cityHint: city.label,
      locale: "fr",
    });
    assert(status === 200 && json?.ok, `${city.label} HTTP ${status}`);
    const names = Array.isArray(json.names) ? json.names : [];
    assert(names.length >= city.minNames, `${city.label}: ${names.length} noms (< ${city.minNames})`);
    const bad = names.filter((n) => FORBIDDEN.some((re) => re.test(fold(n)) || re.test(n)));
    assert(bad.length === 0, `${city.label}: interdits → ${bad.join("; ")}`);
    console.log(`  ${city.label} OK (${names.length}) — top: ${names.slice(0, 5).join(" · ")}`);
  } catch (e) {
    allOk = false;
    console.log(`  ${city.label} ÉCHEC: ${e.message}`);
  }
}

if (!allOk) process.exit(1);
console.log("\n✅ Palerme + Bologne — must-see sans stade/université (P31).");
