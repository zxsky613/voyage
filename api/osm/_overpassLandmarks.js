/**
 * Repères nommés via OpenStreetMap (Overpass) — retry + User-Agent + endpoints de repli.
 */

import {
  osmLandmarksServerCacheKey,
  readOsmLandmarksServerCache,
  writeOsmLandmarksServerCache,
} from "./_landmarksCache.js";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const OVERPASS_USER_AGENT = "JustTrip/1.0 (https://justtrip.fr; guide-landmarks)";

const NAME_JUNK =
  /parking|toilet|\bwc\b|tankstelle|diesel|car wash|^\s*bus stop\s*$|friedhof|cemetery|fuel|gas station|atm\b|cash machine/i;

/** Libellé affiché selon la langue UI (tags OSM name:xx). */
function pickLocalizedNameFromOsmTags(tags, preferredLang) {
  if (!tags || typeof tags !== "object") return "";
  const code = String(preferredLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  const tryKeys = [];
  if (code === "fr") {
    tryKeys.push("name:fr", "name:fr-CH", "name:fr-FR", "name:fr-BE");
  } else if (code === "de") {
    tryKeys.push("name:de", "name:de-DE", "name:de-AT", "name:de-CH");
  } else if (code === "es") {
    tryKeys.push("name:es", "name:es-ES", "name:es-MX");
  } else if (code === "it") {
    tryKeys.push("name:it", "name:it-IT", "name:it-CH");
  } else if (code === "zh") {
    tryKeys.push("name:zh", "name:zh-CN", "name:zh-TW", "name:cmn", "name:zh-Hans", "name:zh-Hant");
  } else {
    tryKeys.push(`name:${code}`);
  }
  for (const key of tryKeys) {
    const s = String(tags[key] || "").trim();
    if (s.length >= 2) return s;
  }
  const en = String(tags["name:en"] || "").trim();
  if (en.length >= 2) return en;
  return String(tags.name || "").trim();
}

function scoreOsmTags(tags) {
  if (!tags || typeof tags !== "object") return 0;
  const amen = String(tags.amenity || "").toLowerCase();
  if (/^museum$|^arts_centre$|^theatre$|^cinema$/.test(amen)) return 6;
  if (amen === "place_of_worship") return 4;
  if (amen === "library") return 3;
  const tour = String(tags.tourism || "").toLowerCase();
  const hist = String(tags.historic || "").toLowerCase();
  const leis = String(tags.leisure || "").toLowerCase();
  if (/museum|gallery|artwork/.test(tour)) return 6;
  if (tour === "attraction" || tour === "viewpoint") return 5;
  if (hist && /castle|ruins|monument|archaeological|memorial|palace|city_gate|church|cathedral|wayside_chapel/.test(hist))
    return 5;
  if (tour) return 3;
  if (hist) return 3;
  if (leis === "park") return 2;
  return 1;
}

export function parseOverpassToRankedNames(elements, preferredLang = "fr") {
  if (!Array.isArray(elements)) return [];
  const scored = [];
  for (const el of elements) {
    const tags = el?.tags && typeof el.tags === "object" ? el.tags : null;
    if (!tags) continue;
    const defaultName = String(tags.name || "").trim();
    if (defaultName.length < 3 || defaultName.length > 110) continue;
    if (NAME_JUNK.test(defaultName)) continue;
    const name = pickLocalizedNameFromOsmTags(tags, preferredLang) || defaultName;
    if (name.length < 2 || name.length > 110) continue;
    if (NAME_JUNK.test(name)) continue;
    scored.push({ name, score: scoreOsmTags(tags) });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const seen = new Set();
  const out = [];
  for (const { name } of scored) {
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length >= 28) break;
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildOverpassQuery(lat, lon, r) {
  return `[out:json][timeout:55];
(
  nwr["name"]["tourism"](around:${r},${lat},${lon});
  nwr["name"]["historic"](around:${r},${lat},${lon});
  nwr["name"]["amenity"="museum"](around:${r},${lat},${lon});
  nwr["name"]["amenity"="place_of_worship"](around:${r},${lat},${lon});
);
out center 48;`;
}

async function postOverpass(endpoint, query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 28000);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": OVERPASS_USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Overpass HTTP ${resp.status}: ${t.slice(0, 200)}`);
    }
    return resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} [radiusMeters] défaut ~11 km autour du centre-ville
 * @param {string} [preferredLang]
 */
export async function fetchLandmarkNamesFromOverpass(lat, lon, radiusMeters = 11000, preferredLang = "fr") {
  const r = Math.min(Math.max(Math.round(Number(radiusMeters) || 11000), 2000), 25000);
  const cacheKey = osmLandmarksServerCacheKey(lat, lon, r, preferredLang);
  const cached = readOsmLandmarksServerCache(cacheKey);
  if (cached?.length) return cached;

  const query = buildOverpassQuery(lat, lon, r);
  let lastErr = null;

  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i += 1) {
    const endpoint = OVERPASS_ENDPOINTS[i];
    try {
      const json = await postOverpass(endpoint, query);
      if (json?.remark && /timed out|runtime error/i.test(String(json.remark))) {
        throw new Error(String(json.remark));
      }
      const names = parseOverpassToRankedNames(json?.elements, preferredLang);
      if (names.length) writeOsmLandmarksServerCache(cacheKey, names);
      return names;
    } catch (e) {
      lastErr = e;
      if (i < OVERPASS_ENDPOINTS.length - 1) await sleep(600);
    }
  }

  throw lastErr || new Error("Overpass unavailable");
}
