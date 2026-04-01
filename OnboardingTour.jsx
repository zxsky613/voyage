/**
 * OnboardingTour — guide interactif avec spotlight sur les éléments réels de l'UI.
 * - Spotlight : assombrit tout sauf l'élément ciblé (SVG mask)
 * - Flèches animées pointant vers l'élément
 * - Swipe gauche/droite pour changer d'étape (mobile)
 * - Bouton Aide dans le menu remet le guide à zéro
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "./i18n/I18nContext.jsx";
import { Plane, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";

/* ─── Storage helpers ──────────────────────────────────────────────────── */
function storageKeyForUser(userId) {
  const id = String(userId || "").trim();
  return id ? `tp_onboarding_done_u_${id}` : "";
}

/** @param {string|undefined} userId */
export function hasSeenOnboardingForUser(userId) {
  const key = storageKeyForUser(userId);
  if (!key) return true;
  try {
    return !!window.localStorage.getItem(key);
  } catch {
    return true;
  }
}

/** @param {string|undefined} userId */
export function markOnboardingDoneForUser(userId) {
  const key = storageKeyForUser(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

const SS_SIGNUP_PENDING = "tp_fresh_signup";
const LS_SIGNUP_EMAIL = "tp_fresh_signup_email";

/** Appeler après un signUp réussi (AuthView) pour afficher le guide au prochain SIGNED_IN. */
export function markSignupExpectsOnboarding(email) {
  try {
    window.sessionStorage.setItem(SS_SIGNUP_PENDING, "1");
    const em = String(email || "").trim().toLowerCase();
    if (em) window.localStorage.setItem(LS_SIGNUP_EMAIL, em);
  } catch {
    /* ignore */
  }
}

/**
 * À appeler sur SIGNED_IN uniquement. Consomme le marqueur d'inscription (même onglet ou e-mail
 * confirmé plus tard). Retourne true seulement si cette session suit une inscription depuis ici.
 */
export function consumePendingOnboardingIntent(user) {
  if (!user?.id) return false;
  try {
    const fromSession = window.sessionStorage.getItem(SS_SIGNUP_PENDING) === "1";
    const em = String(user.email || "").trim().toLowerCase();
    const pending = window.localStorage.getItem(LS_SIGNUP_EMAIL);
    const fromEmail = !!(pending && em && pending === em);

    if (!fromSession && !fromEmail) return false;

    window.sessionStorage.removeItem(SS_SIGNUP_PENDING);
    window.localStorage.removeItem(LS_SIGNUP_EMAIL);
    return true;
  } catch {
    return false;
  }
}

/** Annule l'intention d'onboarding si signUp échoue (e-mail déjà pris, réseau, etc.). */
export function clearSignupOnboardingMarkers() {
  try {
    window.sessionStorage.removeItem(SS_SIGNUP_PENDING);
    window.localStorage.removeItem(LS_SIGNUP_EMAIL);
  } catch {
    /* ignore */
  }
}

/* ─── Tour steps config ─────────────────────────────────────────────────── */
const STEPS = [
  { type: "welcome" },
  {
    type: "spotlight",
    tourId: "plus-button",
    emoji: "✈️",
    labelKey: "onboarding.step.create.label",
    hintKey: "onboarding.step.create.hint",
    arrowDir: "up",   // arrow points UP toward element (element is above card)
  },
  {
    type: "spotlight",
    tourId: "tab-trips",
    emoji: "🧳",
    labelKey: "onboarding.step.trips.label",
    hintKey: "onboarding.step.trips.hint",
    arrowDir: "down", // arrow points DOWN toward element (element is below card)
  },
  {
    type: "spotlight",
    tourId: "tab-planner",
    emoji: "📅",
    labelKey: "onboarding.step.planner.label",
    hintKey: "onboarding.step.planner.hint",
    arrowDir: "down",
  },
  {
    type: "spotlight",
    tourId: "tab-destination",
    emoji: "🔍",
    labelKey: "onboarding.step.destination.label",
    hintKey: "onboarding.step.destination.hint",
    arrowDir: "down",
  },
  {
    type: "spotlight",
    tourId: "tab-budget",
    emoji: "💰",
    labelKey: "onboarding.step.budget.label",
    hintKey: "onboarding.step.budget.hint",
    arrowDir: "down",
  },
  {
    type: "spotlight",
    tourId: "tab-chat",
    emoji: "💬",
    labelKey: "onboarding.step.chat.label",
    hintKey: "onboarding.step.chat.hint",
    arrowDir: "down",
  },
];

/* ─── SVG spotlight overlay ─────────────────────────────────────────────── */
function SpotlightOverlay({ rect }) {
  if (!rect) return null;
  const PAD = 10;
  const cx = rect.x - PAD;
  const cy = rect.y - PAD;
  const cw = rect.width + PAD * 2;
  const ch = rect.height + PAD * 2;
  const r = Math.min(20, ch / 2);

  return (
    <svg
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 9998,
        overflow: "visible",
      }}
    >
      <defs>
        <mask id="tp-tour-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={cx} y={cy} width={cw} height={ch} rx={r} fill="black" />
        </mask>
      </defs>
      {/* Dark overlay with cutout */}
      <rect
        width="100%"
        height="100%"
        fill="rgba(2, 6, 23, 0.80)"
        mask="url(#tp-tour-mask)"
      />
      {/* Indigo glow ring around cutout */}
      <rect
        x={cx} y={cy} width={cw} height={ch} rx={r}
        fill="none"
        stroke="rgba(99,102,241,0.9)"
        strokeWidth="2.5"
        style={{ filter: "drop-shadow(0 0 8px rgba(99,102,241,0.55))" }}
      />
    </svg>
  );
}

/* ─── Animated arrow ────────────────────────────────────────────────────── */
function TourArrow({ direction, leftPx }) {
  const isUp = direction === "up";
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: leftPx,
        ...(isUp ? { bottom: "100%", marginBottom: 6 } : { top: "100%", marginTop: 6 }),
        animation: isUp ? "tpArrowUp 0.9s ease-in-out infinite" : "tpArrowDown 0.9s ease-in-out infinite",
        lineHeight: 0,
      }}
    >
      {isUp ? (
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
          <path
            d="M14 33 L14 3 M4 13 L14 3 L24 13"
            stroke="#6366f1"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
          <path
            d="M14 3 L14 33 M4 23 L14 33 L24 23"
            stroke="#6366f1"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

/* ─── Dots progress ─────────────────────────────────────────────────────── */
function TourDots({ step, total, goTo }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => goTo(i)}
          aria-label={`Step ${i + 1}`}
          className={`rounded-full transition-all duration-300 ${
            i === step
              ? "w-5 h-2 bg-indigo-500"
              : "w-2 h-2 bg-slate-200 hover:bg-slate-300"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */
export function OnboardingTour({ userId, onDone }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [visible, setVisible] = useState(false);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const TOTAL = STEPS.length;
  const currentStep = STEPS[step];
  const isWelcome = currentStep.type === "welcome";
  const isLast = step === TOTAL - 1;

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(id);
  }, []);

  /* Mesure la position de l'élément cible dans le DOM */
  useEffect(() => {
    if (isWelcome) {
      setTargetRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(`[data-tour-id="${currentStep.tourId}"]`);
      if (el) setTargetRect(el.getBoundingClientRect());
      else setTargetRect(null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step, isWelcome, currentStep]);

  const goTo = useCallback(
    (next) => {
      setStep(Math.max(0, Math.min(TOTAL - 1, next)));
    },
    [TOTAL]
  );

  const handleDone = useCallback(() => {
    markOnboardingDoneForUser(userId);
    onDone?.();
  }, [onDone, userId]);

  /* Swipe support */
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0));
      touchStartX.current = null;
      touchStartY.current = null;
      if (Math.abs(dx) < 50 || dy > Math.abs(dx)) return; // not a horizontal swipe
      if (dx < 0 && !isLast) goTo(step + 1);
      if (dx > 0 && step > 0) goTo(step - 1);
    },
    [step, isLast, goTo]
  );

  /* ── Welcome modal ── */
  if (isWelcome) {
    return (
      <div
        className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center transition-all duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(6px)" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`relative w-full max-w-sm bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl transition-all duration-500 ${
            visible ? "translate-y-0" : "translate-y-8"
          }`}
        >
          <div className="flex flex-col items-center text-center px-8 pt-10 pb-8 gap-5">
            {/* Illustration */}
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-200">
                <Plane className="w-9 h-9 text-white" strokeWidth={1.5} />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
                <Sparkles className="w-3.5 h-3.5 text-white" strokeWidth={2} />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {t("onboarding.welcome.title")}
              </h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-xs">
                {t("onboarding.welcome.subtitle")}
              </p>
            </div>

            <TourDots step={step} total={TOTAL} goTo={goTo} />

            <button
              onClick={() => goTo(1)}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
            >
              {t("onboarding.welcome.cta")} →
            </button>

            <button
              type="button"
              onClick={handleDone}
              className="text-xs font-medium text-slate-400 underline decoration-slate-300 underline-offset-2 hover:text-slate-600 transition-colors -mt-1"
            >
              {t("onboarding.skipDemo")}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes tpArrowUp {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-7px); }
          }
          @keyframes tpArrowDown {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(7px); }
          }
        `}</style>
      </div>
    );
  }

  /* ── Spotlight step ── */
  const arrowDir = currentStep.arrowDir;
  const isArrowUp = arrowDir === "up";

  // Card vertical position:
  // - arrow up (+ button at top): card in lower half so arrow points up to element
  // - arrow down (tabs at bottom): card in upper portion so arrow points down to element
  const cardTopPct = isArrowUp ? 42 : 14;

  // Arrow x: center of target element, clamped to card bounds [12, card_width - 28]
  const CARD_W = Math.min(300, window.innerWidth - 32);
  const cardLeft = window.innerWidth / 2 - CARD_W / 2;
  const arrowCenterVP = targetRect
    ? targetRect.x + targetRect.width / 2
    : window.innerWidth / 2;
  const arrowLeftRelative = Math.max(
    12,
    Math.min(arrowCenterVP - cardLeft - 14, CARD_W - 28)
  );

  return (
    <>
      {/* SVG overlay with spotlight cutout */}
      <SpotlightOverlay rect={targetRect} />

      {/* Full-screen interaction zone (swipe + click capture) */}
      <div
        className="fixed inset-0 z-[9999]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Tooltip card */}
        <div
          style={{
            position: "absolute",
            top: `${cardTopPct}%`,
            left: "50%",
            transform: "translateX(-50%)",
            width: CARD_W,
            zIndex: 2,
          }}
        >
          {/* Arrow above card → pointing UP toward element at top */}
          {isArrowUp && (
            <TourArrow direction="up" leftPx={arrowLeftRelative} />
          )}

          {/* Card body */}
          <div
            className="bg-white rounded-3xl shadow-2xl ring-1 ring-slate-200/80"
            style={{ padding: "1.1rem 1.2rem 1rem" }}
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-2xl leading-none">{currentStep.emoji}</span>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {t(currentStep.labelKey)}
              </h3>
            </div>
            <p className="text-sm text-slate-500 mb-3 leading-relaxed">
              {t(currentStep.hintKey)}
            </p>

            <button
              type="button"
              onClick={handleDone}
              className="mb-4 w-full text-center text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800 transition-colors"
            >
              {t("onboarding.skipDemo")}
            </button>

            {/* Navigation bar */}
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <button
                  onClick={() => goTo(step - 1)}
                  className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 transition-colors"
                  aria-label={t("onboarding.prev")}
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                </button>
              ) : (
                <div className="w-8 shrink-0" />
              )}

              <div className="flex-1 flex justify-center">
                <TourDots step={step} total={TOTAL} goTo={goTo} />
              </div>

              <button
                onClick={() => (isLast ? handleDone() : goTo(step + 1))}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-transform active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}
              >
                {isLast ? (
                  t("onboarding.finish")
                ) : (
                  <>
                    {t("onboarding.next")}
                    <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Arrow below card → pointing DOWN toward element at bottom */}
          {!isArrowUp && (
            <TourArrow direction="down" leftPx={arrowLeftRelative} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes tpArrowUp {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @keyframes tpArrowDown {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(7px); }
        }
      `}</style>
    </>
  );
}
