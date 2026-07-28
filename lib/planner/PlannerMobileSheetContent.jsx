import React from "react";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import PlannerTimelineScopeToggle from "./PlannerTimelineScopeToggle.jsx";
import PlannerDayTimeline from "./PlannerDayTimeline.jsx";
import PlannerDayOverviewList from "./PlannerDayOverviewList.jsx";

/**
 * Contenu scrollable de la sheet planning mobile (vue d'ensemble ou zoom jour).
 */
export default function PlannerMobileSheetContent({
  timelineScope,
  onTimelineScopeChange,
  sheetSnap,
  showCalendar,
  renderCalendar,
  overviewProps,
  dayProps,
  onSelectOverviewDay,
  headerAction = null,
}) {
  const { t } = useI18n();
  const showBody = sheetSnap === "mid" || sheetSnap === "full";
  const isOverview = timelineScope === "trip";
  const showHeaderAction = headerAction && sheetSnap === "mid";

  return (
    <div className="space-y-4 pb-1">
      {isOverview ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <PlannerTimelineScopeToggle scope={timelineScope} onScopeChange={onTimelineScopeChange} />
          </div>
          {showHeaderAction ? <div className="shrink-0 pt-0.5">{headerAction}</div> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => onTimelineScopeChange("trip")}
              className="inline-flex min-h-[40px] min-w-0 flex-1 items-center gap-2 self-start rounded-xl px-2 py-2 text-sm font-medium text-brand-blue-deep transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              {t("planner.backToOverview")}
            </button>
            {showHeaderAction ? <div className="shrink-0 pt-1">{headerAction}</div> : null}
          </div>
          <PlannerTimelineScopeToggle scope={timelineScope} onScopeChange={onTimelineScopeChange} />
        </div>
      )}
      {!isOverview && showCalendar ? renderCalendar?.() : null}
      {showBody ? (
        isOverview ? (
          <PlannerDayOverviewList {...overviewProps} onSelectDay={onSelectOverviewDay} />
        ) : (
          <PlannerDayTimeline showHeading {...dayProps} />
        )
      ) : null}
    </div>
  );
}
