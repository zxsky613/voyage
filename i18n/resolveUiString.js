import { translations, DEFAULT_LOCALE } from "./translations.js";

/**
 * Résout une clé i18n hors composant React (helpers participants, notices…).
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, string|number>|undefined} [vars]
 */
export function resolveUiString(lang, key, vars) {
  const code = String(lang || DEFAULT_LOCALE)
    .toLowerCase()
    .split("-")[0]
    .slice(0, 2);
  const pack = translations[code] || translations.en || translations[DEFAULT_LOCALE];
  const fallback = translations[DEFAULT_LOCALE];
  const parts = String(key || "").split(".");
  let cur = pack;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") {
      cur = undefined;
      break;
    }
    cur = cur[p];
  }
  if (typeof cur !== "string") {
    let fb = fallback;
    for (const p of parts) {
      if (fb == null || typeof fb !== "object") {
        fb = undefined;
        break;
      }
      fb = fb[p];
    }
    cur = typeof fb === "string" ? fb : String(key || "");
  }
  let out = String(cur);
  if (vars && typeof vars === "object") {
    Object.keys(vars).forEach((k) => {
      out = out.split(`{{${k}}}`).join(String(vars[k] ?? ""));
    });
  }
  return out;
}
