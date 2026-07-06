/** Largeur cible des miniatures Commons pour les héros destination. */
export const HERO_COMMONS_THUMB_WIDTH = 1600;

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
 * Redimensionne une URL thumb Commons existante (1600px-, 320px-, …).
 * @param {string} url
 * @param {number} [width]
 */
export function resizeCommonsThumbUrl(url, width = HERO_COMMONS_THUMB_WIDTH) {
  const u = stripWikiUtmQuery(url);
  if (!isCommonsThumbPath(u)) return u;
  const q = u.indexOf("?");
  const base = q > 0 ? u.slice(0, q) : u;
  const qs = q > 0 ? u.slice(q) : "";
  const out = base.replace(/\/\d+px-([^/?#]+)$/i, `/${width}px-$1`);
  return out + qs;
}

/**
 * Convertit une URL Commons (originale ou thumb) en miniature /thumb/…/1600px-….
 * Ne double-encode pas : réutilise le segment fichier tel qu’il apparaît dans l’URL source.
 * @param {string} url
 * @param {number} [width]
 */
export function toCommonsThumbUrl(url, width = HERO_COMMONS_THUMB_WIDTH) {
  let u = fixDoubleEncodedUrl(stripWikiUtmQuery(String(url || "").trim()));
  if (!u || !isWikimediaUploadUrl(u)) return u;
  if (isCommonsThumbPath(u)) return resizeCommonsThumbUrl(u, width);

  const m = u.match(
    /^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([a-f0-9]\/[a-f0-9]{2})\/([^/?#]+)$/i
  );
  if (!m) return u;
  const [, base, hashPath, filenameEnc] = m;
  return `${base}/thumb/${hashPath}/${filenameEnc}/${width}px-${filenameEnc}`;
}

/**
 * @param {string} url
 * @param {import('./types.js').ImageKind} [kind]
 */
export function ensureStoredHeroImageUrl(url, kind = "hero") {
  const u = String(url || "").trim();
  if (!u) return u;
  if (kind === "hero" && isWikimediaUploadUrl(u)) {
    return toCommonsThumbUrl(u, HERO_COMMONS_THUMB_WIDTH);
  }
  return u;
}
