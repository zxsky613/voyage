import React, { useMemo } from "react";
import { Bus, Footprints } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { UiTranslatedActivityTitle } from "../../i18n/userContentTranslate.jsx";
import { readActivityEstimatedPriceEur } from "./activityPricing.js";
import { dayMarkerColor } from "../map/tripMapHelpers.js";
import { buildPlannerDayTimelineItems, buildPlannerDayTimelineRows } from "./plannerDayTimelineModel.js";
import PlannerTimelineThumbnail from "./PlannerTimelineThumbnail.jsx";

/**
 * Timeline verticale D2 — planning jour mobile (cartes activité numérotées).
 */
export default function PlannerDayTimeline({
  showHeading = true,
  selectedDate,
  formatDate,
  activities = [],
  plannerMapActivities = [],
  dayIndex = 0,
  selectedDayIndex = 0,
  cityLabel = "",
  selectedActivityId = "",
  onMapFocus,
  onPhotoResolved,
  resolveActivityPlaceImage,
  isMealOrRest,
}) {
  const { t, language } = useI18n();

  const items = useMemo(
    () => buildPlannerDayTimelineItems(activities, plannerMapActivities),
    [activities, plannerMapActivities]
  );

  const rows = useMemo(() => buildPlannerDayTimelineRows(items), [items]);
  const markerColor = dayMarkerColor(dayIndex, selectedDayIndex);

  if (!items.length) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-medium text-slate-700">{t("planner.noActivitiesThisDate")}</p>
      </div>
    );
  }

  return (
    <>
      {showHeading && typeof formatDate === "function" ? (
        <h3 className="mb-3 break-all text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
          {formatDate(selectedDate)}
        </h3>
      ) : null}
      <div className="space-y-0">
        {rows.map((row) => {
          if (row.type === "leg") {
            const LegIcon = row.leg.mode === "transit" ? Bus : Footprints;
            const label =
              row.leg.mode === "transit"
                ? t("planner.travelTransit", { n: row.leg.minutes })
                : t("planner.travelWalk", { n: row.leg.minutes });
            return (
              <div
                key={`leg-${row.beforeIndex}`}
                className="flex justify-center py-2"
                aria-hidden
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange-tint px-3 py-1 text-[11px] font-medium text-brand-orange-ink ring-1 ring-brand-orange-tint">
                  <LegIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  {label}
                </span>
              </div>
            );
          }

          const { item, index } = row;
          const { activity, orderInDay, title, time, location } = item;
          const id = String(activity?.id || index);
          const mapSelected = selectedActivityId === id;
          const priceEur = readActivityEstimatedPriceEur(activity);
          const hasPriceField =
            activity?.estimated_price_eur != null ||
            activity?.estimatedPriceEur != null ||
            Number(activity?.cost) > 0;
          const timeLabel = time && time.length >= 4 ? time : "--:--";
          const locationLabel = location || cityLabel;

          return (
            <div key={`act-${id}`} id={`planner-act-${id}`} className="py-1">
              <div
                className={`overflow-hidden rounded-xl bg-white transition ${
                  mapSelected
                    ? "ring-2 ring-[#F16A2E] shadow-md"
                    : "ring-1 ring-slate-100 hover:ring-slate-200"
                }`}
                role="presentation"
                onClick={(e) => {
                  if (!onMapFocus) return;
                  if (e.target instanceof Element && e.target.closest("button,a")) return;
                  onMapFocus(id);
                }}
                onKeyDown={(e) => {
                  if (!onMapFocus || (e.key !== "Enter" && e.key !== " ")) return;
                  e.preventDefault();
                  onMapFocus(id);
                }}
              >
                <div className="flex gap-3 p-3">
                  <PlannerTimelineThumbnail
                    activity={activity}
                    cityLabel={cityLabel}
                    language={language}
                    orderInDay={orderInDay}
                    markerColor={markerColor}
                    onPhotoResolved={onPhotoResolved}
                    resolveActivityPlaceImage={resolveActivityPlaceImage}
                    isMealOrRest={isMealOrRest}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 flex-1 text-sm font-medium leading-snug text-slate-900">
                        <UiTranslatedActivityTitle
                          raw={title}
                          emptyFallback={t("planner.activityNamePlaceholder")}
                        />
                      </p>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-brand-orange">
                        {timeLabel}
                      </span>
                    </div>
                    {locationLabel ? (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{locationLabel}</p>
                    ) : null}
                    {hasPriceField ? (
                      <p className="mt-1.5">
                        <span className="inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-brand-blue-deep ring-1 ring-slate-200">
                          {priceEur === 0
                            ? t("destination.activityPriceFree")
                            : t("destination.activityPriceEstimate", { n: priceEur })}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
