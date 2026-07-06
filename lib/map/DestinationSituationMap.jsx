import React from "react";
import LazyTripMap from "./LazyTripMap.jsx";

const GUIDE_SECTION_LOAD_TIMEOUT_MS = 8000;

/**
 * Mini-carte de situation — destination unique, marqueur orange, zoom régional.
 * @param {{ latitude: number, longitude: number, cityLabel?: string, className?: string }} props
 */
export default function DestinationSituationMap({ latitude, longitude, cityLabel = "", className = "" }) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const activities = [
    {
      id: "destination-pin",
      dayIndex: 0,
      dayNum: 1,
      orderInDay: 1,
      title: String(cityLabel || "").trim() || "Destination",
      latitude: lat,
      longitude: lon,
    },
  ];

  return (
    <LazyTripMap
      view="situation"
      activities={activities}
      selectedDayIndex={0}
      selectedActivityId=""
      onSelectActivity={() => {}}
      mode="trip"
      cityLabel={cityLabel}
      className={`h-[200px] min-h-[200px] md:h-[280px] md:min-h-[280px] ${className}`.trim()}
    />
  );
}

export { GUIDE_SECTION_LOAD_TIMEOUT_MS };
