import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useI18n } from "../../i18n/I18nContext.jsx";
import TripMapActivitySheet from "./TripMapActivitySheet.jsx";
import TripMapDayLegend from "./TripMapDayLegend.jsx";
import { registerActivityBalloonImages, ACTIVITY_BALLOON_ORANGE } from "./activityBalloonMarker.js";
import {
  activitiesToPointGeoJSON,
  activitiesToRouteGeoJSON,
  computeDayCentroids,
  dayCentroidsToPointGeoJSON,
  dayCentroidsToRouteGeoJSON,
  BRAND_BLUE,
  fitMapToActivities,
  getMapStyleUrl,
} from "./tripMapHelpers.js";

const SOURCE_ID = "trip-activities";
const DAY_SOURCE_ID = "trip-days";
const ROUTE_SOURCE_ID = "trip-route";
const CLUSTER_LAYER = "trip-clusters";
const CLUSTER_COUNT_LAYER = "trip-cluster-count";
const BALLOON_LAYER = "trip-activity-balloon";
const DAY_LAYER = "trip-day-markers";
const DAY_LABEL_LAYER = "trip-day-labels";
const ROUTE_LAYER = "trip-route-line";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

/**
 * Carte d'itinéraire à deux niveaux :
 * - view="trip" : un marqueur numéroté par jour (centroïde) + ligne chronologique jour 1 → N
 * - view="day"  : marqueurs des activités du jour sélectionné (sheet au clic)
 * Un jour sélectionné sans coordonnée retombe sur le cadrage voyage (+ note).
 *
 * @param {{
 *   activities: Array<object>,
 *   view?: 'trip'|'day',
 *   selectedDayIndex: number,
 *   selectedActivityId?: string,
 *   onSelectActivity: (id: string|null) => void,
 *   onSelectDay?: (dayIndex: number) => void,
 *   onViewTrip?: () => void,
 *   showUserLocation?: boolean,
 *   mode?: 'modal'|'trip',
 *   cityLabel?: string,
 *   className?: string,
 * }} props
 */
export default function TripMap({
  activities = [],
  view = "day",
  selectedDayIndex,
  selectedActivityId = "",
  onSelectActivity,
  onSelectDay,
  onViewTrip,
  showUserLocation = false,
  mode = "modal",
  cityLabel = "",
  className = "",
}) {
  const { t } = useI18n();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sheetActivity, setSheetActivity] = useState(null);

  const mappedActivities = useMemo(
    () =>
      (activities || []).filter(
        (a) => Number.isFinite(Number(a?.latitude)) && Number.isFinite(Number(a?.longitude))
      ),
    [activities]
  );

  const dayActivities = useMemo(
    () => mappedActivities.filter((a) => Number(a?.dayIndex) === selectedDayIndex),
    [mappedActivities, selectedDayIndex]
  );

  const requestedDayView = view !== "trip";
  // Jour demandé sans aucune coordonnée → on reste au cadrage voyage (note affichée).
  const effectiveView = requestedDayView && dayActivities.length > 0 ? "day" : "trip";

  const missingCount = useMemo(() => {
    const scope = requestedDayView
      ? (activities || []).filter((a) => Number(a?.dayIndex) === selectedDayIndex)
      : activities || [];
    return scope.filter(
      (a) => !(Number.isFinite(Number(a?.latitude)) && Number.isFinite(Number(a?.longitude)))
    ).length;
  }, [activities, requestedDayView, selectedDayIndex]);

  const dayCentroids = useMemo(() => computeDayCentroids(mappedActivities), [mappedActivities]);

  const legendDays = useMemo(() => {
    const byIdx = new Map();
    for (const a of activities || []) {
      const dayIndex = Number(a?.dayIndex);
      if (!Number.isFinite(dayIndex)) continue;
      if (!byIdx.has(dayIndex)) {
        byIdx.set(dayIndex, {
          dayIndex,
          dayNum: Number(a?.dayNum) || dayIndex + 1,
        });
      }
    }
    return [...byIdx.values()].sort((a, b) => a.dayIndex - b.dayIndex);
  }, [activities]);

  const activityPointsData = useMemo(
    () =>
      effectiveView === "day" ? activitiesToPointGeoJSON(dayActivities, selectedDayIndex) : EMPTY_FC,
    [effectiveView, dayActivities, selectedDayIndex]
  );

  const dayMarkersData = useMemo(
    () =>
      effectiveView === "trip" ? dayCentroidsToPointGeoJSON(dayCentroids, selectedDayIndex) : EMPTY_FC,
    [effectiveView, dayCentroids, selectedDayIndex]
  );

  const routeData = useMemo(
    () =>
      effectiveView === "day"
        ? activitiesToRouteGeoJSON(mappedActivities, selectedDayIndex)
        : dayCentroidsToRouteGeoJSON(dayCentroids, selectedDayIndex),
    [effectiveView, mappedActivities, dayCentroids, selectedDayIndex]
  );

  const activityById = useMemo(() => {
    const m = new Map();
    for (const a of dayActivities) {
      m.set(String(a.id), a);
    }
    return m;
  }, [dayActivities]);

  const activityByIdRef = useRef(activityById);
  activityByIdRef.current = activityById;
  const onSelectRef = useRef(onSelectActivity);
  onSelectRef.current = onSelectActivity;
  const onSelectDayRef = useRef(onSelectDay);
  onSelectDayRef.current = onSelectDay;
  const selectedActivityIdRef = useRef(selectedActivityId);
  selectedActivityIdRef.current = selectedActivityId;
  const effectiveViewRef = useRef(effectiveView);
  effectiveViewRef.current = effectiveView;

  const applyBalloonIconLayout = useCallback((map, selId) => {
    if (!map?.getLayer(BALLOON_LAYER)) return;
    const sid = String(selId || "__none__");
    map.setLayoutProperty(BALLOON_LAYER, "icon-image", [
      "case",
      ["==", ["get", "id"], sid],
      ["concat", "activity-balloon-", ["get", "label"], "-sel"],
      ["concat", "activity-balloon-", ["get", "label"]],
    ]);
  }, []);

  const applyRouteStyle = useCallback((map, viewMode) => {
    if (!map?.getLayer(ROUTE_LAYER)) return;
    if (viewMode === "day") {
      map.setPaintProperty(ROUTE_LAYER, "line-dasharray", [4, 3]);
      map.setPaintProperty(ROUTE_LAYER, "line-opacity", 0.7);
    } else {
      map.setPaintProperty(ROUTE_LAYER, "line-dasharray", [1, 0]);
      map.setPaintProperty(ROUTE_LAYER, "line-opacity", 0.55);
    }
  }, []);

  const syncSources = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.getSource(SOURCE_ID)?.setData(activityPointsData);
    map.getSource(DAY_SOURCE_ID)?.setData(dayMarkersData);
    map.getSource(ROUTE_SOURCE_ID)?.setData(routeData);
    applyRouteStyle(map, effectiveView);
    applyBalloonIconLayout(map, selectedActivityId);
  }, [
    mapReady,
    activityPointsData,
    dayMarkersData,
    routeData,
    effectiveView,
    selectedActivityId,
    applyRouteStyle,
    applyBalloonIconLayout,
  ]);

  useEffect(() => {
    syncSources();
  }, [syncSources]);

  // En vue voyage, fitTargets = toutes les activités mappées : identité stable,
  // donc pas de re-fit quand le jour actif change au scroll de la liste.
  const fitTargets = effectiveView === "day" ? dayActivities : mappedActivities;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    fitMapToActivities(map, fitTargets, { padding: mode === "modal" ? 88 : 64 });
  }, [mapReady, effectiveView, fitTargets, mode]);

  useEffect(() => {
    if (effectiveView !== "day") setSheetActivity(null);
  }, [effectiveView]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || effectiveView !== "day") return;
    const sel = String(selectedActivityId || "").trim();
    if (!sel) {
      setSheetActivity(null);
      return;
    }
    const act = activityById.get(sel);
    if (act) {
      setSheetActivity(act);
      map.easeTo({
        center: [Number(act.longitude), Number(act.latitude)],
        zoom: Math.max(map.getZoom(), 14),
        duration: 550,
      });
    }
  }, [selectedActivityId, activityById, mapReady, effectiveView]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    let cancelled = false;
    setLoadError(false);
    setMapReady(false);

    const initialCenter = fitTargets[0] || mappedActivities[0] || null;
    const map = new maplibregl.Map({
      container: el,
      style: getMapStyleUrl(),
      center: initialCenter
        ? [Number(initialCenter.longitude), Number(initialCenter.latitude)]
        : [2.35, 48.85],
      zoom: initialCenter ? 12 : 4,
      attributionControl: true,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const onError = (e) => {
      if (cancelled) return;
      const msg = String(e?.error?.message || e?.message || "");
      if (/style|sprite|glyph|tile/i.test(msg)) setLoadError(true);
    };

    map.on("error", onError);

    map.on("load", async () => {
      if (cancelled) return;

      try {
        await registerActivityBalloonImages(map);
      } catch {
        /* fallback : clusters + jours restent utilisables */
      }

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: activityPointsData,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addSource(DAY_SOURCE_ID, {
        type: "geojson",
        data: dayMarkersData,
      });

      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: routeData,
      });

      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE_ID,
        paint: {
          "line-color": ["coalesce", ["get", "color"], BRAND_BLUE],
          "line-opacity": 0.55,
          "line-width": 3,
        },
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ACTIVITY_BALLOON_ORANGE,
          "circle-opacity": 0.82,
          "circle-radius": ["step", ["get", "point_count"], 18, 5, 22, 10, 28],
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: BALLOON_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": "activity-balloon-1",
          "icon-size": 1,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": ["case", ["==", ["get", "estimated"], true], 0.45, 1],
        },
      });

      applyBalloonIconLayout(map, selectedActivityIdRef.current);
      applyRouteStyle(map, effectiveViewRef.current);

      map.addLayer({
        id: DAY_LAYER,
        type: "circle",
        source: DAY_SOURCE_ID,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 16,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: DAY_LABEL_LAYER,
        type: "symbol",
        source: DAY_SOURCE_ID,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.on("click", CLUSTER_LAYER, (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
        const clusterId = features[0]?.properties?.cluster_id;
        const src = map.getSource(SOURCE_ID);
        if (clusterId == null || !src?.getClusterExpansionZoom) return;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom });
        });
      });

      const onPointClick = (e) => {
        const f = e.features?.[0];
        const id = String(f?.properties?.id || "").trim();
        if (!id) return;
        onSelectRef.current?.(id);
        setSheetActivity(activityByIdRef.current.get(id) || null);
      };

      map.on("click", BALLOON_LAYER, onPointClick);

      const onDayClick = (e) => {
        const f = e.features?.[0];
        const dayIdx = Number(f?.properties?.dayIndex);
        if (!Number.isFinite(dayIdx)) return;
        onSelectDayRef.current?.(dayIdx);
      };

      map.on("click", DAY_LAYER, onDayClick);
      map.on("click", DAY_LABEL_LAYER, onDayClick);

      const setPointer = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const clearPointer = () => {
        map.getCanvas().style.cursor = "";
      };
      for (const layer of [CLUSTER_LAYER, BALLOON_LAYER, DAY_LAYER]) {
        map.on("mouseenter", layer, setPointer);
        map.on("mouseleave", layer, clearPointer);
      }

      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [BALLOON_LAYER, CLUSTER_LAYER, DAY_LAYER, DAY_LABEL_LAYER],
        });
        if (!hits.length) {
          onSelectRef.current?.(null);
          setSheetActivity(null);
        }
      });

      setMapReady(true);
      fitMapToActivities(map, fitTargets, {
        padding: mode === "modal" ? 88 : 64,
        animate: false,
      });
    });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.resize()) : null;
    ro?.observe(el);

    return () => {
      cancelled = true;
      ro?.disconnect();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per mount
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(BALLOON_LAYER)) return;
    applyBalloonIconLayout(map, selectedActivityId);
  }, [selectedActivityId, mapReady, applyBalloonIconLayout]);

  const handleLocate = () => {
    if (!showUserLocation || !navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapRef.current;
        if (!map) return;
        if (!userMarkerRef.current) {
          const dot = document.createElement("div");
          dot.className =
            "h-3.5 w-3.5 rounded-full bg-brand-blue ring-4 ring-brand-blue/30 animate-pulse";
          userMarkerRef.current = new maplibregl.Marker({ element: dot })
            .setLngLat([longitude, latitude])
            .addTo(map);
        } else {
          userMarkerRef.current.setLngLat([longitude, latitude]);
        }
        map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 14) });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  return (
    <div
      className={`relative min-h-[min(55vh,28rem)] w-full overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/80 ${className}`.trim()}
    >
      {loadError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/95 px-4 text-center text-sm text-slate-600">
          {t("map.loadError")}
        </div>
      ) : null}
      {!mapReady && !loadError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/80 text-sm text-slate-500">
          {t("map.loading")}
        </div>
      ) : null}
      <div ref={containerRef} className="h-full min-h-[inherit] w-full" aria-hidden={loadError} />
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-col items-stretch gap-1.5 sm:inset-x-3">
        {legendDays.length > 0 ? (
          <TripMapDayLegend
            days={legendDays}
            selectedDayIndex={selectedDayIndex}
            onSelectDay={onSelectDay}
          />
        ) : null}
        <div className="flex max-w-full flex-col items-start gap-1.5">
        {onViewTrip && requestedDayView ? (
          <button
            type="button"
            onClick={onViewTrip}
            className="pointer-events-auto rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-medium text-brand-blue-deep shadow-sm ring-1 ring-slate-200/80 transition hover:bg-white"
          >
            {t("map.viewWholeTrip")}
          </button>
        ) : null}
        {missingCount > 0 ? (
          <p className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] text-slate-600 shadow-sm ring-1 ring-slate-200/70">
            {t("map.activitiesWithoutPosition", { n: missingCount })}
          </p>
        ) : null}
        </div>
      </div>
      {showUserLocation ? (
        <button
          type="button"
          onClick={handleLocate}
          className="absolute right-2 top-2 z-10 rounded-xl bg-white/95 px-2.5 py-2 text-xs font-medium text-brand-blue-deep shadow-sm ring-1 ring-slate-200/80"
          aria-label={t("map.myLocation")}
        >
          {t("map.myLocation")}
        </button>
      ) : null}
      <TripMapActivitySheet
        activity={sheetActivity}
        cityLabel={cityLabel}
        onClose={() => {
          setSheetActivity(null);
          onSelectRef.current?.(null);
        }}
      />
    </div>
  );
}
