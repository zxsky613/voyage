/**
 * Repères nommés via OpenStreetMap (Overpass) — sans clé API.
 * Utilisé quand Foursquare est vide ou indisponible.
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

const NAME_JUNK =
  /parking|toilet|\bwc\b|tankstelle|diesel|car wash|^\s*bus stop\s*$|friedhof|cemetery|fuel|gas station|atm\b|cash machine/i;

/** Libellé affiché selon la langue UI (tags OSM name:xx). */
function pickLocalizedNameFromOsmTags(tags, preferredLang) {
  if (!tags || typeof tags !== "object") return "";
  const code = String(preferredLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  const tryKeys = [];
  if (code === "fr") {
    tryKeys.push("name:fr", "name:fr-CH", "name:fr-FR");
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
    if (out.length >= 14) break;
  }
  return out;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} [radiusMeters] défaut ~11 km autour du centre-ville
 */
export async function fetchLandmarkNamesFromOverpass(lat, lon, radiusMeters = 11000, preferredLang = "fr") {
  const r = Math.min(Math.max(Math.round(Number(radiusMeters) || 11000), 2000), 25000);
  const query = `[out:json][timeout:25];
(
  node["name"]["tourism"](around:${r},${lat},${lon});
  way["name"]["tourism"](around:${r},${lat},${lon});
  node["name"]["historic"](around:${r},${lat},${lon});
  way["name"]["historic"](around:${r},${lat},${lon});
  node["name"]["leisure"="park"](around:${r},${lat},${lon});
  way["name"]["leisure"="park"](around:${r},${lat},${lon});
);
out center 32;`;

  const resp = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Overpass HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }
  const json = await resp.json();
  return parseOverpassToRankedNames(json?.elements, preferredLang);
}
