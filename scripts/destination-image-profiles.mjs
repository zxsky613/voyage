/**
 * Règles visuelles pour les images « destination » (script fetch + doc pour l’app).
 * - beach : ville côtière / plage
 * - skyline : grand centre-ville moderne
 * - heritage : patrimoine, culte, médina
 * - landmark : monument ou symbole mondialement reconnu (Tour Eiffel, Colisée, etc.)
 */

export const VISUAL_BEACH = "beach";
export const VISUAL_SKYLINE = "skyline";
export const VISUAL_HERITAGE = "heritage";
export const VISUAL_LANDMARK = "landmark";

/** Phrases Commons (anglais) par clé ville — utilisées en priorité si profil landmark */
export const LANDMARK_SEARCH_PHRASES_BY_KEY = {
  paris: ["Eiffel Tower Paris", "Tour Eiffel Paris view"],
  pisa: ["Leaning Tower of Pisa"],
  pise: ["Leaning Tower of Pisa"],
  rome: ["Colosseum Rome", "Roman Colosseum"],
  london: ["Big Ben London Thames", "Tower Bridge London"],
  berlin: ["Brandenburg Gate Berlin", "Brandenburger Tor Berlin"],
  istanbul: ["Hagia Sophia Istanbul", "Blue Mosque Istanbul"],
  athenes: ["Acropolis Athens", "Parthenon Athens"],
  athens: ["Acropolis Athens", "Parthenon Athens"],
  gizeh: ["Pyramids of Giza", "Great Sphinx Giza"],
  giza: ["Pyramids of Giza", "Great Sphinx Giza"],
  agra: ["Taj Mahal Agra"],
  petra: ["Al-Khazneh Petra", "Petra Treasury Jordan"],
};

/** Clé = normalizeKey(nom canon ou alias), valeur = classe visuelle */
const BY_CITY_KEY = {
  // —— Plage / littoral ——
  nice: VISUAL_BEACH,
  monaco: VISUAL_BEACH,
  miami: VISUAL_BEACH,
  phuket: VISUAL_BEACH,
  bali: VISUAL_BEACH,
  dubai: VISUAL_BEACH,
  sydney: VISUAL_BEACH,
  barcelona: VISUAL_BEACH,
  "rio de janeiro": VISUAL_BEACH,
  "cape town": VISUAL_BEACH,
  auckland: VISUAL_BEACH,
  paphos: VISUAL_BEACH,
  marseille: VISUAL_BEACH,
  bordeaux: VISUAL_BEACH,
  "los angeles": VISUAL_BEACH,
  "san francisco": VISUAL_BEACH,
  vancouver: VISUAL_BEACH,
  "abu dhabi": VISUAL_BEACH,
  doha: VISUAL_BEACH,
  tunis: VISUAL_BEACH,
  alger: VISUAL_BEACH,
  "le caire": VISUAL_HERITAGE,

  // —— Skyline / métropoles ——
  "new york": VISUAL_SKYLINE,
  shanghai: VISUAL_SKYLINE,
  guangzhou: VISUAL_SKYLINE,
  canton: VISUAL_SKYLINE,
  singapore: VISUAL_SKYLINE,
  chicago: VISUAL_SKYLINE,
  tokyo: VISUAL_SKYLINE,
  seoul: VISUAL_SKYLINE,
  toronto: VISUAL_SKYLINE,
  melbourne: VISUAL_SKYLINE,
  frankfurt: VISUAL_SKYLINE,

  // —— Monuments emblématiques ——
  paris: VISUAL_LANDMARK,
  pisa: VISUAL_LANDMARK,
  pise: VISUAL_LANDMARK,
  london: VISUAL_LANDMARK,
  berlin: VISUAL_LANDMARK,
  istanbul: VISUAL_LANDMARK,
  rome: VISUAL_LANDMARK,
  athenes: VISUAL_LANDMARK,
  athens: VISUAL_LANDMARK,
  gizeh: VISUAL_LANDMARK,
  giza: VISUAL_LANDMARK,
  agra: VISUAL_LANDMARK,
  petra: VISUAL_LANDMARK,

  // —— Patrimoine, culte, médinas ——
  beijing: VISUAL_HERITAGE,
  pekin: VISUAL_HERITAGE,
  marrakech: VISUAL_HERITAGE,
  kyoto: VISUAL_HERITAGE,
  venise: VISUAL_HERITAGE,
  prague: VISUAL_HERITAGE,
  vienne: VISUAL_HERITAGE,
  budapest: VISUAL_HERITAGE,
  vienna: VISUAL_HERITAGE,
  jerusalem: VISUAL_HERITAGE,
  jakarta: VISUAL_HERITAGE,

  // —— Défauts raisonnables ——
  amsterdam: VISUAL_SKYLINE,
  lyon: VISUAL_SKYLINE,
  lille: VISUAL_SKYLINE,
  toulouse: VISUAL_SKYLINE,
  nantes: VISUAL_SKYLINE,
  bruxelles: VISUAL_SKYLINE,
  lisbonne: VISUAL_SKYLINE,
  porto: VISUAL_HERITAGE,
  madrid: VISUAL_SKYLINE,
  milan: VISUAL_SKYLINE,
  osaka: VISUAL_SKYLINE,
};

export function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * @param {string} cityKeyOrLabel — ex. "Marrakech", "new york", "Shanghai"
 * @returns {"beach"|"skyline"|"heritage"|"landmark"}
 */
export function getVisualClassForCity(cityKeyOrLabel) {
  const k = normalizeKey(cityKeyOrLabel);
  if (BY_CITY_KEY[k]) return BY_CITY_KEY[k];
  const parts = k.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    if (BY_CITY_KEY[p]) return BY_CITY_KEY[p];
  }
  return VISUAL_SKYLINE;
}

/**
 * Phrases de recherche Commons (namespace Fichier), du plus spécifique au plus large.
 * @param {"beach"|"skyline"|"heritage"|"landmark"} visualClass
 * @param {string} label — nom usuel EN ou FR pour la recherche
 * @param {string} [keyHint] — clé ville (ex. "Paris") pour LANDMARK_SEARCH_PHRASES_BY_KEY
 */
export function buildCommonsSearchPhrases(visualClass, label, keyHint) {
  const name = String(label || "").trim();
  if (!name) return [];
  const nk = normalizeKey(keyHint || name);
  if (visualClass === VISUAL_LANDMARK) {
    const specific = LANDMARK_SEARCH_PHRASES_BY_KEY[nk];
    const tail = [
      `${name} famous landmark`,
      `${name} iconic monument`,
      `${name} historic landmark`,
    ];
    if (specific?.length) return [...specific, ...tail];
    return [
      `${name} famous landmark`,
      `${name} iconic monument`,
      `${name} unesco world heritage`,
      ...tail,
    ];
  }
  if (visualClass === VISUAL_BEACH) {
    return [
      `${name} beach`,
      `${name} coast`,
      `${name} seaside`,
      `${name} bay waterfront`,
    ];
  }
  if (visualClass === VISUAL_HERITAGE) {
    return [
      `${name} mosque`,
      `${name} temple`,
      `${name} medina`,
      `${name} historic center`,
      `${name} palace landmark`,
      `${name} old city architecture`,
    ];
  }
  return [
    `${name} skyline`,
    `${name} downtown`,
    `${name} cityscape`,
    `${name} central business district`,
  ];
}
