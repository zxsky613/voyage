import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useI18n } from "../../i18n/I18nContext.jsx";
import TripMapActivitySheet from "./TripMapActivitySheet.jsx";
import TripMapDayLegend from "./TripMapDayLegend.jsx";
import { registerActivityBalloonImages, registerDayPinImages, ACTIVITY_BALLOON_ORANGE } from "./activityBalloonMarker.js";
import {
  activitiesToPointGeoJSON,
  activitiesToOverviewPointGeoJSON,
  activitiesToRouteGeoJSON,
  computeDayCentroids,
  computeDayViewFitPadding,
  dayCentroidsToPointGeoJSON,
  dayMarkerColor,
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
const POINT_FALLBACK_LAYER = "trip-unclustered-point";
const OVERVIEW_LABEL_LAYER = "trip-overview-activity-label";
const DAY_PIN_LAYER = "trip-day-pins";
const ROUTE_LAYER = "trip-route-line";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

/**
 * Carte d'itinéraire à deux niveaux :
 * - view="trip"     : goutte orange numérotée par jour (pointe sur centroïde), sans spiderfy
 * - view="overview" : tous les marqueurs activité, couleur par jour (planning « tout le voyage »)
 * - view="day"        : marqueurs des activités du jour sélectionné (sheet au clic)
 * Un jour sélectionné sans coordonnée retombe sur le cadrage voyage (+ note).
 *
 * @param {{
 *   activities: Array<object>,
 *   view?: 'trip'|'overview'|'day',
 *   selectedDayIndex: number,
 *   selectedActivityId?: string,
 *   onSelectActivity: (id: string|null) => void,
 *   onSelectDay?: (dayIndex: number) => void,
 *   onViewTrip?: () => void,
 *   showUserLocation?: boolean,
 *   mode?: 'modal'|'trip'|'planner',
 *   cityLabel?: string,
 *   className?: string,
 *   fallbackCenter?: { latitude: number, longitude: number }|null,
 *   suppressActivitySheet?: boolean,
 *   sheetSnap?: 'collapsed'|'mid'|'full',
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
  fallbackCenter = null,
  suppressActivitySheet = false,
  sheetSnap = "mid",
}) {
  const { t } = useI18n();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sheetActivity, setSheetActivity] = useState(null);
  const [mapContainerHeightPx, setMapContainerHeightPx] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => setMapContainerHeightPx(el.clientHeight || 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const requestedDayView = view === "day";
  const requestedOverviewView = view === "overview";
  // Jour demandé sans aucune coordonnée → on reste au cadrage voyage (note affichée).
  const effectiveView =
    requestedDayView && dayActivities.length > 0
      ? "day"
      : requestedOverviewView
        ? "overview"
        : "trip";

  const missingCount = useMemo(() => {
    const scope = requestedDayView
      ? (activities || []).filter((a) => Number(a?.dayIndex) === selectedDayIndex)
      : activities || [];
    return scope.filter(
      (a) => !(Number.isFinite(Number(a?.latitude)) && Number.isFinite(Number(a?.longitude)))
    ).length;
  }, [activities, requestedDayView, selectedDayIndex]);

  const dayCentroids = useMemo(() => computeDayCentroids(mappedActivities), [mappedActivities]);
  const dayCentroidsRef = useRef(dayCentroids);
  dayCentroidsRef.current = dayCentroids;
  const selectedDayIndexRef = useRef(selectedDayIndex);
  selectedDayIndexRef.current = selectedDayIndex;
  const dayActivitiesRef = useRef(dayActivities);
  dayActivitiesRef.current = dayActivities;

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

  const dayFitPadding = useMemo(
    () =>
      computeDayViewFitPadding({
        mode,
        sheetSnap,
        viewportHeight: typeof window !== "undefined" ? window.innerHeight : 844,
        mapHeightPx: mapContainerHeightPx,
        showTopOverlay: Boolean(onViewTrip && requestedDayView) || legendDays.length > 0,
      }),
    [mode, sheetSnap, mapContainerHeightPx, onViewTrip, requestedDayView, legendDays.length]
  );
  const dayFitPaddingRef = useRef(dayFitPadding);
  dayFitPaddingRef.current = dayFitPadding;

  const activityPointsData = useMemo(() => {
    if (effectiveView === "day") {
      return activitiesToPointGeoJSON(dayActivities, selectedDayIndex);
    }
    if (effectiveView === "overview") {
      return activitiesToOverviewPointGeoJSON(mappedActivities, selectedDayIndex);
    }
    return EMPTY_FC;
  }, [effectiveView, dayActivities, mappedActivities, selectedDayIndex]);

  const dayMarkersData = useMemo(
    () =>
      effectiveView === "trip" ? dayCentroidsToPointGeoJSON(dayCentroids, selectedDayIndex) : EMPTY_FC,
    [effectiveView, dayCentroids, selectedDayIndex]
  );

  const routeData = useMemo(
    () =>
      effectiveView === "day"
        ? activitiesToRouteGeoJSON(mappedActivities, selectedDayIndex)
        : EMPTY_FC,
    [effectiveView, mappedActivities, selectedDayIndex]
  );

  const tripOverviewFitPendingRef = useRef(false);

  const activityById = useMemo(() => {
    const m = new Map();
    const scope = effectiveView === "day" ? dayActivities : mappedActivities;
    for (const a of scope) {
      m.set(String(a.id), a);
    }
    return m;
  }, [effectiveView, dayActivities, mappedActivities]);

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
  const suppressSheetRef = useRef(suppressActivitySheet);
  suppressSheetRef.current = suppressActivitySheet;

  const applyBalloonIconLayout = useCallback((map, selId) => {
    if (!map?.getLayer(BALLOON_LAYER)) return;
    const sid = String(selId || "__none__");
    map.setLayoutProperty(BALLOON_LAYER, "icon-image", [
      "case",
      ["==", ["get", "id"], sid],
      ["get", "iconSel"],
      ["get", "icon"],
    ]);
  }, []);

  const applyDayPinIconLayout = useCallback((map, selDayIdx) => {
    if (!map?.getLayer(DAY_PIN_LAYER)) return;
    const sel = Number(selDayIdx) || 0;
    map.setLayoutProperty(DAY_PIN_LAYER, "icon-image", [
      "case",
      ["==", ["get", "dayIndex"], sel],
      ["get", "iconSel"],
      ["get", "icon"],
    ]);
  }, []);

  const applyRouteStyle = useCallback((map, viewMode) => {
    if (!map?.getLayer(ROUTE_LAYER)) return;
    if (viewMode === "day") {
      map.setPaintProperty(ROUTE_LAYER, "line-dasharray", [4, 3]);
      map.setPaintProperty(ROUTE_LAYER, "line-opacity", 0.7);
    } else {
      map.setPaintProperty(ROUTE_LAYER, "line-dasharray", [1, 0]);
      map.setPaintProperty(ROUTE_LAYER, "line-opacity", viewMode === "overview" ? 0.45 : 0.55);
    }
  }, []);

  const applyViewLayerVisibility = useCallback((map, viewMode, selId) => {
    if (!map) return;
    const sid = String(selId || "__none__");
    const isDay = viewMode === "day";
    const isOverview = viewMode === "overview";
    const isTrip = viewMode === "trip";
    const showActivities = isDay || isOverview;
    const plannerMode = mode === "planner";

    const setVis = (layerId, visible) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    };

    setVis(CLUSTER_LAYER, showActivities && !plannerMode);
    setVis(CLUSTER_COUNT_LAYER, showActivities && !plannerMode);
    setVis(BALLOON_LAYER, isDay);
    setVis(POINT_FALLBACK_LAYER, isOverview || (isDay && !map.getLayer(BALLOON_LAYER)));
    setVis(OVERVIEW_LABEL_LAYER, isOverview);
    setVis(DAY_PIN_LAYER, isTrip);
    setVis(ROUTE_LAYER, isDay);

    if (map.getLayer(POINT_FALLBACK_LAYER)) {
      if (isOverview) {
        map.setPaintProperty(POINT_FALLBACK_LAYER, "circle-color", ["get", "color"]);
        map.setPaintProperty(POINT_FALLBACK_LAYER, "circle-radius", [
          "case",
          ["==", ["get", "id"], sid],
          17,
          13,
        ]);
        map.setPaintProperty(POINT_FALLBACK_LAYER, "circle-stroke-width", [
          "case",
          ["==", ["get", "id"], sid],
          3,
          2,
        ]);
      } else if (isDay) {
        map.setPaintProperty(POINT_FALLBACK_LAYER, "circle-color", ACTIVITY_BALLOON_ORANGE);
        map.setPaintProperty(POINT_FALLBACK_LAYER, "circle-radius", 14);
        map.setPaintProperty(POINT_FALLBACK_LAYER, "circle-stroke-width", 2);
      }
    }
  }, [mode]);

  const fitTripOverview = useCallback((opts = {}) => {
    const map = mapRef.current;
    if (!map || !mapReady || effectiveViewRef.current !== "trip") return;
    const centroids = dayCentroidsRef.current;
    if (!centroids.length) return;
    if (opts.fitOverview && tripOverviewFitPendingRef.current) {
      fitMapToActivities(map, centroids, { padding: 40, uniformPadding: true, animate: false });
      tripOverviewFitPendingRef.current = false;
    }
  }, [mapReady]);

  const fitDayView = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady || effectiveViewRef.current !== "day") return;
    const acts = dayActivitiesRef.current;
    if (!acts.length) return;
    fitMapToActivities(map, acts, {
      paddingInsets: dayFitPaddingRef.current,
      animate: false,
    });
  }, [mapReady]);

  const syncSources = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.getSource(SOURCE_ID)?.setData(activityPointsData);
    map.getSource(DAY_SOURCE_ID)?.setData(dayMarkersData);
    map.getSource(ROUTE_SOURCE_ID)?.setData(routeData);
    applyRouteStyle(map, effectiveView);
    applyBalloonIconLayout(map, selectedActivityId);
    applyDayPinIconLayout(map, selectedDayIndex);
    applyViewLayerVisibility(map, effectiveView, selectedActivityId);
  }, [
    mapReady,
    activityPointsData,
    dayMarkersData,
    routeData,
    effectiveView,
    selectedActivityId,
    selectedDayIndex,
    applyRouteStyle,
    applyBalloonIconLayout,
    applyDayPinIconLayout,
    applyViewLayerVisibility,
    fitTripOverview,
  ]);

  useEffect(() => {
    syncSources();
  }, [syncSources]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || effectiveView !== "trip") return undefined;
    const specs = dayCentroids.map((c) => ({
      dayIndex: c.dayIndex,
      dayNum: c.dayNum ?? c.dayIndex + 1,
      color: dayMarkerColor(c.dayIndex, selectedDayIndex),
    }));
    let cancelled = false;
    void registerDayPinImages(map, specs, selectedDayIndex).then((ok) => {
      if (cancelled || !ok) return;
      applyDayPinIconLayout(map, selectedDayIndex);
    });
    return () => {
      cancelled = true;
    };
  }, [mapReady, effectiveView, dayCentroids, selectedDayIndex, applyDayPinIconLayout]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyDayPinIconLayout(map, selectedDayIndex);
  }, [selectedDayIndex, mapReady, applyDayPinIconLayout]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || effectiveView !== "trip") return undefined;

    const onResize = () => {
      tripOverviewFitPendingRef.current = true;
      fitTripOverview({ fitOverview: true });
    };
    map.on("resize", onResize);

    return () => {
      map.off("resize", onResize);
    };
  }, [mapReady, effectiveView, fitTripOverview]);

  useEffect(() => {
    if (!mapReady || effectiveView !== "trip") return;
    const map = mapRef.current;
    if (!map) return;
    tripOverviewFitPendingRef.current = true;
    map.resize();
    const timer = window.setTimeout(() => {
      fitTripOverview({ fitOverview: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [mapReady, effectiveView, dayCentroids, fitTripOverview]);

  const fitTargets =
    effectiveView === "overview"
      ? mappedActivities
      : [];

  const mapPadding = mode === "planner" ? 120 : mode === "modal" ? 88 : 64;

  useEffect(() => {
    if (!mapReady || effectiveView !== "day") return;
    fitDayView();
  }, [mapReady, effectiveView, selectedDayIndex, dayActivities, dayFitPadding, fitDayView]);

  useEffect(() => {
    if (!mapReady || effectiveView !== "day" || !mapContainerHeightPx) return;
    fitDayView();
  }, [mapReady, effectiveView, mapContainerHeightPx, fitDayView]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || effectiveView !== "day") return undefined;
    const onResize = () => fitDayView();
    map.on("resize", onResize);
    return () => map.off("resize", onResize);
  }, [mapReady, effectiveView, fitDayView]);

  useEffect(() => {
    if (!mapReady || effectiveView !== "day") return;
    const map = mapRef.current;
    if (!map) return;
    map.resize();
    const timer = window.setTimeout(fitDayView, 80);
    return () => window.clearTimeout(timer);
  }, [mapReady, effectiveView, sheetSnap, fitDayView]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || effectiveView !== "overview") return;
    if (fitTargets.length > 0) {
      fitMapToActivities(map, fitTargets, { padding: mapPadding, animate: false });
      return;
    }
    const fb = fallbackCenter;
    if (fb && Number.isFinite(Number(fb.latitude)) && Number.isFinite(Number(fb.longitude))) {
      map.easeTo({
        center: [Number(fb.longitude), Number(fb.latitude)],
        zoom: Math.max(map.getZoom(), 11),
        duration: 650,
      });
    }
  }, [mapReady, effectiveView, fitTargets, fallbackCenter, mapPadding]);

  useEffect(() => {
    if (effectiveView !== "day" && effectiveView !== "overview") setSheetActivity(null);
  }, [effectiveView]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || (effectiveView !== "day" && effectiveView !== "overview")) return;
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
    /** @type {import('maplibre-gl').Map | null} */
    let map = null;
    let initWatchdog = 0;
    let layersReady = false;
    let layerSetupStarted = false;

    const finishMapInit = (useBalloons) => {
      if (cancelled || layersReady || !map || mapRef.current !== map) return;
      layersReady = true;
      window.clearTimeout(initWatchdog);

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: activityPointsData,
        cluster: mode !== "planner",
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

      if (useBalloons) {
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
      } else {
        map.addLayer({
          id: POINT_FALLBACK_LAYER,
          type: "circle",
          source: SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ACTIVITY_BALLOON_ORANGE,
            "circle-radius": 14,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": ["case", ["==", ["get", "estimated"], true], 0.45, 1],
          },
        });
      }

      map.addLayer({
        id: OVERVIEW_LABEL_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      applyRouteStyle(map, effectiveViewRef.current);
      applyViewLayerVisibility(map, effectiveViewRef.current, selectedActivityIdRef.current);

      map.addLayer({
        id: DAY_PIN_LAYER,
        type: "symbol",
        source: DAY_SOURCE_ID,
        layout: {
          "icon-image": "day-drop-0-1",
          "icon-size": 1,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
      applyDayPinIconLayout(map, selectedDayIndexRef.current);

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
        if (!suppressSheetRef.current) {
          setSheetActivity(activityByIdRef.current.get(id) || null);
        }
      };

      const activityLayers = useBalloons ? [BALLOON_LAYER] : [POINT_FALLBACK_LAYER];
      for (const layer of activityLayers) {
        map.on("click", layer, onPointClick);
      }
      if (map.getLayer(OVERVIEW_LABEL_LAYER)) {
        map.on("click", OVERVIEW_LABEL_LAYER, onPointClick);
      }

      const onDayClick = (e) => {
        const f = e.features?.[0];
        const dayIdx = Number(f?.properties?.dayIndex);
        if (!Number.isFinite(dayIdx)) return;
        onSelectDayRef.current?.(dayIdx);
      };

      map.on("click", DAY_PIN_LAYER, onDayClick);

      const setPointer = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const clearPointer = () => {
        map.getCanvas().style.cursor = "";
      };
      for (const layer of [CLUSTER_LAYER, ...activityLayers, OVERVIEW_LABEL_LAYER, DAY_PIN_LAYER]) {
        map.on("mouseenter", layer, setPointer);
        map.on("mouseleave", layer, clearPointer);
      }

      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [
            ...activityLayers,
            OVERVIEW_LABEL_LAYER,
            CLUSTER_LAYER,
            DAY_PIN_LAYER,
          ],
        });
        if (!hits.length) {
          onSelectRef.current?.(null);
          if (!suppressSheetRef.current) setSheetActivity(null);
        }
      });

      setMapReady(true);
      if (effectiveViewRef.current === "day" && dayActivitiesRef.current.length) {
        fitMapToActivities(map, dayActivitiesRef.current, {
          paddingInsets: dayFitPaddingRef.current,
          animate: false,
        });
      } else if (effectiveViewRef.current !== "trip" && fitTargets.length > 0) {
        fitMapToActivities(map, fitTargets, {
          padding: mapPadding,
          animate: false,
        });
      }
      map.resize();
      window.setTimeout(() => {
        if (cancelled || !map || effectiveViewRef.current !== "day") return;
        if (!dayActivitiesRef.current.length) return;
        fitMapToActivities(map, dayActivitiesRef.current, {
          paddingInsets: dayFitPaddingRef.current,
          animate: false,
        });
      }, 80);
    };

    const beginLayerSetup = () => {
      if (cancelled || layersReady || layerSetupStarted || !map) return;
      layerSetupStarted = true;
      void (async () => {
        const balloonsOk = await registerActivityBalloonImages(map, { timeoutMs: 3500 });
        await registerDayPinImages(
          map,
          dayCentroidsRef.current.map((c) => ({
            dayIndex: c.dayIndex,
            dayNum: c.dayNum ?? c.dayIndex + 1,
            color: dayMarkerColor(c.dayIndex, selectedDayIndexRef.current),
          })),
          selectedDayIndexRef.current,
          { timeoutMs: 3500 }
        );
        finishMapInit(mode === "planner" || balloonsOk);
      })();
    };

    const mountMap = () => {
      if (cancelled || map) return;
      if (el.offsetWidth < 2 || el.offsetHeight < 2) return;

      setLoadError(false);
      setMapReady(false);

      const initialCenter = fitTargets[0] || mappedActivities[0] || null;
      map = new maplibregl.Map({
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
      if (typeof window !== "undefined" && /preview=planner-sheet/.test(window.location.search)) {
        window.__tripMap = map;
      }

      const onError = (e) => {
        if (cancelled) return;
        const msg = String(e?.error?.message || e?.message || "");
        if (/style|sprite|glyph|tile/i.test(msg)) setLoadError(true);
      };

      map.on("error", onError);
      map.on("load", beginLayerSetup);
      map.once("idle", () => {
        if (!layersReady && !cancelled) beginLayerSetup();
      });

      initWatchdog = window.setTimeout(() => {
        if (cancelled || layersReady || !map) return;
        if (map.loaded() || map.isStyleLoaded()) {
          finishMapInit(mode === "planner");
          return;
        }
        setLoadError(true);
      }, 12000);
    };

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            mountMap();
            map?.resize();
          })
        : null;
    ro?.observe(el);
    mountMap();

    return () => {
      cancelled = true;
      window.clearTimeout(initWatchdog);
      ro?.disconnect();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map?.remove();
      map = null;
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per mount
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer(BALLOON_LAYER)) {
      applyBalloonIconLayout(map, selectedActivityId);
    }
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

  const shellClass =
    mode === "planner"
      ? "relative h-full min-h-0 w-full overflow-hidden rounded-none bg-slate-100 ring-0"
      : "relative min-h-[min(55vh,28rem)] w-full overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/80";

  return (
    <div
      className={`${shellClass} ${className}`.trim()}
      data-effective-map-view={effectiveView}
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
      <div
        ref={containerRef}
        className={
          mode === "planner"
            ? "absolute inset-0 h-full w-full min-h-0"
            : "absolute inset-0 h-full w-full min-h-[min(55vh,28rem)]"
        }
        aria-hidden={loadError}
      />
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
      {!suppressActivitySheet ? (
        <TripMapActivitySheet
          activity={sheetActivity}
          cityLabel={cityLabel}
          onClose={() => {
            setSheetActivity(null);
            onSelectRef.current?.(null);
          }}
        />
      ) : null}
    </div>
  );
}
