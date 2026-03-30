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

export async function fetchGeminiItinerary({ destination, startDate, endDate, language = "fr" }) {
  const r = await fetch("/api/gemini/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, startDate, endDate, language }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Erreur ${r.status}`);
  }
  return j;
}
