import { useEffect, useRef, useState } from "react";
import {
  computePlannerMapHeightPx,
  measurePlannerSheetSnaps,
  plannerSheetHeightPx,
} from "./plannerSheetLayout.js";

/**
 * Mesures container + hauteurs carte/sheet synchronisées avec PlannerBottomSheet.
 * @param {'collapsed'|'mid'|'full'} snap
 */
export function usePlannerSheetLayout(snap) {
  const containerRef = useRef(null);
  const [layout, setLayout] = useState(() => {
    const snaps = measurePlannerSheetSnaps(typeof window !== "undefined" ? window.innerHeight : 844);
    return {
      snaps,
      mapHeightPx: computePlannerMapHeightPx(snap, snaps, 600),
      sheetHeightPx: plannerSheetHeightPx(snap, snaps),
    };
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return undefined;

    const update = () => {
      const snaps = measurePlannerSheetSnaps(window.innerHeight);
      const containerHeight = el.clientHeight;
      setLayout({
        snaps,
        mapHeightPx: computePlannerMapHeightPx(snap, snaps, containerHeight),
        sheetHeightPx: plannerSheetHeightPx(snap, snaps),
      });
    };

    update();
    window.addEventListener("resize", update);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [snap]);

  return { containerRef, ...layout };
}
