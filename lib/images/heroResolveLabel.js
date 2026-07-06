import { resolveHeroLookupLabel } from "../../i18n/cityDisplay.js";
import {
  extractCityPrompt,
  heroImageStemFromDestination,
  stripAdministrativeCityPrefix,
} from "../../cityHeroStem.js";
import { inferDefaultHeroResolveContext } from "./normalizeLabel.js";

/**
 * Libellé héro envoyé à /api/images/resolve — aligné sur normalizeLabel côté serveur.
 * Toujours tige catalogue (ex. « Crete ») + contexte géo anglais implicite (ex. « Greece »),
 * jamais le libellé UI localisé (« Région Crète, Grèce »).
 * @param {string} destination
 * @param {{ city?: string, adminRegion?: string, country?: string }|null|undefined} [guide]
 * @returns {string}
 */
export function buildHeroResolveLabel(destination, guide) {
  const dest = String(destination || "").trim();
  if (dest.includes(",")) return dest;

  const cityRaw = String(guide?.city || dest).trim();
  const stripped = stripAdministrativeCityPrefix(cityRaw);
  const stem =
    resolveHeroLookupLabel(stripped) ||
    heroImageStemFromDestination(stripped) ||
    heroImageStemFromDestination(cityRaw) ||
    stripped ||
    dest;

  const inferred = inferDefaultHeroResolveContext(stem) || inferDefaultHeroResolveContext(dest);
  const fromGuide = [guide?.adminRegion, guide?.country].filter(Boolean).join(", ").trim();
  const context = inferred || fromGuide;
  return context ? `${stem}, ${context}` : stem;
}

/** @param {string} url */
export function isPersistableClientHeroUrl(url) {
  const s = String(url || "").trim();
  return s.length > 0 && /^https?:\/\//i.test(s);
}
