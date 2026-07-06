import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { I18nProvider } from "./i18n/I18nContext.jsx";
import { ToastProvider } from "./lib/ui/toast/ToastContext.jsx";
import { resetScrollLockOnBoot } from "./lib/ui/resetScrollLock.js";

resetScrollLockOnBoot();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
