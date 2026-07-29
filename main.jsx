import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { I18nProvider } from "./i18n/I18nContext.jsx";
import { resetScrollLockOnBoot } from "./lib/ui/resetScrollLock.js";

resetScrollLockOnBoot();

const isTripsCompactPreview =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "trips-compact";

const isPlannerSheetPreview =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "planner-sheet";

const isTripHeroResolvePreview =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "trip-hero-resolve";

async function mount() {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  if (isTripsCompactPreview) {
    const { default: TripsCompactPreview } = await import("./lib/trips/TripsCompactPreview.jsx");
    root.render(
      <React.StrictMode>
        <I18nProvider>
          <TripsCompactPreview />
        </I18nProvider>
      </React.StrictMode>
    );
    return;
  }
  if (isTripHeroResolvePreview) {
    const { default: TripHeroResolvePreview } = await import("./lib/trips/TripHeroResolvePreview.jsx");
    root.render(
      <React.StrictMode>
        <I18nProvider>
          <TripHeroResolvePreview />
        </I18nProvider>
      </React.StrictMode>
    );
    return;
  }
  if (isPlannerSheetPreview) {
    const { default: PlannerSheetPreview } = await import("./lib/ui/PlannerSheetPreview.jsx");
    root.render(
      <React.StrictMode>
        <I18nProvider>
          <PlannerSheetPreview />
        </I18nProvider>
      </React.StrictMode>
    );
    return;
  }
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

void mount();
