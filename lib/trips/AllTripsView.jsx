import React from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { classifyTrips } from "./classifyTrips.js";
import TripActiveHeroCard from "./TripActiveHeroCard.jsx";
import TripCompactCard from "./TripCompactCard.jsx";

/**
 * Accueil « Mes voyages » — hero pour le voyage actif, cartes compactes pour le reste.
 * @param {{
 *   trips: object[],
 *   CityImage: React.ComponentType<{ title: string, frameClassName?: string }>,
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
  CityImage,
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
    CityImage,
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
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)]">
        <div className="mb-3 flex items-center justify-between pl-1">
          <h2 className="font-display text-xs font-normal uppercase tracking-[0.32em] text-emerald-700">
            {t("home.now")}
          </h2>
          {activeTrip ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-emerald-700">
              {t("trips.badgeInProgress")}
            </span>
          ) : null}
        </div>
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
        <div className="mb-3 flex items-center justify-between pl-1">
          <h2 className="font-display text-xs font-normal uppercase tracking-[0.32em] text-brand-blue-deep">
            {t("home.upcoming")}
          </h2>
          <span className="rounded-full bg-brand-blue-tint px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-brand-blue-deep">
            {t("trips.badgeUpcoming")}
          </span>
        </div>
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
        <div className="mb-3 flex items-center justify-between pl-1">
          <h2 className="font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-600">
            {t("trips.memories")}
          </h2>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-slate-600">
            {t("trips.badgePast")}
          </span>
        </div>
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
