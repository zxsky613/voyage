import { useEffect, useState } from "react";
import { useI18n } from "./i18n/I18nContext.jsx";

const MSG_DELAY  = 950;   // message apparaît quand l'avion atteint le centre
const VISIBLE_MS = 4000;  // durée totale
const LEAVE_MS   = 600;   // durée animation de sortie

export function WelcomeBackToast({ open, firstName, onClose }) {
  const { t } = useI18n();
  // phases : idle → flying → visible → exiting
  const [phase, setPhase] = useState("idle");

  useEffect(() => {
    if (!open) { setPhase("idle"); return; }
    setPhase("flying");
    const t1 = window.setTimeout(() => setPhase("visible"), MSG_DELAY);
    const t2 = window.setTimeout(() => setPhase("exiting"), VISIBLE_MS);
    const t3 = window.setTimeout(() => onClose?.(), VISIBLE_MS + LEAVE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [open, onClose]);

  if (phase === "idle") return null;

  const name  = String(firstName || "").trim();
  const label = name ? t("home.welcomeBack", { name }) : t("home.welcomeBackNoName");

  return (
    <div className="pointer-events-none fixed inset-0 z-[9980]">
      <div
        className={phase === "exiting" ? "tp-wb-out" : ""}
        style={{ position: "absolute", inset: "0 0 auto 0", top: "28vh" }}
      >
        {/* ── Couloir de vol ── */}
        <div
          className="relative w-full overflow-hidden"
          style={{ height: "96px" }}
        >
          {/* Teinte ciel */}
          <div className="tp-sky-strip absolute inset-0 pointer-events-none" />

          {/* Avion grand format */}
          <span
            className="tp-plane-fly absolute left-0 select-none"
            style={{ top: "20px", fontSize: "3.2rem", lineHeight: 1, filter: "drop-shadow(0 4px 12px rgba(14,165,233,0.35))" }}
          >
            ✈️
          </span>

          {/* Traînée de nuages — tailles alternées pour effet naturel */}
          <span className="tp-cloud-1 absolute select-none" style={{ top: "8px",  left: "8%",  fontSize: "2rem",   filter: "drop-shadow(0 2px 6px rgba(186,230,255,0.6))" }}>☁️</span>
          <span className="tp-cloud-2 absolute select-none" style={{ top: "30px", left: "22%", fontSize: "3rem",   filter: "drop-shadow(0 2px 8px rgba(186,230,255,0.5))" }}>☁️</span>
          <span className="tp-cloud-3 absolute select-none" style={{ top: "5px",  left: "38%", fontSize: "2.4rem", filter: "drop-shadow(0 2px 6px rgba(186,230,255,0.6))" }}>☁️</span>
          <span className="tp-cloud-4 absolute select-none" style={{ top: "28px", left: "53%", fontSize: "3.4rem", filter: "drop-shadow(0 2px 10px rgba(186,230,255,0.5))" }}>☁️</span>
          <span className="tp-cloud-5 absolute select-none" style={{ top: "6px",  left: "69%", fontSize: "2.2rem", filter: "drop-shadow(0 2px 6px rgba(186,230,255,0.6))" }}>☁️</span>
          <span className="tp-cloud-6 absolute select-none" style={{ top: "26px", left: "83%", fontSize: "2.8rem", filter: "drop-shadow(0 2px 8px rgba(186,230,255,0.5))" }}>☁️</span>
        </div>

        {/* ── Carte message ── */}
        <div
          className={`flex justify-center px-5 mt-4 ${
            phase === "flying" ? "opacity-0 pointer-events-none" : "tp-msg-in"
          }`}
        >
          <div
            role="status"
            aria-live="polite"
            className="tp-card-pulse rounded-[28px] px-8 py-5 flex items-center gap-4"
            style={{
              background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 52%, #a855f7 100%)",
              boxShadow: "0 24px 64px rgba(99,102,241,0.4), 0 6px 20px rgba(14,165,233,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <span style={{ fontSize: "2.2rem", lineHeight: 1, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.15))" }}>🌍</span>
            <div>
              <p className="text-white/60 text-[10px] font-extrabold uppercase tracking-[0.32em] mb-1 leading-none" style={{ fontFamily: "'Yeseva One', serif" }}>
                {t("auth.brand")}
              </p>
              <p className="text-white font-bold leading-snug whitespace-nowrap" style={{ fontSize: "1.2rem", textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                {label}
              </p>
            </div>
            <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>✨</span>
          </div>
        </div>
      </div>
    </div>
  );
}
