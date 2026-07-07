import { useEffect, useState } from "react";

/** lg breakpoint — aligné Tailwind (1024px). */
export function useGygDesktopViewport() {
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(!!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return desktop;
}
