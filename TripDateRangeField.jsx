import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, Lock, Plane } from "lucide-react";
import { useI18n } from "./i18n/I18nContext.jsx";
import { getAppDateLocale } from "./i18n/dateLocale.js";

function ymdFromLocalDate(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function parseYmdToNoon(ymd) {
  const s = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatYmdDisplay(ymd) {
  const d = parseYmdToNoon(ymd);
  if (!d) return "—";
  return d.toLocaleDateString(getAppDateLocale(), { day: "2-digit", month: "short", year: "numeric" });
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Lundi = 0 … dimanche = 6 pour le mois affiché */
function mondayIndexOfFirstDay(year, monthIndex) {
  const dow = new Date(year, monthIndex, 1).getDay();
  return (dow + 6) % 7;
}

export function TripDateRangeField({ startDate, endDate, onRangeChange, readOnly = false }) {
  const { t, language } = useI18n();
  const titleId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    const d = parseYmdToNoon(startDate) || new Date();
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseYmdToNoon(startDate) || new Date();
    return d.getMonth();
  });
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);

  const todayStr = useMemo(() => ymdFromLocalDate(new Date()), []);

  useEffect(() => {
    if (!pickerOpen) return;
    setDraftStart(startDate);
    setDraftEnd(endDate);
    const d = parseYmdToNoon(startDate) || new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [pickerOpen, startDate, endDate]);

  const weekdayLabels = useMemo(() => {
    const loc = getAppDateLocale();
    const monday = new Date(2024, 0, 8);
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(monday);
      x.setDate(monday.getDate() + i);
      return x.toLocaleDateString(loc, { weekday: "short" });
    });
  }, [language]);

  const monthTitle = useMemo(() => {
    const d = new Date(viewYear, viewMonth, 1);
    return d.toLocaleDateString(getAppDateLocale(), { month: "long", year: "numeric" });
  }, [viewYear, viewMonth, language]);

  const calendarCells = useMemo(() => {
    const dim = daysInMonth(viewYear, viewMonth);
    const pad = mondayIndexOfFirstDay(viewYear, viewMonth);
    const cells = [];
    for (let i = 0; i < pad; i += 1) cells.push({ type: "pad", key: `p-${i}` });
    for (let day = 1; day <= dim; day += 1) {
      const mo = String(viewMonth + 1).padStart(2, "0");
      const da = String(day).padStart(2, "0");
      const ymd = `${viewYear}-${mo}-${da}`;
      cells.push({ type: "day", key: ymd, ymd });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const onDayClick = useCallback(
    (ymd) => {
      if (!draftStart || (draftStart && draftEnd)) {
        setDraftStart(ymd);
        setDraftEnd(null);
        return;
      }
      const a = draftStart;
      const b = ymd;
      if (a <= b) {
        setDraftStart(a);
        setDraftEnd(b);
      } else {
        setDraftStart(b);
        setDraftEnd(a);
      }
    },
    [draftStart, draftEnd]
  );

  const goPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  useEffect(() => {
    if (readOnly) setPickerOpen(false);
  }, [readOnly]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pickerOpen]);

  const apply = () => {
    const s = draftStart || startDate;
    const e = draftEnd || draftStart || endDate || s;
    const lo = s <= e ? s : e;
    const hi = s <= e ? e : s;
    onRangeChange(lo, hi);
    setPickerOpen(false);
  };

  const effEnd = draftEnd ?? draftStart;
  const rangeLo = draftStart && effEnd ? (draftStart <= effEnd ? draftStart : effEnd) : "";
  const rangeHi = draftStart && effEnd ? (draftStart <= effEnd ? effEnd : draftStart) : "";

  const pickerOverlay =
    pickerOpen && !readOnly && typeof document !== "undefined" ? (
      <div
        className="fixed -inset-1 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) setPickerOpen(false);
        }}
        role="presentation"
      >
        <div
          className="box-border flex max-h-[min(88dvh,32rem)] w-full min-w-0 max-w-[min(100vw,28rem)] flex-col overflow-y-auto overscroll-y-contain rounded-t-[2rem] border border-slate-200/80 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:max-h-[min(90dvh,36rem)] sm:rounded-[2rem] sm:p-6 sm:pb-6"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <h3
              id={titleId}
              className="min-w-0 font-display text-sm font-normal tracking-[0.04em] text-slate-800"
            >
              {t("tripForm.dateRangeTitle")}
            </h3>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="shrink-0 rounded-full px-3 py-1.5 font-display text-sm font-normal tracking-[0.03em] text-slate-600 hover:bg-slate-100"
            >
              {t("tripForm.dateRangeCancel")}
            </button>
          </div>
          <p className="mb-3 shrink-0 font-display text-xs font-normal leading-snug tracking-[0.02em] text-slate-500">
            {t("tripForm.dateRangeHint")}
          </p>

          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrevMonth}
              className="shrink-0 rounded-full p-2 text-slate-600 hover:bg-slate-100"
              aria-label={t("tripForm.dateRangePrevMonth")}
            >
              <ChevronLeft size={22} />
            </button>
            <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-normal capitalize tracking-[0.03em] text-slate-800">
              {monthTitle}
            </span>
            <button
              type="button"
              onClick={goNextMonth}
              className="shrink-0 rounded-full p-2 text-slate-600 hover:bg-slate-100"
              aria-label={t("tripForm.dateRangeNextMonth")}
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div className="mb-1 grid shrink-0 grid-cols-7 gap-0 text-center font-display text-[0.65rem] font-normal uppercase leading-tight tracking-[0.12em] text-slate-400">
            {weekdayLabels.map((w, i) => (
              <div key={`dow-${i}`} className="truncate px-0.5 py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl bg-slate-100 p-px">
            <div className="grid grid-cols-7 gap-px">
              {calendarCells.map((cell) => {
                if (cell.type === "pad")
                  return <div key={cell.key} className="h-10 min-w-0 bg-white sm:h-11" aria-hidden />;

                const { ymd } = cell;
                const inRange = rangeLo && rangeHi && ymd >= rangeLo && ymd <= rangeHi;
                const isLo = ymd === rangeLo;
                const isHi = ymd === rangeHi;
                const isToday = ymd === todayStr;

                let cellBg = "bg-white text-slate-900";
                if (inRange) {
                  if (isLo || isHi) cellBg = "bg-slate-800 text-white";
                  else cellBg = "bg-slate-100 text-slate-800";
                }

                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => onDayClick(ymd)}
                    className={`flex h-10 min-h-0 min-w-0 w-full items-center justify-center font-display text-sm font-normal tabular-nums transition sm:h-11 ${cellBg} ${
                      isToday && !inRange ? "ring-1 ring-inset ring-slate-300" : ""
                    } ${isToday && inRange && !(isLo || isHi) ? "ring-1 ring-inset ring-slate-300/60" : ""} hover:z-10 hover:brightness-95 active:brightness-90`}
                  >
                    {parseInt(ymd.slice(8, 10), 10)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <div className="min-w-0 font-display text-xs font-normal tracking-[0.02em] text-slate-600">
              <span className="text-slate-800">{formatYmdDisplay(draftStart)}</span>
              <span className="mx-1 text-slate-400">→</span>
              <span className="text-slate-800">{formatYmdDisplay(draftEnd || draftStart)}</span>
            </div>
            <button
              type="button"
              onClick={apply}
              className="shrink-0 rounded-2xl bg-slate-900 px-5 py-2.5 font-display text-sm font-normal tracking-[0.04em] text-white shadow-sm hover:bg-slate-800"
            >
              {t("tripForm.dateRangeApply")}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const rowClass =
    "modal-date-field flex w-full min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden rounded-2xl border border-slate-200 px-4 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3";

  return (
    <>
      {readOnly ? (
        <div
          role="group"
          aria-readonly="true"
          aria-label={t("modals.pastTripDatesHint")}
          className={`${rowClass} cursor-not-allowed border-slate-200/80 bg-slate-50/90`}
        >
          <span className="min-w-0 truncate font-display text-base font-normal tracking-[0.02em] text-slate-700">
            {formatYmdDisplay(startDate)}
          </span>
          <span className="flex shrink-0 justify-center sm:px-0.5">
            <span className="rounded-full bg-slate-200/80 p-1.5 text-slate-500 sm:p-2">
              <Plane size={14} aria-hidden />
            </span>
          </span>
          <span className="flex min-w-0 items-center justify-end gap-2 sm:justify-end">
            <span className="min-w-0 truncate font-display text-base font-normal tracking-[0.02em] text-slate-700">
              {formatYmdDisplay(endDate)}
            </span>
            <Lock size={18} className="shrink-0 text-slate-400" aria-hidden />
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className={`${rowClass} bg-white transition hover:bg-slate-50/80`}
        >
          <span className="min-w-0 truncate font-display text-base font-normal tracking-[0.02em] text-slate-900">
            {formatYmdDisplay(startDate)}
          </span>
          <span className="flex shrink-0 justify-center sm:px-0.5">
            <span className="rounded-full bg-slate-100/90 p-1.5 text-slate-500 shadow-sm sm:p-2">
              <Plane size={14} className="animate-bounce" aria-hidden />
            </span>
          </span>
          <span className="flex min-w-0 items-center justify-end gap-2 sm:justify-end">
            <span className="min-w-0 truncate font-display text-base font-normal tracking-[0.02em] text-slate-900">
              {formatYmdDisplay(endDate)}
            </span>
            <Calendar size={18} className="shrink-0 text-slate-400" aria-hidden />
          </span>
        </button>
      )}

      {pickerOverlay ? createPortal(pickerOverlay, document.body) : null}
    </>
  );
}
