import { normalizeLabelKey, splitResolveImageLabelContext, inferDefaultHeroResolveContext } from "../../lib/images/normalizeLabel.js";
import { isLikelyOrbitalOrMapImagery, isLikelyWikiBrandOrLogoImage } from "../../lib/images/wikiImageFilters.js";
import {
  isCacheConfigured,
  readCacheByEntity,
  readCacheByLabel,
  writeCache,
} from "./_cache.js";
import {
  fetchCommonsCategoryScenicCandidates,
  fetchP18Candidates,
} from "./_commonsClient.js";
import { resolveEntity } from "./_entityResolver.js";
import { WikiApiThrottledError } from "./_fetchRetry.js";
import { candidateToResolved, headCheckUrl } from "./_headCheck.js";
import { fetchWikipediaCandidates } from "./_wikipediaClient.js";
import { fetchWikivoyageCandidates } from "./_wikivoyageClient.js";

/**
 * @param {import('../../lib/images/types.js').ImageCandidate} c
 * @param {import('../../lib/images/types.js').ImageKind} kind
 */
function passesKindFilters(c, kind) {
  if (!c?.url) return false;
  if (kind === "hero") {
    if (isLikelyOrbitalOrMapImagery(c.url, "", "")) return false;
    if (isLikelyWikiBrandOrLogoImage(c.url, "")) return false;
  }
  return true;
}

/**
 * Premier candidat valide (filtres + HEAD) — ordre séquentiel, stop à la 1re image sûre.
 * @param {import('../../lib/images/types.js').ImageCandidate[]} candidates
 * @param {import('../../lib/images/types.js').ImageKind} kind
 */
async function firstValidSequential(candidates, kind) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const c of list) {
    if (!passesKindFilters(c, kind)) continue;
    if (await headCheckUrl(c.url)) return c;
  }
  return null;
}

/**
 * Résolution entité héro — P18 → catégorie Commons → Wikipedia → Wikivoyage (banner puis pageimages).
 * @param {NonNullable<Awaited<ReturnType<typeof resolveEntity>>>} entity
 * @param {string} uiLang
 */
async function resolveHeroFromEntity(entity, uiLang) {
  const heroOpts = { kind: /** @type {'hero'} */ ("hero") };

  if (entity.p18Filenames?.length) {
    const p18 = await fetchP18Candidates(entity.p18Filenames, heroOpts);
    const hit = await firstValidSequential(p18, "hero");
    if (hit) return hit;
  }

  if (entity.commonsCategory) {
    const category = await fetchCommonsCategoryScenicCandidates(entity.commonsCategory, heroOpts);
    const hit = await firstValidSequential(category, "hero");
    if (hit) return hit;
  }

  if (entity.sitelinks?.length) {
    const wiki = await fetchWikipediaCandidates(entity.sitelinks, heroOpts);
    const hit = await firstValidSequential(wiki, "hero");
    if (hit) return hit;
  }

  const wikivoyage = await fetchWikivoyageCandidates(entity, heroOpts, uiLang);
  const wvHit = await firstValidSequential(wikivoyage, "hero");
  if (wvHit) return wvHit;

  return null;
}

/**
 * Landmark / activity — P18 puis Wikipedia (séquentiel).
 * @param {NonNullable<Awaited<ReturnType<typeof resolveEntity>>>} entity
 */
async function resolvePlaceFromEntity(entity, kind) {
  if (entity.p18Filenames?.length) {
    const p18 = await fetchP18Candidates(entity.p18Filenames);
    const hit = await firstValidSequential(p18, kind);
    if (hit) return hit;
  }

  if (entity.sitelinks?.length) {
    const wiki = await fetchWikipediaCandidates(entity.sitelinks);
    const hit = await firstValidSequential(wiki, kind);
    if (hit) return hit;
  }

  return null;
}

/**
 * @typedef {import('../../lib/images/types.js').ResolvedImage} ResolvedImage
 * @typedef {'wikidata_throttled' | 'not_found' | 'timeout' | 'cache_disabled' | 'filtered'} ResolveImageReason
 * @typedef {{ image: ResolvedImage|null, reason?: ResolveImageReason }} ResolveImageOutcome
 */

/**
 * @param {import('../../lib/images/types.js').ResolveImageParams} params
 * @returns {Promise<ResolveImageOutcome>}
 */
export async function resolveImage(params) {
  const kind = params.kind;
  const uiLang = String(params.uiLang || "fr").trim();
  const context = String(params.context || "").trim();
  const { searchLabel, context: geoContext } = splitResolveImageLabelContext(params.label, context);
  const effectiveContext = geoContext || (kind === "hero" ? inferDefaultHeroResolveContext(params.label) : "");
  const labelNormalized = normalizeLabelKey(params.label, context || effectiveContext);

  if (!labelNormalized && !searchLabel) {
    return { image: null, reason: "not_found" };
  }

  if (isCacheConfigured()) {
    const cached = await readCacheByLabel(labelNormalized, kind);
    if (cached?.url) {
      const decodedTitle = decodeURIComponent(cached.url);
      const blocked =
        kind === "hero" &&
        (isLikelyOrbitalOrMapImagery(cached.url, decodedTitle, "") ||
          isLikelyWikiBrandOrLogoImage(cached.url, decodedTitle));
      if (!blocked) return { image: cached };
    }
  }

  let wikiThrottled = false;
  const entity = await (async () => {
    try {
      return await resolveEntity(searchLabel, uiLang, kind, effectiveContext);
    } catch (err) {
      if (err instanceof WikiApiThrottledError) {
        wikiThrottled = true;
        return null;
      }
      throw err;
    }
  })();

  if (!entity) {
    if (wikiThrottled && !isCacheConfigured()) {
      return { image: null, reason: "cache_disabled" };
    }
    return { image: null, reason: wikiThrottled ? "wikidata_throttled" : "not_found" };
  }

  if (entity?.qid && isCacheConfigured()) {
    const byEntity = await readCacheByEntity(entity.qid, kind);
    if (byEntity?.url) {
      const decodedTitle = decodeURIComponent(byEntity.url);
      const blocked =
        kind === "hero" &&
        (isLikelyOrbitalOrMapImagery(byEntity.url, decodedTitle, "") ||
          isLikelyWikiBrandOrLogoImage(byEntity.url, decodedTitle));
      if (!blocked) return { image: { ...byEntity, cached: true } };
    }
  }

  const valid =
    kind === "hero"
      ? await resolveHeroFromEntity(entity, uiLang)
      : await resolvePlaceFromEntity(entity, kind);

  if (!valid?.url) {
    return { image: null, reason: "not_found" };
  }

  const resolved = candidateToResolved(valid, entity.qid);
  resolved.cached = false;

  if (isCacheConfigured()) {
    await writeCache({
      labelNormalized,
      kind,
      entityId: entity.qid,
      candidate: valid,
    });
  }

  return { image: resolved };
}
