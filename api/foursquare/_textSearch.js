import { getFoursquareKey } from "../_helpers.js";
import { fetchJsonWithRetry } from "../images/_fetchRetry.js";

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

  const acceptLanguage =
    locale === "zh" ? "zh-CN,zh;q=0.95,en;q=0.85" : `${locale},en;q=0.85`;
  const fields = "name,location,geocodes,categories,price,link";

  const params = new URLSearchParams({
    query: q,
    near: n,
    limit: "5",
    fields,
  });

  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(
    `https://api.foursquare.com/v3/places/search?${params}`,
    {
      headers: {
        Authorization: key,
        Accept: "application/json",
        "Accept-Language": acceptLanguage,
      },
    }
  );
  if (throttled || timedOut || !ok) return null;

  const results = Array.isArray(json?.results) ? json.results : [];
  const hit = results.find((r) => String(r?.name || "").trim().length >= 2) || results[0];
  if (!hit) return null;

  const lat = Number(hit?.geocodes?.main?.latitude ?? hit?.geocodes?.roof?.latitude);
  const lon = Number(hit?.geocodes?.main?.longitude ?? hit?.geocodes?.roof?.longitude);

  return {
    name: String(hit.name || "").trim(),
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lon) ? lon : undefined,
    priceLevel: hit?.price != null ? Number(hit.price) : undefined,
    foursquareUrl: String(hit?.link || "").trim() || undefined,
    fsqId: String(hit?.fsq_id || "").trim() || undefined,
  };
}
