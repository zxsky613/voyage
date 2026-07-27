import React from "react";
import AllTripsView from "./AllTripsView.jsx";

function offsetYmd(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

const GRADIENTS = {
  Cassis: "from-cyan-600 via-teal-500 to-emerald-400",
  Venise: "from-rose-500 via-orange-400 to-amber-300",
  Amalfi: "from-blue-600 via-indigo-500 to-violet-400",
  Marseille: "from-sky-500 via-blue-500 to-indigo-600",
  Lisbonne: "from-amber-600 via-orange-500 to-red-400",
};

/** Vignette mock pour preview dev (composants réels AllTripsView + cartes). */
function PreviewCityImage({ title, frameClassName = "" }) {
  const key = Object.keys(GRADIENTS).find((k) => String(title || "").includes(k)) || "Cassis";
  return (
    <div
      className={`flex h-full w-full items-end bg-gradient-to-br ${GRADIENTS[key]} ${frameClassName}`.trim()}
    >
      <span className="p-2 text-[10px] font-medium uppercase tracking-wider text-white/90">{title}</span>
    </div>
  );
}

function PreviewEmptyInvite() {
  return null;
}

const DEMO_TRIPS = [
  {
    id: "active-cassis",
    title: "Cassis, France",
    start_date: offsetYmd(-3),
    end_date: offsetYmd(4),
  },
  {
    id: "up-venice",
    title: "Venise, Italie",
    start_date: offsetYmd(14),
    end_date: offsetYmd(21),
  },
  {
    id: "up-amalfi",
    title: "Amalfi, Italie",
    start_date: offsetYmd(35),
    end_date: offsetYmd(42),
  },
  {
    id: "past-marseille",
    title: "Marseille, France",
    start_date: offsetYmd(-120),
    end_date: offsetYmd(-110),
  },
  {
    id: "past-lisbon",
    title: "Lisbonne, Portugal",
    start_date: offsetYmd(-200),
    end_date: offsetYmd(-193),
  },
];

/** Preview dev — 1 hero actif + compacts (mêmes composants prod). */
export default function TripsCompactPreview() {
  return (
    <div className="min-h-[100dvh] bg-slate-100 px-3 py-6">
      <p className="mb-4 text-center text-[10px] uppercase tracking-widest text-slate-500">
        Preview réel — composants lib/trips (390px)
      </p>
      <AllTripsView
        trips={DEMO_TRIPS}
        CityImage={PreviewCityImage}
        EmptyInvite={PreviewEmptyInvite}
        onOpenTrip={() => {}}
        onShareTrip={() => {}}
        onEditTrip={() => {}}
        onDeleteTrip={() => {}}
        onStartAiCreate={() => {}}
      />
    </div>
  );
}
