import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./I18nContext.jsx";
import { displayActivityTitleForLocale } from "./activityDisplay.js";
import { cityHasCatalogEntry, displayCityForLocale } from "./cityDisplay.js";

const MEMORY = new Map();
const INFLIGHT = new Map();
const CITY_MEMORY = new Map();
const CITY_INFLIGHT = new Map();
const LS_KEY = "tp_ui_tr_v1";
const LS_MAX = 120;

function normLang(code) {
  const c = String(code || "fr")
    .toLowerCase()
    .split("-")[0]
    .slice(0, 2);
  return ["fr", "en", "de", "es", "it", "zh"].includes(c) ? c : "fr";
}

function cacheKey(raw, lang) {
  return `${normLang(lang)}::${String(raw)}`;
}

function cityCacheKey(raw, lang) {
  return `city:${normLang(lang)}::${String(raw)}`;
}

function readLs() {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function writeLsEntry(key, value) {
  try {
    const o = readLs();
    o[key] = value;
    const keys = Object.keys(o);
    if (keys.length > LS_MAX) {
      keys.slice(0, keys.length - LS_MAX).forEach((k) => {
        delete o[k];
      });
    }
    window.localStorage.setItem(LS_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function peekMemoryOrLs(raw, lang) {
  const k = cacheKey(raw, lang);
  if (MEMORY.has(k)) return MEMORY.get(k);
  try {
    const o = readLs();
    const v = o[k];
    if (typeof v === "string" && v) {
      MEMORY.set(k, v);
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function peekCityMemoryOrLs(raw, lang) {
  const k = cityCacheKey(raw, lang);
  if (CITY_MEMORY.has(k)) return CITY_MEMORY.get(k);
  try {
    const o = readLs();
    const v = o[k];
    if (typeof v === "string" && v) {
      CITY_MEMORY.set(k, v);
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string[]} texts
 * @param {string} language
 * @returns {Promise<string[]>}
 */
export async function fetchUiTranslations(texts, language) {
  const lang = normLang(language);
  const list = texts.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (list.length === 0) return [];

  const unique = [];
  const seen = new Set();
  for (const s of list) {
    if (seen.has(s)) continue;
    seen.add(s);
    unique.push(s);
  }

  const r = await fetch("/api/ui-translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: lang, texts: unique }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok || !Array.isArray(data.translations)) {
    throw new Error(String(data?.error || `translate ${r.status}`));
  }
  const map = new Map();
  unique.forEach((s, i) => {
    const out = String(data.translations[i] ?? s).trim() || s;
    map.set(s, out);
    const k = cacheKey(s, lang);
    MEMORY.set(k, out);
    writeLsEntry(k, out);
  });
  return list.map((s) => map.get(s) || s);
}

async function translateOneCached(raw, language) {
  const lang = normLang(language);
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  const dict = displayActivityTitleForLocale(trimmed, lang);
  if (dict !== trimmed) return dict;

  const k = cacheKey(trimmed, lang);
  if (MEMORY.has(k)) return MEMORY.get(k);
  const fromLs = peekMemoryOrLs(trimmed, lang);
  if (fromLs) return fromLs;

  if (INFLIGHT.has(k)) return INFLIGHT.get(k);

  const p = (async () => {
    try {
      const [out] = await fetchUiTranslations([trimmed], lang);
      return String(out || trimmed).trim() || trimmed;
    } catch {
      return trimmed;
    } finally {
      INFLIGHT.delete(k);
    }
  })();

  INFLIGHT.set(k, p);
  return p;
}

async function fetchCityTranslations(texts, language) {
  const lang = normLang(language);
  const list = texts.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (list.length === 0) return [];

  const unique = [];
  const seen = new Set();
  for (const s of list) {
    if (seen.has(s)) continue;
    seen.add(s);
    unique.push(s);
  }

  const r = await fetch("/api/ui-translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: lang, texts: unique }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok || !Array.isArray(data.translations)) {
    throw new Error(String(data?.error || `translate ${r.status}`));
  }
  const map = new Map();
  unique.forEach((s, i) => {
    const out = String(data.translations[i] ?? s).trim() || s;
    map.set(s, out);
    const ck = cityCacheKey(s, lang);
    CITY_MEMORY.set(ck, out);
    writeLsEntry(ck, out);
  });
  return list.map((s) => map.get(s) || s);
}

async function translateCityOneCached(raw, language) {
  const lang = normLang(language);
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  const localized = displayCityForLocale(trimmed, lang);
  if (cityHasCatalogEntry(trimmed)) return localized;

  const ck = cityCacheKey(trimmed, lang);
  if (CITY_MEMORY.has(ck)) return CITY_MEMORY.get(ck);
  const fromLs = peekCityMemoryOrLs(trimmed, lang);
  if (fromLs) return fromLs;

  if (CITY_INFLIGHT.has(ck)) return CITY_INFLIGHT.get(ck);

  const p = (async () => {
    try {
      const [out] = await fetchCityTranslations([trimmed], lang);
      return String(out || localized).trim() || localized;
    } catch {
      return localized;
    } finally {
      CITY_INFLIGHT.delete(ck);
    }
  })();

  CITY_INFLIGHT.set(ck, p);
  return p;
}

/**
 * Nom de ville / titre de voyage : catalogue `cityDisplay` puis traduction API si hors catalogue.
 */
export function useUiTranslatedCityName(raw, language) {
  const trimmed = String(raw ?? "").trim();
  const lang = normLang(language);

  const dictLine = useMemo(() => displayCityForLocale(trimmed, lang), [trimmed, lang]);
  const inCatalog = useMemo(() => cityHasCatalogEntry(trimmed), [trimmed]);

  const [line, setLine] = useState(() => {
    if (!trimmed) return "";
    if (inCatalog) return dictLine;
    return peekCityMemoryOrLs(trimmed, lang) ?? dictLine;
  });

  useEffect(() => {
    if (!trimmed) {
      setLine("");
      return;
    }
    if (inCatalog) {
      setLine(dictLine);
      return;
    }
    const cached = peekCityMemoryOrLs(trimmed, lang);
    if (cached) {
      setLine(cached);
      return;
    }
    let cancelled = false;
    setLine(dictLine);
    translateCityOneCached(trimmed, lang).then((t) => {
      if (!cancelled) setLine(t);
    });
    return () => {
      cancelled = true;
    };
  }, [trimmed, lang, inCatalog, dictLine]);

  return { text: line };
}

export function UiLocalizedTripTitle({ raw, emptyLabel, className, ...rest }) {
  const { language } = useI18n();
  const trimmed = String(raw ?? "").trim();
  const { text } = useUiTranslatedCityName(trimmed, language);
  if (!trimmed) return emptyLabel ?? null;
  return (
    <span className={className} {...rest}>
      {text}
    </span>
  );
}

/**
 * Titre / libellé utilisateur : dictionnaire interne puis traduction API si besoin.
 */
export function useUiTranslatedText(raw, language) {
  const trimmed = String(raw ?? "").trim();
  const lang = normLang(language);

  const dictLine = useMemo(() => {
    if (!trimmed) return "";
    return displayActivityTitleForLocale(trimmed, lang);
  }, [trimmed, lang]);

  const dictApplied = Boolean(trimmed && dictLine !== trimmed);

  const [line, setLine] = useState(() => {
    if (!trimmed) return "";
    if (dictApplied) return dictLine;
    return peekMemoryOrLs(trimmed, lang) ?? trimmed;
  });

  useEffect(() => {
    if (!trimmed) {
      setLine("");
      return;
    }
    if (dictApplied) {
      setLine(dictLine);
      return;
    }
    const cached = peekMemoryOrLs(trimmed, lang);
    if (cached) {
      setLine(cached);
      return;
    }
    let cancelled = false;
    setLine(trimmed);
    translateOneCached(trimmed, lang).then((t) => {
      if (!cancelled) setLine(t);
    });
    return () => {
      cancelled = true;
    };
  }, [trimmed, lang, dictApplied, dictLine]);

  return { text: line, dictApplied };
}

export function UiTranslatedActivityTitle({ raw, emptyFallback, className }) {
  const { language } = useI18n();
  const trimmed = String(raw ?? "").trim();
  const { text } = useUiTranslatedText(trimmed, language);
  if (!trimmed) return emptyFallback ?? null;
  return <span className={className}>{text}</span>;
}

export function UiTranslatedPlain({ text: raw, className, as: Tag = "span", ...rest }) {
  const { language } = useI18n();
  const { text } = useUiTranslatedText(raw, language);
  return (
    <Tag className={className} {...rest}>
      {text}
    </Tag>
  );
}
