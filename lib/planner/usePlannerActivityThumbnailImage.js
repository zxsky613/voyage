import { useEffect, useState } from "react";
import { categoryForActivityTitle } from "./activityCategoryThumb.js";
import {
  isActivityPhotoPlaceholder,
  pickActivityDisplayPhotoUrl,
  pickResolvedActivityPhoto,
  pickTripAdvisorActivityPhoto,
} from "./activityImageSource.js";
import {
  clearItineraryBulletImageCacheEntry,
  noteItineraryBulletImageCache,
  readItineraryBulletImageCache,
  scheduleItineraryBulletImageFetch,
} from "./plannerActivityImageCache.js";

function shouldShowTripAdvisorAttribution(activity, url) {
  const ta = String(activity?.tripadvisorUrl || activity?.tripadvisor_url || "").trim();
  return Boolean(ta && url);
}

/**
 * Résolution photo activité planning (cache RAM + fetch async).
 * @param {{
 *   activity: object,
 *   cityLabel: string,
 *   language: string,
 *   cacheKey: string,
 *   rawTitle: string,
 *   onPhotoResolved?: (id: string|number, url: string) => void,
 *   resolveActivityPlaceImage: (opts: object) => Promise<string>,
 *   isMealOrRest?: (title: string) => boolean,
 * }} opts
 */
export function usePlannerActivityThumbnailImage({
  activity,
  cityLabel,
  language,
  cacheKey,
  rawTitle,
  onPhotoResolved,
  resolveActivityPlaceImage,
  isMealOrRest = () => false,
}) {
  const storedPhoto = pickActivityDisplayPhotoUrl(activity);
  const resolvedPhoto = pickResolvedActivityPhoto(activity);
  const taPhotoUrl =
    pickTripAdvisorActivityPhoto(activity) ||
    (storedPhoto && shouldShowTripAdvisorAttribution(activity, storedPhoto) ? storedPhoto : "");
  const initialPhoto =
    resolvedPhoto || taPhotoUrl || storedPhoto || readItineraryBulletImageCache(cacheKey) || "";

  const [src, setSrc] = useState(() => initialPhoto);
  const [loading, setLoading] = useState(
    () => !initialPhoto && !isActivityPhotoPlaceholder(activity) && !isMealOrRest(rawTitle)
  );
  const [imgBroken, setImgBroken] = useState(false);
  const categoryThumb = categoryForActivityTitle(rawTitle);

  useEffect(() => {
    setImgBroken(false);
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    if (!rawTitle || isMealOrRest(rawTitle) || isActivityPhotoPlaceholder(activity)) {
      setSrc("");
      setLoading(false);
      return undefined;
    }
    const prefetched = resolvedPhoto || taPhotoUrl || storedPhoto;
    if (prefetched) {
      setSrc(prefetched);
      setLoading(false);
      return undefined;
    }
    const memHit = readItineraryBulletImageCache(cacheKey);
    if (memHit) {
      setSrc(memHit);
      setLoading(false);
      return undefined;
    }
    setSrc("");
    setLoading(true);
    scheduleItineraryBulletImageFetch(async () => {
      try {
        const url = await resolveActivityPlaceImage({
          title: rawTitle,
          location: activity?.location,
          tripTitle: cityLabel,
          uiLang: language,
          photos: activity?.photos,
          activityMeta: activity,
        });
        if (cancelled) return;
        const finalUrl = String(url || "").trim();
        if (finalUrl) {
          noteItineraryBulletImageCache(cacheKey, finalUrl);
          if (typeof onPhotoResolved === "function" && activity?.id) {
            onPhotoResolved(activity.id, finalUrl);
          }
        }
        setSrc(finalUrl);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    rawTitle,
    cityLabel,
    language,
    taPhotoUrl,
    storedPhoto,
    resolvedPhoto,
    activity,
    onPhotoResolved,
    resolveActivityPlaceImage,
    isMealOrRest,
  ]);

  const onImageError = () => {
    clearItineraryBulletImageCacheEntry(cacheKey);
    setImgBroken(true);
    setSrc("");
  };

  return { src, loading, imgBroken, categoryThumb, onImageError };
}
