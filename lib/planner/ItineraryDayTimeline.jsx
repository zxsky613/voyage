import React, { useMemo } from "react";
import {
  BedDouble,
  Bike,
  CalendarCheck,
  Landmark,
  MapPin,
  Mountain,
  Navigation,
  PartyPopper,
  Plane,
  ShoppingBag,
  TrainFront,
  Users,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { categoryForActivityTitle } from "./activityCategoryThumb.js";
import { formatApproxTimeLabel, normalizeHHMM } from "./activitySchedule.js";
import { estimateItineraryLegMinutes } from "./itineraryTravelEstimate.js";
import { stripItineraryBulletTimePrefix } from "../images/itineraryPlaceExtract.js";

const ACTIVITY_CATEGORY_ICON_MAP = {
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

/** Libellé zone / thème du jour (day-zone-names : zone_label ou title). */
export function getItineraryDayZoneLabel(day) {
  return String(day?.zone_label || day?.zoneLabel || day?.title || "").trim();
}

/**
 * Timeline verticale mobile — un jour d'itinéraire.
 */
export default function ItineraryDayTimeline({
  dayIndex,
  dayNum,
  zoneLabel,
  bullets = [],
  activityMetaList = [],
  cityLabel,
  dayTitle,
  selectedMapActivityId = "",
  onSelectActivity,
  onNavigateActivity,
}) {
  const { t } = useI18n();

  const items = useMemo(() => {
    return bullets.map((bullet, j) => {
      const meta = activityMetaList[j] || null;
      const text = String(bullet || "").trim();
      const title =
        stripItineraryBulletTimePrefix(text)
        || String(meta?.description || meta?.name || "").trim();
      const timeRaw = normalizeHHMM(meta?.suggestedTime || meta?.time || meta?.suggested_time);
      const timeLabel = timeRaw ? formatApproxTimeLabel(timeRaw) : "";
      const lat = Number(meta?.latitude);
      const lon = Number(meta?.longitude);
      const mapId = `${dayIndex}-${j}`;
      const thumb = categoryForActivityTitle(title);
      const CategoryIcon = ACTIVITY_CATEGORY_ICON_MAP[thumb.iconKey] || MapPin;
      return {
        mapId,
        title,
        timeLabel,
        meta,
        coords: Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null,
        thumb,
        CategoryIcon,
      };
    });
  }, [bullets, activityMetaList, dayIndex]);

  if (!items.length) {
    return <p className="py-4 text-center text-sm text-slate-500">{t("destination.itineraryEmptyResult")}</p>;
  }

  const heading = zoneLabel
    ? t("destination.itineraryDayZoneHeading", { day: dayNum, zone: zoneLabel })
    : t("destination.itineraryDayLabel") + ` ${dayNum}`;

  return (
    <div className="px-1 pb-2">
      <h3 className="mb-4 font-display text-base font-normal tracking-[0.02em] text-slate-900">{heading}</h3>
      <ol className="relative m-0 list-none space-y-0 p-0">
        {items.map((item, j) => {
          const leg =
            j > 0 && items[j - 1].coords && item.coords
              ? estimateItineraryLegMinutes(items[j - 1].coords, item.coords)
              : null;
          const selected = selectedMapActivityId === item.mapId;
          const { CategoryIcon } = item;
          return (
            <li key={item.mapId} className="relative">
              {leg ? (
                <div
                  className="ml-[1.125rem] flex items-center gap-2 border-l-2 border-dashed border-slate-200 py-2 pl-4 text-[11px] text-slate-500"
                  aria-hidden
                >
                  {leg.mode === "transit"
                    ? t("destination.itineraryTravelTransit", { n: leg.minutes })
                    : t("destination.itineraryTravelWalk", { n: leg.minutes })}
                </div>
              ) : null}
              <div
                id={`itinerary-timeline-act-${item.mapId}`}
                className={`flex gap-3 rounded-2xl py-2 pr-1 transition ${
                  selected ? "bg-brand-blue-tint/50 ring-1 ring-brand-blue/25" : ""
                }`}
              >
                <div className="flex w-9 shrink-0 flex-col items-center pt-1">
                  <span
                    className={`z-[1] h-3 w-3 rounded-full ring-2 ring-white ${
                      selected ? "bg-brand-blue" : "bg-slate-300"
                    }`}
                    aria-hidden
                  />
                  {j < items.length - 1 ? (
                    <span className="mt-1 w-0.5 flex-1 min-h-[2rem] bg-slate-200" aria-hidden />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 pb-3">
                  {item.timeLabel ? (
                    <p className="text-[11px] font-semibold tabular-nums text-slate-500">
                      {t("destination.itineraryTimelineApproxTime", { time: item.timeLabel })}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="mt-1 flex w-full items-start gap-2.5 text-left"
                    onClick={() => onSelectActivity?.(item.mapId)}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-slate-200/80 ${item.thumb.bgClass}`}
                    >
                      <CategoryIcon className={`h-4 w-4 ${item.thumb.fgClass}`} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 pt-1 text-[13px] leading-snug text-slate-800">{item.title}</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-brand-blue-deep shadow-sm transition hover:bg-slate-50 active:scale-[0.97]"
                  aria-label={t("planner.openInMaps")}
                  title={t("planner.openInMaps")}
                  onClick={() =>
                    onNavigateActivity?.({
                      bullet: bullets[j],
                      meta: item.meta,
                      dayTitle,
                      cityLabel,
                      title: item.title,
                    })
                  }
                >
                  <Navigation className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
