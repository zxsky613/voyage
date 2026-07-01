import { sendJson } from "../_helpers.js";
import { handler as resolveHandler } from "./_resolve.js";
import { handler as unsplashHandler } from "./_unsplash.js";
import { handler as commonsInfoHandler } from "./_commons-info.js";

/** @type {Record<string, (req: import('@vercel/node').VercelRequest, res: import('@vercel/node').VercelResponse) => Promise<void>>} */
const ROUTES = {
  resolve: resolveHandler,
  unsplash: unsplashHandler,
  "commons-info": commonsInfoHandler,
};

/**
 * Routeur unique /api/images/:action — une seule Serverless Function Vercel (limite Hobby).
 * POST /api/images/resolve | unsplash | commons-info
 */
export default async function handler(req, res) {
  const action = String(req.query?.action || "").trim();
  const route = ROUTES[action];
  if (!route) {
    return sendJson(res, 404, { ok: false, error: `Route images inconnue: ${action || "(vide)"}` });
  }
  return route(req, res);
}
