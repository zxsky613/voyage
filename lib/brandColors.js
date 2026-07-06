/** Tokens marque — alignés sur :root dans index.css */

export const BRAND_BLUE = "#142F5D";
export const BRAND_BLUE_DEEP = "#0C2142";
export const BRAND_BLUE_TINT = "#E8EDF4";
export const BRAND_ORANGE_FROM = "#F5824A";
export const BRAND_ORANGE_TO = "#D95A22";
export const BRAND_ORANGE_SOLID = "#F16A2E";
export const BRAND_ORANGE_TINT = "#FDECE4";
export const BRAND_ORANGE_INK = "#B84418";

export const BRAND_ORANGE_GRADIENT = `linear-gradient(90deg, ${BRAND_ORANGE_FROM}, ${BRAND_ORANGE_TO})`;
export const BRAND_ORANGE_GRADIENT_135 = `linear-gradient(135deg, ${BRAND_ORANGE_FROM}, ${BRAND_ORANGE_TO})`;
export const BRAND_BLUE_GRADIENT_H = `linear-gradient(90deg, ${BRAND_BLUE}, ${BRAND_BLUE_DEEP})`;
export const BRAND_BLUE_GLASS_GRADIENT =
  "linear-gradient(135deg, rgba(20,47,93,0.96) 0%, rgba(12,33,66,0.92) 55%, rgba(20,47,93,0.96) 100%)";

/** Boutons d’action structure — bleu marine plat, sans contour ni effet verre. */
export const BRAND_BLUE_BTN_CLASS =
  "font-normal tracking-[0.03em] bg-brand-blue font-semibold text-white shadow-[0_4px_14px_rgba(20,47,93,0.2)] transition hover:bg-brand-blue-deep active:scale-[0.98] disabled:opacity-60";

/** @deprecated alias — préférer BRAND_BLUE_BTN_CLASS */
export const GLASS_BUTTON_CLASS = BRAND_BLUE_BTN_CLASS;

/** Style inline obsolète (effet verre) — laisser vide, la couleur vient de BRAND_BLUE_BTN_CLASS. */
export const GLASS_ACCENT_STYLE = {};

/** Style inline CTA émotionnel principal (orange). */
export const BRAND_CTA_STYLE = { background: BRAND_ORANGE_GRADIENT };

export const BRAND_CTA_BUTTON_CLASS =
  "font-normal tracking-[0.03em] border border-white/25 bg-brand-gradient shadow-[0_14px_35px_rgba(241,106,46,0.28)] transition hover:brightness-110 text-white";
