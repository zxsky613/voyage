import { getImagesApiPostUrl } from "./imagesApi.js";

const memo = Object.create(null);

/**
 * @param {import('../lib/images/types.js').ResolveImageParams} params
 * @returns {Promise<import('../lib/images/types.js').ResolvedImage|null>}
 */
export async function getResolvedImage(params) {
  const key = `${params.kind}|${params.label}|${params.context || ""}|${params.uiLang}`;
  if (memo[key]) return memo[key];

  const task = (async () => {
    try {
      const r = await fetch(getImagesApiPostUrl("resolve"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: params.kind,
          label: params.label,
          context: params.context || "",
          uiLang: params.uiLang,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok || !j?.url) {
        if (import.meta.env.DEV) {
          const reason = j?.reason || j?.error || "unknown";
          console.warn(
            `[resolve-image] placeholder kind=${params.kind} label="${String(params.label || "").slice(0, 60)}" reason=${reason}`
          );
        }
        return null;
      }
      return {
        url: String(j.url).trim(),
        source: j.source,
        attribution: j.attribution,
        entityId: j.entityId,
        cached: j.cached,
      };
    } catch {
      if (import.meta.env.DEV) {
        console.warn(
          `[resolve-image] placeholder kind=${params.kind} label="${String(params.label || "").slice(0, 60)}" reason=network_error`
        );
      }
      return null;
    }
  })();

  memo[key] = task;
  try {
    return await task;
  } finally {
    delete memo[key];
  }
}

/** @param {import('../lib/images/types.js').ResolveImageParams} params */
export async function getResolvedImageUrl(params) {
  const hit = await getResolvedImage(params);
  return hit?.url || "";
}
