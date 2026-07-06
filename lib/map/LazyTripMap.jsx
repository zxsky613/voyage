import React, { Suspense } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";

const TripMap = React.lazy(() => import("./TripMap.jsx"));

/**
 * Chargement différé de MapLibre (chunk séparé du bundle initial).
 * @param {React.ComponentProps<typeof TripMap>} props
 */
export default function LazyTripMap(props) {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[min(55vh,28rem)] w-full items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-500 ring-1 ring-slate-200/80">
          {t("map.loading")}
        </div>
      }
    >
      <TripMap {...props} />
    </Suspense>
  );
}
