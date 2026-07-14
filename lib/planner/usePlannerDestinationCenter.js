import { useEffect, useState } from "react";
import { buildNominatimCityQuery } from "../../cityHeroStem.js";

const _cache = new Map();
const _inflight = Object.create(null);

/**
 * Centre carte fallback (ville) via Nominatim — même logique que le guide destination.
 * @param {string} cityLabel
 * @param {string} [uiLang]
 */
async function fetchDestinationCenter(cityLabel, uiLang = "fr") {
  const q = buildNominatimCityQuery(cityLabel) || String(cityLabel || "").trim();
  if (q.length < 2) return null;
  const lang = String(uiLang || "fr").toLowerCase().split("-")[0] || "fr";
  const k = `${q.toLowerCase()}\x1e${lang}`;
  if (_cache.has(k)) return _cache.get(k);
  const inflight = _inflight[k];
  if (inflight) return inflight;

  const run = (async () => {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=${encodeURIComponent(
          lang
        )}&q=${encodeURIComponent(q)}`
      );
      if (!resp.ok) return null;
      const rows = await resp.json();
      const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      const lat = Number(first?.lat);
      const lon = Number(first?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const hit = { latitude: lat, longitude: lon };
      _cache.set(k, hit);
      return hit;
    } catch {
      return null;
    }
  })();

  _inflight[k] = run;
  run.finally(() => {
    if (_inflight[k] === run) delete _inflight[k];
  });
  return run;
}

/**
 * @param {string} cityLabel
 * @param {boolean} enabled
 * @param {string} [uiLang]
 */
export function usePlannerDestinationCenter(cityLabel, enabled, uiLang = "fr") {
  const [center, setCenter] = useState(null);

  useEffect(() => {
    if (!enabled || !String(cityLabel || "").trim()) {
      setCenter(null);
      return undefined;
    }
    let cancelled = false;
    void fetchDestinationCenter(cityLabel, uiLang).then((hit) => {
      if (!cancelled) setCenter(hit);
    });
    return () => {
      cancelled = true;
    };
  }, [cityLabel, enabled, uiLang]);

  return center;
}
