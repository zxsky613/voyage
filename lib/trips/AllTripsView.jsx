import React from "react";
import { Calendar, ImageIcon, Plane } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { classifyTrips } from "./classifyTrips.js";
import TripActiveHeroCard from "./TripActiveHeroCard.jsx";
import TripCompactCard from "./TripCompactCard.jsx";

/**
 * @param {{ icon: React.ReactNode, label: string, tone: 'emerald'|'blue'|'slate' }} props
 */
function TripsSectionHeader({ icon, label, tone }) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "blue"
        ? "text-brand-blue-deep"
        : "text-slate-600";

  return (
    <div className={`mb-3 flex items-center gap-2 pl-1 ${toneClass}`}>
      <span className="shrink-0 opacity-90" aria-hidden>
        {icon}
      </span>
      <h2 className="font-display text-xs font-normal uppercase tracking-[0.32em]">{label}</h2>
    </div>
  );
}

/**
 * Accueil « Mes voyages » — hero pour le voyage actif, cartes compactes pour le reste.
 * @param {{
 *   trips: object[],
 *   EmptyInvite: React.ComponentType<{ variant: string, onCta: () => void }>,
 *   onOpenTrip: (trip: object) => void,
 *   onShareTrip: (trip: object) => void,
 *   onEditTrip?: (trip: object) => void,
 *   onDeleteTrip?: (trip: object) => void,
 *   onStartAiCreate: () => void,
 * }} props
 */
export default function AllTripsView({
  trips,
  EmptyInvite,
  onOpenTrip,
  onShareTrip,
  onEditTrip,
  onDeleteTrip,
  onStartAiCreate,
}) {
  const { t } = useI18n();
  const sections = classifyTrips(trips);

  const cardProps = {
    onOpen: onOpenTrip,
    onShare: onShareTrip,
    onEdit: onEditTrip,
    onDelete: onDeleteTrip,
  };

  if (!trips?.length) {
    return (
      <section>
        <EmptyInvite variant="trips" onCta={onStartAiCreate} />
      </section>
    );
  }

  const activeTrip = sections.now?.[0] || null;
  const otherInProgress = sections.now?.slice(1) || [];

  return (
    <section className="mx-auto w-full max-w-[480px] space-y-5 px-0 sm:space-y-6">
      <div className="rounded-[2rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)]">
        <TripsSectionHeader
          icon={<Plane size={14} strokeWidth={1.75} />}
          label={t("trips.badgeInProgress")}
          tone="emerald"
        />
        {activeTrip ? (
          <div className="space-y-2">
            <TripActiveHeroCard trip={activeTrip} {...cardProps} onShare={onShareTrip} />
            {otherInProgress.map((trip) => (
              <TripCompactCard
                key={String(trip.id)}
                trip={trip}
                {...cardProps}
                statusLabel={t("trips.badgeInProgress")}
                statusTone="emerald"
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">{t("home.noCurrentTrip")}</p>
        )}
      </div>

      <div className="rounded-[2rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)]">
        <TripsSectionHeader
          icon={<Calendar size={14} strokeWidth={1.75} />}
          label={t("trips.badgeUpcoming")}
          tone="blue"
        />
        {sections.upcoming?.length ? (
          <div className="flex flex-col gap-2">
            {sections.upcoming.map((trip) => (
              <TripCompactCard
                key={String(trip.id)}
                trip={trip}
                {...cardProps}
                statusLabel={t("trips.badgeUpcoming")}
                statusTone="blue"
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">{t("trips.noUpcomingList")}</p>
        )}
      </div>

      <div className="rounded-[2rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)]">
        <TripsSectionHeader
          icon={<ImageIcon size={14} strokeWidth={1.75} />}
          label={t("trips.memories")}
          tone="slate"
        />
        {sections.memories?.length ? (
          <div className="flex flex-col gap-2">
            {sections.memories.map((trip) => (
              <TripCompactCard
                key={String(trip.id)}
                trip={trip}
                {...cardProps}
                statusLabel={t("trips.badgePast")}
                statusTone="slate"
                muted
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">{t("trips.noMemories")}</p>
        )}
      </div>
    </section>
  );
}
