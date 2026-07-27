import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { buildPlannerMapActivities } from "../planner/buildPlannerMapActivities.js";
import PlannerDayTimeline from "../planner/PlannerDayTimeline.jsx";
import LazyTripMap from "../map/LazyTripMap.jsx";
import PlannerMobileSheetLayout from "./PlannerMobileSheetLayout.jsx";

const TRIP_ID = "preview-trip";
const TRIP_START = "2026-07-24";

function offsetYmd(days) {
  const d = new Date(`${TRIP_START}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const RAW_ACTIVITIES = [
  {
    id: "a1",
    trip_id: TRIP_ID,
    title: "Calanques de Cassis",
    date: TRIP_START,
    time: "09:30",
    latitude: 43.212,
    longitude: 5.521,
    location: "Cassis",
  },
  {
    id: "a2",
    trip_id: TRIP_ID,
    title: "Port de Cassis",
    date: TRIP_START,
    time: "11:00",
    latitude: 43.215,
    longitude: 5.539,
    location: "Cassis",
  },
  {
    id: "a3",
    trip_id: TRIP_ID,
    title: "Cap Canaille",
    date: TRIP_START,
    time: "15:00",
    latitude: 43.203,
    longitude: 5.558,
    location: "Cassis",
  },
  {
    id: "a4",
    trip_id: TRIP_ID,
    title: "Plage du Bestouan",
    date: offsetYmd(1),
    time: "10:00",
    latitude: 43.208,
    longitude: 5.532,
    location: "Cassis",
  },
];

/** Preview dev — carte + sheet (3 crans), composants prod. */
export default function PlannerSheetPreview() {
  const { t } = useI18n();
  const [sheetSnap, setSheetSnap] = useState(
    () => new URLSearchParams(window.location.search).get("snap") || "mid"
  );

  const plannerMapActivities = useMemo(
    () => buildPlannerMapActivities({ activities: RAW_ACTIVITIES, tripId: TRIP_ID, tripStartYmd: TRIP_START }),
    []
  );

  const dayActivities = RAW_ACTIVITIES.filter((a) => a.date === TRIP_START);

  const formatDate = (ymd) => {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="min-h-[100dvh] bg-slate-100 [--app-header-clearance:4.5rem] [--app-bottom-nav-clearance:5.5rem]">
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
        <div className="mx-auto flex max-w-lg items-center justify-between rounded-[2rem] bg-white/95 px-4 py-3 shadow-lg">
          <span className="font-display text-sm text-slate-900">Planning — preview</span>
          <div className="flex gap-1">
            {["collapsed", "mid", "full"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSheetSnap(s)}
                className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${
                  sheetSnap === s ? "bg-[#142F5D] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-3 pt-[calc(var(--app-header-clearance)+0.5rem)]">
        <PlannerMobileSheetLayout
          sheetSnap={sheetSnap}
          onSnapChange={setSheetSnap}
          collapsedSummary={t("planner.sheetDaySummary", {
            date: formatDate(TRIP_START),
            n: dayActivities.length,
          })}
          mapNode={
            <LazyTripMap
              activities={plannerMapActivities}
              view="day"
              selectedDayIndex={0}
              selectedActivityId=""
              onSelectActivity={() => {}}
              onSelectDay={() => {}}
              mode="planner"
              cityLabel="Cassis, France"
              fallbackCenter={{ latitude: 43.215, longitude: 5.538 }}
              suppressActivitySheet
              className="h-full min-h-0"
            />
          }
          fab={
            sheetSnap !== "full" ? (
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#142F5D] text-white shadow-lg"
                aria-label={t("planner.addActivity")}
              >
                <Plus size={18} aria-hidden />
              </button>
            ) : null
          }
        >
          <div className="space-y-5 pb-1">
            {sheetSnap === "mid" ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-[10px] uppercase tracking-widest text-slate-500">
                Calendrier (cran mid)
              </p>
            ) : null}
            <PlannerDayTimeline
              showHeading
              selectedDate={TRIP_START}
              formatDate={formatDate}
              activities={dayActivities}
              plannerMapActivities={plannerMapActivities}
              dayIndex={0}
              selectedDayIndex={0}
              cityLabel="Cassis, France"
              selectedActivityId=""
              onMapFocus={() => {}}
            />
          </div>
        </PlannerMobileSheetLayout>
      </main>
    </div>
  );
}
