/**
 * Lieux notables Wikidata — classement par nombre de sitelinks (notoriété).
 * Remplace le geosearch Wikipedia brut pour les villes hors catalogue emblématique.
 */

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "JustTrip/1.0 (https://justtrip.fr; guide-wikidata-notable)";

/** Types P31/P279 acceptés — alignés sur landmark entityResolver + châteaux/ponts. */
const NOTABLE_TYPE_QIDS = [
  "Q570116", // tourist attraction
  "Q41176", // building
  "Q33506", // monument
  "Q839954", // archaeological site
  "Q16970", // church building
  "Q12280", // bridge
  "Q16560", // palace
  "Q22698", // park
  "Q23413", // castle
  "Q12518", // fortification
  "Q4989906", // historic site
  "Q3918", // museum
];

const TTL_MS = 24 * 60 * 60 * 1000;
/** @type {Map<string, { names: string[], ts: number }>} */
const store = new Map();

/** @param {number} lat @param {number} lon @param {string} locale @param {number} radiusKm */
export function wikidataNotableCacheKey(lat, lon, locale, radiusKm = 8) {
  return `${Number(lat).toFixed(3)}|${Number(lon).toFixed(3)}|${String(locale || "fr").slice(0, 2)}|${radiusKm}`;
}

/** @param {string} key */
export function readWikidataNotableCache(key) {
  const row = store.get(String(key || ""));
  if (!row) return null;
  if (Date.now() - row.ts > TTL_MS) {
    store.delete(String(key));
    return null;
  }
  return row.names;
}

/** @param {string} key @param {string[]} names */
export function writeWikidataNotableCache(key, names) {
  if (!names?.length) return;
  store.set(String(key || ""), { names: names.slice(), ts: Date.now() });
}

function buildSparqlQuery(lat, lon, uiLang, radiusKm, minSitelinks, limit) {
  const langs = String(uiLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  const labelLangs = langs === "fr" ? "fr,en" : `${langs},en,fr`;
  const typeValues = NOTABLE_TYPE_QIDS.map((q) => `wd:${q}`).join(" ");
  return `
SELECT ?placeLabel ?sitelinks WHERE {
  SERVICE wikibase:around {
    ?place wdt:P625 ?loc .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  ?place wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
  FILTER(EXISTS {
    ?place wdt:P31/wdt:P279* ?t .
    VALUES ?t { ${typeValues} }
  })
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${labelLangs}". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}`;
}

function dedupeNames(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const name = String(row?.placeLabel?.value || "").trim();
    if (name.length < 2) continue;
    const k = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} [uiLang]
 * @param {{ radiusKm?: number, minSitelinks?: number, limit?: number }} [opts]
 */
export async function fetchWikidataNotablePlaceNames(lat, lon, uiLang = "fr", opts = {}) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return [];

  const radiusKm = Math.min(15, Math.max(4, Number(opts.radiusKm) || 8));
  const minSitelinks = Math.max(3, Number(opts.minSitelinks) || 4);
  const limit = Math.min(28, Math.max(8, Number(opts.limit) || 22));
  const lang = String(uiLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";

  const cacheKey = wikidataNotableCacheKey(la, lo, lang, radiusKm);
  const cached = readWikidataNotableCache(cacheKey);
  if (cached?.length) return cached;

  const query = buildSparqlQuery(la, lo, lang, radiusKm, minSitelinks, limit);
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;

  const resp = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!resp.ok) {
    throw new Error(`Wikidata SPARQL HTTP ${resp.status}`);
  }
  const json = await resp.json();
  const names = dedupeNames(json?.results?.bindings || []);
  if (names.length) writeWikidataNotableCache(cacheKey, names);
  return names;
}
