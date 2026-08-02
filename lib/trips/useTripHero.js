import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { getResolvedImage } from "../getResolvedImage.js";
import { isResolveHeroEnabled } from "../images/featureFlags.js";
import { buildHeroResolveLabel } from "../images/heroResolveLabel.js";
import { resolveDestinationHeroFallbackBackground } from "../images/placeholder.js";
import { persistTripHeroUrl } from "./persistTripHeroUrl.js";
import { notifyTripHeroPersisted } from "./tripHeroEvents.js";
import { isValidPersistedTripHeroUrl, readTripHeroUrlFromTrip } from "./tripHeroQuality.js";
import { writeTripHeroCache } from "./tripHeroCache.js";

/**
 * Lecteur unique hero voyage — DB valide d'abord, sinon resolve hero (pageimage-first) puis set_trip_hero.
 * @param {object | null | undefined} trip
 */
export function useTripHero(trip) {
  const { language } = useI18n();
  const tripId = String(trip?.id || "").trim();
  const label = buildHeroResolveLabel(String(trip?.destination || trip?.title || "").trim());
  const fallbackBg = resolveDestinationHeroFallbackBackground(tripId || label);

  const [url, setUrl] = useState(() => readTripHeroUrlFromTrip(trip));
  const [loadFailed, setLoadFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
    setImgLoaded(false);

    const fromDb = readTripHeroUrlFromTrip(trip);
    if (fromDb) {
      setUrl(fromDb);
      if (tripId) writeTripHeroCache(tripId, fromDb);
      return undefined;
    }

    if (!tripId || !isResolveHeroEnabled() || !label) {
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
      if (!isValidPersistedTripHeroUrl(next)) {
        setUrl("");
        return;
      }

      setUrl(next);
      writeTripHeroCache(tripId, next);
      const persisted = await persistTripHeroUrl(tripId, next);
      if (persisted) notifyTripHeroPersisted(tripId, next);
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

  const onImageError = useCallback(() => {
    setLoadFailed(true);
  }, []);

  const eagerLoad =
    typeof window !== "undefined" && Boolean(window.__TP_TEST_EAGER_HERO__);

  return {
    url,
    loadFailed,
    imgLoaded,
    fallbackBg,
    markLoaded,
    onImageError,
    eagerLoad,
    showImg: Boolean(url && !loadFailed),
  };
}
