/**
 * OnboardingTour — guide interactif avec spotlight sur les éléments réels de l'UI.
 * - Spotlight : assombrit tout sauf l’élément ciblé (SVG mask)
 * - Carte d’aide centrée (pas de flèche directionnelle)
 * - Swipe gauche/droite sur la carte pour changer d’étape (mobile)
 * - Fermeture : « Passer la démonstration » uniquement (pas de croix en conflit avec le +)
 * - Pendant le tour : scroll de la page bloqué ; bascule automatique sur l’onglet illustré
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from "react";
import { createPortal } from "react-dom";
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
    navigateTab: "trips",
    emoji: "✈️",
    labelKey: "onboarding.step.create.label",
    hintKey: "onboarding.step.create.hint",
  },
  {
    type: "spotlight",
    tourId: "tab-trips",
    navigateTab: "trips",
    emoji: "🧳",
    labelKey: "onboarding.step.trips.label",
    hintKey: "onboarding.step.trips.hint",
  },
  {
    type: "spotlight",
    tourId: "tab-planner",
    navigateTab: "planner",
    emoji: "📅",
    labelKey: "onboarding.step.planner.label",
    hintKey: "onboarding.step.planner.hint",
  },
  {
    type: "spotlight",
    tourId: "tab-destination",
    navigateTab: "destination",
    emoji: "🔍",
    labelKey: "onboarding.step.destination.label",
    hintKey: "onboarding.step.destination.hint",
  },
  {
    type: "spotlight",
    tourId: "tab-budget",
    navigateTab: "budget",
    emoji: "💰",
    labelKey: "onboarding.step.budget.label",
    hintKey: "onboarding.step.budget.hint",
  },
  {
    type: "spotlight",
    tourId: "tab-chat",
    navigateTab: "chat",
    emoji: "💬",
    labelKey: "onboarding.step.chat.label",
    hintKey: "onboarding.step.chat.hint",
  },
];

/* ─── SVG spotlight overlay ─────────────────────────────────────────────── */
/** Copie immuable : getBoundingClientRect() est vivant ; React ne rerend pas si les nombres changent in-place. */
function snapshotDomRect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

/**
 * Cible du spotlight : pour les onglets bas (`tab-*`), on cadre tout le bouton (fond actif + icône).
 * Sinon, si `[data-tour-focus]` existe (ex. bouton +), on cadre ce sous-élément pour un meilleur centrage.
 */
function getSpotlightTargetByTourId(tourId) {
  const root = document.querySelector(`[data-tour-id="${tourId}"]`);
  if (!root) return null;
  if (String(tourId || "").startsWith("tab-")) return root;
  const focused = root.querySelector("[data-tour-focus]");
  return focused || root;
}

/** Marge pour stroke + drop-shadow (WebKit rogne si le trou dépasse du viewport / overflow-x-clip). */
function spotlightFrameFromRect(rect, pad = 20, glowBleed = 22) {
  if (typeof window === "undefined") return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = rect.left;
  const top = rect.top;
  const right = rect.right;
  const bottom = rect.bottom;
  const padL = Math.min(pad, Math.max(0, left - glowBleed));
  const padT = Math.min(pad, Math.max(0, top - glowBleed));
  const padR = Math.min(pad, Math.max(0, vw - right - glowBleed));
  const padB = Math.min(pad, Math.max(0, vh - bottom - glowBleed));
  return {
    cx: left - padL,
    cy: top - padT,
    cw: rect.width + padL + padR,
    ch: rect.height + padT + padB,
  };
}

function SpotlightOverlay({ rect }) {
  const maskId = `tp-tour-mask-${useId().replace(/:/g, "")}`;
  if (!rect) return null;
  const PAD = 20;
  const frame = spotlightFrameFromRect(rect, PAD, 22);
  if (!frame) return null;
  const { cx, cy, cw, ch } = frame;
  const r = Math.min(24, ch / 2);

  return (
    <svg
      aria-hidden="true"
      overflow="visible"
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
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          <rect x={cx} y={cy} width={cw} height={ch} rx={r} fill="black" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(2, 6, 23, 0.72)" mask={`url(#${maskId})`} />
      <rect x={cx} y={cy} width={cw} height={ch} rx={r} fill="rgba(255,255,255,0.13)" stroke="none" />
      <rect
        x={cx}
        y={cy}
        width={cw}
        height={ch}
        rx={r}
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="3"
        style={{ filter: "drop-shadow(0 0 12px rgba(99,102,241,0.7)) drop-shadow(0 0 28px rgba(255,255,255,0.35))" }}
      >
        <animate attributeName="stroke-opacity" values="0.85;0.4;0.85" dur="1.8s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

/* ─── Dots progress ─────────────────────────────────────────────────────── */
function TourDots({ step, total, goTo }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => goTo(i)}
          aria-label={`Step ${i + 1}`}
          className={`rounded-full transition-all duration-300 ${
            i === step ? "h-2 w-5 bg-indigo-500" : "h-2 w-2 bg-slate-200 hover:bg-slate-300"
          }`}
        />
      ))}
    </div>
  );
}

/** Bloque le scroll du document pendant le tour (y compris rebond iOS). */
function useTourScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlO = html.style.overflow;
    const prevHtmlOx = html.style.overflowX;
    const prevHtmlOy = html.style.overflowY;
    const prevBodyO = body.style.overflow;
    const prevBodyOx = body.style.overflowX;
    const prevBodyOy = body.style.overflowY;
    const prevBodyTouch = body.style.touchAction;
    const prevHtmlTouch = html.style.touchAction;
    /* Pas de shorthand overflow:hidden : il ferait repasser overflow-x à auto avec overflow-y hidden. */
    html.style.overflow = "";
    body.style.overflow = "";
    html.style.overflowY = "hidden";
    body.style.overflowY = "hidden";
    /* index.css impose overflow-x: clip sur html/body — rogne le halo SVG du spotlight près des bords. */
    html.style.overflowX = "visible";
    body.style.overflowX = "visible";
    html.style.touchAction = "none";
    body.style.touchAction = "none";

    const blockMove = (e) => e.preventDefault();
    window.addEventListener("touchmove", blockMove, { passive: false });

    return () => {
      html.style.overflow = prevHtmlO;
      html.style.overflowX = prevHtmlOx;
      html.style.overflowY = prevHtmlOy;
      body.style.overflow = prevBodyO;
      body.style.overflowX = prevBodyOx;
      body.style.overflowY = prevBodyOy;
      html.style.touchAction = prevHtmlTouch;
      body.style.touchAction = prevBodyTouch;
      window.removeEventListener("touchmove", blockMove);
    };
  }, [active]);
}

/* ─── Main component ────────────────────────────────────────────────────── */
/** @param {{ userId?: string, onDone?: (completedFullTour?: boolean) => void, onNavigateToTab?: (tab: string) => void }} props */
export function OnboardingTour({ userId, onDone, onNavigateToTab }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [visible, setVisible] = useState(false);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const onNavigateRef = useRef(onNavigateToTab);
  onNavigateRef.current = onNavigateToTab;

  useTourScrollLock(true);

  const TOTAL = STEPS.length;
  const currentStep = STEPS[step];
  const isWelcome = currentStep.type === "welcome";
  const isLast = step === TOTAL - 1;

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(id);
  }, []);

  /* Onglet cible + mesure spotlight : 1ère connexion (post-inscription) peut bouger encore (polices, barre iOS, layout). */
  useLayoutEffect(() => {
    if (isWelcome) {
      setTargetRect(null);
      return undefined;
    }
    const tourId = currentStep.tourId;
    const tab = currentStep.navigateTab;
    if (tab) onNavigateRef.current?.(tab);

    const measure = () => {
      const el = getSpotlightTargetByTourId(tourId);
      setTargetRect(snapshotDomRect(el));
    };

    measure();

    let raf1 = 0;
    let raf2 = 0;
    let raf3 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        raf3 = requestAnimationFrame(measure);
      });
    });

    const delays = [40, 120, 280, 550];
    const timers = delays.map((ms) => setTimeout(measure, ms));

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);

    let fontsCancel = false;
    const fr = document.fonts?.ready;
    if (fr && typeof fr.then === "function") {
      fr.then(() => {
        if (!fontsCancel) measure();
      });
    }

    return () => {
      fontsCancel = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      cancelAnimationFrame(raf3);
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [step, isWelcome, currentStep.tourId, currentStep.navigateTab]);

  const goTo = useCallback(
    (next) => {
      setStep(Math.max(0, Math.min(TOTAL - 1, next)));
    },
    [TOTAL]
  );

  /** @param {boolean} [completedFullTour] true uniquement si l’utilisateur a validé la dernière étape (« C’est parti » / Terminer). */
  const dismissTour = useCallback(
    (completedFullTour = false) => {
      markOnboardingDoneForUser(userId);
      onDone?.(completedFullTour);
    },
    [onDone, userId]
  );

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
      if (Math.abs(dx) < 50 || dy > Math.abs(dx)) return;
      if (dx < 0 && !isLast) goTo(step + 1);
      if (dx > 0 && step > 0) goTo(step - 1);
    },
    [step, isLast, goTo]
  );

  const CARD_W = Math.min(300, typeof window !== "undefined" ? window.innerWidth - 32 : 300);

  const welcomeLayer = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        touchAction: "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={`relative w-full max-w-sm rounded-[2rem] bg-white shadow-2xl transition-all duration-500 ${
          visible ? "translate-y-0 scale-100" : "translate-y-4 scale-[0.98]"
        }`}
        style={{ maxWidth: CARD_W + 32, touchAction: "manipulation" }}
      >
        <div className="flex flex-col items-center gap-5 px-8 pb-8 pt-10 text-center">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-200">
              <Plane className="h-9 w-9 text-white" strokeWidth={1.5} />
            </div>
            <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 shadow-md">
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">{t("onboarding.welcome.title")}</h2>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
              {t("onboarding.welcome.subtitle")}
            </p>
          </div>

          <TourDots step={step} total={TOTAL} goTo={goTo} />

          <button
            type="button"
            onClick={() => goTo(1)}
            className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-transform active:scale-95"
          >
            {t("onboarding.welcome.cta")} →
          </button>

          <button
            type="button"
            onClick={() => dismissTour(false)}
            className="-mt-1 text-xs font-medium text-slate-400 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-600"
          >
            {t("onboarding.skipDemo")}
          </button>
        </div>
      </div>
    </div>
  );

  const spotlightLayer = (
    <>
      <SpotlightOverlay rect={targetRect} />

      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ touchAction: "none" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="relative z-[10002] max-h-[min(92dvh,100%)] w-full overflow-y-auto"
          style={{ width: CARD_W, maxWidth: "100%", touchAction: "manipulation" }}
        >
          <div className="rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200/80" style={{ padding: "1.1rem 1.2rem 1rem" }}>
            <div className="mb-1.5 flex items-center gap-2.5">
              <span className="text-2xl leading-none">{currentStep.emoji}</span>
              <h3 className="text-base font-bold leading-tight text-slate-900">{t(currentStep.labelKey)}</h3>
            </div>
            <p className="mb-3 text-sm leading-relaxed text-slate-500">{t(currentStep.hintKey)}</p>

            <button
              type="button"
              onClick={() => dismissTour(false)}
              className="mb-4 w-full text-center text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-800"
            >
              {t("onboarding.skipDemo")}
            </button>

            <div className="flex items-center gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => goTo(step - 1)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100"
                  aria-label={t("onboarding.prev")}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
                </button>
              ) : (
                <div className="w-8 shrink-0" />
              )}

              <div className="flex flex-1 justify-center">
                <TourDots step={step} total={TOTAL} goTo={goTo} />
              </div>

              <button
                type="button"
                onClick={() => (isLast ? dismissTour(true) : goTo(step + 1))}
                className="flex shrink-0 items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-transform active:scale-95"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {isLast ? (
                  t("onboarding.finish")
                ) : (
                  <>
                    {t("onboarding.next")}
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(isWelcome ? welcomeLayer : spotlightLayer, document.body);
}
