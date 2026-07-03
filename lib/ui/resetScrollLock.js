/** Réinitialise scroll-lock / modal-open (body fixed, header masqué) après crash ou HMR. */
export function resetScrollLockOnBoot() {
  if (typeof document === "undefined") return;
  try {
    document.documentElement.classList.remove("modal-open");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    document.querySelectorAll("header, .app-top-nav, [class*='sticky']").forEach((el) => {
      if (Object.prototype.hasOwnProperty.call(el.dataset, "prevVis")) {
        el.style.visibility = el.dataset.prevVis || "";
        delete el.dataset.prevVis;
      }
      el.style.removeProperty("visibility");
    });
  } catch {
    /* ignore */
  }
}
