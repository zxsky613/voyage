import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { translations, DEFAULT_LOCALE } from "./translations.js";
import { setAppDateLocale } from "./dateLocale.js";

const STORAGE_KEY = "tp_locale_v1";

/** Code ISO pour images PNG (flagcdn.com), pas forcément identique au code langue (ex. en → gb). */
export const LOCALE_OPTIONS = [
  { code: "fr", nativeLabel: "Français", flagEmoji: "🇫🇷", flagCode: "fr" },
  { code: "en", nativeLabel: "English", flagEmoji: "🇬🇧", flagCode: "gb" },
  { code: "de", nativeLabel: "Deutsch", flagEmoji: "🇩🇪", flagCode: "de" },
  { code: "es", nativeLabel: "Español", flagEmoji: "🇪🇸", flagCode: "es" },
  { code: "it", nativeLabel: "Italiano", flagEmoji: "🇮🇹", flagCode: "it" },
  { code: "zh", nativeLabel: "中文", flagEmoji: "🇨🇳", flagCode: "cn" },
];

export function flagCdnSrc(flagCode, pixelWidth = 80) {
  return `https://flagcdn.com/w${pixelWidth}/${String(flagCode || "").toLowerCase()}.png`;
}

function LocaleFlagImg({ flagCode, title }) {
  const code = String(flagCode || "").toLowerCase();
  if (!code) return null;
  return (
    <img
      src={flagCdnSrc(code, 160)}
      alt=""
      role="presentation"
      draggable={false}
      className="box-border h-full w-full min-h-0 min-w-0 object-cover object-center"
      loading="lazy"
      decoding="async"
      title={title}
    />
  );
}

function readStoredLocale() {
  try {
    const raw = String(window.localStorage.getItem(STORAGE_KEY) || "").trim().toLowerCase();
    if (raw && translations[raw]) return raw;
  } catch (_e) {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

function deepGet(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(str, vars) {
  if (!vars || typeof str !== "string") return str;
  let out = str;
  Object.keys(vars).forEach((k) => {
    out = out.split(`{{${k}}}`).join(String(vars[k] ?? ""));
  });
  return out;
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const initial = readStoredLocale();
    setAppDateLocale(initial);
    return initial;
  });

  useEffect(() => {
    setAppDateLocale(language);
    const htmlLang = language === "zh" ? "zh-CN" : language;
    try {
      document.documentElement.lang = htmlLang;
    } catch (_e) {
      /* ignore */
    }
  }, [language]);

  const setLanguage = useCallback((code) => {
    const c = String(code || "").toLowerCase();
    if (!translations[c]) return;
    setLanguageState(c);
    try {
      window.localStorage.setItem(STORAGE_KEY, c);
    } catch (_e) {
      /* ignore */
    }
    setAppDateLocale(c);
  }, []);

  const t = useCallback(
    (key, vars) => {
      const pack = translations[language] || translations[DEFAULT_LOCALE];
      const fallback = translations[DEFAULT_LOCALE];
      const enPack = translations.en;
      let s =
        deepGet(pack, key) ?? deepGet(enPack, key) ?? deepGet(fallback, key) ?? String(key);
      return interpolate(s, vars);
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      locales: LOCALE_OPTIONS,
    }),
    [language, setLanguage, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

export function LanguageSelector({ className = "" }) {
  const { language, setLanguage, t, locales } = useI18n();
  const groupLabel = t("menu.language");
  return (
    <div className={className}>
      <span className="mb-2 block font-display text-[11px] font-normal uppercase tracking-[0.22em] text-slate-500">
        {groupLabel}
      </span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={groupLabel}>
        {locales.map((l) => {
          const selected = language === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => setLanguage(l.code)}
              title={l.nativeLabel}
              aria-label={l.nativeLabel}
              aria-pressed={selected}
              className={`box-border flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border p-0 leading-none shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 ${
                selected
                  ? "border-slate-600 ring-1 ring-slate-400"
                  : "border-slate-200/90 hover:border-slate-300"
              }`}
            >
              <LocaleFlagImg flagCode={l.flagCode} title={l.nativeLabel} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Connexion / inscription : voir `placement="authFooter"` dans la carte (flux + portail pour le menu). */
const MENU_GAP_PX = 8;
const MENU_EDGE_SAFE_PX = 12;

/**
 * Bandeau horizontal en portail, bords bas alignés sur le bouton.
 * @param {"expandLeftFirst" | "expandRightFirst"} toward — sens prioritaire d’ouverture.
 */
function computeMenuFixedBox(btnEl, toward) {
  if (typeof window === "undefined" || !btnEl) return null;
  const r = btnEl.getBoundingClientRect();
  const spaceRight = window.innerWidth - r.right - MENU_EDGE_SAFE_PX;
  const spaceLeft = r.left - MENU_EDGE_SAFE_PX;
  const bottom = window.innerHeight - r.bottom;
  const minSpace = 200;

  const openLeft = () => ({
    side: "left",
    right: window.innerWidth - r.left + MENU_GAP_PX,
    bottom,
    maxWidth: Math.max(160, spaceLeft),
  });
  const openRight = () => ({
    side: "right",
    left: r.right + MENU_GAP_PX,
    bottom,
    maxWidth: Math.max(160, spaceRight),
  });

  if (toward === "expandLeftFirst") {
    if (spaceLeft >= minSpace) return openLeft();
    return openRight();
  }
  if (spaceRight >= minSpace) return openRight();
  return openLeft();
}

/**
 * @param {{ placement?: "authFooter" | "viewport" }} props
 * — `authFooter` : flux normal sous le formulaire (l’extension reste en portail pour ne pas être coupée).
 */
export function LanguageFab({ placement = "authFooter" }) {
  const { language, setLanguage, t, locales } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(() => null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const groupLabel = t("menu.language");

  const current = locales.find((l) => l.code === language) || locales[0];

  const expandToward = placement === "authFooter" ? "expandLeftFirst" : "expandRightFirst";

  const updateMenuPlacement = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const box = computeMenuFixedBox(btn, expandToward);
    if (box) setMenuBox(box);
  }, [expandToward]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    updateMenuPlacement();
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(updateMenuPlacement);
    });
    window.addEventListener("resize", updateMenuPlacement);
    window.addEventListener("scroll", updateMenuPlacement, true);
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.removeEventListener("resize", updateMenuPlacement);
      window.removeEventListener("scroll", updateMenuPlacement, true);
    };
  }, [open, updateMenuPlacement]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const node = e.target;
      if (rootRef.current?.contains(node)) return;
      if (menuRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const positionClass =
    placement === "viewport"
      ? "fixed bottom-6 left-5 z-[90] sm:bottom-8 sm:left-6"
      : "relative z-10 w-full";

  const menuFallbackBox =
    expandToward === "expandLeftFirst"
      ? { side: "left", right: 120, bottom: 72, maxWidth: 320 }
      : { side: "right", left: 180, bottom: 72, maxWidth: 320 };
  const box = menuBox || menuFallbackBox;

  const menuPanel = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={groupLabel}
      style={{
        position: "fixed",
        bottom: box.bottom,
        maxWidth: box.maxWidth,
        zIndex: 200,
        ...(box.side === "right"
          ? { left: box.left, right: "auto" }
          : { right: box.right, left: "auto" }),
      }}
      className="box-border flex h-9 max-h-9 flex-row flex-nowrap items-center gap-1 overflow-x-auto overscroll-contain rounded-full border border-slate-200/90 bg-white/98 px-1.5 leading-none shadow-lg backdrop-blur-md [scrollbar-width:thin]"
    >
      {locales.map((l) => {
        const selected = language === l.code;
        return (
          <button
            key={l.code}
            type="button"
            role="menuitem"
            onClick={() => {
              setLanguage(l.code);
              setOpen(false);
            }}
            title={l.nativeLabel}
            aria-label={l.nativeLabel}
            className={`box-border flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border p-0 leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 ${
              selected
                ? "border-slate-600 ring-1 ring-slate-400"
                : "border-slate-200/90 hover:border-slate-300"
            }`}
          >
            <LocaleFlagImg flagCode={l.flagCode} title={l.nativeLabel} />
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`pointer-events-auto flex min-h-9 items-center ${positionClass}`}>
      <div
        className={`relative flex min-h-9 w-full items-center ${placement === "authFooter" ? "justify-end" : "justify-start"}`}
      >
        {typeof document !== "undefined" && menuPanel ? createPortal(menuPanel, document.body) : null}
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`${groupLabel} — ${current.nativeLabel}`}
          title={current.nativeLabel}
          className="relative z-10 box-border flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200/90 bg-white/95 p-0 leading-none shadow-md backdrop-blur-md transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
        >
          <LocaleFlagImg flagCode={current.flagCode} title={current.nativeLabel} />
        </button>
      </div>
    </div>
  );
}
