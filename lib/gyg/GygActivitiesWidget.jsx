import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import {
  buildGetYourGuideAffiliateUrl,
  buildGygWidgetMountConfig,
  gygWidgetHostHasContent,
  GYG_WIDGET_DESKTOP_MAX_HEIGHT_PX,
  GYG_WIDGET_MIN_HEIGHT_PX,
  loadGygWidgetScript,
} from "./getYourGuide.js";
import { useGygDesktopViewport } from "./useGygViewport.js";
import "./gygWidgetLayout.css";

/**
 * Widget activités GetYourGuide — lazy-load, fallback affilié si échec.
 * @param {{ embedded?: boolean }} props — `embedded` : intégré dans la section guide (2e étage).
 */
export function GygActivitiesWidget({
  cityLabel,
  language,
  partnerId,
  numberOfItems,
  embedded = false,
  className = "",
}) {
  const { t } = useI18n();
  const mountRef = useRef(null);
  const [phase, setPhase] = useState("pending");
  const attemptRef = useRef(0);
  const isDesktop = useGygDesktopViewport();

  const cityToken = String(cityLabel || "").trim();
  const fallbackHref = buildGetYourGuideAffiliateUrl(cityToken, partnerId);
  const effectiveItems = numberOfItems ?? (isDesktop ? 3 : 4);

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
        numberOfItems: effectiveItems,
        desktop: isDesktop,
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
  }, [cityToken, language, partnerId, effectiveItems, isDesktop]);

  const showFallback = phase !== "ready";
  const showMount = phase === "loading" || phase === "ready";

  const shellClass = embedded
    ? `gyg-widget-embedded border-t border-brand-orange-tint/50 pt-3 lg:pt-2.5 ${className}`.trim()
    : `gyg-widget-block overflow-hidden rounded-2xl border border-brand-blue/15 bg-white/95 px-4 py-3 shadow-[0_8px_32px_rgba(20,47,93,0.06)] ring-1 ring-brand-blue/10 ${className}`.trim();

  const titleClass = embedded
    ? "mb-1 text-[10px] font-normal uppercase tracking-[0.18em] text-brand-orange-ink/80"
    : "mb-2 text-[11px] font-normal uppercase tracking-[0.2em] text-slate-600";

  const hintClass = embedded
    ? "mb-2 text-[10px] leading-snug text-slate-500/90"
    : "mb-3 text-[11px] leading-snug text-slate-500";

  const mountMinH =
    showMount && phase !== "ready"
      ? isDesktop && embedded
        ? 200
        : 300
      : 0;

  const blockMinH = embedded ? undefined : GYG_WIDGET_MIN_HEIGHT_PX;
  const blockMaxH = embedded && isDesktop ? GYG_WIDGET_DESKTOP_MAX_HEIGHT_PX : undefined;

  return (
    <div
      className={shellClass}
      style={{
        minHeight: blockMinH,
        maxHeight: blockMaxH,
      }}
    >
      <p className={titleClass}>{t("destination.gygWidgetTitle")}</p>
      <p className={hintClass}>{t("destination.gygWidgetHint")}</p>

      {showFallback && fallbackHref ? (
        <a
          href={fallbackHref}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className={`mb-2 inline-flex w-full items-center justify-center rounded-xl border border-brand-blue/25 bg-white px-4 py-2.5 text-center text-[13px] font-medium text-brand-blue-deep shadow-sm ring-1 ring-slate-100/90 transition hover:border-orange-300/90 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:mb-1.5 lg:max-w-sm ${
            embedded ? "" : "max-w-[390px]"
          }`}
          aria-label={t("destination.gygLinkAria", { city: cityToken })}
        >
          {t("destination.gygFallbackCta")}
        </a>
      ) : null}

      <div
        ref={mountRef}
        className={`gyg-widget-mount w-full ${embedded ? "gyg-widget-mount--guide" : ""} ${
          showMount ? "block" : "hidden"
        } ${embedded ? "" : "mx-auto max-w-[390px]"}`}
        style={{ minHeight: mountMinH }}
        aria-busy={phase === "loading"}
        aria-live="polite"
      />
    </div>
  );
}
