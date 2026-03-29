/**
 * Appelle les routes locales du plugin Vite (npm run dev / vite preview).
 * En production statique, prévoir une Edge Function ou backend.
 */
export async function fetchGeminiTripSuggestions({ destination, days = 3 }) {
  const r = await fetch("/api/gemini/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, days }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Erreur ${r.status}`);
  }
  return j;
}

export async function fetchGeminiItinerary({ destination, startDate, endDate }) {
  const r = await fetch("/api/gemini/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, startDate, endDate }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === "string" ? j.error : `Erreur ${r.status}`);
  }
  return j;
}
