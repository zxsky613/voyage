/** Motifs imagerie orbitale / cartographique — exclusion kind=hero uniquement. */
const ORBITAL_MAP_FILENAME_RE =
  /\b(satellite|from[_\s-]?space|sts[_\s-]|nasa|landsat|sentinel|orbital|aerial[_\s-]?view|vue[_\s-]?a[eéè]rienne|map[_\s-]?of|carte[_\s-]?de|topographic|relief)\b|(?:^|[_\s./-])iss(?:[_\s./-]|$)/i;

const ORBITAL_MAP_CATEGORY_RE =
  /\b(maps[_\s-]?of|carte[_\s-]?de|satellite[_\s-]?pictures[_\s-]?of|aerial[_\s-]?photographs[_\s-]?of)\b/i;

/**
 * Imagerie orbitale / cartographique — à exclure du bandeau héro scénique au sol.
 * @param {string} [url]
 * @param {string} [fileTitle]
 * @param {string} [categories]
 */
/** Vue d'ensemble type « Island of X » (souvent satellite NASA) — héro seulement. */
const HERO_ISLAND_OVERVIEW_RE = /\bisland[_\s-]of[_\s-]/i;

export function isLikelyOrbitalOrMapImagery(url = "", fileTitle = "", categories = "") {
  const ft = String(fileTitle || "")
    .toLowerCase()
    .replace(/^file:/i, "");
  const u = String(url || "").toLowerCase();
  const cat = String(categories || "").toLowerCase();
  const hay = `${ft} ${u} ${cat}`.replace(/_/g, " ");
  if (!hay.trim()) return false;
  if (HERO_ISLAND_OVERVIEW_RE.test(hay)) return true;
  if (ORBITAL_MAP_FILENAME_RE.test(hay)) return true;
  if (ORBITAL_MAP_CATEGORY_RE.test(hay)) return true;
  return false;
}

/** Catégorie Commons entièrement cartographique / satellite — ignorer pour héro. */
export function isOrbitalCommonsCategoryName(categoryName) {
  const c = String(categoryName || "").trim();
  if (!c) return false;
  return ORBITAL_MAP_CATEGORY_RE.test(c) || /^maps?\s+of\b/i.test(c);
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
  const u = String(url || "").toLowerCase();
  const ft = String(fileTitle || "")
    .toLowerCase()
    .replace(/^file:/i, "");
  if (!u && !ft) return false;
  if (isLikelyWikiFlagOrSealThumb(url)) return true;
  const hay = `${u} ${ft}`;
  if (/wordmark|lockup|branding|brand_mark|charte_graphique/i.test(hay)) return true;
  if (/logo\.svg|_logo\.|\/logo\.|_logo_|\/logos?\//i.test(hay)) return true;
  if (/\blogo\b/i.test(ft) && /\.(svg|png|gif)/i.test(ft)) return true;
  if (u.includes(".svg.png") && /logo|wordmark|emblem|icon/i.test(hay)) return true;
  if (/^file:[^|]+_logo\.(svg|png)/i.test(String(fileTitle || ""))) return true;
  if (/\b(openstreetmap|osm[_-]|locator[_-]?map|location[_-]?map|map[_-]?of[_-]|relief[_-]?map|carte[_-]|karte[_-]|plan[_-]d|stadtplan|lageplan)\b/i.test(hay)) {
    return true;
  }
  if (/\bmap\.(?:svg|png)\b/i.test(hay)) return true;
  return false;
}

export const HERO_MIN_WIDTH = 1280;

/**
 * Scoring scénique équilibré pour fichiers Commons (catégorie héro).
 * @param {string} fileTitle
 * @param {string} pageUrl
 * @param {number} width
 * @param {number} height
 * @param {{ hero?: boolean }} [options]
 */
export function scoreScenicCommonsFile(fileTitle, pageUrl, width, height, options = {}) {
  const hero = options.hero === true;
  const ft = String(fileTitle || "").toLowerCase().replace(/^file:/i, "");
  const u = String(pageUrl || "").toLowerCase();
  const hay = `${ft} ${u}`;
  if (isLikelyWikiBrandOrLogoImage(pageUrl, fileTitle)) return -1000;
  if (hero && isLikelyOrbitalOrMapImagery(pageUrl, fileTitle)) return -1000;

  let s = 0;
  const w = Number(width) || 0;
  const h = Number(height) || 1;
  const ratio = w / h;

  if (w >= HERO_MIN_WIDTH) s += 50;
  else if (w >= 960) s += 10;
  else s -= 80;

  if (ratio >= 1.4) s += 40;
  else if (ratio >= 1.2) s += 10;
  else if (h > w * 1.15) s -= 60;

  if (
    /\b(at_)?night\b|nocturne|\bnighttime\b|_night\.|twilight|dusk|after.?dark|neon|long_exposure/i.test(
      hay
    )
  ) {
    s -= 44;
  }
  if (hero) {
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
  if (/\.svg/i.test(u) || u.includes(".svg.png")) s -= 200;
  return s;
}
