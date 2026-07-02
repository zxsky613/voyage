import { handleCors, sendJson, parseBody } from "../_helpers.js";
import { resolveImage } from "./_resolveImage.js";

const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

function checkRateLimit(ip) {
  const key = String(ip || "unknown");
  const now = Date.now();
  let entry = rateMap.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    entry = { start: now, count: 0 };
    rateMap.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= RATE_MAX;
}

/**
 * POST { kind, label, context?, uiLang? }
 * → ResolvedImage JSON (200 même si vide — le client fallback legacy)
 */
export async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);

  const ip =
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() || req.socket?.remoteAddress || "";
  if (!checkRateLimit(ip)) {
    console.error(
      `[images/resolve] rate limited label="${String(body?.label || "").slice(0, 80)}" reason=timeout`
    );
    return sendJson(res, 429, { ok: false, error: "Rate limit exceeded.", reason: "timeout" });
  }

  const kind = String(body.kind || "hero").trim();
  const label = String(body.label || "").trim();
  const context = String(body.context || "").trim();
  const uiLang = String(body.uiLang || body.language || "fr").trim();

  if (!label && !context) {
    return sendJson(res, 400, { ok: false, error: "label ou context requis." });
  }

  if (!["hero", "landmark", "activity"].includes(kind)) {
    return sendJson(res, 400, { ok: false, error: "kind invalide." });
  }

  try {
    const outcome = await Promise.race([
      resolveImage({ kind: /** @type {import('../../lib/images/types.js').ImageKind} */ (kind), label, context, uiLang }),
      new Promise((resolve) => setTimeout(() => resolve({ image: null, reason: "timeout" }), 12000)),
    ]);

    const result = outcome?.image || null;
    const reason = outcome?.reason;

    if (!result?.url) {
      const failReason = reason || "not_found";
      console.error(
        `[images/resolve] failed kind=${kind} label="${label.slice(0, 80)}" context="${context.slice(0, 40)}" reason=${failReason}`
      );
      return sendJson(res, 200, {
        ok: false,
        url: "",
        source: "fallback",
        reason: failReason,
        error: "Aucune image résolue — utiliser le fallback legacy.",
      });
    }

    if (result.cached) {
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    }

    return sendJson(res, 200, {
      ok: true,
      url: result.url,
      source: result.source,
      attribution: result.attribution,
      entityId: result.entityId,
      cached: Boolean(result.cached),
    });
  } catch (e) {
    console.error(
      `[images/resolve] error kind=${kind} label="${label.slice(0, 80)}" reason=not_found msg=${String(e?.message || e).slice(0, 120)}`
    );
    return sendJson(res, 200, {
      ok: false,
      url: "",
      source: "fallback",
      reason: "not_found",
      error: String(e?.message || e),
    });
  }
}
