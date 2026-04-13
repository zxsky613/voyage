
// ── InviteEmailModal ──────────────────────────────────────────────────────────
function InviteEmailModal({ open, onClose, trip, activities, inviterName }) {
  useScrollLock(open);
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [manualMailto, setManualMailto] = useState("");
  const [fallbackInviteUrl, setFallbackInviteUrl] = useState("");
  const [lastApiError, setLastApiError] = useState("");
  const [copyLinkState, setCopyLinkState] = useState("");

  useEffect(() => {
    if (open) {
      setEmail("");
      setState("idle");
      setManualMailto("");
      setFallbackInviteUrl("");
      setLastApiError("");
      setCopyLinkState("");
    }
  }, [open]);

  if (!open || !trip) return null;

  const tripTitle = String(trip?.title || t("modals.tripDefault"));
  const startDate = String(trip?.start_date || "");
  const endDate = String(trip?.end_date || "");
  const dateRange = `${formatDate(startDate)} \u2014 ${formatDate(endDate)}`;

  const buildProgramme = () => {
    const rows = (activities || []).slice().sort((a, b) => {
      const d = String(a.date || "").localeCompare(String(b.date || ""));
      return d !== 0 ? d : String(a.time || "").localeCompare(String(b.time || ""));
    });
    if (!rows.length) return "";
    const byDay = {};
    rows.forEach((r) => { const k = String(r.date || ""); if (!byDay[k]) byDay[k] = []; byDay[k].push(r); });
    return Object.entries(byDay).map(([date, acts]) =>
      [`\uD83D\uDCC5 ${formatDate(date)}`, ...acts.map((a) => `  ${String(a.time || "--:--").slice(0, 5)}  ${String(a.title || "")}`)].join("\n")
    ).join("\n\n");
  };

  const buildMailtoFallback = (trimmed, programme) => {
    const inviteParams = new URLSearchParams({
      invite: "1",
      email: trimmed,
      trip: tripTitle,
      ...(inviterName ? { from: inviterName } : {}),
      ...(startDate ? { start: startDate } : {}),
      ...(endDate ? { end: endDate } : {}),
    });
    const inviteUrl = `${window.location.origin}?${inviteParams.toString()}`;
    const subj = encodeURIComponent(
      `\u2708\uFE0F ${inviterName ? `${inviterName} t'invite` : "Invitation"} : ${tripTitle}`
    );
    const bodyLines = [
      `Salut,`,
      ``,
      `${inviterName ? `${inviterName} t'` : "On t'"}invite \u00e0 rejoindre le voyage "${tripTitle}" !`,
      ``,
      `\uD83D\uDCC5 Dates : ${dateRange}`,
      programme ? `\n\uD83D\uDCCB Programme :\n${programme}` : "",
      ``,
      `\uD83D\uDD17 Acc\u00e8de aux d\u00e9tails et rejoins le voyage directement :`,
      inviteUrl,
      ``,
      `\u00c0 bient\u00f4t ! \uD83C\uDF0D`,
    ].join("\n");
    return {
      inviteUrl,
      mailto: `mailto:${encodeURIComponent(trimmed)}?subject=${subj}&body=${encodeURIComponent(bodyLines)}`,
    };
  };

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    setState("sending");
    setLastApiError("");
    setCopyLinkState("");
    const programme = buildProgramme();
    const inv = await postTripInvitesToApi({
      to: [trimmed],
      tripTitle,
      startYmd: startDate,
      endYmd: endDate,
      fixedUrl: String(trip?.fixed_url || ""),
      programmeText: programme,
    });
    if (inv.ok && !inv.skipped) {
      setState("sent");
      setTimeout(onClose, 1500);
      return;
    }
    const fb = buildMailtoFallback(trimmed, programme);
    setFallbackInviteUrl(fb.inviteUrl);
    setManualMailto(fb.mailto);
    setLastApiError(String(inv.error || NOTICE_INVITE_EMAIL_FAILED).trim());
    setState("needs_manual");
  };

  const openMailtoFallback = () => {
    if (!manualMailto) return;
    window.location.href = manualMailto;
  };

  const copyInviteLink = async () => {
    const url = String(fallbackInviteUrl || "").trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyLinkState("copied");
      return;
    } catch (_e) {
      /* fallback */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      setCopyLinkState(document.execCommand("copy") ? "copied" : "error");
      document.body.removeChild(ta);
    } catch (_err) {
      setCopyLinkState("error");
    }
  };

  return (
    <div
      className="fixed -inset-1 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
              <Mail size={16} strokeWidth={2.5} />
            </span>
            <h2 className="text-[15px] font-bold text-slate-900">{t("modals.shareInviteEmailTitle")}</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"><X size={15} /></button>
        </div>
        <div className="px-5 pb-6 space-y-4">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-100">
            <MapPin size={13} className="shrink-0 text-indigo-500" />
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-slate-800">{tripTitle}</p>
              <p className="text-[11px] text-slate-400">{dateRange}</p>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "needs_manual") {
                  setState("idle");
                  setManualMailto("");
                  setFallbackInviteUrl("");
                  setLastApiError("");
                  setCopyLinkState("");
                }
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              placeholder={t("modals.shareInviteEmailPlaceholder")}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              autoFocus
            />
          </div>
          <p className="flex gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-sky-700 ring-1 ring-sky-100">
            <span className="mt-0.5 shrink-0">\u2139\uFE0F</span>
            <span>{t("modals.shareInviteEmailHint")}</span>
          </p>
          {state === "needs_manual" && (
            <div className="space-y-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-100">
              <p className="font-semibold">{t("modals.shareInviteEmailApiFailed")}</p>
              {lastApiError ? (
                <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-normal text-amber-950/90">
                  {lastApiError}
                </p>
              ) : null}
              <p className="font-normal">{t("modals.shareInviteEmailManualExplain")}</p>
              <p className="text-[10px] font-normal text-amber-800/90">
                {t("modals.shareInviteEmailResendConfigHint")}
              </p>
            </div>
          )}
          {state === "needs_manual" ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={openMailtoFallback}
                disabled={!manualMailto}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                {t("modals.shareInviteEmailOpenMail")}
              </button>
              <button
                type="button"
                onClick={copyInviteLink}
                disabled={!fallbackInviteUrl}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                {copyLinkState === "copied"
                  ? `\u2713 ${t("modals.shareInviteEmailLinkCopied")}`
                  : t("modals.shareInviteEmailCopyLink")}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={state === "sending"}
                className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {t("modals.shareInviteEmailRetry")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={state === "sending" || state === "sent"}
              className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {state === "sent"
                ? `\u2713 ${t("modals.shareInviteEmailSent")}`
                : state === "sending"
                  ? t("modals.shareInviteEmailSending")
                  : t("modals.shareInviteEmailSend")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ShareModal ────────────────────────────────────────────────────────────────
function ShareModal({ open, onClose, trip, activities, inviterName }) {
  useScrollLock(open);
  const { t } = useI18n();
  const [copyState, setCopyState] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => { if (!open) setInviteOpen(false); }, [open]);

  if (!open || !trip) return null;

  const invitedEmails = Array.isArray(trip?.invited_emails) ? trip.invited_emails : [];
  const tripTitle = String(trip?.title || t("modals.tripDefault"));
  const dateRange = `${formatDate(trip?.start_date)} \u2014 ${formatDate(trip?.end_date)}`;

  const sortedActs = (activities || []).slice().sort((a, b) => {
    const d = String(a.date || "").localeCompare(String(b.date || ""));
    return d !== 0 ? d : String(a.time || "").localeCompare(String(b.time || ""));
  });
  const byDay = {};
  sortedActs.forEach((r) => { const k = String(r.date || ""); if (!byDay[k]) byDay[k] = []; byDay[k].push(r); });
  const dayEntries = Object.entries(byDay);

  const buildRecap = () => {
    const lines = [`\u2708\uFE0F ${tripTitle}`, `\uD83D\uDCC5 ${dateRange}`];
    if (dayEntries.length) {
      lines.push("", `\u2500\u2500 ${t("modals.shareProgramSection")} \u2500\u2500`);
      dayEntries.forEach(([date, acts]) => {
        lines.push(`\n${formatDate(date)}`);
        acts.forEach((a) => lines.push(`  ${String(a.time || "--:--").slice(0, 5)}  ${String(a.title || "")}`));
      });
    }
    if (invitedEmails.length) lines.push("", `\u2500\u2500 ${t("modals.shareGuestsSection")} \u2500\u2500`, invitedEmails.join(", "));
    const link = String(trip?.fixed_url || "").trim();
    if (link) lines.push("", `\uD83D\uDD17 ${link}`);
    return lines.join("\n");
  };

  const copy = async () => {
    const text = buildRecap();
    try { await navigator.clipboard.writeText(text); setCopyState("copied"); return; } catch (_e) { /* fallback */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "-9999px";
      document.body.appendChild(ta); ta.select();
      setCopyState(document.execCommand("copy") ? "copied" : "error");
      document.body.removeChild(ta);
    } catch (_err) { setCopyState("error"); }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[1.75rem]"
          style={{ maxHeight: "90svh" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 justify-center pt-3 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-slate-200" />
          </div>
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t("modals.shareTitle")}</p>
              <h2 className="text-[17px] font-bold leading-tight text-slate-900">{tripTitle}</h2>
              <p className="mt-0.5 text-[12px] text-slate-500">{dateRange}</p>
            </div>
            <button onClick={onClose} className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
              <X size={16} />
            </button>
          </div>
          <div className="h-px shrink-0 bg-slate-100 mx-5" />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 pt-4 pb-2 sm:px-6">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("modals.shareProgramSection")}</p>
              {dayEntries.length === 0 ? (
                <p className="text-[12px] italic text-slate-400">{t("modals.shareNoActivities")}</p>
              ) : (
                <ol className="space-y-5">
                  {dayEntries.map(([date, acts], di) => (
                    <li key={date}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-600 to-indigo-700 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                          {t("modals.shareDay", { n: di + 1 })}
                        </span>
                        <span className="text-[12px] font-semibold text-slate-600">{formatDate(date)}</span>
                      </div>
                      <ul className="space-y-2 pl-1">
                        {acts.map((a, ai) => (
                          <li key={ai} className="flex items-start gap-3">
                            <span className="mt-0.5 shrink-0 rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums text-slate-500">
                              {String(a.time || "--:--").slice(0, 5)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium leading-snug text-slate-800">{String(a.title || "")}</p>
                              {String(a.location || "") ? (
                                <p className="text-[11px] text-slate-400">{String(a.location)}</p>
                              ) : null}
                            </div>
                            {Number(a.cost) > 0 ? (
                              <span className="shrink-0 text-[11px] font-semibold text-slate-400">~{Number(a.cost)}&euro;</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {invitedEmails.length > 0 && (
              <div className="px-5 pt-4 pb-2 sm:px-6">
                <div className="h-px bg-slate-100 mb-4" />
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("modals.shareGuestsSection")}</p>
                <div className="flex flex-wrap gap-2">
                  {invitedEmails.map((mail) => (
                    <span key={mail} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-700">
                      <Mail size={11} className="shrink-0 text-slate-400" />{String(mail)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="h-4" />
          </div>
          <div className="shrink-0 border-t border-slate-100 px-5 pb-6 pt-3 flex items-center gap-2.5 sm:px-6 sm:pb-4">
            <button
              onClick={copy}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              {copyState === "copied"
                ? <><span className="text-emerald-600">\u2713</span> {t("modals.copied")}</>
                : <><span>\uD83D\uDCCB</span> {t("modals.copyRecap")}</>}
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-2.5 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
            >
              <Mail size={15} strokeWidth={2.5} />
              {t("modals.shareInviteByEmail")}
            </button>
          </div>
        </div>
      </div>
      <InviteEmailModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        trip={trip}
        activities={activities}
        inviterName={inviterName}
      />
    </>
  );
}
