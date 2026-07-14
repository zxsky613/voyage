/**
 * Contrat photo_source activités — pipeline ↔ CHECK Postgres.
 * Toute valeur émise par la cascade doit être dans ACTIVITY_PHOTO_SOURCE_DB_ALLOWED.
 * SQL : supabase/sql/activities_photo_source_check.sql
 */

/** @typedef {'tripadvisor'|'foursquare'|'wikimedia'|'wikimedia_geo'|'placeholder'|'user'} ActivityPhotoSourceDb */

/**
 * Valeurs acceptées par activities_photo_source_check (NULL = colonne omise).
 * `user` = upload manuel / édition future (hors cascade auto).
 * @type {readonly ActivityPhotoSourceDb[]}
 */
export const ACTIVITY_PHOTO_SOURCE_DB_ALLOWED = Object.freeze([
  "tripadvisor",
  "foursquare",
  "wikimedia",
  "wikimedia_geo",
  "placeholder",
  "user",
]);

/**
 * Valeurs réellement émises par la cascade persist (serveur + client).
 * Audit 2026-07-14 :
 * - _resolveActivityPhotos.js : tripadvisor | wikimedia | wikimedia_geo | placeholder
 * - inferPhotoSourceFromPlace : + foursquare (enrichissement FSQ)
 * - mapResolverSourceToPhotoSource : mappe toujours → wikimedia (jamais commons-category/unsplash/osm)
 * - buildActivityPhotoFieldsForPersist : repasse explicit ou infère ; jamais coords_source/estimated
 * @type {readonly string[]}
 */
export const ACTIVITY_PHOTO_SOURCE_PIPELINE_EMITTED = Object.freeze([
  "tripadvisor",
  "foursquare",
  "wikimedia",
  "wikimedia_geo",
  "placeholder",
]);

/** @param {string} value */
export function isActivityPhotoSourceDbAllowed(value) {
  const v = String(value || "").trim();
  if (!v) return true;
  return ACTIVITY_PHOTO_SOURCE_DB_ALLOWED.includes(/** @type {ActivityPhotoSourceDb} */ (v));
}
