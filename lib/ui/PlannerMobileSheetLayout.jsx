import React from "react";
import PlannerBottomSheet from "./PlannerBottomSheet.jsx";
import { PLANNER_SHEET_TRANSITION } from "./plannerSheetLayout.js";
import { usePlannerSheetLayout } from "./usePlannerSheetLayout.js";

/**
 * Planning mobile — carte toujours montée (hauteur animée) + bottom sheet.
 * @param {{
 *   sheetSnap: 'collapsed'|'mid'|'full',
 *   onSnapChange: (snap: 'collapsed'|'mid'|'full') => void,
 *   collapsedSummary: React.ReactNode,
 *   mapNode: React.ReactNode,
 *   children: React.ReactNode,
 *   headerAction?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export default function PlannerMobileSheetLayout({
  sheetSnap,
  onSnapChange,
  collapsedSummary,
  mapNode,
  children,
  headerAction = null,
  className = "",
}) {
  const { containerRef, mapHeightPx } = usePlannerSheetLayout(sheetSnap);
  const reduceMotion =
    typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      ref={containerRef}
      className={`relative -mx-1 min-h-[calc(100dvh-var(--app-header-clearance,4rem)-14rem)] ${className}`.trim()}
    >
      <div
        className="absolute inset-x-0 top-0 z-10 overflow-hidden will-change-[height]"
        style={{
          height: `${mapHeightPx}px`,
          transition: reduceMotion ? "none" : PLANNER_SHEET_TRANSITION,
        }}
      >
        {mapNode}
      </div>
      <PlannerBottomSheet
        snap={sheetSnap}
        onSnapChange={onSnapChange}
        collapsedSummary={collapsedSummary}
        headerAction={sheetSnap === "collapsed" ? headerAction : null}
      >
        {children}
      </PlannerBottomSheet>
    </div>
  );
}
