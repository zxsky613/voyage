import { normalizeLabelKey, splitResolveImageLabelContext, inferDefaultHeroResolveContext } from "../../lib/images/normalizeLabel.js";
import { isLikelyOrbitalOrMapImagery } from "../../lib/images/wikiImageFilters.js";
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
import { candidateToResolved, firstValidCandidate } from "./_headCheck.js";
import { fetchUnsplashHeroCandidate, fetchUnsplashPlaceCandidate } from "./_unsplashClient.js";
import { fetchWikipediaCandidates } from "./_wikipediaClient.js";

/**
 * @param {import('../../lib/images/types.js').ResolveImageParams} params
 * @returns {Promise<import('../../lib/images/types.js').ResolvedImage|null>}
 */
export async function resolveImage(params) {
  const kind = params.kind;
  const uiLang = String(params.uiLang || "fr").trim();
  const context = String(params.context || "").trim();
  const { searchLabel, context: geoContext } = splitResolveImageLabelContext(params.label, context);
  const effectiveContext = geoContext || (kind === "hero" ? inferDefaultHeroResolveContext(params.label) : "");
  const labelNormalized = normalizeLabelKey(params.label, context || effectiveContext);

  if (!labelNormalized && !searchLabel) return null;

  if (isCacheConfigured()) {
    const cached = await readCacheByLabel(labelNormalized, kind);
    if (cached?.url) {
      const blocked =
        kind === "hero" &&
        isLikelyOrbitalOrMapImagery(cached.url, decodeURIComponent(cached.url), "");
      if (!blocked) return cached;
    }
  }

  const entity = await resolveEntity(searchLabel, uiLang, kind, effectiveContext);

  if (entity?.qid && isCacheConfigured()) {
    const byEntity = await readCacheByEntity(entity.qid, kind);
    if (byEntity?.url) {
      const blocked =
        kind === "hero" &&
        isLikelyOrbitalOrMapImagery(byEntity.url, decodeURIComponent(byEntity.url), "");
      if (!blocked) return { ...byEntity, cached: true };
    }
  }

  /** @type {import('../../lib/images/types.js').ImageCandidate[]} */
  let candidateLists = [];

  if (kind === "hero") {
    const heroOpts = { kind: /** @type {'hero'} */ ("hero") };
    if (entity) {
      const [category, p18, wiki, unsplash] = await Promise.all([
        entity.commonsCategory
          ? fetchCommonsCategoryScenicCandidates(entity.commonsCategory, heroOpts)
          : Promise.resolve([]),
        entity.p18Filenames?.length ? fetchP18Candidates(entity.p18Filenames, heroOpts) : Promise.resolve([]),
        entity.sitelinks?.length ? fetchWikipediaCandidates(entity.sitelinks, heroOpts) : Promise.resolve([]),
        fetchUnsplashHeroCandidate(searchLabel, effectiveContext),
      ]);
      const wikiScenic = wiki.filter((c) => !isLikelyOrbitalOrMapImagery(c.url || "", "", ""));
      candidateLists = [
        ...category,
        ...p18,
        ...wikiScenic,
        ...(unsplash ? [unsplash] : []),
      ];
    } else {
      const unsplash = await fetchUnsplashHeroCandidate(searchLabel, effectiveContext);
      if (unsplash) candidateLists = [unsplash];
    }
  } else {
    const [p18, wiki, unsplash] = await Promise.all([
      entity?.p18Filenames?.length ? fetchP18Candidates(entity.p18Filenames) : Promise.resolve([]),
      entity?.sitelinks?.length ? fetchWikipediaCandidates(entity.sitelinks) : Promise.resolve([]),
      fetchUnsplashPlaceCandidate(searchLabel, effectiveContext),
    ]);
    candidateLists = [...p18, ...wiki, ...(unsplash ? [unsplash] : [])];
  }

  candidateLists.sort((a, b) => (b.score || 0) - (a.score || 0));

  const valid = await firstValidCandidate(candidateLists);
  if (!valid?.url) return null;

  const resolved = candidateToResolved(valid, entity?.qid);
  resolved.cached = false;

  if (isCacheConfigured()) {
    await writeCache({
      labelNormalized,
      kind,
      entityId: entity?.qid,
      candidate: valid,
    });
  }

  return resolved;
}
