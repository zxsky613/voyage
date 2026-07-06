import React from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { dayMarkerColor } from "./tripMapHelpers.js";

/**
 * Légende cliquable — pastille ronde par jour (couleur jour + numéro).
 * @param {{
 *   days: Array<{ dayIndex: number, dayNum: number }>,
 *   selectedDayIndex: number,
 *   onSelectDay?: (dayIndex: number) => void,
 * }} props
 */
export default function TripMapDayLegend({ days = [], selectedDayIndex, onSelectDay }) {
  const { t } = useI18n();
  if (!days.length) return null;

  return (
    <div
      className="pointer-events-auto max-w-full overflow-x-auto rounded-xl bg-white/92 px-2 py-1.5 shadow-sm ring-1 ring-slate-200/75 backdrop-blur-sm [-webkit-overflow-scrolling:touch]"
      role="toolbar"
      aria-label={t("destination.itineraryDayLabel")}
    >
      <div className="flex min-w-min items-center gap-1.5">
        {days.map(({ dayIndex, dayNum }) => {
          const color = dayMarkerColor(dayIndex, selectedDayIndex);
          const active = dayIndex === selectedDayIndex;
          return (
            <button
              key={`legend-day-${dayIndex}`}
              type="button"
              onClick={() => onSelectDay?.(dayIndex)}
              disabled={!onSelectDay}
              aria-current={active ? "true" : undefined}
              aria-label={`${t("destination.itineraryDayLabel")} ${dayNum}`}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition hover:brightness-110 disabled:cursor-default disabled:hover:brightness-100 ${
                active ? "ring-2 ring-offset-1 ring-offset-white/90" : "ring-1 ring-white/60"
              }`}
              style={{
                backgroundColor: color,
                color: "#ffffff",
                ...(active ? { boxShadow: `0 0 0 2px ${color}` } : {}),
              }}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}
