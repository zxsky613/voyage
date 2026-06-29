import { handleCors, sendJson, parseBody, getUnsplashKey } from "../_helpers.js";

/**
 * Proxy Unsplash Search — la clé reste côté serveur.
 * POST { query, per_page?, content_filter?, orientation? }
 * → { ok, results: UnsplashPhoto[] }
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const key = getUnsplashKey();
  if (!key) {
    return sendJson(res, 503, {
      ok: false,
      error: "UNSPLASH_ACCESS_KEY non configurée sur le serveur.",
    });
  }

  const body = parseBody(req);
  const q = String(body.query || "").trim();
  if (!q) {
    return sendJson(res, 400, { ok: false, error: "query requis." });
  }

  const perPage = Math.min(30, Math.max(1, Number(body.per_page) || 15));
  const orientation = String(body.orientation || "landscape").trim() || "landscape";
  const contentFilter = String(body.content_filter || "").trim();

  try {
    const params = new URLSearchParams();
    params.set("query", q);
    params.set("orientation", orientation);
    params.set("per_page", String(perPage));
    if (contentFilter === "high" || contentFilter === "low") {
      params.set("content_filter", contentFilter);
    }

    const response = await fetch(`https://api.unsplash.com/search/photos?${params.toString()}`, {
      headers: { Authorization: `Client-ID ${key}` },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return sendJson(res, response.status, {
        ok: false,
        error: `Unsplash ${response.status}: ${errText.slice(0, 200)}`,
        results: [],
      });
    }

    const json = await response.json();
    return sendJson(res, 200, {
      ok: true,
      results: Array.isArray(json?.results) ? json.results : [],
    });
  } catch (e) {
    return sendJson(res, 502, {
      ok: false,
      error: String(e?.message || e),
      results: [],
    });
  }
}
