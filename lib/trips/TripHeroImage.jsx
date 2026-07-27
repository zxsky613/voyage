import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { getResolvedImage } from "../getResolvedImage.js";
import { isResolveHeroEnabled } from "../images/featureFlags.js";
import { buildHeroResolveLabel } from "../images/heroResolveLabel.js";
import { resolveDestinationHeroFallbackBackground } from "../images/placeholder.js";
import { readTripHeroCache, writeTripHeroCache } from "./tripHeroCache.js";

/** @param {object} trip */
function readInlineTripHeroUrl(trip) {
  const raw = String(trip?.hero_image_url || trip?.heroImageUrl || trip?.hero_url || "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

/**
 * Photo héro d'un voyage — cache localStorage par trip.id (pas le cache ville partagé).
 * @param {{ trip: object, frameClassName?: string }} props
 */
export default function TripHeroImage({ trip, frameClassName = "" }) {
  const { language, t } = useI18n();
  const tripId = String(trip?.id || "").trim();
  const label = buildHeroResolveLabel(String(trip?.destination || trip?.title || "").trim());
  const fallbackBg = resolveDestinationHeroFallbackBackground(tripId || label);
  const imgRef = useRef(null);

  const [url, setUrl] = useState(() => {
    const inline = readInlineTripHeroUrl(trip);
    if (inline) return inline;
    if (tripId) {
      const own = readTripHeroCache(tripId);
      if (own) return own;
    }
    return "";
  });
  const [loadFailed, setLoadFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
    setImgLoaded(false);

    const inline = readInlineTripHeroUrl(trip);
    if (inline) {
      setUrl(inline);
      if (tripId) writeTripHeroCache(tripId, inline);
      return undefined;
    }

    if (tripId) {
      const own = readTripHeroCache(tripId);
      if (own) {
        setUrl(own);
        return undefined;
      }
    }

    if (!isResolveHeroEnabled() || !label) {
      setUrl("");
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const hit = await getResolvedImage({
        kind: "hero",
        label,
        context: "",
        uiLang: language,
      });
      if (cancelled) return;
      const next = String(hit?.url || "").trim();
      if (next) {
        setUrl(next);
        if (tripId) writeTripHeroCache(tripId, next);
      } else {
        setUrl("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, label, language, trip?.hero_image_url, trip?.heroImageUrl, trip?.hero_url]);

  useLayoutEffect(() => {
    setImgLoaded(false);
  }, [url]);

  const markLoaded = useCallback(() => {
    setImgLoaded(true);
  }, []);

  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el || loadFailed || !url) return undefined;
    if (el.complete && el.naturalWidth > 0) markLoaded();
    const onLoad = () => markLoaded();
    el.addEventListener("load", onLoad, { passive: true });
    return () => el.removeEventListener("load", onLoad);
  }, [url, loadFailed, markLoaded]);

  const showImg = url && !loadFailed;

  return (
    <div
      className={`relative h-full w-full min-h-0 overflow-hidden ${frameClassName}`.trim()}
      style={!showImg ? { background: fallbackBg } : undefined}
    >
      {showImg ? (
        <img
          ref={imgRef}
          key={url}
          src={url}
          alt=""
          className="h-full w-full min-h-0 object-cover object-[center_45%]"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          decoding="async"
          onLoad={markLoaded}
          onError={() => setLoadFailed(true)}
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
