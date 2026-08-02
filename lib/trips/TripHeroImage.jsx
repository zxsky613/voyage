import React, { useLayoutEffect, useRef } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { useTripHero } from "./useTripHero.js";

/**
 * Photo héro d'un voyage — useTripHero (trips.hero_image_url + resolve unique).
 * @param {{ trip: object, frameClassName?: string }} props
 */
export default function TripHeroImage({ trip, frameClassName = "" }) {
  const { t } = useI18n();
  const tripId = String(trip?.id || "").trim();
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
      data-trip-hero-root={tripId || undefined}
      className={`relative h-full w-full min-h-0 overflow-hidden ${frameClassName}`.trim()}
      style={!showImg ? { background: fallbackBg } : undefined}
    >
      {showImg ? (
        <img
          ref={imgRef}
          key={url}
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full min-h-[1px] object-cover object-[center_45%]"
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
  );
}
