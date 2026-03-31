/**
 * OnboardingTour — guide de bienvenue après inscription.
 * Affiché uniquement au premier SIGNED_IN qui suit un signUp (marqueur session/localStorage).
 * Une fois terminé : tp_onboarding_done_u_<userId> dans localStorage.
 */
import { useState, useEffect, useCallback } from "react";
import { useI18n } from "./i18n/I18nContext.jsx";
import {
  Briefcase,
  Calendar,
  Search,
  DollarSign,
  MessageCircle,
  Plane,
  ChevronRight,
  ChevronLeft,
  X,
  MapPin,
  Sparkles,
} from "lucide-react";

function storageKeyForUser(userId) {
  const id = String(userId || "").trim();
  return id ? `tp_onboarding_done_u_${id}` : "";
}

/** @param {string|undefined} userId — Supabase auth.users.id */
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
 * À appeler sur SIGNED_IN uniquement. Consomme le marqueur d’inscription (même onglet ou e-mail
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

/** Annule l’intention d’onboarding si signUp échoue (e-mail déjà pris, réseau, etc.). */
export function clearSignupOnboardingMarkers() {
  try {
    window.sessionStorage.removeItem(SS_SIGNUP_PENDING);
    window.localStorage.removeItem(LS_SIGNUP_EMAIL);
  } catch {
    /* ignore */
  }
}

/* ─── Couleurs par onglet ──────────────────────────────────────────────── */
const TAB_CONFIG = [
  {
    id: "trips",
    icon: Briefcase,
    gradient: "from-violet-500 to-indigo-600",
    bg: "bg-violet-50",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    dot: "bg-violet-500",
  },
  {
    id: "planner",
    icon: Calendar,
    gradient: "from-sky-500 to-blue-600",
    bg: "bg-sky-50",
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    dot: "bg-sky-500",
  },
  {
    id: "destination",
    icon: Search,
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-50",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    dot: "bg-emerald-500",
  },
  {
    id: "budget",
    icon: DollarSign,
    gradient: "from-amber-500 to-orange-500",
    bg: "bg-amber-50",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    dot: "bg-amber-500",
  },
  {
    id: "chat",
    icon: MessageCircle,
    gradient: "from-rose-500 to-pink-600",
    bg: "bg-rose-50",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    dot: "bg-rose-500",
  },
];

/* ─── Composant principal ──────────────────────────────────────────────── */
export function OnboardingTour({ userId, onDone }) {
  const { t } = useI18n();
  // 0 = welcome, 1-5 = tabs
  const [step, setStep] = useState(0);
  const [animDir, setAnimDir] = useState("right"); // "right" | "left"
  const [visible, setVisible] = useState(false);

  const TOTAL_STEPS = 6; // welcome + 5 tabs

  useEffect(() => {
    // Small delay so the modal animates in after mount
    const id = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(id);
  }, []);

  const goTo = useCallback(
    (next) => {
      setAnimDir(next > step ? "right" : "left");
      setStep(next);
    },
    [step]
  );

  const handleDone = useCallback(() => {
    markOnboardingDoneForUser(userId);
    onDone?.();
  }, [onDone, userId]);

  const handleSkip = useCallback(() => {
    markOnboardingDoneForUser(userId);
    onDone?.();
  }, [onDone, userId]);

  const isLast = step === TOTAL_STEPS - 1;
  const tabCfg = step > 0 ? TAB_CONFIG[step - 1] : null;

  /* ── Barre de progression ── */
  const Dots = () => (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <button
          key={i}
          onClick={() => goTo(i)}
          aria-label={`Step ${i + 1}`}
          className={`transition-all duration-300 rounded-full ${
            i === step
              ? "w-6 h-2 bg-indigo-500"
              : "w-2 h-2 bg-slate-200 hover:bg-slate-300"
          }`}
        />
      ))}
    </div>
  );

  /* ── Slide 0 : Bienvenue ── */
  const WelcomeSlide = () => (
    <div className="flex flex-col items-center text-center px-2">
      {/* Illustration */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-200">
          <Plane className="w-11 h-11 text-white" strokeWidth={1.5} />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
          <Sparkles className="w-3.5 h-3.5 text-white" strokeWidth={2} />
        </div>
        {/* Floating dots */}
        <div className="absolute -left-4 top-6 w-3 h-3 rounded-full bg-sky-400 opacity-70" />
        <div className="absolute -bottom-2 -left-2 w-2 h-2 rounded-full bg-rose-400 opacity-60" />
        <div className="absolute -bottom-1 -right-3 w-2.5 h-2.5 rounded-full bg-emerald-400 opacity-70" />
      </div>

      <h2 className="text-2xl font-bold text-slate-900 leading-tight">
        {t("onboarding.welcome.title")}
      </h2>
      <p className="mt-3 text-base text-slate-500 leading-relaxed max-w-xs">
        {t("onboarding.welcome.subtitle")}
      </p>

      {/* Mini preview of the 5 tabs */}
      <div className="mt-6 flex items-center gap-3 flex-wrap justify-center">
        {TAB_CONFIG.map((cfg) => {
          const Icon = cfg.icon;
          return (
            <div
              key={cfg.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${cfg.bg} text-xs font-medium`}
            >
              <Icon className={`w-3.5 h-3.5 ${cfg.iconColor}`} strokeWidth={2} />
              <span className={cfg.iconColor}>{t(`nav.${cfg.id === "destination" ? "search" : cfg.id}`)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ── Slide 1-5 : Onglets ── */
  const TabSlide = ({ cfg }) => {
    const Icon = cfg.icon;
    const tabKey = cfg.id === "destination" ? "search" : cfg.id;
    return (
      <div className="flex flex-col items-center text-center px-2">
        {/* Icône grande */}
        <div
          className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-xl mb-5`}
          style={{ boxShadow: `0 16px 40px -8px rgba(0,0,0,0.18)` }}
        >
          <Icon className="w-9 h-9 text-white" strokeWidth={1.5} />
        </div>

        {/* Badge onglet */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${cfg.bg} mb-3`}
        >
          <span className={`text-[11px] font-bold uppercase tracking-widest ${cfg.iconColor}`}>
            {t(`onboarding.tabs.${cfg.id}.title`)}
          </span>
        </div>

        {/* Description */}
        <p className="text-base text-slate-600 leading-relaxed max-w-xs">
          {t(`onboarding.tabs.${cfg.id}.desc`)}
        </p>

        {/* Numéro d'onglet */}
        <div className="mt-6 flex items-center gap-2">
          <MapPin className={`w-4 h-4 ${cfg.iconColor}`} strokeWidth={2} />
          <span className="text-xs text-slate-400 font-medium">
            {t("onboarding.stepOf")
              .replace("{current}", step)
              .replace("{total}", TOTAL_STEPS - 1)}
          </span>
        </div>
      </div>
    );
  };

  return (
    /* ── Backdrop ── */
    <div
      className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(6px)" }}
    >
      {/* ── Carte ── */}
      <div
        className={`relative w-full max-w-sm bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl transition-all duration-500 ${
          visible ? "translate-y-0 scale-100" : "translate-y-8 scale-95"
        }`}
        style={{ minHeight: 460 }}
      >
        {/* Bouton fermer */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors z-10"
          aria-label={t("onboarding.skip")}
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>

        {/* Corps */}
        <div className="flex flex-col h-full px-8 pt-10 pb-8 gap-6" style={{ minHeight: 460 }}>
          {/* Slide content */}
          <div
            key={step}
            className="flex-1 flex items-center justify-center"
            style={{
              animation: "onboardSlideIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
            }}
          >
            {step === 0 ? (
              <WelcomeSlide />
            ) : (
              <TabSlide cfg={TAB_CONFIG[step - 1]} />
            )}
          </div>

          {/* Dots */}
          <Dots />

          {/* Boutons navigation */}
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => goTo(step - 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                {t("onboarding.prev")}
              </button>
            )}

            <button
              onClick={() => {
                if (isLast) {
                  handleDone();
                } else if (step === 0) {
                  goTo(1);
                } else {
                  goTo(step + 1);
                }
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all shadow-lg active:scale-95 ${
                step === 0
                  ? "bg-gradient-to-r from-indigo-500 to-violet-600 shadow-indigo-200 hover:shadow-indigo-300 hover:shadow-xl"
                  : tabCfg
                  ? `bg-gradient-to-r ${tabCfg.gradient} shadow-md hover:shadow-lg`
                  : "bg-indigo-600"
              }`}
            >
              {step === 0
                ? t("onboarding.welcome.cta")
                : isLast
                ? t("onboarding.finish")
                : t("onboarding.next")}
              {!isLast && <ChevronRight className="w-4 h-4" strokeWidth={2.5} />}
            </button>
          </div>

          {/* Skip link (premier écran seulement) */}
          {step === 0 && (
            <button
              onClick={handleSkip}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors text-center -mt-2"
            >
              {t("onboarding.skip")}
            </button>
          )}
        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes onboardSlideIn {
          from { opacity: 0; transform: translateX(20px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
