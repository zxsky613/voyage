import React from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { GENERATION_PHASE_I18N_KEY } from "./generationProgress.js";

/**
 * Barre + libellé de phase (remplace le spinner seul).
 * @param {{
 *   displayPercent: number,
 *   phase?: string,
 *   slowWarning?: boolean,
 *   compact?: boolean,
 * }} props
 */
export default function GenerationProgressPanel({
  displayPercent = 0,
  phase = "",
  slowWarning = false,
  compact = false,
}) {
  const { t } = useI18n();
  const pct = Math.max(0, Math.min(100, Math.round(displayPercent)));
  const phaseKey = GENERATION_PHASE_I18N_KEY[phase];
  const phaseLabel = phaseKey
    ? t(`destination.${phaseKey}`)
    : t("destination.itineraryBuildingProgram");

  return (
    <div
      className={`flex w-full flex-col ${compact ? "gap-2" : "gap-3"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={phaseLabel}
    >
      <div className="w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-brand-blue to-brand-orange transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className={`text-center font-normal tracking-[0.02em] text-slate-700 ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        {phaseLabel}
      </p>
      {slowWarning ? (
        <p className="text-center text-xs leading-snug text-amber-800/90">
          {t("destination.generationSlowMessage")}
        </p>
      ) : null}
    </div>
  );
}
