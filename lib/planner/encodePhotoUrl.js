/**
 * Encode les segments d'URL photo (Commons / Wikimedia : accents, apostrophes).
 * Évite URL() qui re-décode %27 → ' à la sérialisation.
 * @param {string} url
 * @returns {string}
 */
export function encodePhotoUrlForDisplay(url) {
  const raw = String(url || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return "";
  try {
    const match = raw.match(/^(https?:\/\/[^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i);
    if (!match) return raw;
    const origin = match[1];
    const path = match[2] || "";
    const query = match[3] || "";
    const hash = match[4] || "";
    const encodedPath = path
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        try {
          return encodeURIComponent(decodeURIComponent(seg)).replace(/'/g, "%27");
        } catch {
          return encodeURIComponent(seg).replace(/'/g, "%27");
        }
      })
      .join("/");
    return `${origin}${encodedPath}${query}${hash}`;
  } catch {
    return raw;
  }
}
