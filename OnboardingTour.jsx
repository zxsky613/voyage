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
 * Cible du spotlight : onglets bas et bouton + = tout le bouton (même silhouette qu’à l’écran).
 * Sinon, `[data-tour-focus]` si présent.
 */
function getSpotlightTargetByTourId(tourId) {
  const root = document.querySelector(`[data-tour-id="${tourId}"]`);
  if (!root) return null;
  if (String(tourId || "").startsWith("tab-") || tourId === "plus-button") return root;
  const focused = root.querySelector("[data-tour-focus]");
  return focused || root;
}

/**
 * Dimensions « viewport » pour le spotlight : Visual Viewport sur mobile (barre d’adresse, encoche),
 * sinon fenêtre — pour que cadre et masque restent cohérents sur téléphone comme sur PC.
 */
function getSpotlightLayoutMetrics() {
  if (typeof window === "undefined") {
    return { vw: 0, vh: 0, safeTop: 0, safeBottom: 0 };
  }
  const vv = window.visualViewport;
  const vw =
    vv && Number.isFinite(vv.width) && vv.width > 0
      ? vv.width
      : window.innerWidth;
  const vh =
    vv && Number.isFinite(vv.height) && vv.height > 0
      ? vv.height
      : window.innerHeight;
  return {
    vw,
    vh,
    safeTop: readSafeAreaInsetTopPx(),
    safeBottom: readSafeAreaInsetBottomPx(),
  };
}

/** Marges autour du trou : un peu plus serrées sur très petit écran, confortables sur desktop. */
function spotlightPadAndGlow(metrics) {
  const { vw, vh } = metrics;
  const ref = Math.min(vw || 390, vh || 844) || 390;
  const pad = Math.max(10, Math.min(22, Math.round(ref * 0.048 + 6)));
  const glowBleed = Math.max(14, Math.min(28, Math.round(ref * 0.052 + 6)));
  return { pad, glowBleed };
}

/**
 * Marge autour de l’élément ciblé. Padding symétrique horizontal / vertical : sinon près des bords
 * du viewport (ex. 1er onglet bas) le trou n’est plus centré sur le logo.
 */
function spotlightFrameFromRect(rect, metrics, pad, glowBleed) {
  if (typeof window === "undefined" || !metrics) return null;
  const { vw, vh } = metrics;
  const left = rect.left;
  const top = rect.top;
  const right = rect.right;
  const bottom = rect.bottom;
  const spaceL = Math.max(0, left - glowBleed);
  const spaceR = Math.max(0, vw - glowBleed - right);
  const spaceT = Math.max(0, top - glowBleed);
  const spaceB = Math.max(0, vh - glowBleed - bottom);
  const padX = Math.min(pad, spaceL, spaceR);
  const padY = Math.min(pad, spaceT, spaceB);
  return {
    cx: left - padX,
    cy: top - padY,
    cw: rect.width + 2 * padX,
    ch: rect.height + 2 * padY,
  };
}

/**
 * Tous les encadrés du guide adoptent la même silhouette « pilule » que les onglets bas :
 * si le trou est trop carré (ex. bouton +), on élargit en conservant la hauteur et le centre horizontal
 * de l’élément réel, puis on borde le viewport.
 */
function normalizeSpotlightToTabPillShape(frame, elementRect, metrics, minAspect, glowBleed) {
  if (typeof window === "undefined" || !elementRect || !frame || !metrics) return frame;
  const { vw } = metrics;
  let { cx, cy, cw, ch } = frame;
  const ratio = cw / ch;
  if (ratio < minAspect) {
    const elCx = (elementRect.left + elementRect.right) / 2;
    let newW = Math.max(cw, ch * minAspect);
    newW = Math.min(newW, vw - 2 * glowBleed);
    cx = elCx - newW / 2;
    cw = newW;
    if (cx < glowBleed) cx = glowBleed;
    if (cx + cw > vw - glowBleed) cx = Math.max(glowBleed, vw - glowBleed - cw);
  }
  return { cx, cy, cw, ch };
}

/** Rayon d’arrondi type barre d’onglets : moitié du petit côté (vraie pilule, sans plafond arbitraire à 24px). */
function spotlightCornerRadius(cw, ch) {
  return Math.min(cw, ch) / 2;
}

/** Lit env(safe-area-inset-top) en px (iPhone encoche / barre de statut). Sur PC → 0. */
function readSafeAreaInsetTopPx() {
  if (typeof document === "undefined") return 0;
  try {
    const probe = document.createElement("div");
    probe.setAttribute("style", "position:fixed;left:-9999px;top:0;padding-top:env(safe-area-inset-top,0px);");
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    document.body.removeChild(probe);
    return px;
  } catch {
    return 0;
  }
}

/** zone indicator / barre d’home iOS — utile pour les onglets bas du guide. */
function readSafeAreaInsetBottomPx() {
  if (typeof document === "undefined") return 0;
  try {
    const probe = document.createElement("div");
    probe.setAttribute(
      "style",
      "position:fixed;left:-9999px;top:0;padding-bottom:env(safe-area-inset-bottom,0px);"
    );
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    document.body.removeChild(probe);
    return px;
  } catch {
    return 0;
  }
}

/** Ratio largeur / hauteur mini pour la pilule : un peu plus souple sur grand écran (bouton +). */
function spotlightMinPillAspect(metrics) {
  const { vw } = metrics;
  if (!vw || vw >= 900) return 1.28;
  if (vw >= 640) return 1.35;
  return 1.5;
}

/**
 * Garde le trou dans la zone utile (safe area haut / bas), mobile comme desktop.
 */
function clampSpotlightFrameToSafeViewport(frame, elementRect, metrics, glowBleed) {
  const { vh, safeTop, safeBottom } = metrics;
  const minCy = safeTop + glowBleed;
  const maxY = vh - safeBottom - glowBleed;
  let { cx, cy, cw, ch } = frame;

  if (cy < minCy) {
    const bottom = cy + ch;
    cy = minCy;
    ch = Math.max(ch, bottom - cy, elementRect.bottom + glowBleed - cy);
  }
  if (cy + ch > maxY) {
    cy = maxY - ch;
    if (cy < minCy) {
      cy = minCy;
      ch = Math.max(48, maxY - minCy);
    }
  }
  return { cx, cy, cw, ch };
}

function SpotlightOverlay({ rect }) {
  const maskId = `tp-tour-mask-${useId().replace(/:/g, "")}`;
  if (!rect) return null;
  const metrics = getSpotlightLayoutMetrics();
  const { pad, glowBleed: GLOW } = spotlightPadAndGlow(metrics);
  const minAspect = spotlightMinPillAspect(metrics);
  const baseFrame = spotlightFrameFromRect(rect, metrics, pad, GLOW);
  if (!baseFrame) return null;
  const pill = normalizeSpotlightToTabPillShape(baseFrame, rect, metrics, minAspect, GLOW);
  const frame = clampSpotlightFrameToSafeViewport(pill, rect, metrics, GLOW);
  const { cx, cy, cw, ch } = frame;
  const r = spotlightCornerRadius(cw, ch);

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
