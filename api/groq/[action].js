import { sendJson } from "../_helpers.js";
import { handler as descriptionHandler } from "./_description.js";
import { handler as itineraryHandler } from "./_itinerary.js";
import { handler as suggestedActivitiesHandler } from "./_suggested-activities.js";
import { handler as suggestionsHandler } from "./_suggestions.js";
import { handler as tipsHandler } from "./_tips.js";

/** @type {Record<string, (req: import('@vercel/node').VercelRequest, res: import('@vercel/node').VercelResponse) => Promise<void>>} */
const ROUTES = {
  description: descriptionHandler,
  itinerary: itineraryHandler,
  "suggested-activities": suggestedActivitiesHandler,
  suggestions: suggestionsHandler,
  tips: tipsHandler,
};

/**
 * Routeur unique /api/groq/:action — une seule Serverless Function Vercel (limite Hobby).
 */
export default async function handler(req, res) {
  const action = String(req.query?.action || "").trim();
  const route = ROUTES[action];
  if (!route) {
    return sendJson(res, 404, { error: `Route Groq inconnue: ${action || "(vide)"}` });
  }
  return route(req, res);
}
