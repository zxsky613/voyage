/** @param {string} seedText */
function hashSeedText(seedText) {
  let h = 216;
  const s = String(seedText || "destination");
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Dégradé déterministe (placeholder flou) — pas une fausse photo. */
export function resolveImagePlaceholder(seedText) {
  const h = hashSeedText(seedText);
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 42%, 82%) 0%, hsl(${hue2}, 48%, 58%) 100%)`;
}

/**
 * Bandeau destination sans photo — dégradé navy + motif grille, seed déterministe.
 * @param {string} [seedText]
 */
export function resolveDestinationHeroFallbackBackground(seedText = "") {
  const h = hashSeedText(seedText);
  const accentHue = 215 + (h % 35);
  const grid =
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 28px)," +
    "repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 28px)";
  const gradient = `linear-gradient(135deg, rgba(20,47,93,0.98) 0%, hsla(${accentHue}, 42%, 26%, 0.93) 50%, rgba(12,33,66,0.98) 100%)`;
  return `${grid}, ${gradient}`;
}

/**
 * Sous-titre hero fallback — « Région · Pays ».
 * @param {string} [adminRegion]
 * @param {string} [country]
 */
export function formatDestinationHeroSubtitle(adminRegion = "", country = "") {
  return [adminRegion, country].map((p) => String(p || "").trim()).filter(Boolean).join(" · ");
}

/** @deprecated Préférer resolveDestinationHeroFallbackBackground */
export function resolveDestinationHeroPlaceholder(cityName = "") {
  return resolveDestinationHeroFallbackBackground(cityName);
}

/** @param {{ title?: string, name?: string, location?: string, date?: string, time?: string }} activity */
export function activityPlaceholderStyle(activity) {
  const seed = `${String(activity?.title || activity?.name || "")}|${String(activity?.location || "")}|${String(activity?.date || "")}|${String(activity?.time || "")}`;
  return resolveImagePlaceholder(seed);
}
