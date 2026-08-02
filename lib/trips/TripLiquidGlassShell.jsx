import React, { useLayoutEffect, useRef } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { useTripHero } from "./useTripHero.js";

/**
 * Fond photo voyage + verre — hero via useTripHero (Planning header, Budget).
 * @param {{
 *   trip: object,
 *   active?: boolean,
 *   contrast?: 'standard' | 'high',
 *   className?: string,
 *   children?: React.ReactNode,
 * }} props
 */
export default function TripLiquidGlassShell({
  trip,
  active = false,
  contrast = "standard",
  className = "",
  children,
}) {
  const { t } = useI18n();
  const high = contrast === "high";
  const imgRef = useRef(null);
  const {
    url,
    loadFailed,
    imgLoaded,
    fallbackBg,
    markLoaded,
    onImageError,
    eagerLoad,
    showImg,
  } = useTripHero(trip);

  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el || loadFailed || !url) return undefined;
    if (el.complete && el.naturalWidth > 0) markLoaded();
    const onLoad = () => markLoaded();
    el.addEventListener("load", onLoad, { passive: true });
    return () => el.removeEventListener("load", onLoad);
  }, [url, loadFailed, markLoaded]);

  return (
    <div
      data-trip-hero-root={String(trip?.id || "").trim() || undefined}
      className={`relative isolate overflow-hidden ${className}`.trim()}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          background: !showImg ? fallbackBg : undefined,
          filter: high
            ? active
              ? "blur(0.7px) saturate(1.12) brightness(0.78)"
              : "blur(0.5px) saturate(1.1) brightness(0.82)"
            : active
              ? "blur(0.7px) saturate(1.28) brightness(0.93)"
              : "blur(0.5px) saturate(1.22) brightness(0.95)",
        }}
      >
        {showImg ? (
          <img
            ref={imgRef}
            key={url}
            src={url}
            alt=""
            className="h-full w-full object-cover object-[center_45%]"
            referrerPolicy="strict-origin-when-cross-origin"
          loading={eagerLoad ? "eager" : "lazy"}
          fetchPriority={eagerLoad ? "high" : "auto"}
          decoding="async"
            onLoad={markLoaded}
            onError={onImageError}
          />
        ) : null}
        {!imgLoaded && !loadFailed && url ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="animate-pulse text-[10px] font-medium text-white/70">{t("common.imageLoading")}</span>
          </div>
        ) : null}
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: high
            ? active
              ? "linear-gradient(118deg, rgba(2,6,23,0.78) 0%, rgba(2,6,23,0.52) 46%, rgba(2,6,23,0.28) 100%)"
              : "linear-gradient(118deg, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.48) 48%, rgba(2,6,23,0.22) 100%)"
            : active
              ? "linear-gradient(160deg, rgba(2,6,23,0.24) 0%, rgba(2,6,23,0.38) 100%)"
              : "linear-gradient(160deg, rgba(2,6,23,0.18) 0%, rgba(2,6,23,0.32) 100%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: high
            ? "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 36%)"
            : "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 28%, rgba(255,255,255,0) 62%)",
        }}
      />

      <div className="relative">{children}</div>
    </div>
  );
}
