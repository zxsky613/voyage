import React from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { UiLocalizedTripTitle } from "../../i18n/userContentTranslate.jsx";
import { formatTripDate } from "./formatTripDate.js";
import TripCardMenu from "./TripCardMenu.jsx";

/**
 * Carte voyage horizontale compacte (~100px).
 * @param {{
 *   trip: object,
 *   CityImage: React.ComponentType<{ title: string, frameClassName?: string }>,
 *   onOpen: (trip: object) => void,
 *   onShare?: (trip: object) => void,
 *   onEdit?: (trip: object) => void,
 *   onDelete?: (trip: object) => void,
 *   statusLabel?: string,
 *   statusTone?: 'emerald'|'blue'|'slate',
 *   muted?: boolean,
 * }} props
 */
export default function TripCompactCard({
  trip,
  CityImage,
  onOpen,
  onShare,
  onEdit,
  onDelete,
  statusLabel = "",
  statusTone = "blue",
  muted = false,
}) {
  const { t } = useI18n();

  const chipClass =
    statusTone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : statusTone === "slate"
        ? "bg-slate-200 text-slate-600"
        : "bg-brand-blue-tint text-brand-blue-deep";

  return (
    <article
      className={`group relative flex h-[104px] min-h-[100px] w-full items-stretch overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-100/80 transition hover:-translate-y-px hover:shadow-md ${
        muted ? "opacity-75 grayscale-[0.35]" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(trip)}
        className="flex min-w-0 flex-1 items-stretch text-left"
      >
        <div className="relative h-[104px] w-[100px] shrink-0 overflow-hidden [&_img]:h-full [&_img]:w-full [&_img]:object-cover">
          <CityImage title={trip.title} frameClassName="rounded-none" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5 pr-10">
          <h3 className="truncate font-display text-[0.92rem] font-medium uppercase tracking-[0.06em] text-slate-900">
            <UiLocalizedTripTitle raw={String(trip.title || "")} emptyLabel={t("modals.tripDefault")} />
          </h3>
          <p className="truncate text-[0.72rem] font-medium tracking-[0.02em] text-slate-500">
            {formatTripDate(trip.start_date)} – {formatTripDate(trip.end_date)}
          </p>
          {statusLabel ? (
            <span
              className={`mt-0.5 inline-flex w-fit max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] ${chipClass}`}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
      </button>
      <TripCardMenu
        trip={trip}
        onShare={onShare}
        onEdit={onEdit}
        onDelete={onDelete}
        className="absolute right-2 top-2"
      />
    </article>
  );
}
