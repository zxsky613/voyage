/** Tokens marque — alignés sur :root dans index.css */

export const BRAND_BLUE = "#1D4ED8";
export const BRAND_BLUE_DEEP = "#1E3A8A";
export const BRAND_BLUE_TINT = "#E5EBFB";
export const BRAND_ORANGE_FROM = "#FB8A3C";
export const BRAND_ORANGE_TO = "#FB6514";
export const BRAND_ORANGE_SOLID = "#F97316";

export const BRAND_ORANGE_GRADIENT = `linear-gradient(90deg, ${BRAND_ORANGE_FROM}, ${BRAND_ORANGE_TO})`;
export const BRAND_ORANGE_GRADIENT_135 = `linear-gradient(135deg, ${BRAND_ORANGE_FROM}, ${BRAND_ORANGE_TO})`;
export const BRAND_BLUE_GRADIENT_H = `linear-gradient(90deg, ${BRAND_BLUE}, ${BRAND_BLUE_DEEP})`;
export const BRAND_BLUE_GLASS_GRADIENT =
  "linear-gradient(135deg, rgba(29,78,216,0.96) 0%, rgba(30,58,138,0.92) 55%, rgba(29,78,216,0.96) 100%)";

/** Boutons d’action structure — bleu cobalt plat, sans contour ni effet verre. */
export const BRAND_BLUE_BTN_CLASS =
  "font-normal tracking-[0.03em] bg-brand-blue font-semibold text-white shadow-[0_4px_14px_rgba(29,78,216,0.2)] transition hover:bg-brand-blue-deep active:scale-[0.98] disabled:opacity-60";

/** @deprecated alias — préférer BRAND_BLUE_BTN_CLASS */
export const GLASS_BUTTON_CLASS = BRAND_BLUE_BTN_CLASS;

/** Style inline obsolète (effet verre) — laisser vide, la couleur vient de BRAND_BLUE_BTN_CLASS. */
export const GLASS_ACCENT_STYLE = {};

/** Style inline CTA émotionnel principal (orange). */
export const BRAND_CTA_STYLE = { background: BRAND_ORANGE_GRADIENT };

export const BRAND_CTA_BUTTON_CLASS =
  "font-normal tracking-[0.03em] border border-white/25 bg-brand-gradient shadow-[0_14px_35px_rgba(249,115,22,0.28)] transition hover:brightness-110 text-white";
