/**
 * Juge vision héros — prompt, croisement signaux froids, politique d'action.
 */
import {
  extractCommonsFileTitleFromUrl,
  HERO_QUALITY,
  isSubjectlessHeroFilename,
  scoreHeroSuspicion,
  shouldBlockHeroImage,
} from "./heroQualityRules.js";

/** @typedef {'excellent'|'acceptable'|'reject'} HeroVisionVerdict */
/** @typedef {'accept'|'auto_reject'|'review_reject'|'review'} HeroVisionPolicy */

export const HERO_VISION_THUMB_WIDTH = 640;

export const HERO_VISION_SHOWS = Object.freeze([
  "landscape",
  "beach",
  "landmark",
  "cityscape",
  "interior",
  "sign",
  "satellite",
  "parking",
  "people",
  "other",
]);

/**
 * Cas de référence recette vision (sans appel API en mode mock).
 * @type {Array<{ id: string, destination: string, url: string, fileTitle?: string, heroSource?: string, expectedVerdict: HeroVisionVerdict }>}
 */
export const HERO_VISION_REFERENCE_CASES = Object.freeze([
  {
    id: "annecy-subjectless",
    destination: "Annecy, France",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/2019_Annecy.jpg/1280px-2019_Annecy.jpg",
    fileTitle: "2019_Annecy.jpg",
    expectedVerdict: "reject",
  },
  {
    id: "crete-wc",
    destination: "Crete, Greece",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Besser_is_das_restroom_sign.jpg/1280px-Besser_is_das_restroom_sign.jpg",
    fileTitle: "Besser_is_das_restroom_sign.jpg",
    expectedVerdict: "reject",
  },
  {
    id: "elounda-good",
    destination: "Crete, Greece",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg/1280px-20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg",
    fileTitle: "20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg",
    heroSource: "commons-featured",
    expectedVerdict: "excellent",
  },
  {
    id: "palermo-buenos-aires",
    destination: "Palermo, Italy",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Palermo_Buenos_Aires.jpg/1280px-Palermo_Buenos_Aires.jpg",
    fileTitle: "Palermo_Buenos_Aires.jpg",
    expectedVerdict: "reject",
    categories: "palermo buenos aires argentina city neighborhoods",
  },
]);

/**
 * @param {string} destinationLabel
 * @param {string} [expectedCountry]
 */
export function buildHeroVisionJudgePrompt(destinationLabel, expectedCountry = "") {
  const dest = String(destinationLabel || "").trim() || "this destination";
  const country = String(expectedCountry || "").trim();
  const countryLine = country
    ? `\nPAYS ATTENDU : cette image est-elle plausiblement située en ${country} ? Rejette si le lieu est clairement hors de ce pays/région.\n`
    : "";
  return (
    `Tu évalues une image destinée au bandeau héro d'une app de voyage pour ${dest}.\n` +
    countryLine +
    `Réponds UNIQUEMENT en JSON valide :\n` +
    `{"verdict":"excellent|acceptable|reject","reasons":["..."],"shows":"landscape|beach|landmark|cityscape|interior|sign|satellite|parking|people|other"}\n` +
    `REJECT si : intérieur, panneau/enseigne, parking/zone commerciale, vue satellite, photo floue/sombre, ` +
    `personnes en sujet principal, sans rapport avec la destination.\n` +
    `EXCELLENT si : paysage/plage/monument iconique qui donne envie de voyager.\n` +
    `ACCEPTABLE si : correct mais pas iconique (utilisable en dernier recours).`
  );
}

/**
 * @param {unknown} raw
 */
export function parseHeroVisionVerdict(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  let verdict = String(o.verdict || "").trim().toLowerCase();
  if (!["excellent", "acceptable", "reject"].includes(verdict)) verdict = "acceptable";
  const shows = String(o.shows || "other").trim().toLowerCase();
  const reasons = Array.isArray(o.reasons)
    ? o.reasons.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  return {
    verdict: /** @type {HeroVisionVerdict} */ (verdict),
    shows: HERO_VISION_SHOWS.includes(shows) ? shows : "other",
    reasons,
  };
}

/**
 * Signaux froids pour croisement.
 * @param {{ url?: string, fileTitle?: string, heroSource?: string, width?: number, height?: number }} input
 */
export function buildHeroColdSignals(input = {}) {
  const url = String(input.url || "");
  const fileTitle = String(input.fileTitle || extractCommonsFileTitleFromUrl(url));
  const suspicion = scoreHeroSuspicion({
    url,
    fileTitle,
    heroSource: input.heroSource,
    width: input.width,
    height: input.height,
  });
  return {
    fileTitle,
    suspicionScore: suspicion.score,
    suspicionReasons: suspicion.reasons,
    blocked: suspicion.blocked,
    subjectless: isSubjectlessHeroFilename(fileTitle),
    hardBlock: shouldBlockHeroImage(url, fileTitle),
  };
}

/**
 * Signaux froids concordants avec un rejet vision.
 * @param {{ suspicionScore?: number, blocked?: boolean, subjectless?: boolean, hardBlock?: boolean }} cold
 */
export function coldSignalsConcordantWithReject(cold = {}) {
  if (cold.hardBlock || cold.blocked) return true;
  if (cold.subjectless) return true;
  const score = Number(cold.suspicionScore) || 0;
  return score >= HERO_QUALITY.SUSPICION_REVIEW_THRESHOLD;
}

/**
 * Verdict effectif après croisement vision + froid (recette / rapport).
 * @param {{ verdict?: string }} vision
 * @param {ReturnType<typeof buildHeroColdSignals>} cold
 */
export function effectiveHeroVisionVerdict(vision, cold) {
  const policy = resolveHeroVisionPolicy(vision, cold);
  if (policy === "auto_reject" || policy === "review_reject") return "reject";
  if (String(vision?.verdict || "").toLowerCase() === "excellent") return "excellent";
  return String(vision?.verdict || "acceptable").toLowerCase();
}

/**
 * Politique d'action croisée vision + froid.
 * @param {{ verdict?: string }} vision
 * @param {ReturnType<typeof buildHeroColdSignals>} cold
 * @returns {HeroVisionPolicy}
 */
export function resolveHeroVisionPolicy(vision, cold) {
  const v = String(vision?.verdict || "").toLowerCase();
  const coldReject = coldSignalsConcordantWithReject(cold);

  if (cold.hardBlock || cold.blocked) return "auto_reject";
  if (cold.subjectless && v !== "excellent") return "auto_reject";

  if (v === "excellent") return "accept";
  if (v === "acceptable") {
    return coldReject ? "review" : "accept";
  }
  if (v === "reject") {
    return coldReject ? "auto_reject" : "review_reject";
  }
  return coldReject ? "review" : "accept";
}

/**
 * Mock déterministe (tests / HERO_VISION_MOCK=1) — infère depuis nom de fichier.
 * @param {string} fileTitle
 */
export function mockHeroVisionVerdictFromFileTitle(fileTitle) {
  const ft = String(fileTitle || "").toLowerCase();
  if (/besser|toilet|wc|restroom|satellite|island_of_crete|parking/.test(ft)) {
    return { verdict: /** @type {const} */ ("reject"), shows: "sign", reasons: ["mock:hard-block-filename"] };
  }
  if (/2019_annecy|^img_|^dsc_|panoramio/.test(ft)) {
    return { verdict: /** @type {const} */ ("reject"), shows: "other", reasons: ["mock:subjectless-filename"] };
  }
  if (/palermo_buenos_aires|buenos_aires/.test(ft)) {
    return {
      verdict: /** @type {const} */ ("reject"),
      shows: "cityscape",
      reasons: ["mock:homonym-palermo-buenos-aires"],
    };
  }
  if (/lac|lake|panoram|elounda|spinalonga|landscape|sunset|harbour|castle|chateau/.test(ft)) {
    return {
      verdict: /** @type {const} */ ("excellent"),
      shows: "landscape",
      reasons: ["mock:desirable-subject"],
    };
  }
  return { verdict: /** @type {const} */ ("acceptable"), shows: "cityscape", reasons: ["mock:default"] };
}
