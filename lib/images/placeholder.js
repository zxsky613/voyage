/** Dégradé déterministe (placeholder flou) — pas une fausse photo. */
export function resolveImagePlaceholder(seedText) {
  let h = 216;
  const s = String(seedText || "place");
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 42%, 82%) 0%, hsl(${hue2}, 48%, 58%) 100%)`;
}

/** @param {{ title?: string, name?: string, location?: string, date?: string, time?: string }} activity */
export function activityPlaceholderStyle(activity) {
  const seed = `${String(activity?.title || activity?.name || "")}|${String(activity?.location || "")}|${String(activity?.date || "")}|${String(activity?.time || "")}`;
  return resolveImagePlaceholder(seed);
}
