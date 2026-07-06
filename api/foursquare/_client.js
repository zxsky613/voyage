import { getFoursquareKey } from "../_helpers.js";

/** Places API (2025) — remplace api.foursquare.com/v3 pour les Service Keys. */
export const FOURSQUARE_PLACES_BASE = "https://places-api.foursquare.com";
export const FOURSQUARE_PLACES_API_VERSION = "2025-06-17";

/**
 * @param {string} [locale]
 */
export function foursquarePlacesHeaders(locale = "fr") {
  const key = getFoursquareKey();
  const acceptLanguage =
    locale === "zh" ? "zh-CN,zh;q=0.95,en;q=0.85" : `${locale},en;q=0.85`;
  return {
    Authorization: `Bearer ${key}`,
    "X-Places-Api-Version": FOURSQUARE_PLACES_API_VERSION,
    Accept: "application/json",
    "Accept-Language": acceptLanguage,
  };
}

/**
 * @param {object|null|undefined} hit
 */
export function mapFoursquarePlaceHit(hit) {
  if (!hit || typeof hit !== "object") return null;
  const fsqId = String(hit.fsq_place_id || hit.fsq_id || "").trim();
  const lat = Number(
    hit.latitude ?? hit?.geocodes?.main?.latitude ?? hit?.geocodes?.roof?.latitude
  );
  const lon = Number(
    hit.longitude ?? hit?.geocodes?.main?.longitude ?? hit?.geocodes?.roof?.longitude
  );
  let link = String(hit.link || "").trim();
  if (link.startsWith("/places/")) link = `https://foursquare.com${link}`;

  const categories = Array.isArray(hit.categories)
    ? hit.categories
        .map((c) => ({
          id: String(c?.fsq_category_id || c?.id || "").trim() || undefined,
          name: String(c?.name || "").trim() || undefined,
        }))
        .filter((c) => c.name)
    : undefined;

  return {
    name: String(hit.name || "").trim(),
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lon) ? lon : undefined,
    priceLevel: hit?.price != null ? Number(hit.price) : undefined,
    foursquareUrl: link || undefined,
    fsqId: fsqId || undefined,
    fsqCategories: categories?.length ? categories : undefined,
  };
}
