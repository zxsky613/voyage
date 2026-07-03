import { getImagesApiPostUrl } from "./imagesApi.js";

const memo = Object.create(null);

const ACTIVITY_RESOLVE_MAX_CONCURRENT = 3;
let activityResolveActive = 0;
/** @type {Array<() => void>} */
const activityResolveWaitQueue = [];

/**
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function runActivityResolveQueued(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activityResolveActive += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          activityResolveActive -= 1;
          const next = activityResolveWaitQueue.shift();
          if (next) next();
        });
    };
    if (activityResolveActive < ACTIVITY_RESOLVE_MAX_CONCURRENT) run();
    else activityResolveWaitQueue.push(run);
  });
}

/**
 * @param {import('../lib/images/types.js').ResolveImageParams} params
 * @returns {Promise<import('../lib/images/types.js').ResolvedImage|null>}
 */
async function fetchResolvedImage(params) {
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
        const cache = j?.cache ? ` cache=${j.cache}` : "";
        console.warn(
          `[resolve-image] placeholder kind=${params.kind} label="${String(params.label || "").slice(0, 60)}" reason=${reason}${cache}`
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
}

/**
 * @param {import('../lib/images/types.js').ResolveImageParams} params
 * @returns {Promise<import('../lib/images/types.js').ResolvedImage|null>}
 */
export async function getResolvedImage(params) {
  const key = `${params.kind}|${params.label}|${params.context || ""}|${params.uiLang}`;
  if (memo[key]) return memo[key];

  const task = (async () => {
    if (params.kind === "activity") {
      return runActivityResolveQueued(() => fetchResolvedImage(params));
    }
    return fetchResolvedImage(params);
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
