import { sendJson } from "../_helpers.js";
import { handler as generateItineraryHandler } from "./_generateItinerary.js";
import { handler as verifyItineraryHandler } from "./_verifyItinerary.js";
import { handler as suggestHighlightsHandler } from "./_suggestHighlights.js";

/** @type {Record<string, (req: import('@vercel/node').VercelRequest, res: import('@vercel/node').VercelResponse) => Promise<void>>} */
const ROUTES = {
  "generate-itinerary": generateItineraryHandler,
  "verify-itinerary": verifyItineraryHandler,
  "suggest-highlights": suggestHighlightsHandler,
};

/**
 * Routeur unique /api/planner/:action — une seule Serverless Function Vercel.
 */
export default async function handler(req, res) {
  const action = String(req.query?.action || "").trim();
  const route = ROUTES[action];
  if (!route) {
    return sendJson(res, 404, { error: `Route planner inconnue: ${action || "(vide)"}` });
  }
  return route(req, res);
}
