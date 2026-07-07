/**
 * Test prod guide — villes fraîches Gérone + Bergame (hors catalogue/recette).
 * Usage: node scripts/verify-prod-guide-fresh-cities.mjs
 */
const BASE = process.env.PROD_BASE_URL || "https://www.justtrip.fr";

const CITIES = [
  {
    label: "Gérone",
    lat: 41.9794,
    lon: 2.8214,
    landmarks: [/cath[eé]drale|cathedral|santa maria|saint.?feliu|muraille|fortification|call/i],
  },
  {
    label: "Bergame",
    lat: 45.6983,
    lon: 9.6773,
    landmarks: [
      /citt[aà] alta|santa maria maggiore|colleoni|rocca|duomo|basilique|san vigilio|venice/i,
    ],
  },
];

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function post(path, body) {
  const resp = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: resp.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log(`=== Prod guide test (fresh cities) @ ${BASE} ===\n`);

/** Attendre que le déploiement expose wikidata-landmarks */
const probe = await post("/api/guide/wikidata-landmarks", { lat: 41.98, lon: 2.82, locale: "fr" });
if (probe.status === 404) {
  console.error("API wikidata-landmarks 404 — deploy pas encore prêt?");
  process.exit(2);
}

let allOk = true;
for (const city of CITIES) {
  console.log(`--- ${city.label} ---`);
  try {
    const wd = await post("/api/guide/wikidata-landmarks", {
      lat: city.lat,
      lon: city.lon,
      cityHint: city.label,
      locale: "fr",
    });
    assert(wd.status === 200, `Wikidata HTTP ${wd.status}`);
    const names = Array.isArray(wd.json?.names) ? wd.json.names : [];
    assert(names.length >= 3, `Wikidata < 3 (${names.length})`);
    console.log("  Must-see (top 7):");
    for (const n of names.slice(0, 7)) console.log(`    • ${n}`);

    const hit = city.landmarks.some((re) => names.some((n) => re.test(fold(n)) || re.test(n)));
    assert(hit, `Monument majeur manquant pour ${city.label}`);

    const microDominant = names.slice(0, 7).filter((p) => /^museo\b|^museum\b|^parking/i.test(p)).length >= 5;
    assert(!microDominant, "Liste dominée par micro-POI");

    console.log(`  OK ${city.label}`);
  } catch (e) {
    allOk = false;
    console.log(`  ÉCHEC: ${e.message}`);
  }
}

if (!allOk) process.exit(1);
console.log("\n✅ Gérone + Bergame — prod OK (Wikidata must-see majeurs).");
