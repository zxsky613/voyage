import { getFoursquareKey } from "../_helpers.js";
import { fetchJsonWithRetry } from "../images/_fetchRetry.js";
import {
  FOURSQUARE_PLACES_BASE,
  foursquarePlacesHeaders,
  mapFoursquarePlaceHit,
} from "./_client.js";

let loggedAuthFailure = false;
function logAuthFailureOnce(status) {
  if (loggedAuthFailure) return;
  loggedAuthFailure = true;
  console.error(
    `[foursquare] AUTH ${status}: FOURSQUARE_API_KEY invalide ou révoquée — fallback coords Foursquare inopérant`
  );
}

/**
 * Recherche Foursquare par nom + ville (identité + coords). Pas de géocodage externe.
 * @param {string} query
 * @param {string} near — « Ville, Pays »
 * @param {string} [locale]
 */
export async function searchFoursquarePlace(query, near, locale = "fr") {
  const key = getFoursquareKey();
  const q = String(query || "").trim();
  const n = String(near || "").trim();
  if (!key || q.length < 2 || n.length < 2) return null;

  const params = new URLSearchParams({
    query: q,
    near: n,
    limit: "5",
    // Places API 2025 : pas de champ legacy « geocodes » ; lat/lon sont top-level.
    fields: "name,latitude,longitude,location,categories,link,fsq_place_id",
  });

  const { ok, status, json, throttled, timedOut } = await fetchJsonWithRetry(
    `${FOURSQUARE_PLACES_BASE}/places/search?${params}`,
    { headers: foursquarePlacesHeaders(locale) }
  );
  if (status === 401 || status === 403) {
    logAuthFailureOnce(status);
    return null;
  }
  if (throttled || timedOut || !ok) return null;

  const results = Array.isArray(json?.results) ? json.results : [];
  const hit = results.find((r) => String(r?.name || "").trim().length >= 2) || results[0];
  return mapFoursquarePlaceHit(hit);
}
