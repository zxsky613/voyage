/**
 * Appelle les routes locales du plugin Vite (npm run dev / vite preview).
 * En production statique, prévoir une Edge Function ou backend.
 */

const ITIN_FETCH_TIMEOUT_MS = 120000;
const VERIFIED_ITIN_FETCH_TIMEOUT_MS = 180000;
const SUGGEST_HIGHLIGHTS_TIMEOUT_MS = 90000;

async function fetchPostWithTimeout(url, body, timeoutMs = ITIN_FETCH_TIMEOUT_MS, headers = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(
        "TIMEOUT_ITINERARY La génération a dépassé le délai. Réessaie avec moins de jours ou une connexion plus stable."
      );
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

async function fetchPostJsonWithTimeout(url, body, timeoutMs = ITIN_FETCH_TIMEOUT_MS) {
  const r = await fetchPostWithTimeout(url, body, timeoutMs);
  return r;
}

/**
 * @param {Response} response
 * @param {(evt: { phase: string, percent: number }) => void} [onProgress]
 * @returns {Promise<object>}
 */
async function readVerifiedItineraryNdjsonStream(response, onProgress) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const j = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof j.error === "string" ? j.error : `Planner erreur ${response.status}`);
    }
    return j;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  /** @type {object | null} */
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = String(line || "").trim();
      if (!t) continue;
      let evt;
      try {
        evt = JSON.parse(t);
      } catch {
        continue;
      }
      if (evt?.type === "progress" && evt.phase) {
        onProgress?.({ phase: String(evt.phase), percent: Number(evt.percent) || 0 });
      } else if (evt?.type === "done") {
        result = evt;
      } else if (evt?.type === "error") {
        throw new Error(typeof evt.error === "string" ? evt.error : "Planner erreur");
      }
    }
  }

  const tail = String(buffer || "").trim();
  if (tail) {
    try {
      const evt = JSON.parse(tail);
      if (evt?.type === "progress" && evt.phase) {
        onProgress?.({ phase: String(evt.phase), percent: Number(evt.percent) || 0 });
      } else if (evt?.type === "done") {
        result = evt;
      } else if (evt?.type === "error") {
        throw new Error(typeof evt.error === "string" ? evt.error : "Planner erreur");
      }
    } catch (e) {
      if (e instanceof Error && /Planner erreur/i.test(e.message)) throw e;
    }
  }

  if (!result) {
    throw new Error("La réponse était incomplète. Réessaie ou raccourcis la période (moins de jours).");
  }
  return result;
}

export async function fetchGeminiTripSuggestions({ destination, days = 3, language = "fr" }) {
  const r = await fetch("/api/gemini/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, days, language }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Erreur ${r.status}`);
  }
  return j;
}

/** Activités proposées uniquement (moins de tokens que /suggestions complet). */
export async function fetchGeminiSuggestedActivities({ destination, language = "fr" }) {
  const r = await fetch("/api/gemini/suggested-activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, language }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Erreur ${r.status}`);
  }
  return j;
}

export async function fetchGeminiItinerary({
  destination,
  startDate,
  endDate,
  language = "fr",
  prefs = null,
  countryCode = "",
}) {
  const r = await fetchPostJsonWithTimeout("/api/gemini/itinerary", {
    destination,
    startDate,
    endDate,
    language,
    prefs,
    countryCode: String(countryCode || "").trim(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Erreur ${r.status}`);
  }
  return j;
}

/**
 * Génère un programme jour par jour via Groq (llama-3.3-70b-versatile).
 * Pour l’app, préférer fetchItineraryGroqFirst : Groq d’abord, Gemini seulement en secours.
 */
export async function fetchGroqItinerary({
  destination,
  startDate,
  endDate,
  language = "fr",
  prefs = null,
  countryCode = "",
}) {
  const r = await fetchPostJsonWithTimeout("/api/groq/itinerary", {
    destination,
    startDate,
    endDate,
    language,
    prefs,
    countryCode: String(countryCode || "").trim(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Groq erreur ${r.status}`);
  }
  return j;
}

/**
 * Pipeline vérifié : passe 1 → TripAdvisor/Foursquare → clustering → passe 2.
 */
export async function fetchVerifiedItinerary({
  destination,
  startDate,
  endDate,
  language = "fr",
  prefs = null,
  countryCode = "",
  country = "",
  debug = false,
  onProgress = null,
}) {
  const debugQ = debug || import.meta.env.DEV ? "?debug=1" : "";
  const r = await fetchPostWithTimeout(
    `/api/planner/generate-itinerary${debugQ}`,
    {
      destination,
      startDate,
      endDate,
      language,
      prefs,
      countryCode: String(countryCode || "").trim(),
      country: String(country || "").trim(),
      streamProgress: Boolean(onProgress),
    },
    VERIFIED_ITIN_FETCH_TIMEOUT_MS,
    onProgress ? { Accept: "application/x-ndjson, application/json" } : {}
  );
  const ct = String(r.headers.get("content-type") || "");
  const j =
    onProgress && /ndjson/i.test(ct)
      ? await readVerifiedItineraryNdjsonStream(r, onProgress)
      : await r.json().catch(() => ({}));
  if (!j?.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Planner erreur ${r.status}`);
  }
  if (import.meta.env.DEV && j?.data?.timings) {
    console.info("[planner/generate-itinerary timings]", j.data.timings);
  }
  return j;
}

/** Lieux réels vérifiés pour activités proposées + modale « Ajouter destination ». */
export async function fetchSuggestHighlights({
  destination,
  language = "fr",
  country = "",
  countryCode = "",
  prefs = null,
  debug = false,
}) {
  const debugQ = debug || import.meta.env.DEV ? "?debug=1" : "";
  const r = await fetchPostJsonWithTimeout(
    `/api/planner/suggest-highlights${debugQ}`,
    {
      destination: String(destination || "").trim(),
      language,
      country: String(country || "").trim(),
      countryCode: String(countryCode || "").trim(),
      prefs,
    },
    SUGGEST_HIGHLIGHTS_TIMEOUT_MS
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Planner erreur ${r.status}`);
  }
  if (import.meta.env.DEV && j?.data?.tripAdvisorCalls != null) {
    console.info("[planner/suggest-highlights]", {
      count: Array.isArray(j?.data?.highlights) ? j.data.highlights.length : 0,
      tripAdvisorCalls: j.data.tripAdvisorCalls,
      cached: Boolean(j?.data?.cached),
    });
  }
  return j;
}

function countInclusiveTripDaysClient(startYmd, endYmd) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(startYmd) || !re.test(endYmd)) return { ok: false, days: 0 };
  const t0 = Date.parse(`${startYmd}T12:00:00`);
  const t1 = Date.parse(`${endYmd}T12:00:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return { ok: false, days: 0 };
  let a = t0;
  let b = t1;
  if (b < a) [a, b] = [b, a];
  const diff = Math.round((b - a) / 86400000);
  const days = diff + 1;
  if (days > 14) return { ok: false, days: 0 };
  return { ok: true, days };
}

function itineraryDayHasUsableContent(d) {
  const hasTitle = String(d?.title || "").trim().length > 0;
  const hasBullets =
    Array.isArray(d?.bullets) && d.bullets.some((b) => String(b || "").trim().length > 0);
  const hasActivities = Array.isArray(d?.activities) && d.activities.length > 0;
  return hasTitle && (hasBullets || hasActivities);
}

function isGroqItineraryAcceptable(res, expectedDays) {
  if (!res?.ok || !Array.isArray(res.data?.dayIdeas)) return false;
  const list = res.data.dayIdeas;
  if (list.length !== expectedDays) return false;
  if (typeof res.data.tripDays === "number" && res.data.tripDays !== expectedDays) return false;
  return list.every(itineraryDayHasUsableContent);
}

/**
 * Programme jour par jour : appelle **toujours Groq en premier**, puis Gemini uniquement si
 * Groq échoue (réseau, 5xx, JSON) ou si la réponse est incomplète (mauvais nombre de jours, jour vide).
 * Même corps de requête (prefs, countryCode, langue) pour les deux backends.
 */
export async function fetchItineraryGroqFirst({
  destination,
  startDate,
  endDate,
  language = "fr",
  prefs = null,
  countryCode = "",
}) {
  const { ok, days: expectedDays } = countInclusiveTripDaysClient(
    String(startDate || "").trim(),
    String(endDate || "").trim()
  );
  if (!ok) {
    throw new Error(
      "Dates au format AAAA-MM-JJ requises ; le séjour doit compter au plus 14 jours."
    );
  }

  let res = null;
  try {
    res = await fetchGroqItinerary({
      destination,
      startDate,
      endDate,
      language,
      prefs,
      countryCode,
    });
  } catch {
    res = null;
  }

  if (isGroqItineraryAcceptable(res, expectedDays)) {
    return res;
  }

  return await fetchGeminiItinerary({
    destination,
    startDate,
    endDate,
    language,
    prefs,
    countryCode,
  });
}

/**
 * Suggestions complètes (places + tips + activities) via Groq — prioritaire sur Gemini.
 */
export async function fetchGroqTripSuggestions({ destination, days = 3, language = "fr" }) {
  const r = await fetch("/api/groq/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, days, language }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Groq erreur ${r.status}`);
  }
  return j;
}

/** Activités proposées via Groq — prioritaire sur Gemini. */
export async function fetchGroqSuggestedActivities({ destination, language = "fr" }) {
  const r = await fetch("/api/groq/suggested-activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, language }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Groq erreur ${r.status}`);
  }
  return j;
}

/**
 * Génère des conseils d'expert (do / don't) via Groq pour une destination.
 * Retourne { ok, data: { tips: { do: string[], dont: string[] } } }.
 */
export async function fetchGroqTips({ destination, language = "fr" }) {
  const r = await fetch("/api/groq/tips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, language }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Groq erreur ${r.status}`);
  }
  return j;
}
