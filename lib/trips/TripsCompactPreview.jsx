import React, { useEffect } from "react";
import {
  BedDouble,
  Briefcase,
  Calendar,
  DollarSign,
  Menu,
  Plus,
  Search,
} from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import AllTripsView from "./AllTripsView.jsx";
import { writeTripHeroCache } from "./tripHeroCache.js";

const ACCENT = "#142F5D";

function offsetYmd(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function PreviewEmptyInvite() {
  return null;
}

function PreviewTopNav({ title }) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 min-w-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px)+0.35rem)] pb-1">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl items-center justify-between gap-2 rounded-[2.25rem] bg-white/90 px-3 py-3 shadow-[0_16px_44px_rgba(2,6,23,0.08)] backdrop-blur-xl">
        <button type="button" className="shrink-0 rounded-full p-2.5 text-slate-700" aria-label="Menu">
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1 px-1 text-center">
          <h1 className="truncate font-display text-sm font-normal tracking-[0.05em] text-slate-900">{title}</h1>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-[2rem] px-3.5 py-2.5 text-white shadow-[0_2px_10px_rgba(20,47,93,0.22)]"
          style={{ backgroundColor: ACCENT }}
          aria-label="Ajouter"
        >
          <Plus size={20} className="shrink-0" aria-hidden />
        </button>
      </div>
    </header>
  );
}

function PreviewBottomNav() {
  const tabs = [
    { id: "trips", icon: Briefcase, active: true },
    { id: "planner", icon: Calendar, active: false },
    { id: "destination", icon: Search, active: false },
    { id: "stays", icon: BedDouble, active: false },
    { id: "budget", icon: DollarSign, active: false },
  ];

  return (
    <nav className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 z-30 w-[min(100%-1.5rem,calc(100vw-1.5rem))] max-w-3xl -translate-x-1/2 rounded-[2.2rem] bg-white/92 p-1.5 shadow-[0_18px_44px_rgba(2,6,23,0.12)] backdrop-blur-xl">
      <div className="grid items-center gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ id, icon: Icon, active }) => (
          <button
            key={id}
            type="button"
            className={`relative flex min-h-[2.75rem] items-center justify-center rounded-[2rem] px-1 py-1.5 text-xs ${
              active ? "text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)]" : "text-slate-700"
            }`}
            style={active ? { backgroundColor: ACCENT } : undefined}
            aria-label={id}
          >
            <Icon size={20} className="shrink-0" aria-hidden />
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Photos Wikimedia vérifiées (catalogue app) — une URL distincte par voyage demo. */
const DEMO_HERO_URLS = {
  "active-cassis":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Nice_baie_des_Anges.jpg/1920px-Nice_baie_des_Anges.jpg",
  "up-venice":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Panorama_of_Canal_Grande_and_Ponte_di_Rialto%2C_Venice_-_September_2017.jpg/1920px-Panorama_of_Canal_Grande_and_Ponte_di_Rialto%2C_Venice_-_September_2017.jpg",
  "up-amalfi":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Colosseum_in_Rome%2C_Italy_-_April_2007.jpg/1920px-Colosseum_in_Rome%2C_Italy_-_April_2007.jpg",
  "past-marseille":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Hafen_von_Marseille-Notre_Dame_de_la_Garde.jpg/1920px-Hafen_von_Marseille-Notre_Dame_de_la_Garde.jpg",
  "past-lisbon":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Tram_28_Lisbon_Portuguese.jpg/1920px-Tram_28_Lisbon_Portuguese.jpg",
};

const DEMO_TRIPS = [
  {
    id: "active-cassis",
    title: "Cassis, France",
    destination: "Cassis, France",
    hero_image_url: DEMO_HERO_URLS["active-cassis"],
    start_date: offsetYmd(-3),
    end_date: offsetYmd(4),
  },
  {
    id: "up-venice",
    title: "Venise, Italie",
    destination: "Venise, Italie",
    hero_image_url: DEMO_HERO_URLS["up-venice"],
    start_date: offsetYmd(14),
    end_date: offsetYmd(21),
  },
  {
    id: "up-amalfi",
    title: "Amalfi, Italie",
    destination: "Amalfi, Italie",
    hero_image_url: DEMO_HERO_URLS["up-amalfi"],
    start_date: offsetYmd(35),
    end_date: offsetYmd(42),
  },
  {
    id: "past-marseille",
    title: "Marseille, France",
    destination: "Marseille, France",
    hero_image_url: DEMO_HERO_URLS["past-marseille"],
    start_date: offsetYmd(-120),
    end_date: offsetYmd(-110),
  },
  {
    id: "past-lisbon",
    title: "Lisbonne, Portugal",
    destination: "Lisbonne, Portugal",
    hero_image_url: DEMO_HERO_URLS["past-lisbon"],
    start_date: offsetYmd(-200),
    end_date: offsetYmd(-193),
  },
];

/** Preview dev — page complète (TopNav + AllTripsView + bottom nav). */
export default function TripsCompactPreview() {
  const { t } = useI18n();

  useEffect(() => {
    for (const [tripId, url] of Object.entries(DEMO_HERO_URLS)) {
      writeTripHeroCache(tripId, url);
    }
  }, []);

  return (
    <div className="min-h-[100dvh] bg-slate-100 pb-[var(--app-bottom-nav-clearance,5.5rem)]">
      <PreviewTopNav title={t("nav.trips")} />
      <main className="mx-auto w-full min-w-0 max-w-6xl scroll-mt-[var(--app-header-clearance,5rem)] px-3 pt-[calc(var(--app-header-clearance,5rem)+0.5rem)] sm:px-5">
        <AllTripsView
          trips={DEMO_TRIPS}
          EmptyInvite={PreviewEmptyInvite}
          onOpenTrip={() => {}}
          onShareTrip={() => {}}
          onEditTrip={() => {}}
          onDeleteTrip={() => {}}
          onStartAiCreate={() => {}}
        />
      </main>
      <PreviewBottomNav />
    </div>
  );
}
