import React from "react";
import { resolveActivityCategoryIcon } from "./activityCategoryIcons.js";
import { buildPlannerActivityImageCacheKey } from "./plannerActivityImageCache.js";
import { usePlannerActivityThumbnailImage } from "./usePlannerActivityThumbnailImage.js";

/**
 * Vignette 54×54 — photo async ou icône catégorie + pastille numérotée.
 * @param {{
 *   activity: object,
 *   cityLabel: string,
 *   language: string,
 *   orderInDay: number,
 *   markerColor: string,
 *   onPhotoResolved?: (id: string|number, url: string) => void,
 *   resolveActivityPlaceImage: (opts: object) => Promise<string>,
 *   isMealOrRest?: (title: string) => boolean,
 * }} props
 */
export default function PlannerTimelineThumbnail({
  activity,
  cityLabel,
  language,
  orderInDay,
  markerColor,
  onPhotoResolved,
  resolveActivityPlaceImage,
  isMealOrRest,
}) {
  const rawTitle = String(activity?.title || activity?.name || "").trim();
  const cacheKey = buildPlannerActivityImageCacheKey(cityLabel, activity?.id, rawTitle);
  const { src, loading, imgBroken, categoryThumb, onImageError } = usePlannerActivityThumbnailImage({
    activity,
    cityLabel,
    language,
    cacheKey,
    rawTitle,
    onPhotoResolved,
    resolveActivityPlaceImage,
    isMealOrRest,
  });

  const CategoryIcon = resolveActivityCategoryIcon(categoryThumb.iconKey);

  return (
    <div className="relative h-[54px] w-[54px] shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
      {loading ? (
        <div className="h-full w-full animate-pulse bg-slate-200" aria-hidden />
      ) : src && !imgBroken ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={onImageError}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center ${categoryThumb.bgClass}`}
          aria-hidden
        >
          <CategoryIcon className={`h-6 w-6 ${categoryThumb.fgClass}`} strokeWidth={1.75} />
        </div>
      )}
      <span
        className="absolute -left-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-white"
        style={{ backgroundColor: markerColor }}
        aria-hidden
      >
        {orderInDay}
      </span>
    </div>
  );
}
