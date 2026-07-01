import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { I18nProvider } from "./i18n/I18nContext.jsx";

/** Après un rechargement HMR / crash, évite body position:fixed et header masqué. */
function resetScrollLockOnBoot() {
  try {
    document.documentElement.classList.remove("modal-open");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    document.querySelectorAll("header, [class*='sticky']").forEach((el) => {
      if (Object.prototype.hasOwnProperty.call(el.dataset, "prevVis")) {
        el.style.visibility = el.dataset.prevVis || "";
        delete el.dataset.prevVis;
      }
    });
  } catch {
    /* ignore */
  }
}

resetScrollLockOnBoot();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
