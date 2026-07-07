import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import {
  buildGetYourGuideAffiliateUrl,
  buildGygWidgetMountConfig,
  gygWidgetHostHasContent,
  GYG_WIDGET_MIN_HEIGHT_PX,
  loadGygWidgetScript,
} from "./getYourGuide.js";

/**
 * Widget activités GetYourGuide — lazy-load, hauteur réservée, fallback affilié si échec.
 */
export function GygActivitiesWidget({
  cityLabel,
  language,
  partnerId,
  numberOfItems = 4,
  className = "",
}) {
  const { t } = useI18n();
  const mountRef = useRef(null);
  const [phase, setPhase] = useState("pending");
  const attemptRef = useRef(0);

  const cityToken = String(cityLabel || "").trim();
  const fallbackHref = buildGetYourGuideAffiliateUrl(cityToken, partnerId);

  useEffect(() => {
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    const host = mountRef.current;
    if (!host || !partnerId || !cityToken) {
      setPhase("failed");
      return undefined;
    }

    let cancelled = false;
    let observer = null;
    let fallbackTimer = 0;
    let pollTimer = 0;
    let started = false;

    const fail = () => {
      if (!cancelled && attempt === attemptRef.current) setPhase("failed");
    };

    const succeed = () => {
      if (!cancelled && attempt === attemptRef.current) setPhase("ready");
    };

    const startLoad = async () => {
      if (cancelled || attempt !== attemptRef.current) return;
      setPhase("loading");
      host.replaceChildren();

      const cfg = buildGygWidgetMountConfig({
        cityLabel: cityToken,
        language,
        partnerId,
        numberOfItems,
      });
      const mount = document.createElement("div");
      mount.className = "gyg-widget-embed w-full";
      for (const [key, value] of Object.entries(cfg.dataset)) {
        if (value != null && String(value).trim() !== "") {
          mount.setAttribute(key, String(value));
        }
      }
      host.appendChild(mount);

      try {
        await loadGygWidgetScript();
      } catch {
        fail();
        return;
      }
      if (cancelled) return;

      const deadline = Date.now() + 9000;
      const poll = () => {
        if (cancelled) return;
        if (gygWidgetHostHasContent(host)) {
          succeed();
          return;
        }
        if (Date.now() >= deadline) {
          fail();
          return;
        }
        pollTimer = window.setTimeout(poll, 450);
      };
      pollTimer = window.setTimeout(poll, 500);
    };

    const tryStart = () => {
      if (started || cancelled || attempt !== attemptRef.current) return;
      started = true;
      void startLoad();
    };

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          tryStart();
        }
      },
      { rootMargin: "160px", threshold: 0.01 }
    );
    observer.observe(host);

    fallbackTimer = window.setTimeout(tryStart, 1500);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(pollTimer);
    };
  }, [cityToken, language, partnerId, numberOfItems]);

  const showFallback = phase !== "ready";
  const showMount = phase === "loading" || phase === "ready";

  return (
    <div
      className={`gyg-widget-block overflow-hidden rounded-2xl border border-brand-blue/15 bg-white/95 px-4 py-3 ring-1 ring-brand-blue/10 ${className}`}
      style={{ minHeight: GYG_WIDGET_MIN_HEIGHT_PX }}
    >
      <p className="mb-2 text-[11px] font-normal uppercase tracking-[0.2em] text-slate-600">
        {t("destination.gygWidgetTitle")}
      </p>
      <p className="mb-3 text-[11px] leading-snug text-slate-500">{t("destination.gygWidgetHint")}</p>

      {showFallback && fallbackHref ? (
        <a
          href={fallbackHref}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="mb-3 inline-flex w-full max-w-[390px] items-center justify-center rounded-xl border border-brand-blue/25 bg-white px-4 py-3 text-center text-[13px] font-medium text-brand-blue-deep shadow-sm ring-1 ring-slate-100/90 transition hover:border-orange-300/90 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          aria-label={t("destination.gygLinkAria", { city: cityToken })}
        >
          {t("destination.gygFallbackCta")}
        </a>
      ) : null}

      <div
        ref={mountRef}
        className={`gyg-widget-mount mx-auto w-full max-w-[390px] ${showMount ? "block" : "hidden"}`}
        style={{ minHeight: showMount && phase !== "ready" ? 300 : 0 }}
        aria-busy={phase === "loading"}
        aria-live="polite"
      />
    </div>
  );
}
