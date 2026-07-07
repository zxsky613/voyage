/**
 * Fusion lieux incontournables guide — jamais de geosearch Wikipedia brut.
 * Priorité : catalogue emblématique → cache highlights → OSM nommés → Foursquare.
 */

/**
 * @param {{ iconicNames?: string[], highlightsNames?: string[], osmNames?: string[], fsqNames?: string[], cap?: number }} input
 */
export function mergeMustSeePlaceCandidates(input = {}) {
  const out = [];
  const seen = new Set();
  const push = (label) => {
    const s = String(label || "").trim();
    if (s.length < 2) return;
    const k = s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };

  for (const n of input.iconicNames || []) push(n);
  for (const n of input.highlightsNames || []) push(n);
  for (const n of input.osmNames || []) push(n);
  for (const n of input.fsqNames || []) push(n);

  const cap = Math.min(48, Math.max(10, Number(input.cap) || 22));
  return out.slice(0, cap);
}

/** @param {unknown[]} highlights */
export function highlightObjectsToPlaceNames(highlights) {
  const list = Array.isArray(highlights) ? highlights : [];
  return list
    .map((h) => {
      if (typeof h === "string") return h.trim();
      if (h && typeof h === "object") return String(h.name || h.title || "").trim();
      return "";
    })
    .filter((s) => s.length >= 2);
}
