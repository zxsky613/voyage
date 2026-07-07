/**
 * Recette guide — villes HORS catalogue emblématique (fix de classe OSM/FSQ).
 * Valide que les incontournables viennent des APIs, pas du catalogue curated.
 *
 * Villes : Split, Gand (Ghent), Ronda
 *
 * Usage: node scripts/verify-guide-off-catalog-recipe.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICONIC_PLACES_CANONICAL } from "../iconicPlacesData.js";
import { mergeMustSeePlaceCandidates, highlightObjectsToPlaceNames } from "../lib/guide/mergeMustSeePlaces.js";
import {
  sanitizeMustSeePlaces,
  pickPlacesListAfterScriptFilter,
} from "../placeGuards.js";
import { resolveTravelTips } from "../travelTipsData.js";
import { getDestinationTransportProfile } from "../lib/guide/destinationTransport.js";
import { readDestinationHighlightsCacheStale } from "../lib/planner/highlightsListCache.js";
import osmHandler from "../api/osm/landmarks.js";
import fsqHandler from "../api/foursquare/places.js";
import wikidataHandler from "../api/guide/wikidata-landmarks.js";

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

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function mockRes() {
  return {
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
}

async function callHandler(handler, body) {
  const res = mockRes();
  await handler(
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    res
  );
  return res;
}

function finalizeMustSeeForUi(rawPlaces, cityName, uiLang = "fr") {
  const sanitized = sanitizeMustSeePlaces(rawPlaces, cityName);
  const filtered = pickPlacesListAfterScriptFilter(sanitized, uiLang);
  return filtered.slice(0, 7);
}

function matchesAny(text, patterns) {
  const f = fold(text);
  return patterns.some((re) => re.test(f) || re.test(text));
}

function isMicroPoiDominant(list) {
  if (!list.length) return true;
  const microRe =
    /^museo\b|^museum\b|^galerie\b|^gallery\b|^oratorio\b|^chiesa\b|^church\b|^kapela\b|^kapelica\b|^muzej\b/i;
  const microCount = list.filter((p) => microRe.test(String(p).trim())).length;
  return microCount >= Math.ceil(list.length * 0.6);
}

/** @type {Array<{ key: string, label: string, lat: number, lon: number, landmarkPatterns: RegExp[], transportProfile?: string, transportAvoid?: RegExp[] }>} */
const CITIES = [
  {
    key: "split",
    label: "Split",
    lat: 43.5081,
    lon: 16.4402,
    landmarkPatterns: [
      /dioclet|dioklec|diokletian|palais de dioclet|palace of dioclet/i,
    ],
    transportProfile: "general",
    transportAvoid: [/\b(métro|metro)\b/i],
  },
  {
    key: "gand",
    label: "Gand",
    lat: 51.0543,
    lon: 3.7174,
    landmarkPatterns: [
      /gravensteen|chateau des comtes|castle of the counts|grafelijke/i,
      /saint.?bavon|sint.?baaf|st.?bavo|saint bavo|cath[eé]drale saint-bavon/i,
    ],
    landmarkRequireAny: true,
    transportProfile: "general",
    transportAvoid: [/\b(métro|metro)\b/i],
  },
  {
    key: "ronda",
    label: "Ronda",
    lat: 36.742,
    lon: -5.1671,
    landmarkPatterns: [/puente nuevo|pont neuf|new bridge|nuevo puente/i],
    transportProfile: "general",
    transportAvoid: [/\b(métro|metro)\b/i],
  },
];

function catalogAbsent(key, label) {
  const keys = [fold(key), fold(label), "ghent", "gent"];
  for (const k of keys) {
    assert(!ICONIC_PLACES_CANONICAL[k]?.length, `${label} ne doit pas être dans le catalogue (clé ${k})`);
  }
}

console.log("=== Recette guide hors catalogue (Split / Gand / Ronda) ===\n");

const failures = [];
const reports = [];

for (const city of CITIES) {
  console.log(`--- ${city.label} ---`);
  try {
    catalogAbsent(city.key, city.label);

    const osmRes = await callHandler(osmHandler, {
      lat: city.lat,
      lon: city.lon,
      radius: 11000,
      cityHint: city.label,
      locale: "fr",
    });
    const osmNames =
      osmRes.statusCode === 200 && Array.isArray(osmRes.body?.names) ? osmRes.body.names : [];
    if (osmRes.statusCode !== 200) {
      console.log(`  (OSM ${osmRes.statusCode} — repli Wikidata)`);
    }

    const wikidataRes = await callHandler(wikidataHandler, {
      lat: city.lat,
      lon: city.lon,
      cityHint: city.label,
      locale: "fr",
    });
    assert(wikidataRes.statusCode === 200, `${city.label} Wikidata HTTP ${wikidataRes.statusCode}`);
    const wikidataNames = Array.isArray(wikidataRes.body?.names) ? wikidataRes.body.names : [];

    const fsqRes = await callHandler(fsqHandler, {
      lat: city.lat,
      lon: city.lon,
      limit: 20,
      locale: "fr",
    });
    const fsqQuota = fsqRes.statusCode === 429;
    const fsqNames =
      fsqRes.statusCode === 200 && Array.isArray(fsqRes.body?.results)
        ? fsqRes.body.results.map((r) => String(r?.name || "").trim()).filter(Boolean)
        : [];

    let highlightsNames = [];
    const hlCache = await readDestinationHighlightsCacheStale(city.label, "fr");
    if (hlCache?.highlights?.length) {
      highlightsNames = highlightObjectsToPlaceNames(hlCache.highlights);
    }

    const merged = mergeMustSeePlaceCandidates({
      iconicNames: [],
      highlightsNames,
      wikidataNames,
      osmNames,
      fsqNames,
      cap: 22,
    });

    const uiList = finalizeMustSeeForUi(merged, city.label, "fr");
    console.log(
      `  Wikidata: ${wikidataNames.length} | OSM: ${osmNames.length} | FSQ: ${fsqNames.length}${fsqQuota ? " (429)" : ""} | highlights cache: ${highlightsNames.length}`
    );
    console.log("  Must-see UI:");
    for (const p of uiList) console.log(`    • ${p}`);

    assert(wikidataNames.length >= 3, `${city.label}: Wikidata sitelinks insuffisant (${wikidataNames.length})`);

    const landmarkHit = city.landmarkRequireAny
      ? city.landmarkPatterns.some((re) => uiList.some((p) => matchesAny(p, [re])))
      : city.landmarkPatterns.every((re) => uiList.some((p) => matchesAny(p, [re])));
    if (!landmarkHit) {
      throw new Error(
        `${city.label}: monument majeur manquant (attendu: ${city.landmarkPatterns.map((r) => r.source).join(" | ")})`
      );
    }

    if (isMicroPoiDominant(uiList)) {
      throw new Error(`${city.label}: liste dominée par micro-POI/musées`);
    }

    for (const p of uiList) {
      assert(!/parking|wc|toilet|bus stop|atm\b/i.test(p), `${city.label}: POI absurde: ${p}`);
    }

    const tips = resolveTravelTips(city.key, city.label, uiList, "fr");
    assert(tips.do.length >= 3, `${city.label}: conseils insuffisants`);
    const tipsJoined = tips.do.join(" ");
    for (const re of city.transportAvoid || []) {
      assert(!re.test(tipsJoined), `${city.label}: conseil transport incohérent (${re})`);
    }
    const profile = getDestinationTransportProfile(city.key);
    if (city.transportProfile) {
      assert(profile === city.transportProfile, `${city.label}: profil transport ${profile} ≠ ${city.transportProfile}`);
    }

    console.log(`  Conseil transport: ${tips.do[1]?.slice(0, 90)}…`);
    console.log(`  OK ${city.label}\n`);
    reports.push({ city: city.label, ok: true, uiList, osm: osmNames.length, fsq: fsqNames.length });
  } catch (e) {
    const msg = String(e?.message || e);
    console.log(`  ÉCHEC: ${msg}\n`);
    failures.push({ city: city.label, error: msg });
    reports.push({ city: city.label, ok: false, error: msg });
  }
}

if (failures.length) {
  console.error(`\n❌ ${failures.length}/3 villes en échec — fix sitelinks Wikidata requis dans étape 0.`);
  for (const f of failures) console.error(`  • ${f.city}: ${f.error}`);
  process.exit(1);
}

console.log("✅ 3/3 villes hors catalogue passent avec fusion Wikidata sitelinks + OSM/FSQ (sans catalogue emblématique).");
