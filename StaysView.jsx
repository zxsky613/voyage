import React, { useEffect, useMemo, useState } from "react";
import { BedDouble, Calendar, ExternalLink, MapPin, Users, Wallet } from "lucide-react";
import { useI18n } from "./i18n/I18nContext.jsx";
import { buildAllStaySearchUrls } from "./lib/stays/staySearchLinks.js";
import { EXPENSE_SOURCE, expenseCategory, filterExpensesForTrip } from "./lib/budget/expenseSources.js";

function toYMD(value, fallback = "") {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return fallback;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function formatEuroFR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function tripLabel(trip) {
  return String(trip?.title || trip?.destination || trip?.name || "").trim();
}

function tripDestination(trip) {
  return String(trip?.destination || trip?.title || trip?.name || "").trim();
}

export default function StaysView({
  trips = [],
  destinationHint = "",
  groupExpenses = [],
  groupExpensesEnabled = false,
  onAddLodgingExpense,
  onOpenTripBudget,
}) {
  const { t } = useI18n();
  const sortedTrips = useMemo(
    () =>
      [...(trips || [])].sort((a, b) =>
        String(a?.start_date || "").localeCompare(String(b?.start_date || ""))
      ),
    [trips]
  );

  const [tripId, setTripId] = useState("");
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [lodgingTitle, setLodgingTitle] = useState("");
  const [lodgingAmount, setLodgingAmount] = useState("");
  const [savingLodging, setSavingLodging] = useState(false);

  const activeTrip = sortedTrips.find((tr) => String(tr.id) === String(tripId)) || null;

  useEffect(() => {
    if (activeTrip) {
      setDestination(tripDestination(activeTrip));
      setCheckIn(toYMD(activeTrip.start_date, ""));
      setCheckOut(toYMD(activeTrip.end_date, ""));
      const dest = tripDestination(activeTrip);
      setLodgingTitle(dest ? t("stays.lodgingDefaultTitle", { place: dest }) : "");
      return;
    }
    if (destinationHint) setDestination(String(destinationHint).trim());
  }, [activeTrip, destinationHint, t]);

  useEffect(() => {
    if (tripId || sortedTrips.length === 0) return;
    setTripId(String(sortedTrips[0].id));
  }, [sortedTrips, tripId]);

  const lodgingExpenses = useMemo(() => {
    if (!tripId) return [];
    return filterExpensesForTrip(groupExpenses, tripId).filter(
      (e) => expenseCategory(e) === EXPENSE_SOURCE.LODGING
    );
  }, [groupExpenses, tripId]);

  const providers = useMemo(
    () =>
      buildAllStaySearchUrls({
        destination,
        checkIn,
        checkOut,
        adults,
        rooms,
      }),
    [destination, checkIn, checkOut, adults, rooms]
  );

  const openProvider = (url) => {
    if (!url || typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleAddToBudget = async () => {
    if (!groupExpensesEnabled || !tripId || typeof onAddLodgingExpense !== "function") return;
    const amt = Number(String(lodgingAmount).replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) return;
    setSavingLodging(true);
    try {
      const title =
        String(lodgingTitle || "").trim() ||
        t("stays.lodgingDefaultTitle", { place: destination.trim() || t("stays.tripFallback") });
      const ok = await onAddLodgingExpense({
        tripId,
        title,
        amount: amt,
        checkIn,
      });
      if (ok) {
        setLodgingAmount("");
      }
    } finally {
      setSavingLodging(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-blue-tint text-brand-blue-deep">
          <BedDouble size={22} aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-lg text-slate-900">{t("stays.title")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{t("stays.subtitle")}</p>
        </div>
      </div>

      <div className="space-y-4 rounded-[2rem] bg-white/93 p-5 shadow-[0_14px_36px_rgba(2,6,23,0.07)]">
        {sortedTrips.length > 0 ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              {t("stays.linkedTrip")}
            </span>
            <select
              value={tripId}
              onChange={(e) => setTripId(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none ring-brand-blue/20 focus:border-brand-blue focus:ring-2"
            >
              <option value="">{t("stays.noTripSelected")}</option>
              {sortedTrips.map((trip) => (
                <option key={String(trip.id)} value={String(trip.id)}>
                  {tripLabel(trip) || t("stays.tripFallback")}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-slate-500">{t("stays.noTrips")}</p>
        )}

        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            <MapPin size={14} aria-hidden />
            {t("stays.destination")}
          </span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={t("stays.destinationPlaceholder")}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              <Calendar size={14} aria-hidden />
              {t("stays.checkIn")}
            </span>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="modal-date-field w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 shadow-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              <Calendar size={14} aria-hidden />
              {t("stays.checkOut")}
            </span>
            <input
              type="date"
              value={checkOut}
              min={checkIn || undefined}
              onChange={(e) => setCheckOut(e.target.value)}
              className="modal-date-field w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 shadow-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              <Users size={14} aria-hidden />
              {t("stays.adults")}
            </span>
            <input
              type="number"
              min={1}
              max={16}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              {t("stays.rooms")}
            </span>
            <input
              type="number"
              min={1}
              max={8}
              value={rooms}
              onChange={(e) => setRooms(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
            />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">{t("stays.providers")}</p>
        {!destination.trim() ? (
          <p className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white/80 px-5 py-6 text-sm text-slate-500">
            {t("stays.enterDestination")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openProvider(p.url)}
                className="group flex flex-col items-start gap-3 rounded-[1.75rem] border border-slate-200/80 bg-white p-5 text-left shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.1)]"
              >
                <span
                  className="inline-flex rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: p.accent }}
                >
                  {p.logoLabel}
                </span>
                <span className="text-sm font-medium text-slate-900">{t(`stays.provider.${p.id}`)}</span>
                <span className="text-xs leading-relaxed text-slate-500">{t(`stays.providerHint.${p.id}`)}</span>
                <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue-deep/80 group-hover:text-brand-blue-deep">
                  {t("stays.searchOn", { name: p.name })}
                  <ExternalLink size={14} aria-hidden />
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-slate-500">{t("stays.disclaimer")}</p>
      </div>

      <div className="space-y-4 rounded-[2rem] bg-white/92 p-5 shadow-[0_14px_36px_rgba(2,6,23,0.07)]">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-blue-tint text-brand-blue-deep">
            <Wallet size={18} aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-900">{t("stays.budgetSection")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{t("stays.budgetSectionHint")}</p>
          </div>
        </div>

        {!groupExpensesEnabled ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
            {t("stays.budgetDisabledHint")}
          </p>
        ) : !tripId ? (
          <p className="text-sm text-slate-500">{t("stays.selectTripForBudget")}</p>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                {t("stays.lodgingTitle")}
              </span>
              <input
                type="text"
                value={lodgingTitle}
                onChange={(e) => setLodgingTitle(e.target.value)}
                placeholder={t("stays.lodgingTitlePh")}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                {t("stays.lodgingAmount")}
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={lodgingAmount}
                onChange={(e) => setLodgingAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingLodging}
                onClick={() => void handleAddToBudget()}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-gradient px-4 py-2.5 text-sm text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {savingLodging ? t("stays.addingToBudget") : t("stays.addToBudget")}
              </button>
              {typeof onOpenTripBudget === "function" && activeTrip ? (
                <button
                  type="button"
                  onClick={() => onOpenTripBudget(activeTrip)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-brand-blue/20 bg-white px-4 py-2.5 text-sm text-brand-blue-deep transition hover:bg-brand-blue-tint"
                >
                  {t("stays.openBudget")}
                </button>
              ) : null}
            </div>
            {lodgingExpenses.length > 0 ? (
              <div className="border-t border-brand-blue/15 pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                  {t("stays.recentLodging")}
                </p>
                <ul className="space-y-2">
                  {lodgingExpenses.map((e) => (
                    <li
                      key={String(e.id)}
                      className="flex items-center justify-between gap-2 rounded-xl bg-white/90 px-3 py-2 text-sm ring-1 ring-brand-blue/15"
                    >
                      <span className="min-w-0 truncate text-slate-800">{e.title}</span>
                      <span className="shrink-0 tabular-nums text-slate-700">{formatEuroFR(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
