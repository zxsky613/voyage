import React from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { openExternalMaps } from "../maps/itineraryActivityMap.js";
import { BRAND_BLUE_BTN_CLASS } from "../brandColors.js";
import ActivityMapThumbnail from "./ActivityMapThumbnail.jsx";
import { MapPin, Sunrise, Sun, X } from "lucide-react";

/**
 * Panneau bas type Wanderlog — activité sélectionnée sur la carte.
 * @param {{ activity: object|null, cityLabel?: string, onClose: () => void }} props
 */
export default function TripMapActivitySheet({ activity, cityLabel = "", onClose }) {
  const { t } = useI18n();
  if (!activity) return null;

  const title = String(activity.title || "").trim();
  const lat = Number(activity.latitude);
  const lon = Number(activity.longitude);
  const period = String(activity.period || "").trim();

  const periodChip =
    period === "morning" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange-tint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-orange-ink ring-1 ring-brand-orange-tint">
        <Sunrise className="h-3 w-3" strokeWidth={2} aria-hidden />
        {t("destination.itineraryPeriodMorning")}
      </span>
    ) : period === "afternoon" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange-tint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-orange-ink ring-1 ring-brand-orange-tint">
        <Sun className="h-3 w-3" strokeWidth={2} aria-hidden />
        {t("destination.itineraryPeriodAfternoon")}
      </span>
    ) : null;

  const handleGo = () => {
    openExternalMaps({
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
      label: title,
      query: [title, cityLabel].filter(Boolean).join(", "),
    });
  };

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
      role="dialog"
      aria-label={title}
    >
      <div className="overflow-hidden rounded-2xl bg-white/95 shadow-[0_18px_48px_rgba(2,6,23,0.18)] ring-1 ring-slate-200/80 backdrop-blur-sm">
        <div className="flex gap-3 p-3">
          <ActivityMapThumbnail activity={activity} className="h-16 w-20" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {periodChip ? <div className="mb-1">{periodChip}</div> : null}
                <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-900">{title}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label={t("common.close")}
              >
                <X size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={handleGo}
              className={`mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs ${BRAND_BLUE_BTN_CLASS}`}
            >
              <MapPin size={14} aria-hidden />
              {t("map.goThere")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
