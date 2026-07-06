/**
 * Largeurs miniatures Wikimedia autorisées en accès direct (hotlink).
 * Source : https://w.wiki/GHai ($wgThumbnailSteps production).
 * Les requêtes hors liste → 400 « Use thumbnail sizes listed on https://w.wiki/GHai ».
 */
export const ALLOWED_THUMB_WIDTHS = Object.freeze([
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
]);

/** Largeur hero destination — 1280px (standard CDN, ~200–400 Ko, suffisant retina). */
export const HERO_COMMONS_THUMB_WIDTH = 1280;

/**
 * @param {number} requested
 * @returns {number}
 */
export function snapToAllowedThumbWidth(requested) {
  const w = Number(requested);
  if (!Number.isFinite(w) || w <= 0) return HERO_COMMONS_THUMB_WIDTH;
  if (ALLOWED_THUMB_WIDTHS.includes(w)) return w;
  for (const step of ALLOWED_THUMB_WIDTHS) {
    if (step >= w) return step;
  }
  return ALLOWED_THUMB_WIDTHS[ALLOWED_THUMB_WIDTHS.length - 1];
}

/** @param {number} width */
export function isAllowedThumbWidth(width) {
  return ALLOWED_THUMB_WIDTHS.includes(Number(width));
}

/** @param {string} url */
export function stripWikiUtmQuery(url) {
  const u = String(url || "").trim();
  const q = u.indexOf("?");
  if (q > 0 && /\butm_source=/i.test(u)) return u.slice(0, q);
  return u;
}

/** @param {string} url */
export function isWikimediaUploadUrl(url) {
  return /upload\.wikimedia\.org/i.test(String(url || ""));
}

/** @param {string} url */
export function isCommonsThumbPath(url) {
  return isWikimediaUploadUrl(url) && /\/thumb\//i.test(String(url || ""));
}

/** Corrige un double encodage (%252C → %2C) sans toucher aux URLs déjà valides. */
export function fixDoubleEncodedUrl(url) {
  const u = String(url || "").trim();
  if (!/%25[0-9a-f]{2}/i.test(u)) return u;
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

/**
 * Redimensionne une URL thumb Commons existante (320px-, 1600px-, …).
 * @param {string} url
 * @param {number} [width]
 */
export function resizeCommonsThumbUrl(url, width = HERO_COMMONS_THUMB_WIDTH) {
  const u = stripWikiUtmQuery(url);
  if (!isCommonsThumbPath(u)) return u;
  const target = snapToAllowedThumbWidth(width);
  const q = u.indexOf("?");
  const base = q > 0 ? u.slice(0, q) : u;
  const qs = q > 0 ? u.slice(q) : "";
  const out = base.replace(/\/\d+px-([^/?#]+)$/i, `/${target}px-$1`);
  return out + qs;
}

/**
 * Convertit une URL Commons (originale ou thumb) en miniature /thumb/…/1280px-….
 * Ne double-encode pas : réutilise le segment fichier tel qu’il apparaît dans l’URL source.
 * @param {string} url
 * @param {number} [width]
 */
export function toCommonsThumbUrl(url, width = HERO_COMMONS_THUMB_WIDTH) {
  let u = fixDoubleEncodedUrl(stripWikiUtmQuery(String(url || "").trim()));
  if (!u || !isWikimediaUploadUrl(u)) return u;
  const target = snapToAllowedThumbWidth(width);
  if (isCommonsThumbPath(u)) return resizeCommonsThumbUrl(u, target);

  const m = u.match(
    /^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([a-f0-9]\/[a-f0-9]{2})\/([^/?#]+)$/i
  );
  if (!m) return u;
  const [, base, hashPath, filenameEnc] = m;
  return `${base}/thumb/${hashPath}/${filenameEnc}/${target}px-${filenameEnc}`;
}

/**
 * @param {string} url
 * @param {import('./types.js').ImageKind} [kind]
 */
export function ensureStoredHeroImageUrl(url, kind = "hero") {
  const u = String(url || "").trim();
  if (!u) return u;
  if (kind !== "hero" || !isWikimediaUploadUrl(u)) return u;

  let thumb = toCommonsThumbUrl(u, HERO_COMMONS_THUMB_WIDTH);
  if (!isCommonsThumbPath(thumb)) return thumb;

  const m = thumb.match(/\/(\d+)px-/i);
  const current = m ? Number(m[1]) : 0;
  if (current !== HERO_COMMONS_THUMB_WIDTH || !isAllowedThumbWidth(current)) {
    thumb = resizeCommonsThumbUrl(thumb, HERO_COMMONS_THUMB_WIDTH);
  }
  return thumb;
}
