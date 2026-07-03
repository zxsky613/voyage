import { resolveHeroLookupLabel } from "../../i18n/cityDisplay.js";
import {
  extractCityPrompt,
  heroImageStemFromDestination,
  stripAdministrativeCityPrefix,
} from "../../cityHeroStem.js";

/** Normalise une partie de clé cache : minuscule, sans accents, espaces unifiés. */
export function normalizeKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sépare libellé lieu et contexte géographique (région / pays).
 * Ex. « Capri, Campanie, Italie » → label « Capri », context « Campanie, Italie ».
 * Le contexte explicite (2e arg) n'est utilisé que si le label ne contient pas déjà de virgules.
 * @returns {{ searchLabel: string, context: string }}
 */
export function splitResolveImageLabelContext(label, context = "") {
  const ctxIn = String(context || "").trim();
  const rawLabel = String(label || "").trim();
  if (!rawLabel) return { searchLabel: "", context: "" };

  const parts = rawLabel.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const head =
      stripAdministrativeCityPrefix(parts[0]) ||
      heroImageStemFromDestination(parts[0]) ||
      parts[0];
    const geoContext = parts.slice(1).join(", ");
    return { searchLabel: head, context: geoContext };
  }

  if (ctxIn) {
    const searchLabel =
      heroImageStemFromDestination(rawLabel) ||
      resolveHeroLookupLabel(rawLabel) ||
      stripAdministrativeCityPrefix(extractCityPrompt(rawLabel) || rawLabel) ||
      rawLabel;
    return { searchLabel, context: ctxIn };
  }

  const searchLabel =
    heroImageStemFromDestination(rawLabel) ||
    resolveHeroLookupLabel(rawLabel) ||
    stripAdministrativeCityPrefix(extractCityPrompt(rawLabel) || rawLabel) ||
    rawLabel;
  return { searchLabel, context: "" };
}

/**
 * Clé cache image — langue UI agnostique ; contexte géo discriminante si présent.
 * Utiliser cette fonction pour lecture, écriture et seed/warmup.
 * @param {string} label
 * @param {string} [context] — contexte API explicite uniquement (pas le contexte inféré)
 */
export function normalizeLabel(label, context = "") {
  const { searchLabel, context: geoContext } = splitResolveImageLabelContext(label, context);
  const stem =
    heroImageStemFromDestination(searchLabel) ||
    resolveHeroLookupLabel(searchLabel) ||
    searchLabel;
  const base = normalizeKeyPart(stem);
  if (!base) return "";
  const ctxNorm = normalizeKeyPart(geoContext);
  return ctxNorm ? `${base}|${ctxNorm}` : base;
}

/** @deprecated Alias — préférer normalizeLabel */
export const normalizeLabelKey = normalizeLabel;

/** Libellé humain stable pour wbsearchentities (ville seule, pas le pays). */
export function resolveSearchLabel(label, context = "") {
  return splitResolveImageLabelContext(label, context).searchLabel;
}

/** Contexte pays/région par défaut pour homonymes voyage (label seul sans virgule). */
const DEFAULT_HERO_GEO_CONTEXT = {
  crete: "Greece",
  crète: "Greece",
  kreta: "Greece",
  creta: "Greece",
  capri: "Campania, Italy",
  santorini: "Greece",
  mykonos: "Greece",
  rhodes: "Greece",
  corfu: "Greece",
  zanzibar: "Tanzania",
  bali: "Indonesia",
};

/**
 * Contexte géo implicite quand l'utilisateur ne tape que le nom (ex. « Crete » → Grèce).
 * @param {string} label
 * @returns {string}
 */
export function inferDefaultHeroResolveContext(label) {
  const { searchLabel, context } = splitResolveImageLabelContext(label, "");
  if (context) return context;
  const stem = normalizeKeyPart(
    heroImageStemFromDestination(searchLabel) ||
      resolveHeroLookupLabel(searchLabel) ||
      searchLabel
  );
  return DEFAULT_HERO_GEO_CONTEXT[stem] || "";
}
