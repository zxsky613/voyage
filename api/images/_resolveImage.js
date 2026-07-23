import { normalizeLabel, splitResolveImageLabelContext, inferDefaultHeroResolveContext } from "../../lib/images/normalizeLabel.js";
import { heroCacheLabelKey, isSupersededHeroCacheEntry } from "../../lib/images/heroCacheKey.js";
import {
  ensureStoredHeroImageUrl,
  isCommonsThumbPath,
  isWikimediaUploadUrl,
} from "../../lib/images/commonsThumbUrl.js";
import { isLikelyOrbitalOrMapImagery, isLikelyWikiBrandOrLogoImage, isLikelyNonScenicHeroImagery } from "../../lib/images/wikiImageFilters.js";
import { passesEntityImageGuards, resetImageGeoMismatchLog } from "../../lib/images/imageEntityGuard.js";
import {
  isCacheConfigured,
  noteCacheStatusAtResolveStart,
  readCacheByEntity,
  readCacheByLabel,
  writeCache,
} from "./_cache.js";
import { fetchHeroP18Candidates, fetchP18Candidates } from "./_commonsClient.js";
import {
  buildHeroFeaturedQualitySteps,
  buildHeroViewsLandscapesSteps,
  fetchHeroCommonsCategoryCandidates,
  fetchHeroGeosearchCandidates,
} from "./_heroEmotionalCommons.js";
import { resolveEntity } from "./_entityResolver.js";
import { WikiApiThrottledError } from "./_fetchRetry.js";
import { candidateToResolved, headCheckUrl } from "./_headCheck.js";
import { fetchWikipediaCandidates, fetchWikipediaPageCandidate } from "./_wikipediaClient.js";
import { fetchWikivoyageCandidates } from "./_wikivoyageClient.js";

/** @param {string} label */
function destinationTokensForHero(label) {
  return String(label || "")
    .split(/[,|]/)
    .flatMap((part) =>
      part
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 4)
    );
}

/**
 * @param {import('../../lib/images/types.js').ImageCandidate|null|undefined} c
 * @returns {import('../../lib/images/types.js').HeroSource}
 */
function inferHeroSource(c) {
  if (!c) return "fallback";
  if (c.heroSource) return c.heroSource;
  if (c.source === "wikidata-commons") return "p18";
  if (c.source === "wikipedia") return "pageimage";
  if (c.source === "wikivoyage") return "wikivoyage";
  if (c.source === "commons-category") return "commons";
  return "fallback";
}

/**
 * @param {import('../../lib/images/types.js').ImageCandidate} c
 * @param {import('../../lib/images/types.js').ImageKind} kind
 */
function passesKindFilters(c, kind) {
  if (!c?.url) return false;
  if (kind === "hero") {
    if (isLikelyOrbitalOrMapImagery(c.url, "", "")) return false;
    if (isLikelyWikiBrandOrLogoImage(c.url, "")) return false;
    if (isLikelyNonScenicHeroImagery(c.url, decodeURIComponent(c.url), "")) return false;
  }
  return true;
}

/**
 * Premier candidat valide (filtres + verrous entité + HEAD).
 * @param {import('../../lib/images/types.js').ImageCandidate[]} candidates
 * @param {import('../../lib/images/types.js').ImageKind} kind
 * @param {Awaited<ReturnType<typeof resolveEntity>>|null|undefined} entity
 */
async function firstValidSequential(candidates, kind, entity = null) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const c of list) {
    if (!passesKindFilters(c, kind)) continue;
    if (!passesEntityImageGuards(c, entity?.geoAnchor, kind)) continue;
    if (await headCheckUrl(c.url)) return c;
  }
  return null;
}

/**
 * Pageimage hero — uiLang puis en → fr… ; passe à la langue suivante si le candidat est filtré.
 * @param {{ lang: string, title: string }[]} sitelinks
 * @param {string} uiLang
 * @param {{ kind?: import('../../lib/images/types.js').ImageKind }} heroOpts
 * @param {typeof firstValidSequential} pickValid
 * @param {NonNullable<Awaited<ReturnType<typeof resolveEntity>>>} entity
 */
async function resolveHeroPageimageStep(sitelinks, uiLang, heroOpts, pickValid, entity) {
  const links = Array.isArray(sitelinks) ? sitelinks : [];
  const byLang = Object.fromEntries(
    links.map(({ lang, title }) => [String(lang || "").slice(0, 2), { lang, title }])
  );
  const langOrder = [...new Set([String(uiLang || "en").slice(0, 2), "en", "fr", "de", "es", "it", "zh"])];
  for (const l of langOrder) {
    const link = byLang[l];
    if (!link) continue;
    const c = await fetchWikipediaPageCandidate(link.lang, link.title, heroOpts);
    if (!c) continue;
    const hit = await pickValid([c], "hero", entity);
    if (hit) return hit;
  }
  return null;
}

/**
 * Résolution entité héro — cascade séquentielle (pageimage → P18 → Commons curatées → WV → geosearch).
 * @param {NonNullable<Awaited<ReturnType<typeof resolveEntity>>>} entity
 * @param {string} uiLang
 * @param {string} searchLabel
 */
async function resolveHeroFromEntity(entity, uiLang, searchLabel) {
  const heroOpts = {
    kind: /** @type {'hero'} */ ("hero"),
    uiLang,
    destinationTokens: destinationTokensForHero(searchLabel),
  };

  if (entity.sitelinks?.length) {
    const pageHit = await resolveHeroPageimageStep(
      entity.sitelinks,
      uiLang,
      heroOpts,
      firstValidSequential,
      entity
    );
    if (pageHit) return pageHit;
  }

  if (entity.p18Filenames?.length) {
    const p18 = await fetchHeroP18Candidates(entity.p18Filenames, heroOpts);
    const hit = await firstValidSequential(p18, "hero", entity);
    if (hit) return hit;
  }

  for (const step of buildHeroFeaturedQualitySteps(entity)) {
    const batch = await fetchHeroCommonsCategoryCandidates(step.name, step.heroSource, heroOpts);
    const hit = await firstValidSequential(batch, "hero", entity);
    if (hit) return hit;
  }

  const wikivoyage = (await fetchWikivoyageCandidates(entity, heroOpts, uiLang)).map((c) => ({
    ...c,
    heroSource: /** @type {const} */ ("wikivoyage"),
  }));
  const wvHit = await firstValidSequential(wikivoyage, "hero", entity);
  if (wvHit) return wvHit;

  for (const step of buildHeroViewsLandscapesSteps(entity)) {
    const batch = await fetchHeroCommonsCategoryCandidates(step.name, step.heroSource, heroOpts);
    const hit = await firstValidSequential(batch, "hero", entity);
    if (hit) return hit;
  }

  const geo = await fetchHeroGeosearchCandidates(entity, heroOpts);
  const geoHit = await firstValidSequential(geo, "hero", entity);
  if (geoHit) return geoHit;

  return null;
}

/**
 * Landmark / activity — P18 puis Wikipedia (séquentiel).
 * @param {NonNullable<Awaited<ReturnType<typeof resolveEntity>>>} entity
 */
async function resolvePlaceFromEntity(entity, kind) {
  if (entity.p18Filenames?.length) {
    const p18 = await fetchP18Candidates(entity.p18Filenames);
    const hit = await firstValidSequential(p18, kind, entity);
    if (hit) return hit;
  }

  if (entity.sitelinks?.length) {
    const wiki = await fetchWikipediaCandidates(entity.sitelinks);
    const hit = await firstValidSequential(wiki, kind, entity);
    if (hit) return hit;
  }

  return null;
}

function isBlockedHeroCacheEntry(url, kind) {
  if (kind !== "hero") return false;
  const decodedTitle = decodeURIComponent(String(url || ""));
  return (
    isLikelyOrbitalOrMapImagery(url, decodedTitle, "") ||
    isLikelyWikiBrandOrLogoImage(url, decodedTitle) ||
    isLikelyNonScenicHeroImagery(url, decodedTitle, "")
  );
}

/**
 * Migration douce : réécrit les entrées cache héros (original ou 1600px → thumb 1280px standard).
 * @param {import('../../lib/images/types.js').ResolvedImage} entry
 * @param {{ labelNormalized: string, kind: import('../../lib/images/types.js').ImageKind, entityId?: string }} ctx
 */
async function maybeMigrateCachedHeroThumb(entry, ctx) {
  if (ctx.kind !== "hero" || !entry?.url) return entry;
  const nextUrl = ensureStoredHeroImageUrl(entry.url, "hero");
  if (nextUrl === entry.url) return entry;
  if (isWikimediaUploadUrl(entry.url) && !isCommonsThumbPath(nextUrl)) return entry;
  await writeCache({
    labelNormalized: ctx.labelNormalized,
    kind: ctx.kind,
    entityId: ctx.entityId || entry.entityId,
    candidate: {
      url: nextUrl,
      source: entry.source,
      heroSource: entry.heroSource,
      author: entry.attribution?.author,
      license: entry.attribution?.license,
      licenseUrl: entry.attribution?.licenseUrl,
      sourceUrl: entry.attribution?.sourceUrl,
    },
  });
  return { ...entry, url: nextUrl };
}

/**
 * @typedef {import('../../lib/images/types.js').ResolvedImage} ResolvedImage
 * @typedef {'wikidata_throttled' | 'not_found' | 'timeout' | 'cache_disabled' | 'filtered'} ResolveImageReason
 * @typedef {'hit' | 'miss' | 'disabled'} ImageCacheField
 * @typedef {{ image: ResolvedImage|null, heroSource?: import('../../lib/images/types.js').HeroSource, reason?: ResolveImageReason, cache: ImageCacheField }} ResolveImageOutcome
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
  const labelNormalized =
    kind === "hero" ? heroCacheLabelKey(params.label, context) : normalizeLabel(params.label, context);

  let cacheField = noteCacheStatusAtResolveStart();
  const cacheReady = isCacheConfigured() && cacheField !== "disabled";

  if (!labelNormalized && !searchLabel) {
    return { image: null, heroSource: "fallback", reason: "not_found", cache: cacheField };
  }

  if (cacheReady) {
    const labelCached = await readCacheByLabel(labelNormalized, kind);
    if (labelCached.cache === "disabled") cacheField = "disabled";
    else if (labelCached.cache === "hit" && labelCached.entry?.url) {
      const cached = await maybeMigrateCachedHeroThumb(labelCached.entry, {
        labelNormalized,
        kind,
      });
      if (!isBlockedHeroCacheEntry(cached.url, kind) && !isSupersededHeroCacheEntry(cached)) {
        return {
          image: { ...cached, heroSource: cached.heroSource || inferHeroSource({ source: cached.source }) },
          heroSource: cached.heroSource || inferHeroSource({ source: cached.source }),
          cache: "hit",
        };
      }
    } else if (labelCached.cache === "miss") {
      cacheField = "miss";
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
    if (wikiThrottled && cacheField === "disabled") {
      return { image: null, heroSource: "fallback", reason: "cache_disabled", cache: "disabled" };
    }
    return {
      image: null,
      heroSource: "fallback",
      reason: wikiThrottled ? "wikidata_throttled" : "not_found",
      cache: cacheField,
    };
  }

  if (kind === "hero") {
    resetImageGeoMismatchLog();
    console.info(
      `entityAnchor: ${entity.qid}${entity.countryLabel ? ` (${entity.countryLabel})` : ""}`
    );
  }

  if (entity?.qid && cacheReady && cacheField !== "disabled") {
    const byEntity = await readCacheByEntity(entity.qid, kind);
    if (byEntity.cache === "disabled") cacheField = "disabled";
    else if (byEntity.cache === "hit" && byEntity.entry?.url) {
      const byEntityImage = await maybeMigrateCachedHeroThumb(byEntity.entry, {
        labelNormalized,
        kind,
        entityId: entity.qid,
      });
      if (!isBlockedHeroCacheEntry(byEntityImage.url, kind) && !isSupersededHeroCacheEntry(byEntityImage)) {
        const heroSource = byEntityImage.heroSource || inferHeroSource({ source: byEntityImage.source });
        return {
          image: { ...byEntityImage, cached: true, heroSource },
          heroSource,
          cache: "hit",
        };
      }
    }
  }

  const valid =
    kind === "hero"
      ? await resolveHeroFromEntity(entity, uiLang, searchLabel || params.label)
      : await resolvePlaceFromEntity(entity, kind);

  if (!valid?.url) {
    return { image: null, heroSource: "fallback", reason: "not_found", cache: cacheField };
  }

  const resolved = candidateToResolved(valid, entity.qid);
  resolved.heroSource = inferHeroSource(valid);
  resolved.cached = false;

  if (cacheReady && cacheField !== "disabled") {
    await writeCache({
      labelNormalized,
      kind,
      entityId: entity.qid,
      candidate: valid,
    });
  }

  return {
    image: resolved,
    heroSource: resolved.heroSource,
    cache: cacheField === "disabled" ? "disabled" : "miss",
  };
}
