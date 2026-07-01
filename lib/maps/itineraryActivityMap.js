import {
  extractItineraryBulletPlaceHint,
  inferItineraryBulletCity,
} from "../images/itineraryPlaceExtract.js";

const geoCache = new Map();
const inflight = new Map();

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function includesPlace(hay, needle) {
  const h = norm(hay);
  const n = norm(needle);
  if (!h || !n) return false;
  return h.includes(n) || n.includes(h.split(",")[0]);
}

/** Nettoie le libellé pour une recherche cartographique plus précise. */
function cleanPlaceForMapSearch(hint) {
  return String(hint || "")
    .replace(/^(?:visite|visit(?:er|ing)?|exploration|découverte|découvrir)\s+(?:de\s+(?:la|le|l'|les)\s+)?/iu, "")
    .replace(/^(?:la|le|les|l')\s+/iu, "")
    .replace(/[，,。.!！?？;；].*$/, "")
    .trim();
}

export function buildItineraryActivityMapQuery(bullet, cityLabel, dayTitle = "") {
  const rawHint = extractItineraryBulletPlaceHint(bullet, dayTitle);
  const hint = cleanPlaceForMapSearch(rawHint) || rawHint;
  if (!hint) return "";
  const city = inferItineraryBulletCity(hint, cityLabel) || String(cityLabel || "").trim();
  const parts = [hint];
  if (city && !includesPlace(hint, city)) parts.push(city);
  return parts.filter(Boolean).join(", ");
}

async function geocodeWithNominatim(query, language) {
  const q = String(query || "").trim();
  if (q.length < 2) return null;
  const lang = String(language || "fr").toLowerCase().split("-")[0] || "fr";
  const cacheKey = `${norm(q)}::${lang}`;
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey);
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const run = (async () => {
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0` +
        `&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const rows = await resp.json();
      const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!first) return null;
      const lat = Number(first.lat);
      const lon = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const result = {
        lat,
        lon,
        label: String(first.display_name || q).trim(),
      };
      geoCache.set(cacheKey, result);
      return result;
    } catch {
      return null;
    } finally {
      if (inflight.get(cacheKey) === run) inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, run);
  return run;
}

async function geocodeWithOpenMeteo(query, language) {
  const q = String(query || "").trim();
  if (q.length < 2) return null;
  const lang = String(language || "fr").toLowerCase().split("-")[0] || "fr";
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
      `&count=1&language=${encodeURIComponent(lang)}&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const row = Array.isArray(json?.results) ? json.results[0] : null;
    if (!row || row.latitude == null || row.longitude == null) return null;
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const labelParts = [row.name, row.admin1, row.country].filter(Boolean);
    return { lat, lon, label: labelParts.join(", ") || q };
  } catch {
    return null;
  }
}

export function isAppleMapsPlatform() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Ouvre Google Maps ou Apple Maps (iOS / iPadOS / macOS tactile). */
export function openExternalMaps({ lat, lon, label, query }) {
  const name = String(label || query || "").trim();
  const q = String(query || name).trim();
  if (!q && !Number.isFinite(lat)) return false;

  const apple = isAppleMapsPlatform();
  let url;

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    url = apple
      ? `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(name || q)}`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  } else if (apple) {
    url = `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * Géolocalise une activité d'itinéraire puis ouvre la carte native / web.
 * @returns {Promise<boolean>}
 */
export async function openItineraryActivityMap({ bullet, cityLabel, dayTitle, language }) {
  const query = buildItineraryActivityMapQuery(bullet, cityLabel, dayTitle);
  if (!query) return false;

  const placeHint = extractItineraryBulletPlaceHint(bullet, dayTitle);
  let geo = await geocodeWithNominatim(query, language);
  if (!geo) geo = await geocodeWithOpenMeteo(query, language);

  return openExternalMaps({
    lat: geo?.lat,
    lon: geo?.lon,
    label: geo?.label || placeHint || query,
    query,
  });
}
