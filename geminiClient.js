/**
 * Appelle les routes locales du plugin Vite (npm run dev / vite preview).
 * En production statique, prévoir une Edge Function ou backend.
 */
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

export async function fetchGeminiItinerary({ destination, startDate, endDate, language = "fr", prefs = null }) {
  const r = await fetch("/api/gemini/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, startDate, endDate, language, prefs }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Erreur ${r.status}`);
  }
  return j;
}

/**
 * Génère un programme jour par jour via Groq (llama-3.3-70b-versatile).
 * Groq est prioritaire sur Gemini pour l'itinéraire : plus rapide, free tier généreux.
 * Fallback automatique sur Gemini si Groq est indisponible ou sans clé.
 */
export async function fetchGroqItinerary({ destination, startDate, endDate, language = "fr", prefs = null }) {
  const r = await fetch("/api/groq/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, startDate, endDate, language, prefs }),
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
