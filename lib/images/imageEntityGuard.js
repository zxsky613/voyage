import { haversineKm } from "../planner/geoCluster.js";
import { parseExtMetaValue } from "../../api/images/_headCheck.js";

/** Verrou géo image ↔ P625 destination (km). */
export const IMAGE_GEO_MISMATCH_MAX_KM = 100;

/** @type {number} */
let imageGeoMismatchLogCount = 0;

export function resetImageGeoMismatchLog() {
  imageGeoMismatchLogCount = 0;
}

export function getImageGeoMismatchLogCount() {
  return imageGeoMismatchLogCount;
}

function normalizeToponym(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Toponymes forts interdits selon le pays/région attendu (homonymes pièges).
 * @param {string} countryOrRegionToken
 * @param {string[]} allowedToponyms
 */
export function forbiddenToponymsForAnchor(countryOrRegionToken, allowedToponyms = []) {
  const country = normalizeToponym(countryOrRegionToken);
  const blob = normalizeToponym(allowedToponyms.join(" "));
  /** @type {Set<string>} */
  const out = new Set();
  const rules = [
    {
      when: /italy|italie|italia|sicily|sicile|sicilia/,
      forbid: ["buenos aires", "argentina", "argentinian", "barrio palermo", "city of buenos aires"],
    },
    {
      when: /argentina|argent/,
      forbid: ["sicily", "sicile", "sicilia", "italy", "italie", "italia", "region sicily"],
    },
    {
      when: /france|french|republique francaise/,
      forbid: ["comunidad valenciana", "valencia spain", "kingdom of spain", "espana", "spain valencia"],
    },
    {
      when: /spain|espana|espagne|spanish/,
      forbid: ["valence france", "drome", "auvergne-rhone", "france valence", "departement drome"],
    },
    {
      when: /greece|grece|hellas|greek/,
      forbid: ["libya", "libyan", "tripoli libya", "state of libya"],
    },
    {
      when: /libya|libyan/,
      forbid: ["peloponnese", "peloponese", "greece", "grece", "tripoli greece", "arcadia"],
    },
  ];
  for (const rule of rules) {
    if (rule.when.test(country) || rule.when.test(blob)) {
      for (const f of rule.forbid) out.add(f);
    }
  }
  return [...out];
}

/**
 * @param {object} ent — entité Wikidata brute
 * @param {Record<string, string[]>} geoLabelMap
 */
export function buildEntityGeoAnchor(ent, geoLabelMap) {
  const qid = String(ent?.id || "").trim();
  const p17 = (ent?.claims?.P17 || [])
    .map((c) => String(c?.mainsnak?.datavalue?.value?.id || "").trim())
    .filter(Boolean);
  const p131 = (ent?.claims?.P131 || [])
    .map((c) => String(c?.mainsnak?.datavalue?.value?.id || "").trim())
    .filter(Boolean);

  const countryLabels = p17.flatMap((id) => geoLabelMap[id] || []);
  const adminLabels = [...p17, ...p131].flatMap((id) => geoLabelMap[id] || []);
  const entityLabels = Object.values(ent?.labels || {})
    .map((l) => String(l?.value || "").trim())
    .filter(Boolean);

  const allowedToponyms = [
    ...new Set([...countryLabels, ...adminLabels, ...entityLabels].map(normalizeToponym).filter(Boolean)),
  ];

  const countryToken = normalizeToponym(countryLabels[0] || adminLabels[0] || "");
  const forbiddenToponyms = forbiddenToponymsForAnchor(countryToken, allowedToponyms);

  let lat;
  let lon;
  for (const c of ent?.claims?.P625 || []) {
    const v = c?.mainsnak?.datavalue?.value;
    lat = Number(v?.latitude);
    lon = Number(v?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) break;
  }

  return {
    qid,
    coordinates: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
    countryLabels,
    adminLabels,
    allowedToponyms,
    forbiddenToponyms,
    countryToken,
  };
}

/**
 * @param {string} raw
 * @returns {number|null}
 */
function parseGpsCoordinateComponent(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const dec = Number(s.replace(",", "."));
  if (Number.isFinite(dec)) return dec;
  const m = s.match(/([\d.]+)\s*°?\s*(\d+)?\s*['′]?\s*([\d.]+)?/);
  if (!m) return null;
  const deg = Number(m[1]);
  const min = Number(m[2] || 0);
  const sec = Number(m[3] || 0);
  if (!Number.isFinite(deg)) return null;
  let val = deg + min / 60 + sec / 3600;
  if (/[SWO]/i.test(s)) val = -val;
  return Number.isFinite(val) ? val : null;
}

/**
 * @param {import('../../lib/images/types.js').ImageCandidate} candidate
 */
export function extractImageCoordinates(candidate) {
  const directLat = Number(candidate?.imageLat ?? candidate?.latitude);
  const directLon = Number(candidate?.imageLon ?? candidate?.longitude);
  if (Number.isFinite(directLat) && Number.isFinite(directLon)) {
    return { lat: directLat, lon: directLon };
  }

  const meta = candidate?.extmetadata;
  if (meta && typeof meta === "object") {
    const latRaw = parseExtMetaValue(meta.GPSLatitude);
    const lonRaw = parseExtMetaValue(meta.GPSLongitude);
    const lat = parseGpsCoordinateComponent(latRaw);
    const lon = parseGpsCoordinateComponent(lonRaw);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }

  return null;
}

/**
 * @param {import('../../lib/images/types.js').ImageCandidate} candidate
 * @param {{ lat: number, lon: number }|null|undefined} entityCoords
 */
export function checkImageGeoAnchor(candidate, entityCoords) {
  if (!entityCoords || !Number.isFinite(entityCoords.lat) || !Number.isFinite(entityCoords.lon)) {
    return { ok: true, km: null };
  }

  const geosearchDistM = Number(candidate?.geosearchDistM);
  if (Number.isFinite(geosearchDistM) && geosearchDistM > IMAGE_GEO_MISMATCH_MAX_KM * 1000) {
    const km = geosearchDistM / 1000;
    imageGeoMismatchLogCount += 1;
    console.info(`imageGeoMismatch: ${Math.round(km)}`);
    return { ok: false, km, reason: "geosearch_dist" };
  }

  const imgCoords = extractImageCoordinates(candidate);
  if (!imgCoords) return { ok: true, km: null };

  const km = haversineKm(
    { latitude: imgCoords.lat, longitude: imgCoords.lon },
    { latitude: entityCoords.lat, longitude: entityCoords.lon }
  );
  if (km > IMAGE_GEO_MISMATCH_MAX_KM) {
    imageGeoMismatchLogCount += 1;
    console.info(`imageGeoMismatch: ${Math.round(km)}`);
    return { ok: false, km, reason: "exif_geotag" };
  }
  return { ok: true, km };
}

/**
 * @param {string} categoriesNorm
 * @param {{ allowedToponyms?: string[], forbiddenToponyms?: string[] }} geoAnchor
 */
export function checkImageCategoryToponymLock(categoriesNorm, geoAnchor) {
  const cats = normalizeToponym(categoriesNorm);
  if (!cats) return { ok: true };

  const forbidden = Array.isArray(geoAnchor?.forbiddenToponyms) ? geoAnchor.forbiddenToponyms : [];
  for (const token of forbidden) {
    const t = normalizeToponym(token);
    if (t.length >= 4 && cats.includes(t)) {
      return { ok: false, reason: `forbidden_toponym:${t}` };
    }
  }

  return { ok: true };
}

/**
 * @param {import('../../lib/images/types.js').ImageCandidate} candidate
 * @param {{ qid?: string, coordinates?: { lat: number, lon: number }|null, forbiddenToponyms?: string[], allowedToponyms?: string[] }|null|undefined} geoAnchor
 * @param {import('../../lib/images/types.js').ImageKind} kind
 */
export function passesEntityImageGuards(candidate, geoAnchor, kind = "hero") {
  if (!candidate?.url || kind !== "hero" || !geoAnchor?.qid) return true;

  const categoriesNorm = normalizeToponym(
    String(candidate?.categories || candidate?.extmetadata?.Categories || "")
  );

  const catCheck = checkImageCategoryToponymLock(categoriesNorm, geoAnchor);
  if (!catCheck.ok) return false;

  const geoCheck = checkImageGeoAnchor(candidate, geoAnchor.coordinates);
  return geoCheck.ok;
}
