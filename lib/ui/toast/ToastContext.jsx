import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { BRAND_BLUE_GLASS_GRADIENT } from "../../brandColors.js";

const ToastContext = createContext(null);

const TOAST_VISIBLE_MS = 3000;
const TOAST_LEAVE_MS = 220;
const TOAST_LEAVE_REDUCED_MS = 80;
const TOAST_QUEUE_GAP_MS = 100;
const MAX_QUEUE = 6;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function ToastPill({ toast, leaving, reducedMotion, onDismiss }) {
  if (!toast) return null;

  const enterClass = reducedMotion ? "tp-toast-fade-in" : "tp-toast-slide-in";
  const leaveClass = reducedMotion ? "tp-toast-fade-out" : "tp-toast-slide-out";

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`pointer-events-auto flex w-full max-w-[min(100%,22rem)] items-center gap-2.5 rounded-full px-4 py-2.5 text-left text-sm font-medium text-white shadow-[0_16px_40px_rgba(2,6,23,0.28)] ring-1 ring-white/10 transition hover:brightness-105 active:scale-[0.99] sm:max-w-md sm:px-5 sm:py-3 ${
        leaving ? leaveClass : enterClass
      }`}
      style={{ background: BRAND_BLUE_GLASS_GRADIENT }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15"
        aria-hidden
      >
        <Check size={14} strokeWidth={2.5} className="text-white" />
      </span>
      <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
    </button>
  );
}

function ToastViewport({ current, leaving, reducedMotion, onDismiss }) {
  if (typeof document === "undefined" || !current) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 z-[200] w-[min(100%-1.5rem,24rem)] -translate-x-1/2 px-2 sm:bottom-[max(1.5rem,env(safe-area-inset-bottom,0px)+0.75rem)] sm:w-auto"
      style={{
        bottom: "max(calc(var(--app-bottom-nav-clearance) + 0.35rem), calc(env(safe-area-inset-bottom, 0px) + 0.75rem))",
      }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <ToastPill
        key={current.id}
        toast={current}
        leaving={leaving}
        reducedMotion={reducedMotion}
        onDismiss={onDismiss}
      />
    </div>,
    document.body
  );
}

export function ToastProvider({ children }) {
  const reducedMotion = usePrefersReducedMotion();
  const [current, setCurrent] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const queueRef = useRef([]);
  const idRef = useRef(0);
  const hideTimerRef = useRef(0);
  const leaveTimerRef = useRef(0);
  const gapTimerRef = useRef(0);
  const currentRef = useRef(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    leavingRef.current = leaving;
  }, [leaving]);

  const clearTimers = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    window.clearTimeout(leaveTimerRef.current);
    window.clearTimeout(gapTimerRef.current);
  }, []);

  const showItem = useCallback((item) => {
    setLeaving(false);
    setCurrent(item);
    hideTimerRef.current = window.setTimeout(() => {
      setLeaving(true);
      leaveTimerRef.current = window.setTimeout(() => {
        setLeaving(false);
        setCurrent(null);
        gapTimerRef.current = window.setTimeout(() => {
          const next = queueRef.current.shift();
          if (next) showItem(next);
        }, TOAST_QUEUE_GAP_MS);
      }, reducedMotion ? TOAST_LEAVE_REDUCED_MS : TOAST_LEAVE_MS);
    }, TOAST_VISIBLE_MS);
  }, [reducedMotion]);

  const dismiss = useCallback(() => {
    if (!currentRef.current || leavingRef.current) return;
    clearTimers();
    setLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      setLeaving(false);
      setCurrent(null);
      gapTimerRef.current = window.setTimeout(() => {
        const next = queueRef.current.shift();
        if (next) showItem(next);
      }, TOAST_QUEUE_GAP_MS);
    }, reducedMotion ? TOAST_LEAVE_REDUCED_MS : TOAST_LEAVE_MS);
  }, [clearTimers, reducedMotion, showItem]);

  const enqueue = useCallback(
    (message, variant = "success") => {
      const text = String(message || "").trim();
      if (!text) return;
      const item = { id: ++idRef.current, message: text, variant };
      if (!currentRef.current && queueRef.current.length === 0 && !leavingRef.current) {
        showItem(item);
        return;
      }
      if (queueRef.current.length >= MAX_QUEUE) queueRef.current.shift();
      queueRef.current.push(item);
    },
    [showItem]
  );

  const toast = useCallback(
    (message, options) => {
      enqueue(message, options?.variant || "success");
    },
    [enqueue]
  );

  const toastSuccess = useCallback(
    (message) => {
      enqueue(message, "success");
    },
    [enqueue]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo(
    () => ({
      toast,
      toastSuccess,
      dismiss,
    }),
    [toast, toastSuccess, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        current={current}
        leaving={leaving}
        reducedMotion={reducedMotion}
        onDismiss={dismiss}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
