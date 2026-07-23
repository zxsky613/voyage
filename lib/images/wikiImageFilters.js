/** Motifs imagerie orbitale / cartographique — exclusion kind=hero uniquement. */
const ORBITAL_MAP_FILENAME_RE =
  /\b(satellite|from[_\s-]?space|sts[_\s-]|nasa|landsat|sentinel|orbital|aerial[_\s-]?view|vue[_\s-]?a[eéè]rienne|map[_\s-]?of|carte[_\s-]?de|topographic|relief)\b|(?:^|[_\s./-])iss(?:[_\s./-]|$)/i;

const ORBITAL_MAP_CATEGORY_RE =
  /\b(maps[_\s-]?of|carte[_\s-]?de|satellite[_\s-]?pictures[_\s-]?of|aerial[_\s-]?photographs[_\s-]?of)\b/i;

/** Vocabulaire cartographique générique (mots de carte, multilingue — pas de noms de lieux). */
const CARTOGRAPHIC_VOCAB_RE =
  /\b(locator|location[_\s-]?map|locator[_\s-]?map|map[_\s-]?of|maps?[_\s-]?of|carte|karte|mappa|mapa|kaart|harita|topographic|relief[_\s-]?map|administrative|boundaries|confini|grenzen|localisation|localizaci[oó]n|posizione|orthographic|prefecture|arrondissement)\b/i;

/** Vue d'ensemble type « Island of X » (souvent satellite NASA) — rejet héro sauf paysage explicite. */
const HERO_ISLAND_OVERVIEW_RE = /\bisland[_\s-]of[_\s-]/i;
const ORBITAL_HINT_RE =
  /\b(nasa|satellite|from[_\s-]?space|sentinel|landsat|orbital|sts[_\s-]|iss(?:[_\s./-]|$))\b/i;

/**
 * Une photo de lieu n'est jamais vectorielle → rejet universel, tout lieu confondu.
 * @param {string} [url]
 * @param {string} [fileTitle]
 */
export function isVectorWikiImageOrigin(url = "", fileTitle = "") {
  const u = String(url || "");
  const ft = String(fileTitle || "")
    .replace(/^file:/i, "")
    .trim();
  if (/\.svg(\.png)?(?:$|\?|\/)/i.test(u)) return true;
  if (/\.svg$/i.test(ft)) return true;
  return false;
}

/**
 * Imagerie orbitale / cartographique — à exclure du bandeau héro scénique au sol.
 * @param {string} [url]
 * @param {string} [fileTitle]
 * @param {string} [categories]
 */
export function isLikelyOrbitalOrMapImagery(url = "", fileTitle = "", categories = "") {
  if (isVectorWikiImageOrigin(url, fileTitle)) return true;

  const ft = String(fileTitle || "")
    .toLowerCase()
    .replace(/^file:/i, "");
  const u = String(url || "").toLowerCase();
  const cat = String(categories || "").toLowerCase();
  const hay = `${ft} ${u} ${cat}`.replace(/_/g, " ");
  if (!hay.trim()) return false;
  if (HERO_ISLAND_OVERVIEW_RE.test(hay) && ORBITAL_HINT_RE.test(hay)) return true;
  if (HERO_ISLAND_OVERVIEW_RE.test(hay) && !SCENIC_HERO_BONUS_RE.test(hay)) return true;
  if (CARTOGRAPHIC_VOCAB_RE.test(hay)) return true;
  if (ORBITAL_MAP_FILENAME_RE.test(hay)) return true;
  if (ORBITAL_MAP_CATEGORY_RE.test(hay)) return true;
  return false;
}

/** Catégorie Commons entièrement cartographique / satellite — ignorer pour héro. */
export function isOrbitalCommonsCategoryName(categoryName) {
  const c = String(categoryName || "").trim();
  if (!c) return false;
  if (/satellite pictures of/i.test(c)) return true;
  return ORBITAL_MAP_CATEGORY_RE.test(c) || /^maps?\s+of\b/i.test(c);
}

/** Bonus score catégories Commons « émotion » (Featured / Quality / Views / Landscapes). */
export function scoreEmotionalHeroCategory(categoryName) {
  const c = String(categoryName || "").toLowerCase();
  if (/^featured pictures of\b/.test(c)) return 130;
  if (/^quality images of\b/.test(c)) return 110;
  if (/^landscapes of\b/.test(c)) return 85;
  if (/^views of\b/.test(c)) return 75;
  return 0;
}

/** @param {string} url */
export function isLikelyWikiFlagOrSealThumb(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return false;
  return (
    u.includes("flag_of") ||
    u.includes("/flag/") ||
    u.includes("seal_of") ||
    u.includes("coat_of_arms") ||
    u.includes("armoiries") ||
    u.includes("emblem_of") ||
    u.includes("drapeau") ||
    u.includes("blason") ||
    u.includes("_seal.") ||
    u.includes("_badge.") ||
    u.includes("logo_")
  );
}

/**
 * Logo / wordmark / carte — à éviter pour bandeau lieu.
 * @param {string} url
 * @param {string} [fileTitle]
 */
export function isLikelyWikiBrandOrLogoImage(url, fileTitle = "") {
  if (isVectorWikiImageOrigin(url, fileTitle)) return true;

  const u = String(url || "").toLowerCase();
  const ft = String(fileTitle || "")
    .toLowerCase()
    .replace(/^file:/i, "");
  if (!u && !ft) return false;
  if (isLikelyWikiFlagOrSealThumb(url)) return true;
  const hay = `${u} ${ft}`.replace(/_/g, " ");
  if (/wordmark|lockup|branding|brand_mark|charte_graphique/i.test(hay)) return true;
  if (/logo\.svg|_logo\.|\/logo\.|_logo_|\/logos?\//i.test(hay)) return true;
  if (/\blogo\b/i.test(ft) && /\.(svg|png|gif)/i.test(ft)) return true;
  if (u.includes(".svg.png") && /logo|wordmark|emblem|icon/i.test(hay)) return true;
  if (/^file:[^|]+_logo\.(svg|png)/i.test(String(fileTitle || ""))) return true;
  if (/\bflag\b|\bcoat of arms\b|\bblason\b|\bdrapeau\b|\bembl[eè]me\b/i.test(hay)) return true;
  if (CARTOGRAPHIC_VOCAB_RE.test(hay)) return true;
  if (
    /\b(openstreetmap|osm[_-]|locator[_\s-]?map|location[_\s-]?map|map[_\s-]?of[_-]|relief[_\s-]?map|carte[_-]|karte[_-]|plan[_-]d|stadtplan|lageplan)\b/i.test(
      hay
    )
  ) {
    return true;
  }
  if (/\bmap\.(?:svg|png)\b/i.test(hay)) return true;
  return false;
}

export const HERO_MIN_WIDTH = 1280;
/** Largeur minimale pour un bandeau héro (plus strict que le filtre source). */
export const HERO_MIN_LANDSCAPE_WIDTH = 1200;

/** Objet / scène urbaine non touristique, monochrome, détail — hors sujet pour héro destination. */
const NON_SCENIC_HERO_FILENAME_RE =
  /\b(wc|toilet|restroom|lavatory|bathroom|urinal|washroom|ladies|gents|besser[_\s.-]*is[_\s.-]*das|barrel|drum|cask|keg|pigeon|pigeons|dove|doves|sparrow|trash|rubbish|dumpster|garbage|litter|graffiti|plaque|inscription|signpost|street[_\s-]?sign|\bsign\b|signage|interior|indoor|inside|door|menu|notice|bus[_\s-]?stop|parking|construction|roadwork|road[_\s-]?work|close[_\s-]?up|closeup|macro|detail|texture|monochrome|black[_\s-]?and[_\s-]?white|black[_\s-]?white|grayscale|greyscale|noir[_\s-]?et[_\s-]?blanc|sepia|desaturated|\bb&w\b|\bb\/w\b|portrait|selfie|screenshot)\b/i;

const SCENIC_HERO_BONUS_RE =
  /\b(panoram|panorama|landscape|view|vista|skyline|coast|beach|harbour|harbor|bay|lagoon|aerial|sunset|sunrise|waterfront|seaside|shoreline|mountain|valley|cliff|promenade|old[_\s-]?town|historic[_\s-]?center|views of)\b/i;

const SCENIC_HERO_CATEGORY_RE =
  /\b(views of|landscape|panorama|panoramic|coast|harbour|harbor|skyline|aerial view of)\b/i;

/**
 * Fichier Commons / URL peu représentatif d'une destination (objet, oiseaux sans paysage, N&B…).
 * @param {string} [url]
 * @param {string} [fileTitle]
 * @param {string} [categories]
 */
export function isLikelyNonScenicHeroImagery(url = "", fileTitle = "", categories = "") {
  const ft = String(fileTitle || "").toLowerCase().replace(/^file:/i, "");
  const u = String(url || "").toLowerCase();
  const cat = String(categories || "").toLowerCase();
  const hay = `${ft} ${u} ${cat}`.replace(/_/g, " ");
  if (!hay.trim()) return false;
  if (NON_SCENIC_HERO_FILENAME_RE.test(hay)) return true;
  if (/\b(toilets?|restrooms?|public[_\s-]?toilets?|water[_\s-]?closets?|wc[_\s-]?signs?)\b/i.test(cat)) return true;
  if (
    /\b(bird|birds|pigeon|dove|sparrow|animal|fauna)\b/i.test(hay) &&
    !/\b(panorama|landscape|skyline|harbour|harbor|lagoon|aerial|view of)\b/i.test(hay)
  ) {
    return true;
  }
  return false;
}

/**
 * Héro : paysage obligatoire (largeur > hauteur, min 1000px).
 * @param {number} width
 * @param {number} height
 */
export function isHeroLandscapeDimensions(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w < HERO_MIN_LANDSCAPE_WIDTH) return false;
  if (h <= 0) return false;
  return w > h;
}

/**
 * Scoring scénique équilibré pour fichiers Commons (catégorie héro).
 * @param {string} fileTitle
 * @param {string} pageUrl
 * @param {number} width
 * @param {number} height
 * @param {{ hero?: boolean, destinationTokens?: string[], categories?: string }} [options]
 */
export function scoreScenicCommonsFile(fileTitle, pageUrl, width, height, options = {}) {
  const hero = options.hero === true;
  const categories = String(options.categories || "").toLowerCase();
  const ft = String(fileTitle || "").toLowerCase().replace(/^file:/i, "");
  const u = String(pageUrl || "").toLowerCase();
  const hay = `${ft} ${u} ${categories}`.replace(/_/g, " ");
  if (isLikelyWikiBrandOrLogoImage(pageUrl, fileTitle)) return -1000;
  if (hero && isLikelyOrbitalOrMapImagery(pageUrl, fileTitle)) return -1000;
  if (hero && isLikelyNonScenicHeroImagery(pageUrl, fileTitle)) return -1000;

  let s = 0;
  const emotionalCat = String(options.emotionalCategory || "");
  if (hero && emotionalCat) {
    s += scoreEmotionalHeroCategory(emotionalCat);
  }
  const w = Number(width) || 0;
  const h = Number(height) || 1;
  const ratio = w / h;

  if (hero && !isHeroLandscapeDimensions(w, h)) return -1000;

  if (w >= HERO_MIN_WIDTH) s += 50;
  else if (w >= HERO_MIN_LANDSCAPE_WIDTH) s += 20;
  else s -= 120;

  if (ratio >= 1.4) s += 40;
  else if (ratio >= 1.2) s += 10;
  else if (hero && h >= w) s -= 120;
  else if (h > w * 1.15) s -= 60;

  if (NON_SCENIC_HERO_FILENAME_RE.test(hay)) s -= 200;
  if (
    /\b(bird|birds|pigeon|dove|sparrow)\b/i.test(hay) &&
    !/\b(panorama|landscape|skyline|harbour|harbor|lagoon|aerial|view of)\b/i.test(hay)
  ) {
    s -= 160;
  }
  if (SCENIC_HERO_BONUS_RE.test(hay)) s += 42;

  if (hero && options.destinationTokens?.length && categories) {
    const destHit = options.destinationTokens.some((tok) => {
      const t = String(tok || "").trim().toLowerCase();
      return t.length >= 4 && categories.includes(t.replace(/ /g, "_"));
    });
    if (destHit && SCENIC_HERO_CATEGORY_RE.test(categories)) s += 55;
    else if (destHit) s += 22;
  }

  if (
    /\b(at_)?night\b|nocturne|\bnighttime\b|_night\.|twilight|dusk|after.?dark|neon|long_exposure/i.test(
      hay
    )
  ) {
    s -= 44;
  }
  if (hero) {
    if (
      /\b(railway|railroad|graffiti|graffito|parking[_\s-]?lot|car[_\s-]?park|train[_\s-]?station)\b/i.test(
        hay
      )
    ) {
      s -= 45;
    }
    if (/overhead|top[_\s-]?down|bird[_\s-]?s[_\s-]?eye|nadir|orthophoto|orthoimage/i.test(hay)) {
      s -= 90;
    }
    if (/aerial|vue[_\s-]?a[eéè]rienne|from[_\s-]?above|satellite/i.test(hay)) {
      s -= 70;
    }
  } else if (/daylight|daytime|morning|afternoon|sunny|blue_sky|clear_sky|aerial.?view/i.test(hay)) {
    s += 18;
  }
  if (/panoram|drone|skyline|landscape|coast|beach|harbour|harbor|bay|view of/i.test(hay)) {
    s += 38;
  }
  if (!hero && /aerial|aerial.?view/i.test(hay)) {
    s += 18;
  }
  if (/\.(jpe?g|webp)(?:$|\?|\/)/i.test(u) || /\.(jpe?g|webp)$/i.test(ft)) s += 40;
  if (/\.svg/i.test(u) || u.includes(".svg.png")) s -= 200;
  return s;
}
