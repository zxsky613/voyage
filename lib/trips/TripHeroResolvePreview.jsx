import React from "react";
import TripHeroImage from "./TripHeroImage.jsx";

/** Dev preview — cascade resolve-only (pas de hero_image_url, cache vidé au mount). */
export default function TripHeroResolvePreview() {
  const tripId = "preview-resolve-marseille";
  React.useEffect(() => {
    try {
      window.localStorage.removeItem(`tp_trip_hero_v2_${tripId}`);
    } catch {
      /* ignore */
    }
  }, []);

  const trip = {
    id: tripId,
    title: "Marseille",
    destination: "Marseille, France",
    owner_id: "preview-owner",
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 p-4">
      <p className="mb-2 text-xs text-slate-600">Preview resolve-only — sans hero_image_url ni cache v2</p>
      <article className="h-48 overflow-hidden rounded-2xl bg-white shadow">
        <TripHeroImage trip={trip} />
      </article>
    </div>
  );
}
