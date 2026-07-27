import React from "react";
import { Pencil, Share2, Trash2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { UiLocalizedTripTitle } from "../../i18n/userContentTranslate.jsx";
import { formatTripDate } from "./formatTripDate.js";
import TripHeroImage from "./TripHeroImage.jsx";

/**
 * Grande carte immersive — voyage actif (en cours).
 * @param {{
 *   trip: object,
 *   onOpen: (trip: object) => void,
 *   onShare: (trip: object) => void,
 *   onEdit?: (trip: object) => void,
 *   onDelete?: (trip: object) => void,
 * }} props
 */
export default function TripActiveHeroCard({
  trip,
  onOpen,
  onShare,
  onEdit,
  onDelete,
}) {
  const { t } = useI18n();
  const actionBtnClass =
    "rounded-full bg-[rgba(20,47,93,0.42)] p-2 text-white shadow-md backdrop-blur-sm ring-1 ring-white/25 transition hover:bg-[rgba(20,47,93,0.58)]";

  return (
    <article className="group w-full min-w-0 max-w-full">
      <div className="relative aspect-[4/3] max-h-[min(52vw,240px)] w-full min-w-0 overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-slate-200/40 sm:aspect-[16/10] sm:max-h-none">
        <button type="button" onClick={() => onOpen(trip)} className="block h-full w-full text-left">
          <div className="h-full w-full overflow-hidden rounded-[2rem] [&_img]:transition-transform [&_img]:duration-500 [&_img]:ease-out group-hover:[&_img]:scale-[1.03]">
            <TripHeroImage trip={trip} frameClassName="rounded-[2rem]" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[2rem] bg-gradient-to-b from-[rgba(20,47,93,0.55)] via-[rgba(20,47,93,0.2)] to-transparent" />
          <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-t from-black/50 via-black/12 to-transparent" />
          <div className="pointer-events-none absolute bottom-5 left-5 right-5 text-white">
            <span className="mb-2 inline-flex rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
              {t("trips.badgeInProgress")}
            </span>
            <h3 className="max-w-full truncate font-display text-[clamp(1.1rem,2.2vw,1.65rem)] font-normal uppercase leading-[1.08] tracking-[0.08em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8),0_2px_14px_rgba(0,0,0,0.5)]">
              <UiLocalizedTripTitle raw={String(trip.title || "")} emptyLabel={t("modals.tripDefault")} />
            </h3>
            <p className="mt-1 w-full truncate text-left text-[clamp(0.62rem,0.85vw,0.75rem)] font-medium tracking-[0.04em] text-white/95">
              {formatTripDate(trip.start_date)} – {formatTripDate(trip.end_date)}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShare(trip);
          }}
          className={`absolute left-4 top-4 ${actionBtnClass}`}
          title={t("tripCard.share")}
        >
          <Share2 size={14} />
        </button>
        {(onEdit || onDelete) ? (
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {onEdit ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(trip);
                }}
                className={actionBtnClass}
                title={t("tripCard.edit")}
              >
                <Pencil size={14} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(trip);
                }}
                className={`${actionBtnClass} hover:bg-rose-900/55`}
                title={t("tripCard.delete")}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
