import React, { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { dayMarkerColor } from "../map/tripMapHelpers.js";
import { buildPlannerTripDayGroups } from "./buildPlannerTripDayGroups.js";

/**
 * Liste légère par jour — vue d'ensemble géographique (une ligne / jour).
 */
export default function PlannerDayOverviewList({
  activities = [],
  tripId = "",
  tripStartYmd = "",
  tripEndYmd = "",
  cityLabel = "",
  formatDate,
  selectedDayIndex = 0,
  onSelectDay,
}) {
  const { t } = useI18n();

  const dayGroups = useMemo(
    () =>
      buildPlannerTripDayGroups({
        activities,
        tripId,
        tripStartYmd,
        tripEndYmd,
        cityLabel,
      }),
    [activities, tripId, tripStartYmd, tripEndYmd, cityLabel]
  );

  if (!dayGroups.length) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-medium text-slate-700">{t("planner.noActivitiesThisDate")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label={t("planner.overviewDayListAria")}>
      {dayGroups.map((group) => {
        const color = dayMarkerColor(group.dayIndex, selectedDayIndex);
        const dateLabel =
          typeof formatDate === "function"
            ? formatDate(group.dateKey)
            : String(group.dateKey || "");

        const zone = String(group.zoneLabel || "").trim();
        const city = String(cityLabel || "").trim();
        const showZone = zone && zone.toLowerCase() !== city.toLowerCase();
        const rowLabel = showZone
          ? t("planner.dayOverviewRow", { n: group.dayNum, zone })
          : t("planner.dayOverviewRowNoZone", { n: group.dayNum });

        return (
          <li key={`overview-day-${group.dayIndex}-${group.dateKey}`}>
            <button
              type="button"
              onClick={() => onSelectDay?.(group.dayIndex, group.dateKey)}
              className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left ring-1 ring-slate-100 transition hover:ring-slate-200"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-2 ring-white"
                style={{ backgroundColor: color }}
                aria-hidden
              >
                {group.dayNum}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{rowLabel}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{dateLabel}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
