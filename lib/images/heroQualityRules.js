/**
 * Règles qualité héros destination — source unique (blocklist, pénalités, bonus, seuils).
 * Utilisé par wikiImageFilters, resolveImage, audit-heroes, tests anti-régression.
 */

/** Seuils dimensions / ratio pour un bandeau héro paysage. */
export const HERO_QUALITY = Object.freeze({
  MIN_LANDSCAPE_WIDTH: 1200,
  MIN_WIDTH: 1280,
  /** Largeur en dessous → +suspect en audit. */
  AUDIT_MIN_WIDTH: 1000,
  MIN_LANDSCAPE_RATIO: 1.05,
  PREFERRED_LANDSCAPE_RATIO: 1.2,
  /** Score suspicion ≥ seuil → revue humaine recommandée. */
  SUSPICION_REVIEW_THRESHOLD: 50,
});

/** Motifs → rejet dur (résolution + cache). */
export const HERO_HARD_BLOCK_PATTERNS = Object.freeze([
  { id: "satellite", re: /\b(satellite|from[_\s-]?space|sentinel|landsat|orbital|sts[_\s-]|iss(?:[_\s./-]|$))\b/i, reason: "satellite/ISS/espace" },
  { id: "map", re: /\b(map[_\s-]?of|carte[_\s-]?de|locator|location[_\s-]?map|topographic|relief[_\s-]?map|stadtplan|lageplan|openstreetmap|osm[_-])\b/i, reason: "carte/plan" },
  { id: "logo", re: /\b(logo|wordmark|coat of arms|blason|drapeau|flag_of|seal_of|emblem_of|armoiries)\b/i, reason: "logo/blason/drapeau" },
  { id: "wc", re: /\b(wc|toilet|restroom|lavatory|bathroom|urinal|washroom|besser[_\s.-]*is[_\s.-]*das)\b/i, reason: "WC/toilettes" },
  { id: "interior", re: /\b(interior|indoor|inside|museum interior)\b/i, reason: "intérieur" },
  { id: "sign", re: /\b(signpost|street[_\s-]?sign|\bsign\b|signage|notice|menu)\b/i, reason: "panneau/signalétique" },
  { id: "island_overview", re: /\bisland[_\s-]of[_\s-]/i, reason: "vue satellite « Island of »", unlessScenic: true },
]);

/** Motifs → pénalité audit (pas blocage systématique). */
export const HERO_PENALTY_PATTERNS = Object.freeze([
  { id: "panoramio", re: /\bpanoramio\b/i, score: 35, reason: "photo brute Panoramio" },
  { id: "camera_raw", re: /\b(IMG[_-]|DSC[_-]|DCIM|P\d{6}|DSCN\d|SAM_\d)/i, score: 40, reason: "photo appareil brute" },
  { id: "night", re: /\b(at_)?night\b|nocturne|nighttime|_night\.|twilight|dusk|after.?dark|neon|long_exposure/i, score: 30, reason: "photo de nuit" },
  { id: "people", re: /\b(wedding|portrait|selfie|bride|groom|ceremony)\b/i, score: 45, reason: "personnes/portrait" },
  { id: "monochrome", re: /\b(monochrome|black[_\s-]?and[_\s-]?white|grayscale|greyscale|noir[_\s-]?et[_\s-]?blanc|\bb&w\b)\b/i, score: 25, reason: "monochrome" },
  { id: "detail", re: /\b(close[_\s-]?up|closeup|macro|detail|texture)\b/i, score: 30, reason: "gros plan/détail" },
  { id: "construction", re: /\b(construction|roadwork|scaffolding)\b/i, score: 35, reason: "travaux/chantier" },
  { id: "aerial", re: /\b(aerial|vue[_\s-]?a[eéè]rienne|from[_\s-]?above|orthophoto)\b/i, score: 25, reason: "vue aérienne" },
]);

/** Bonus paysage explicite (annule island_overview si présent). */
export const HERO_SCENIC_BONUS_RE =
  /\b(panoram|panorama|landscape|view|vista|skyline|coast|beach|harbour|harbor|bay|lagoon|sunset|sunrise|waterfront|seaside|shoreline|mountain|valley|cliff|promenade|old[_\s-]?town|historic[_\s-]?center|views of|calanques|elounda|spinalonga|lake|lac|lago|canal|chateau|château|castle|vieille[_\s-]?ville|baie|plage)\b/i;

/** Mots « sujet désirable » — lac, vieille ville, canal… (nom de fichier ou catégories). */
export const HERO_DESIRABLE_SUBJECT_RE =
  /\b(lake|lac|lago|see|old[_\s-]?town|vieille[_\s-]?ville|canal|chateau|château|castle|harbour|harbor|port|sunset|sunrise|beach|plage|panorama|panoram|landscape|skyline|waterfront|bay|baie|mountain|montagne)\b/i;

/** Mots indiquant un sujet descriptif (pas seulement date+ville). */
export const HERO_DESCRIPTIVE_SUBJECT_RE =
  /\b(view|views|panorama|panoram|landscape|lake|lac|harbour|harbor|sunset|sunrise|castle|chateau|château|canal|old[_\s-]?town|vieille[_\s-]?ville|beach|plage|waterfront|skyline|mountain|valley|bay|baie|church|cathedral|bridge|pont|gorge|fjord|coast|plaza|square|monument|museum|musee|musée)\b/i;

/** Pénalité forte « photo sans sujet » (date+ville, IMG_, DSC_, panoramio). */
export const HERO_SUBJECTLESS_PENALTY = 220;

/** Bonus score résolution par heroSource (ordre de préférence durci). */
export const HERO_SOURCE_TIER_SCORE = Object.freeze({
  "commons-featured": 200,
  "commons-quality": 165,
  "commons-views": 115,
  "commons-landscapes": 105,
  commons: 25,
  geosearch: 10,
  p18: 8,
  pageimage: 5,
  wikivoyage: 5,
  bundle: 0,
  override: 300,
  fallback: -50,
});

/** Bonus catégories Commons émotion. */
export const HERO_EMOTIONAL_CATEGORY_BONUS = Object.freeze({
  featured: 130,
  quality: 110,
  landscapes: 85,
  views: 75,
});

/** Ajustement suspicion par heroSource (positif = plus suspect). */
export const HERO_SOURCE_SUSPICION = Object.freeze({
  geosearch: 28,
  pageimage: 18,
  p18: 12,
  wikivoyage: 10,
  commons: 5,
  bundle: 8,
  "commons-featured": -45,
  "commons-quality": -35,
  "commons-views": -28,
  "commons-landscapes": -25,
  override: -100,
  fallback: 80,
});

/**
 * Cas de référence anti-régression — tests unitaires + doc.
 * @type {Array<{ id: string, url: string, fileTitle?: string, heroSource?: string, mustBlock?: boolean, maxSuspicion?: number, minSuspicion?: number }>}
 */
export const HERO_REFERENCE_CASES = Object.freeze([
  {
    id: "wc-besser",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Besser_is_das_restroom_sign.jpg/1280px-Besser_is_das_restroom_sign.jpg",
    fileTitle: "Besser_is_das_restroom_sign.jpg",
    mustBlock: true,
  },
  {
    id: "crete-satellite",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Island_of_Crete%2C_Greece.JPG/1280px-Island_of_Crete%2C_Greece.JPG",
    fileTitle: "Island_of_Crete,_Greece.JPG",
    heroSource: "pageimage",
    mustBlock: true,
  },
  {
    id: "elounda-good",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg/1280px-20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg",
    fileTitle: "20090620_Spinalogka_Elounta_panoramic_view_from_the_mountain.jpg",
    heroSource: "commons-featured",
    maxSuspicion: 25,
  },
  {
    id: "panoramio-penalty",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/1512_2010_-_panoramio.jpg/1280px-1512_2010_-_panoramio.jpg",
    fileTitle: "1512_2010_-_panoramio.jpg",
    heroSource: "commons",
    maxSuspicion: 120,
    minSuspicion: 40,
  },
  {
    id: "annecy-subjectless",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/2019_Annecy.jpg/1280px-2019_Annecy.jpg",
    fileTitle: "2019_Annecy.jpg",
    heroSource: "commons",
    maxSuspicion: 90,
    minSuspicion: 30,
  },
  {
    id: "annecy-lake-good",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Lac_d%27Annecy_et_le_massif_des_Arpilles.jpg/1280px-Lac_d%27Annecy_et_le_massif_des_Arpilles.jpg",
    fileTitle: "Lac_d'Annecy_et_le_massif_des_Arpilles.jpg",
    heroSource: "commons-featured",
    maxSuspicion: 20,
  },
]);

/** @param {string} url */
export function extractCommonsFileTitleFromUrl(url) {
  const u = decodeURIComponent(String(url || ""));
  const m = u.match(/\/(\d+px-)?([^/?#]+)$/i);
  return m ? m[2] : "";
}

/**
 * @param {string} hay
 * @param {typeof HERO_HARD_BLOCK_PATTERNS[number]} pattern
 */
function blockPatternMatches(hay, pattern) {
  if (!pattern.re.test(hay)) return false;
  if (pattern.unlessScenic && HERO_SCENIC_BONUS_RE.test(hay)) return false;
  return true;
}

const ORBITAL_MAP_BLOCK_IDS = new Set(["satellite", "map", "island_overview"]);

/**
 * Satellite / carte / vue « Island of » — sous-ensemble des blocages durs.
 * @param {string} [url]
 * @param {string} [fileTitle]
 * @param {string} [categories]
 */
export function shouldBlockOrbitalOrMapHeroImage(url = "", fileTitle = "", categories = "") {
  if (isOrbitalCommonsCategoryName(categories)) return true;
  const ft = String(fileTitle || extractCommonsFileTitleFromUrl(url))
    .toLowerCase()
    .replace(/^file:/i, "");
  const u = String(url || "").toLowerCase();
  const hay = `${ft} ${u}`.replace(/_/g, " ");
  if (!hay.trim()) return false;
  if (/\.svg(\.png)?(?:$|\?|\/)/i.test(u)) return true;
  for (const p of HERO_HARD_BLOCK_PATTERNS) {
    if (ORBITAL_MAP_BLOCK_IDS.has(p.id) && blockPatternMatches(hay, p)) return true;
  }
  return false;
}

/**
 * Rejet dur héro (WC, satellite, carte, logo…).
 * @param {string} [url]
 * @param {string} [fileTitle]
 * @param {string} [categories]
 */
export function shouldBlockHeroImage(url = "", fileTitle = "", categories = "") {
  const ft = String(fileTitle || extractCommonsFileTitleFromUrl(url))
    .toLowerCase()
    .replace(/^file:/i, "");
  const u = String(url || "").toLowerCase();
  const cat = String(categories || "").toLowerCase();
  const hay = `${ft} ${u} ${cat}`.replace(/_/g, " ");
  if (!hay.trim()) return false;
  if (/\.svg(\.png)?(?:$|\?|\/)/i.test(u)) return true;
  for (const p of HERO_HARD_BLOCK_PATTERNS) {
    if (blockPatternMatches(hay, p)) return true;
  }
  if (/\b(toilets?|restrooms?|wc[_\s-]?signs?)\b/i.test(cat)) return true;
  return false;
}

/**
 * Score de suspicion pour audit (0 = confiance, 100+ = revue urgente).
 * @param {{ url?: string, fileTitle?: string, heroSource?: string, width?: number, height?: number, categories?: string }} input
 */
export function scoreHeroSuspicion(input = {}) {
  const url = String(input.url || "");
  const fileTitle = String(input.fileTitle || extractCommonsFileTitleFromUrl(url));
  const heroSource = String(input.heroSource || "");
  const w = Number(input.width) || 0;
  const h = Number(input.height) || 0;
  const hay = `${fileTitle} ${decodeURIComponent(url)} ${input.categories || ""}`.replace(/_/g, " ").toLowerCase();

  /** @type {string[]} */
  const reasons = [];
  let score = 0;

  if (shouldBlockHeroImage(url, fileTitle, input.categories)) {
    return { score: 999, reasons: ["hard-block"], blocked: true };
  }

  for (const p of HERO_PENALTY_PATTERNS) {
    if (p.re.test(hay)) {
      score += p.score;
      reasons.push(p.reason);
    }
  }

  const srcAdj = HERO_SOURCE_SUSPICION[heroSource];
  if (srcAdj != null) {
    score += srcAdj;
    if (srcAdj > 0) reasons.push(`source:${heroSource}`);
    else if (srcAdj < -20) reasons.push(`trusted:${heroSource}`);
  }

  if (w > 0 && w < HERO_QUALITY.AUDIT_MIN_WIDTH) {
    score += 35;
    reasons.push(`width<${HERO_QUALITY.AUDIT_MIN_WIDTH}px`);
  }
  if (w > 0 && h > 0) {
    const ratio = w / h;
    if (h >= w) {
      score += 50;
      reasons.push("portrait/square");
    } else if (ratio < HERO_QUALITY.PREFERRED_LANDSCAPE_RATIO) {
      score += 20;
      reasons.push("ratio faible");
    }
  }

  if (HERO_SCENIC_BONUS_RE.test(hay)) {
    score -= 25;
    reasons.push("bonus:paysage");
  }

  if (isSubjectlessHeroFilename(fileTitle, hay)) {
    score += 80;
    reasons.push("photo-sans-sujet");
  } else if (HERO_DESIRABLE_SUBJECT_RE.test(hay)) {
    score -= 30;
    reasons.push("bonus:sujet-desirable");
  }

  return { score: Math.max(0, score), reasons, blocked: false };
}

/**
 * Photo sans sujet : date+ville, IMG_/DSC_/panoramio sans mot descriptif.
 * @param {string} [fileTitle]
 * @param {string} [hay] — haystack déjà normalisé optionnel
 */
export function isSubjectlessHeroFilename(fileTitle = "", hay = "") {
  const ft = String(fileTitle || "")
    .replace(/^file:/i, "")
    .trim();
  const blob = String(hay || `${ft}`.replace(/_/g, " ")).toLowerCase();

  if (/\bpanoramio\b/i.test(blob)) return true;
  if (/\b(IMG[_-]|DSC[_-]|DCIM|P\d{6}|DSCN\d|SAM_\d)/i.test(blob)) return true;

  if (HERO_DESCRIPTIVE_SUBJECT_RE.test(blob)) return false;

  if (/^(?:\d{4}[_-])[a-z][a-z0-9_-]*\.(?:jpe?g|webp)$/i.test(ft.replace(/\s/g, ""))) return true;
  if (/^(?:\d{4}[-_]\d{2}[-_]\d{2})[_-][a-z][a-z0-9_-]*\.(?:jpe?g|webp)$/i.test(ft.replace(/\s/g, ""))) return true;
  if (/^(?:\d{8})[_-][a-z][a-z0-9_-]*\.(?:jpe?g|webp)$/i.test(ft.replace(/\s/g, ""))) return true;

  return false;
}

/**
 * Bonus / pénalité sujet fichier (scoring résolution live).
 * @param {string} fileTitle
 * @param {string} [categories]
 */
export function scoreHeroSubjectSignals(fileTitle = "", categories = "") {
  const ft = String(fileTitle || "").replace(/^file:/i, "");
  const hay = `${ft} ${categories || ""}`.replace(/_/g, " ").toLowerCase();
  if (isSubjectlessHeroFilename(ft, hay)) return -HERO_SUBJECTLESS_PENALTY;
  if (HERO_DESIRABLE_SUBJECT_RE.test(hay)) return 55;
  if (HERO_DESCRIPTIVE_SUBJECT_RE.test(hay)) return 28;
  return 0;
}

/** @param {string} [heroSource] */
export function scoreHeroSourceTier(heroSource = "") {
  const k = String(heroSource || "").trim();
  return HERO_SOURCE_TIER_SCORE[k] ?? 0;
}

/** @param {string} categoryName */
export function scoreEmotionalHeroCategory(categoryName) {
  const c = String(categoryName || "").toLowerCase();
  if (/^featured pictures of\b/.test(c)) return HERO_EMOTIONAL_CATEGORY_BONUS.featured;
  if (/^quality images of\b/.test(c)) return HERO_EMOTIONAL_CATEGORY_BONUS.quality;
  if (/^landscapes of\b/.test(c)) return HERO_EMOTIONAL_CATEGORY_BONUS.landscapes;
  if (/^views of\b/.test(c)) return HERO_EMOTIONAL_CATEGORY_BONUS.views;
  return 0;
}

/** @param {string} categoryName */
export function isOrbitalCommonsCategoryName(categoryName) {
  const c = String(categoryName || "").trim();
  if (!c) return false;
  if (/satellite pictures of/i.test(c)) return true;
  return /\b(maps?[_\s-]?of|carte[_\s-]?de|satellite[_\s-]?pictures[_\s-]?of)\b/i.test(c);
}

/** @param {number} width @param {number} height */
export function isHeroLandscapeDimensions(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w < HERO_QUALITY.MIN_LANDSCAPE_WIDTH) return false;
  if (h <= 0) return false;
  return w > h * HERO_QUALITY.MIN_LANDSCAPE_RATIO;
}

export const HERO_MIN_WIDTH = HERO_QUALITY.MIN_WIDTH;
export const HERO_MIN_LANDSCAPE_WIDTH = HERO_QUALITY.MIN_LANDSCAPE_WIDTH;
