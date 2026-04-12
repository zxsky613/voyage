/**
 * Appelle les routes locales du plugin Vite (npm run dev / vite preview).
 * En production statique, prévoir une Edge Function ou backend.
 */

const ITIN_FETCH_TIMEOUT_MS = 120000;

async function fetchPostJsonWithTimeout(url, body, timeoutMs = ITIN_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
