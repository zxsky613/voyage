import React, { useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  Bike,
  CalendarCheck,
  Landmark,
  Mountain,
  PartyPopper,
  Plane,
  ShoppingBag,
  TrainFront,
  Users,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import { categoryForActivityTitle } from "../planner/activityCategoryThumb.js";
import {
  isActivityPhotoPlaceholder,
  pickResolvedActivityPhoto,
} from "../planner/activityImageSource.js";
import { encodePhotoUrlForDisplay } from "../planner/encodePhotoUrl.js";

const CATEGORY_ICON_MAP = {
  UtensilsCrossed,
  Users,
  BedDouble,
  Waves,
  ShoppingBag,
  Mountain,
  Landmark,
  Plane,
  TrainFront,
  PartyPopper,
  Bike,
  CalendarCheck,
};

/**
 * Vignette activité carte — même logique que la liste (photo résolue ou placeholder catégorie).
 * @param {{ activity: object|null, className?: string }} props
 */
export default function ActivityMapThumbnail({ activity, className = "" }) {
  const title = String(activity?.title || "").trim();
  const categoryThumb = useMemo(() => categoryForActivityTitle(title), [title]);
  const CategoryIcon = CATEGORY_ICON_MAP[categoryThumb.iconKey] || CalendarCheck;

  const resolved = useMemo(() => {
    if (isActivityPhotoPlaceholder(activity)) return "";
    const raw = pickResolvedActivityPhoto(activity) || String(activity?.photoUrl || "").trim();
    return encodePhotoUrlForDisplay(raw);
  }, [activity]);

  const [imgBroken, setImgBroken] = useState(false);
  const showPhoto = Boolean(resolved) && !imgBroken;

  useEffect(() => {
    setImgBroken(false);
  }, [resolved, activity?.id, title]);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/80 ${className}`.trim()}
    >
      {showPhoto ? (
        <img
          src={resolved}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImgBroken(true)}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center ${categoryThumb.bgClass}`}
          aria-hidden
        >
          <CategoryIcon className={`h-6 w-6 ${categoryThumb.fgClass}`} strokeWidth={1.75} />
        </div>
      )}
    </div>
  );
}
