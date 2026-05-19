import assert from "node:assert/strict";
import test from "node:test";

import { fetchItineraryGroqFirst } from "./geminiClient.js";

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test("fetchItineraryGroqFirst rejects incomplete Gemini fallback itineraries", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (String(url).includes("/api/groq/itinerary")) {
      return jsonResponse({
        ok: true,
        data: {
          tripDays: 2,
          dayIdeas: [{ day: 1, title: "Jour 1", bullets: ["Matin : visite"] }],
        },
      });
    }
    return jsonResponse({
      ok: true,
      data: {
        tripDays: 2,
        dayIdeas: [{ day: 1, title: "Jour 1", bullets: ["Matin : visite"] }],
      },
    });
  };

  try {
    await assert.rejects(
      fetchItineraryGroqFirst({
        destination: "Paris",
        startDate: "2026-06-01",
        endDate: "2026-06-02",
      }),
      /ITIN_ERROR_EMPTY_RESULT/
    );
    assert.deepEqual(calls, ["/api/groq/itinerary", "/api/gemini/itinerary"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchItineraryGroqFirst accepts complete Gemini fallback itineraries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/groq/itinerary")) {
      return jsonResponse({ ok: true, data: { tripDays: 2, dayIdeas: [] } });
    }
    return jsonResponse({
      ok: true,
      data: {
        tripDays: 2,
        dayIdeas: [
          { day: 1, title: "Jour 1", bullets: ["Matin : visite"] },
          { day: 2, title: "Jour 2", bullets: ["Matin : musee"] },
        ],
      },
    });
  };

  try {
    const res = await fetchItineraryGroqFirst({
      destination: "Paris",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
    });
    assert.equal(res.ok, true);
    assert.equal(res.data.dayIdeas.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
