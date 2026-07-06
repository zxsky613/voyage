/**
 * Politique TripAdvisor : hors chemin de génération par défaut.
 * TA_ENRICHMENT=off|lazy (défaut off). Legacy DISABLE_TRIPADVISOR=1 → off.
 */

/** @returns {'off'|'lazy'} */
export function getTaEnrichmentMode() {
  const legacy = String(process.env.DISABLE_TRIPADVISOR || "").trim().toLowerCase();
  if (legacy === "1" || legacy === "true" || legacy === "yes") return "off";
  const raw = String(process.env.TA_ENRICHMENT || "off").trim().toLowerCase();
  return raw === "lazy" ? "lazy" : "off";
}

/** @returns {boolean} */
export function isTaEnrichmentOff() {
  return getTaEnrichmentMode() === "off";
}

/** @returns {boolean} */
export function isTaEnrichmentLazy() {
  return getTaEnrichmentMode() === "lazy";
}

/** TripAdvisor ne participe jamais à verify / generate-itinerary. */
export function isTripAdvisorAllowedInVerify() {
  return false;
}

/** Plafond mensuel d'appels TA (mode lazy uniquement). */
export function getTaMonthlyCap() {
  const n = Number(process.env.TA_MONTHLY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200;
}

/**
 * Cache enrichissement TA ignoré dans le pipeline verify (FSQ/Nominatim seuls).
 * @param {string} source
 */
export function shouldUseEnrichmentCacheInVerify(source) {
  return String(source || "").trim().toLowerCase() !== "tripadvisor";
}
