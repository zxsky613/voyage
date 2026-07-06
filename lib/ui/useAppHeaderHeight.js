import { useLayoutEffect, useRef } from "react";

const CSS_VAR = "--app-header-height";

function applyHeaderHeight(el) {
  if (!el || typeof document === "undefined") return;
  const height = Math.ceil(el.getBoundingClientRect().height);
  if (height > 0) {
    document.documentElement.style.setProperty(CSS_VAR, `${height}px`);
  }
}

/** Mesure le header flottant et publie --app-header-height sur :root (ResizeObserver). */
export function useAppHeaderHeight() {
  const headerRef = useRef(null);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el || typeof window === "undefined") return undefined;

    applyHeaderHeight(el);

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => applyHeaderHeight(el));
      ro.observe(el);
    }

    const onResize = () => applyHeaderHeight(el);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return headerRef;
}
