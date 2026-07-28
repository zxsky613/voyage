import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { buildPlannerMapActivities, addDaysToYmd } from "../planner/buildPlannerMapActivities.js";
import { buildPlannerTripDayGroups } from "../planner/buildPlannerTripDayGroups.js";
import PlannerMobileSheetContent from "../planner/PlannerMobileSheetContent.jsx";
import LazyTripMap from "../map/LazyTripMap.jsx";
import PlannerMobileSheetLayout from "./PlannerMobileSheetLayout.jsx";

const TRIP_ID = "preview-trip";
const TRIP_START = "2026-07-24";

/** @param {string} start @param {number} days */
function tripEnd(start, days) {
  return addDaysToYmd(start, days - 1);
}

/** @param {string} start @param {number} dayOffset */
function dayYmd(start, dayOffset) {
  return addDaysToYmd(start, dayOffset);
}

const PREVIEW_SCENARIOS = {
  cassis: {
    label: "Cassis (2j proches)",
    cityLabel: "Cassis, France",
    tripDays: 2,
    fallbackCenter: { latitude: 43.215, longitude: 5.538 },
    activities: [
      { id: "a1", title: "Calanques", date: dayYmd(TRIP_START, 0), time: "09:30", latitude: 43.212, longitude: 5.521, location: "Calanques, Cassis" },
      { id: "a2", title: "Port", date: dayYmd(TRIP_START, 0), time: "11:00", latitude: 43.215, longitude: 5.539, location: "Port, Cassis" },
      { id: "a4", title: "Bestouan", date: dayYmd(TRIP_START, 1), time: "10:00", latitude: 43.208, longitude: 5.532, location: "Bestouan, Cassis" },
    ],
  },
  marseille: {
    label: "Marseille city-trip (3j proches)",
    cityLabel: "Marseille, France",
    tripDays: 3,
    fallbackCenter: { latitude: 43.2965, longitude: 5.374 },
    activities: [
      { id: "m1", title: "Vieux-Port", date: dayYmd(TRIP_START, 0), time: "10:00", latitude: 43.2951, longitude: 5.374, location: "Vieux-Port, Marseille" },
      { id: "m2", title: "Notre-Dame de la Garde", date: dayYmd(TRIP_START, 0), time: "14:00", latitude: 43.284, longitude: 5.371, location: "Notre-Dame, Marseille" },
      { id: "m6", title: "MuCEM terrasse", date: dayYmd(TRIP_START, 0), time: "17:00", latitude: 43.2938, longitude: 5.3595, location: "MuCEM, Marseille" },
      { id: "m3", title: "Le Panier", date: dayYmd(TRIP_START, 1), time: "10:00", latitude: 43.2965, longitude: 5.3698, location: "Le Panier, Marseille" },
      { id: "m4", title: "MuCEM", date: dayYmd(TRIP_START, 2), time: "11:00", latitude: 43.2935, longitude: 5.3775, location: "MuCEM, Marseille" },
      { id: "m5", title: "Cathédrale La Major", date: dayYmd(TRIP_START, 2), time: "15:00", latitude: 43.299, longitude: 5.365, location: "La Major, Marseille" },
    ],
  },
  crete: {
    label: "Crète road-trip (3j espacés)",
    cityLabel: "Crète, Grèce",
    tripDays: 3,
    fallbackCenter: { latitude: 35.35, longitude: 24.8 },
    activities: [
      { id: "c1", title: "Héraklion", date: dayYmd(TRIP_START, 0), time: "10:00", latitude: 35.3387, longitude: 25.1442, location: "Héraklion" },
      { id: "c2", title: "Knossos", date: dayYmd(TRIP_START, 0), time: "14:00", latitude: 35.298, longitude: 25.163, location: "Knossos" },
      { id: "c3", title: "La Canée", date: dayYmd(TRIP_START, 1), time: "10:00", latitude: 35.5138, longitude: 24.018, location: "La Canée" },
      { id: "c4", title: "Elounda", date: dayYmd(TRIP_START, 2), time: "11:00", latitude: 35.2614, longitude: 25.7273, location: "Elounda" },
    ],
  },
};

/** Preview dev — vue d'ensemble marqueurs-jour (?scenario=marseille|crete|cassis). */
export default function PlannerSheetPreview() {
  const { t } = useI18n();
  const params = new URLSearchParams(window.location.search);
  const scenarioKey = params.get("scenario") || "cassis";
  const scenario = PREVIEW_SCENARIOS[scenarioKey] || PREVIEW_SCENARIOS.cassis;
  const tripEndYmd = tripEnd(TRIP_START, scenario.tripDays);

  const rawActivities = useMemo(
    () =>
      scenario.activities.map((a) => ({
        ...a,
        trip_id: TRIP_ID,
      })),
    [scenario]
  );

  const [sheetSnap, setSheetSnap] = useState(() => params.get("snap") || "mid");
  const [timelineScope, setTimelineScope] = useState(() => params.get("scope") || "trip");
  const [selectedDate, setSelectedDate] = useState(TRIP_START);
  const [selectedActivityId, setSelectedActivityId] = useState("");

  const plannerMapActivities = useMemo(
    () => buildPlannerMapActivities({ activities: rawActivities, tripId: TRIP_ID, tripStartYmd: TRIP_START }),
    [rawActivities]
  );

  const tripDayGroups = useMemo(
    () =>
      buildPlannerTripDayGroups({
        activities: rawActivities,
        tripId: TRIP_ID,
        tripStartYmd: TRIP_START,
        tripEndYmd,
        cityLabel: scenario.cityLabel,
      }),
    [rawActivities, tripEndYmd, scenario.cityLabel]
  );

  const dayActivities = rawActivities.filter((a) => a.date === selectedDate);
  const mapView = timelineScope === "trip" ? "trip" : "day";
  const selectedDayIndex = Math.max(
    0,
    Math.round(
      (new Date(`${selectedDate}T12:00:00`).getTime() - new Date(`${TRIP_START}T12:00:00`).getTime()) / 86400000
    )
  );

  const formatDate = (ymd) => {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  const handleOverviewDaySelect = (dayIndex, dateKey) => {
    setSelectedDate(dateKey || addDaysToYmd(TRIP_START, dayIndex));
    setTimelineScope("day");
    setSelectedActivityId("");
  };

  return (
    <div
      className="min-h-[100dvh] bg-slate-100 [--app-header-clearance:4.5rem] [--app-bottom-nav-clearance:5.5rem]"
      data-preview-scope={timelineScope}
      data-preview-scenario={scenarioKey}
    >
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
        <div className="mx-auto flex max-w-lg items-center justify-between rounded-[2rem] bg-white/95 px-4 py-3 shadow-lg">
          <span className="font-display text-sm text-slate-900">{scenario.label}</span>
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
          collapsedSummary={
            timelineScope === "trip"
              ? t("planner.sheetOverviewSummary", { days: tripDayGroups.length })
              : t("planner.sheetDaySummary", {
                  date: formatDate(selectedDate),
                  n: dayActivities.length,
                })
          }
          mapNode={
            <LazyTripMap
              activities={plannerMapActivities}
              view={mapView}
              selectedDayIndex={selectedDayIndex}
              selectedActivityId={selectedActivityId}
              onSelectActivity={(id) => {
                setSelectedActivityId(String(id || ""));
                if (id) setTimelineScope("day");
              }}
              onSelectDay={(dayIndex) => handleOverviewDaySelect(dayIndex)}
              onViewTrip={() => setTimelineScope("trip")}
              mode="planner"
              cityLabel={scenario.cityLabel}
              fallbackCenter={scenario.fallbackCenter}
              suppressActivitySheet
              className="h-full min-h-0"
            />
          }
          headerAction={
            sheetSnap !== "full" ? (
              <button
                type="button"
                className="flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[#142F5D] text-white shadow-md"
                aria-label={t("planner.addActivity")}
              >
                <Plus size={18} aria-hidden />
              </button>
            ) : null
          }
        >
          <PlannerMobileSheetContent
            timelineScope={timelineScope}
            onTimelineScopeChange={setTimelineScope}
            sheetSnap={sheetSnap}
            headerAction={
              sheetSnap !== "full" ? (
                <button
                  type="button"
                  className="flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[#142F5D] text-white shadow-md"
                  aria-label={t("planner.addActivity")}
                >
                  <Plus size={18} aria-hidden />
                </button>
              ) : null
            }
            showCalendar={timelineScope === "day" && sheetSnap === "mid"}
            renderCalendar={() => (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-[10px] uppercase tracking-widest text-slate-500">
                Calendrier (cran mid · mode jour)
              </p>
            )}
            onSelectOverviewDay={handleOverviewDaySelect}
            overviewProps={{
              activities: rawActivities,
              tripId: TRIP_ID,
              tripStartYmd: TRIP_START,
              tripEndYmd,
              cityLabel: scenario.cityLabel,
              formatDate,
              selectedDayIndex,
            }}
            dayProps={{
              selectedDate,
              formatDate,
              activities: dayActivities,
              plannerMapActivities,
              dayIndex: selectedDayIndex,
              selectedDayIndex,
              cityLabel: scenario.cityLabel,
              selectedActivityId,
              onMapFocus: setSelectedActivityId,
            }}
          />
        </PlannerMobileSheetLayout>
      </main>
    </div>
  );
}
