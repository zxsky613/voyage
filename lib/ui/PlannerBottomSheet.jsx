import React, { useCallback, useEffect, useRef, useState } from "react";

const SNAP_ORDER = ["collapsed", "mid", "full"];

/**
 * Bottom sheet planning mobile — 3 crans (replié / mi-hauteur / plein).
 * @param {{
 *   snap?: 'collapsed'|'mid'|'full',
 *   onSnapChange?: (snap: 'collapsed'|'mid'|'full') => void,
 *   collapsedSummary?: React.ReactNode,
 *   children?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export default function PlannerBottomSheet({
  snap = "mid",
  onSnapChange,
  collapsedSummary = null,
  children = null,
  className = "",
}) {
  const dragRef = useRef({ startY: 0, startH: 0, dragging: false, lastY: 0, lastT: 0 });
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const measureSnaps = useCallback(() => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 844;
    return {
      collapsed: 72,
      mid: Math.round(Math.min(vh * 0.48, 420)),
      full: Math.round(Math.min(vh * 0.88, vh - 72)),
    };
  }, []);

  const [snaps, setSnaps] = useState(measureSnaps);

  useEffect(() => {
    const onResize = () => setSnaps(measureSnaps());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureSnaps]);

  const reduceMotion =
    typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const baseH = snaps[snap] ?? snaps.mid;
  const heightPx = Math.max(snaps.collapsed, Math.min(snaps.full, baseH + dragOffset));

  const pickNearestSnap = useCallback(
    (currentH, velocity = 0) => {
      const entries = SNAP_ORDER.map((k) => [k, snaps[k]]);
      let best = snap;
      let bestDist = Infinity;
      for (const [k, h] of entries) {
        const d = Math.abs(currentH - h);
        if (d < bestDist) {
          bestDist = d;
          best = k;
        }
      }
      if (Math.abs(velocity) > 0.45) {
        const idx = SNAP_ORDER.indexOf(snap);
        if (velocity > 0 && idx < SNAP_ORDER.length - 1) best = SNAP_ORDER[idx + 1];
        if (velocity < 0 && idx > 0) best = SNAP_ORDER[idx - 1];
      }
      return best;
    },
    [snaps, snap]
  );

  const onPointerDown = (e) => {
    dragRef.current = {
      startY: e.clientY,
      startH: snaps[snap],
      dragging: true,
      lastY: e.clientY,
      lastT: performance.now(),
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dy = dragRef.current.startY - e.clientY;
    setDragOffset(dy);
    dragRef.current.lastY = e.clientY;
    dragRef.current.lastT = performance.now();
  };

  const finishDrag = (e) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    setDragging(false);
    const now = performance.now();
    const dt = Math.max(1, now - dragRef.current.lastT);
    const velocity = (dragRef.current.lastY - e.clientY) / dt;
    const current = dragRef.current.startH + dragOffset;
    setDragOffset(0);
    onSnapChange?.(pickNearestSnap(current, velocity));
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[1.75rem] bg-white/95 shadow-[0_-12px_40px_rgba(2,6,23,0.14)] ring-1 ring-slate-200/80 backdrop-blur-md ${className}`.trim()}
      style={{
        height: `${heightPx}px`,
        transition:
          dragging || reduceMotion ? "none" : "height 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
        paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        role="slider"
        aria-label="Planning sheet"
        aria-valuenow={heightPx}
        tabIndex={0}
        className="flex shrink-0 cursor-grab touch-none flex-col items-center px-4 pb-2 pt-3 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const idx = SNAP_ORDER.indexOf(snap);
            if (idx < SNAP_ORDER.length - 1) onSnapChange?.(SNAP_ORDER[idx + 1]);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            const idx = SNAP_ORDER.indexOf(snap);
            if (idx > 0) onSnapChange?.(SNAP_ORDER[idx - 1]);
          }
        }}
      >
        <div className="mb-2 h-1 w-10 rounded-full bg-slate-300" aria-hidden />
        {snap === "collapsed" ? (
          <div className="w-full min-w-0 text-center text-sm text-slate-700">{collapsedSummary}</div>
        ) : null}
      </div>
      {snap !== "collapsed" ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 sm:px-4 sm:pb-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export { SNAP_ORDER as PLANNER_SHEET_SNAPS };
