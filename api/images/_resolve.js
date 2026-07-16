import { handleCors, sendJson, parseBody } from "../_helpers.js";
import { resolveImage } from "./_resolveImage.js";
import { resolveWikimediaGeoPhoto } from "./_wikimediaGeoPhotos.js";

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
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const preferGeo = body.preferGeo === true || body.preferGeo === "true";

  if (!label && !context) {
    return sendJson(res, 400, { ok: false, error: "label ou context requis." });
  }

  if (!["hero", "landmark", "activity"].includes(kind)) {
    return sendJson(res, 400, { ok: false, error: "kind invalide." });
  }

  if (
    kind === "activity"
    && preferGeo
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
  ) {
    try {
      const geo = await resolveWikimediaGeoPhoto({
        latitude,
        longitude,
        placeName: label,
        logContext: `resolve-api label="${label.slice(0, 40)}"`,
      });
      const geoUrl = String(geo.url || "").trim();
      if (/^https?:\/\//i.test(geoUrl)) {
        return sendJson(res, 200, {
          ok: true,
          url: geoUrl,
          source: "wikidata-commons",
          photoSource: "wikimedia_geo",
          heroSource: "fallback",
          cached: Boolean(geo.cached),
          cache: geo.cached ? "hit" : "miss",
        });
      }
    } catch (e) {
      console.error(
        `[images/resolve] geo failed label="${label.slice(0, 80)}" msg=${String(e?.message || e).slice(0, 120)}`
      );
    }
  }

  try {
    const outcome = await Promise.race([
      resolveImage({ kind: /** @type {import('../../lib/images/types.js').ImageKind} */ (kind), label, context, uiLang }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ image: null, reason: "timeout", cache: "miss" }), 12000)
      ),
    ]);

    const result = outcome?.image || null;
    const reason = outcome?.reason;
    const cache = outcome?.cache || "miss";

    if (!result?.url) {
      const failReason = reason || "not_found";
      console.error(
        `[images/resolve] failed kind=${kind} label="${label.slice(0, 80)}" context="${context.slice(0, 40)}" reason=${failReason} cache=${cache}`
      );
      return sendJson(res, 200, {
        ok: false,
        url: "",
        source: "fallback",
        reason: failReason,
        cache,
        error: "Aucune image résolue — utiliser le fallback legacy.",
      });
    }

    if (result.cached) {
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    }

    console.info(
      `[images/resolve] ok kind=${kind} label="${label.slice(0, 80)}" heroSource=${result.heroSource || "fallback"} source=${result.source || ""} cache=${cache}`
    );

    return sendJson(res, 200, {
      ok: true,
      url: result.url,
      source: result.source,
      heroSource: result.heroSource || "fallback",
      attribution: result.attribution,
      entityId: result.entityId,
      cached: Boolean(result.cached),
      cache,
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
      cache: "miss",
      error: String(e?.message || e),
    });
  }
}
