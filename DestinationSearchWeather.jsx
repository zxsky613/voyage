import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n/I18nContext.jsx";
import { getAppDateLocale } from "./i18n/dateLocale.js";

const GEO_LANG = { fr: "fr", en: "en", de: "de", es: "es", it: "it", zh: "zh" };
const GEO_COORDS_CACHE = new Map();
const ROLLING_DAYS = 7;

/** Jaune vif type ref. soleil (capsules + disque). */
const SUN_FILL = "#ffcc00";
const SUN_RAYS = "#ffcc00";
const CLOUD_FILL = "#ffffff";
/** Bleu pluie cyan vif (réf. image pluie). */
const RAIN_STROKE = "#5ec8ff";
const FOG_FILL = "#aab6c7";
/** Contour nuage lisible sur pastille très foncée. */
const CLOUD_EDGE = "rgba(226,232,240,0.35)";

/** viewBox commun 48×48 — calé sur les quatre visuels utilisateur. */
const VB = "0 0 48 48";

/** Nuage unique : trois lobes arrondis + base plate (réf. nuageux / pluie). */
function RefCloud({ dy = 0 }) {
  return (
    <path
      transform={`translate(0,${dy})`}
      fill={CLOUD_FILL}
      stroke={CLOUD_EDGE}
      strokeWidth={0.85}
      strokeLinejoin="round"
      d="M 10.5 30.2
         C 8.2 30 6.5 28.2 6.5 25.6
         C 6.5 22 8.8 19 12.4 18.4
         C 14.3 14.5 18.4 12 23.2 12.5
         C 26.8 10.5 31.5 11.2 34.8 14.6
         C 38.6 14.8 41.5 18.2 41.5 22.4
         C 41.5 26.8 38.2 29.6 33.8 29.6
         L 14.2 29.6
         C 12.6 30 11.2 30.3 10.5 30.2 Z"
    />
  );
}

/** Image 1 — disque + 8 rayons capsules, espace entre disque et rayons. */
function GlyphClear() {
  const cx = 24;
  const cy = 24;
  const rDisk = 10;
  const rGapIn = 11.4;
  const rGapOut = 16.4;
  const rayW = 2.35;
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const deg = i * 45;
        const rad = (deg * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        return (
          <line
            key={i}
            x1={cx + c * rGapIn}
            y1={cy + s * rGapIn}
            x2={cx + c * rGapOut}
            y2={cy + s * rGapOut}
            stroke={SUN_RAYS}
            strokeWidth={rayW}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={rDisk} fill={SUN_FILL} />
    </>
  );
}

/** Image 3 — soleil derrière, nuage avant (ordre de peinture SVG). */
function GlyphPartly() {
  const sx = 32;
  const sy = 15;
  const rDisk = 6.9;
  const rIn = 8.2;
  const rOut = 11;
  const rays = [218, 242, 268, 292, 316]; // cinq rayons visibles — ref. utilisateur (soleil masqué)
  return (
    <>
      <circle cx={sx} cy={sy} r={rDisk} fill={SUN_FILL} />
      {rays.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        return (
          <line
            key={i}
            x1={sx + c * rIn}
            y1={sy + s * rIn}
            x2={sx + c * rOut}
            y2={sy + s * rOut}
            stroke={SUN_RAYS}
            strokeWidth={1.85}
            strokeLinecap="round"
          />
        );
      })}
      <RefCloud dy={3.2} />
    </>
  );
}

/** Image 4 — nuage + quatre traits obliques bleus. */
function RainStreaksFour({ heavy }) {
  const w = heavy ? 2.15 : 1.9;
  const rows = [
    [15.8, 31.2],
    [20.6, 31.2],
    [25.4, 31.2],
    [30.2, 31.2],
  ];
  return rows.map(([x, y], i) => (
    <line
      key={i}
      x1={x}
      y1={y}
      x2={x - 4.1}
      y2={y + 9.2}
      stroke={RAIN_STROKE}
      strokeWidth={w}
      strokeLinecap="round"
    />
  ));
}

/** Pastille derrière les pictos : fond nettement plus sombre pour contraster avec nuages blancs / soleil jaune. */
function WeatherIconTray({ large, children }) {
  const box = large
    ? "my-2 flex h-[3.55rem] w-[3.55rem] shrink-0 items-center justify-center rounded-[0.72rem] bg-gradient-to-b from-slate-800 to-slate-950 ring-1 ring-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-slate-800 to-slate-950 ring-1 ring-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
  return (
    <div className={box} aria-hidden>
      {children}
    </div>
  );
}

/** Catégorie picto plat (réf. nuages blancs, soleil jaune, traits pluie bleu). */
function flatWeatherKind(code) {
  const n = Number(code);
  const c = Number.isFinite(n) ? n : 0;
  if (c === 0) return "clear";
  if (c <= 2) return "partly";
  if (c === 3) return "cloud";
  if (c === 45 || c === 48) return "fog";
  if (c >= 51 && c <= 57) return "drizzle";
  if (c >= 61 && c <= 67) return c >= 65 ? "snow" : "rain";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
  if (c >= 80 && c <= 82) return "showers";
  if (c === 96 || c === 99) return "hail";
  if (c >= 95) return "thunder";
  return "cloud";
}

/**
 * Soleil ref. fig. 1, nuage ref. fig. 2, éclaircies ref. fig. 3, pluie ref. fig. 4 (toujours 4 traits).
 * Flat, sans dégradés — lisibilité assurée par WeatherIconTray (slates alignés sur les cartes).
 */
function WeatherGlyphFlat({ code, size = 40 }) {
  const kind = flatWeatherKind(code);

  let content;
  if (kind === "clear") {
    content = <GlyphClear />;
  } else if (kind === "partly") {
    content = <GlyphPartly />;
  } else if (kind === "cloud") {
    content = <RefCloud dy={0} />;
  } else if (kind === "fog") {
    content = (
      <>
        <RefCloud dy={0} />
        <ellipse cx={24} cy={41} rx={16} ry={2.4} fill={FOG_FILL} opacity={0.75} />
        <ellipse cx={24} cy={43.8} rx={12} ry={1.85} fill={FOG_FILL} opacity={0.45} />
      </>
    );
  } else if (kind === "drizzle" || kind === "rain") {
    content = (
      <>
        <RefCloud dy={-0.8} />
        <RainStreaksFour heavy={false} />
      </>
    );
  } else if (kind === "showers") {
    content = (
      <>
        <RefCloud dy={-0.8} />
        <RainStreaksFour heavy />
      </>
    );
  } else if (kind === "snow") {
    content = (
      <>
        <RefCloud dy={-0.8} />
        {[13.8, 20.8, 27.8, 34].map((cx, i) => (
          <circle key={i} cx={cx} cy={38.8} r={2.05} fill="#e8f4ff" />
        ))}
      </>
    );
  } else if (kind === "thunder") {
    content = (
      <>
        <RefCloud dy={-0.8} />
        <RainStreaksFour heavy />
        <path d="M25.8 31.8 L17.8 43.8 H23.9 L21.9 46.4 L31.8 37.9 H26.9 Z" fill={SUN_FILL} />
      </>
    );
  } else if (kind === "hail") {
    content = (
      <>
        <RefCloud dy={-0.8} />
        <RainStreaksFour heavy={false} />
        {[13.8, 24, 34.6].map((cx, i) => (
          <circle key={i} cx={cx} cy={40.8} r={2.35} fill={RAIN_STROKE} />
        ))}
      </>
    );
  } else {
    content = <RefCloud dy={0} />;
  }

  return (
    <svg width={size} height={size} viewBox={VB} className="shrink-0 overflow-visible" aria-hidden>
      {content}
    </svg>
  );
}


function openMeteoGeocodeLang(appLang) {
  return GEO_LANG[String(appLang || "").toLowerCase()] || "en";
}

function shortenGeocodeQuery(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const comma = s.split(",")[0]?.trim() || "";
  return comma.split("-")[0]?.trim() || comma.trim();
}

async function fetchOpenMeteoCoords(query, appLanguage) {
  const q = String(query || "").trim();
  if (q.length < 2) return null;
  const lang = openMeteoGeocodeLang(appLanguage);
  const cacheKey = `${q.toLowerCase()}::${lang}`;
  if (GEO_COORDS_CACHE.has(cacheKey)) return GEO_COORDS_CACHE.get(cacheKey);

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      q
    )}&count=1&language=${encodeURIComponent(lang)}&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const row = Array.isArray(json?.results) ? json.results[0] : null;
    if (!row || row.latitude == null || row.longitude == null) return null;
    const out = {
      lat: Number(row.latitude),
      lon: Number(row.longitude),
      label: String(row.name || ""),
      country: String(row.country_code || row.country || "").trim(),
    };
    GEO_COORDS_CACHE.set(cacheKey, out);
    return out;
  } catch (_e) {
    return null;
  }
}

async function fetchSevenDayForecast(lat, lon) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", String(lat));
  u.searchParams.set("longitude", String(lon));
  u.searchParams.set("timezone", "auto");
  u.searchParams.set("forecast_days", String(ROLLING_DAYS));
  u.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  const resp = await fetch(u.toString());
  if (!resp.ok) return null;
  return resp.json();
}

function formatWeekdayLong(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || "").slice(0, 10));
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(getAppDateLocale(), { weekday: "long" });
}

export function DestinationSearchWeather({ coordinates = null, geocodeQuery = "" }) {
  const { t, language } = useI18n();
  const [state, setState] = useState({ kind: "idle" });
  const requestIdRef = useRef(0);

  const latIn = coordinates != null ? Number(coordinates.lat) : NaN;
  const lonIn = coordinates != null ? Number(coordinates.lon ?? coordinates.longitude) : NaN;
  const hasGuideCoords = Number.isFinite(latIn) && Number.isFinite(lonIn);

  const load = useCallback(async () => {
    const req = ++requestIdRef.current;
    setState({ kind: "loading" });

    let lat = hasGuideCoords ? latIn : NaN;
    let lon = hasGuideCoords ? lonIn : NaN;
    let placeLabel = "";

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const full = String(geocodeQuery || "").trim();
      const short = shortenGeocodeQuery(full);
      let g = await fetchOpenMeteoCoords(full, language);
      if ((!g || !Number.isFinite(g.lat)) && short && short !== full) {
        g = await fetchOpenMeteoCoords(short, language);
      }
      if (req !== requestIdRef.current) return;
      if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon)) {
        setState({ kind: "error", message: t("destination.weatherUnavailable") });
        return;
      }
      lat = g.lat;
      lon = g.lon;
      placeLabel = [g.label, g.country ? g.country.toUpperCase() : ""].filter(Boolean).join(" · ");
    }

    if (req !== requestIdRef.current) return;

    try {
      const json = await fetchSevenDayForecast(lat, lon);
      if (req !== requestIdRef.current) return;
      if (!json?.daily?.time?.length) {
        setState({ kind: "error", message: t("destination.weatherUnavailable") });
        return;
      }

      const max = Math.min(ROLLING_DAYS, json.daily.time.length);
      const codes = json.daily.weather_code || [];
      const tmax = json.daily.temperature_2m_max || [];
      const tmin = json.daily.temperature_2m_min || [];
      const pop = json.daily.precipitation_probability_max || [];

      const days = [];
      for (let i = 0; i < max; i += 1) {
        const dateStr = String(json.daily.time[i] || "").slice(0, 10);
        if (!dateStr) continue;
        days.push({
          date: dateStr,
          code: codes[i],
          tmax: tmax[i],
          tmin: tmin[i],
          popProb: Number.isFinite(Number(pop[i])) ? Number(pop[i]) : null,
        });
      }

      if (!days.length) {
        setState({ kind: "error", message: t("destination.weatherUnavailable") });
        return;
      }

      setState({
        kind: "ok",
        days,
        place: placeLabel || null,
      });
    } catch (_e) {
      if (req !== requestIdRef.current) return;
      setState({ kind: "error", message: t("destination.weatherUnavailable") });
    }
  }, [geocodeQuery, hasGuideCoords, latIn, lonIn, language, t]);

  useEffect(() => {
    if (!String(geocodeQuery || "").trim() && !hasGuideCoords) {
      setState({ kind: "idle" });
      return;
    }
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load, geocodeQuery, hasGuideCoords, latIn, lonIn]);

  if (!String(geocodeQuery || "").trim() && !hasGuideCoords) return null;

  const headingCode =
    state.kind === "ok" && state.days?.[0]?.code != null ? Number(state.days[0].code) : 2;

  return (
    <section className="rounded-2xl border border-slate-200/95 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:rounded-[1.35rem] sm:p-5">
      <header className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <WeatherIconTray large={false}>
            <WeatherGlyphFlat code={headingCode} size={36} />
          </WeatherIconTray>
          <div className="min-w-0 pt-0.5 leading-tight">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              {t("destination.weatherHeading")}
            </h4>
            <p className="mt-1 max-w-md text-[12px] leading-snug text-slate-500">{t("destination.weatherSubtitle")}</p>
          </div>
        </div>
        {state.kind === "ok" && state.place ? (
          <p className="max-w-[16rem] text-right text-[11px] leading-snug text-slate-400 sm:self-center">{state.place}</p>
        ) : null}
      </header>

      {state.kind === "loading" ? (
        <p className="py-3 text-[13px] text-slate-500">{t("destination.weatherLoading")}</p>
      ) : null}

      {state.kind === "error" ? (
        <div className="flex flex-wrap items-center gap-3 py-2">
          <p className="text-[13px] text-slate-600">{state.message}</p>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
          >
            {t("destination.weatherRetry")}
          </button>
        </div>
      ) : null}

      {state.kind === "ok" ? (
        <>
          <div
            className="-mx-1 flex snap-x snap-proximity gap-2 overflow-x-auto scroll-px-2 px-1 pb-1 pt-0.5 [scrollbar-width:thin]"
            role="list"
            aria-label={t("destination.weatherHeading")}
          >
            {state.days.map((row) => {
              const tmaxN = Number(row.tmax);
              const tminN = Number(row.tmin);
              const hi = Number.isFinite(tmaxN) ? Math.round(tmaxN) : "—";
              const lo = Number.isFinite(tminN) ? Math.round(tminN) : "—";
              const popN = row.popProb;
              const popStr = Number.isFinite(popN) ? `${Math.round(popN)}%` : "—";
              return (
                <div
                  key={row.date}
                  role="listitem"
                  className="flex min-h-[156px] min-w-[7.35rem] max-w-[8rem] shrink-0 snap-start flex-col items-center rounded-[1rem] bg-gradient-to-b from-slate-600 to-slate-800 px-2 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-slate-500/55"
                >
                  <div className="flex min-h-[2.25rem] flex-col items-center justify-center gap-0.5 text-center">
                    <span className="px-0.5 text-[10px] font-semibold capitalize leading-snug text-slate-100 sm:text-[11px]">
                      {formatWeekdayLong(row.date)}
                    </span>
                    <span className="text-[11px] tabular-nums text-slate-300">
                      {row.date.slice(8, 10)}/{row.date.slice(5, 7)}
                    </span>
                  </div>
                  <WeatherIconTray large>
                    <WeatherGlyphFlat code={row.code} size={43} />
                  </WeatherIconTray>
                  <p className="mt-2 text-[13px] font-bold tabular-nums leading-none tracking-tight text-white">
                    {hi}°
                    <span className="font-semibold text-slate-300">/</span>
                    <span className="font-semibold text-slate-200">{lo}°</span>
                  </p>
                  <p
                    className="mt-auto pt-2 text-[11px] font-bold tabular-nums leading-none tracking-tight"
                    style={{ color: RAIN_STROKE }}
                  >
                    {popStr}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-400">
            {t("destination.weatherHint")}
          </p>
        </>
      ) : null}
    </section>
  );
}
