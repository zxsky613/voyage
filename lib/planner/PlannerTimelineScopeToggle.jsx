import React from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";

/**
 * Bascule « Tout le voyage » ⇄ « Jour » en tête de sheet planning.
 * @param {{ scope: 'trip'|'day', onScopeChange: (scope: 'trip'|'day') => void, className?: string }} props
 */
export default function PlannerTimelineScopeToggle({ scope, onScopeChange, className = "" }) {
  const { t } = useI18n();

  return (
    <div
      className={`inline-flex w-full rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70 ${className}`.trim()}
      role="tablist"
      aria-label={t("planner.timelineScopeAria")}
    >
      {(["trip", "day"]).map((value) => {
        const active = scope === value;
        const label = value === "trip" ? t("planner.scopeTrip") : t("planner.scopeDay");
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onScopeChange(value)}
            className={`min-h-[40px] flex-1 rounded-xl px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] transition ${
              active
                ? "bg-white text-brand-blue-deep shadow-sm ring-1 ring-slate-200/80"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
