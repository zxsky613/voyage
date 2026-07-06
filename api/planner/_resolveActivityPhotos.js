import { resolveImage } from "../images/_resolveImage.js";
import { resolveWikimediaGeoPhoto } from "../images/_wikimediaGeoPhotos.js";
import {
  pickTripAdvisorActivityPhoto,
  collectActivityPhotoUrls,
} from "../../lib/planner/activityImageSource.js";
import { mapResolverSourceToPhotoSource } from "../../lib/planner/photoSource.js";

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<unknown>} fn
 * @param {number} [concurrency]
 */
async function mapPool(items, fn, concurrency = 3) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, list.length || 1) }, async () => {
    while (cursor < list.length) {
      const idx = cursor++;
      results[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/** @param {string} url */
function normalizePhotoKey(url) {
  return String(url || "")
    .trim()
    .toLowerCase()
    .replace(/\/\d+x\d+\//, "/");
}

/**
 * Choisit la première URL non utilisée ; tente les suivantes si doublon.
 * @param {string[]} urls
 * @param {Set<string>} usedKeys
 * @returns {string}
 */
function pickDedupedPhotoUrl(urls, usedKeys) {
  for (const raw of urls || []) {
    const url = String(raw || "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const key = normalizePhotoKey(url);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    return url;
  }
  return "";
}

/**
 * Cascade photos serveur : TA → Wikidata/Commons entité → Commons geosearch → placeholder.
 * Anti-doublon par génération (usedKeys partagé).
 *
 * @param {Array<Record<string, unknown>>} places
 * @param {{ city: string, country?: string, uiLang?: string, concurrency?: number }} options
 */
export async function resolveActivityPhotosForPlaces(places, options) {
  const city = String(options.city || "").trim();
  const country = String(options.country || "").trim();
  const uiLang = String(options.uiLang || "fr").trim();
  const context = country ? `${city}, ${country}` : city;
  const usedKeys = new Set();
  /** @type {Record<string, number>} */
  const photoSourceCounts = {
    tripadvisor: 0,
    wikimedia: 0,
    wikimedia_geo: 0,
    placeholder: 0,
  };
  let wikimediaGeoCalls = 0;
  let wikimediaGeoCacheHits = 0;

  const resolved = await mapPool(
    Array.isArray(places) ? places : [],
    async (place) => {
      const name = String(place?.name || "").trim();
      const placeId = String(place?.id || "").trim();
      let photoSource = "placeholder";
      let photoUrl = "";
      /** @type {string[]} */
      let photos = collectActivityPhotoUrls(place);

      const taCandidates = photos.length ? photos : [pickTripAdvisorActivityPhoto(place)].filter(Boolean);
      if (taCandidates.length) {
        photoUrl = pickDedupedPhotoUrl(taCandidates, usedKeys);
        if (photoUrl) {
          photoSource = "tripadvisor";
          photos = taCandidates;
        }
      }

      if (!photoUrl && name) {
        const label = String(place?.searchName || name).trim();
        try {
          const outcome = await resolveImage({
            kind: "activity",
            label,
            context,
            uiLang,
          });
          const wikiUrl = String(outcome?.image?.url || "").trim();
          if (/^https?:\/\//i.test(wikiUrl)) {
            photoUrl = pickDedupedPhotoUrl([wikiUrl], usedKeys);
            if (photoUrl) {
              photoSource = mapResolverSourceToPhotoSource(outcome?.image?.source) || "wikimedia";
              photos = [photoUrl];
            }
          }
        } catch {
          /* wikidata throttled / miss → geosearch */
        }
      }

      if (!photoUrl) {
        const lat = Number(place?.latitude);
        const lon = Number(place?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          wikimediaGeoCalls += 1;
          const geo = await resolveWikimediaGeoPhoto({
            latitude: lat,
            longitude: lon,
            placeName: name,
            logContext: `id=${placeId} name="${name.slice(0, 40)}"`,
          });
          if (geo.cached) wikimediaGeoCacheHits += 1;
          const geoUrl = String(geo.url || "").trim();
          if (/^https?:\/\//i.test(geoUrl)) {
            photoUrl = pickDedupedPhotoUrl([geoUrl], usedKeys);
            if (photoUrl) {
              photoSource = "wikimedia_geo";
              photos = [photoUrl];
            }
          }
        } else {
          console.info(`[photos-cascade] geo skip no coords id=${placeId} name="${name}"`);
        }
      }

      if (!photoUrl) {
        photoSource = "placeholder";
        photos = [];
      }

      photoSourceCounts[photoSource] = (photoSourceCounts[photoSource] || 0) + 1;

      return {
        ...place,
        photos: photoUrl ? [photoUrl, ...photos.filter((u) => u !== photoUrl)].slice(0, 3) : [],
        photoUrl: photoUrl || undefined,
        photoSource,
      };
    },
    options.concurrency || 3
  );

  return {
    places: resolved,
    photoSourceCounts,
    wikimediaGeoCalls,
    wikimediaGeoCacheHits,
  };
}
