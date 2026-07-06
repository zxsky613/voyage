import { getFoursquareKey } from "../_helpers.js";
import { FOURSQUARE_PLACES_BASE, foursquarePlacesHeaders } from "./_client.js";

/** Après 429 « no API credits », on évite de marteler l'endpoint photos. */
let photosCreditsExhausted = false;
let loggedCreditsExhausted = false;

export function isFoursquarePhotosCreditsExhausted() {
  return photosCreditsExhausted;
}

/** @param {object|null|undefined} photo */
export function foursquarePhotoToUrl(photo, opts = {}) {
  const prefix = String(photo?.prefix || "").trim();
  const suffix = String(photo?.suffix || "").trim();
  if (!prefix || !suffix) return "";
  const w = Math.min(Math.max(Number(opts.width) || 800, 100), 1920);
  const h = Math.min(Math.max(Number(opts.height) || 600, 100), 1920);
  return `${prefix}${w}x${h}${suffix}`;
}

/**
 * @param {unknown} json
 * @returns {object[]}
 */
function parsePhotosPayload(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.photos)) return json.photos;
  return [];
}

function logCreditsExhaustedOnce(status, message) {
  photosCreditsExhausted = true;
  if (loggedCreditsExhausted) return;
  loggedCreditsExhausted = true;
  console.error(
    `[fsq-photos] ${status} credits épuisés — GET /places/{id}/photos nécessite des crédits FSQ (freePro coords OK, photos payantes). ${String(message || "").slice(0, 160)}`
  );
}

/**
 * Photos d'un lieu FSQ — GET /places/{fsq_place_id}/photos (Places API 2025).
 * @param {string} fsqId
 * @param {string} [locale]
 * @param {number} [limit] 1–2 recommandé
 * @param {{ logContext?: string }} [opts]
 * @returns {Promise<string[]>}
 */
export async function fetchFoursquarePlacePhotos(fsqId, locale = "fr", limit = 2, opts = {}) {
  const id = String(fsqId || "").trim();
  const ctx = String(opts.logContext || "").trim();
  const logPrefix = `[fsq-photos]${ctx ? ` ${ctx}` : ""}`;

  if (!id || !getFoursquareKey()) {
    console.info(`${logPrefix} skip fsqId=${id || "(empty)"} key=${Boolean(getFoursquareKey())}`);
    return [];
  }

  if (photosCreditsExhausted) {
    console.info(`${logPrefix} skip fsqId=${id} (credits exhausted)`);
    return [];
  }

  const cap = Math.min(Math.max(Number(limit) || 2, 1), 2);
  const url =
    `${FOURSQUARE_PLACES_BASE}/places/${encodeURIComponent(id)}/photos` +
    `?limit=${cap}&sort=POPULAR`;

  console.info(`${logPrefix} request fsqId=${id} limit=${cap}`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const resp = await fetch(url, {
      headers: foursquarePlacesHeaders(locale),
      signal: ctrl.signal,
    });
    const status = resp.status;
    const text = await resp.text();

    if (!resp.ok) {
      let message = text.slice(0, 240);
      try {
        const errJson = JSON.parse(text);
        message = String(errJson?.message || message);
      } catch {
        /* ignore */
      }
      if (status === 429 && /no API credits|credit/i.test(message)) {
        logCreditsExhaustedOnce(status, message);
      } else {
        console.warn(`${logPrefix} HTTP ${status} fsqId=${id} — ${message.slice(0, 180)}`);
      }
      return [];
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.warn(`${logPrefix} HTTP 200 invalid JSON fsqId=${id} — ${text.slice(0, 120)}`);
      return [];
    }

    const rows = parsePhotosPayload(json);
    const urls = rows
      .map((row) => foursquarePhotoToUrl(row))
      .filter((u) => /^https?:\/\//i.test(u));

    if (!urls.length && rows.length) {
      console.warn(
        `${logPrefix} HTTP 200 fsqId=${id} rows=${rows.length} but 0 URL mappable — keys=${Object.keys(rows[0] || {}).join(",")}`
      );
    } else {
      console.info(`${logPrefix} OK fsqId=${id} photos=${urls.length}`);
    }
    return urls;
  } catch (e) {
    const msg = String(e?.message || e);
    console.warn(`${logPrefix} error fsqId=${id} — ${msg.slice(0, 160)}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
