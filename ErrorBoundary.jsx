import React from "react";
import { resetScrollLockOnBoot } from "./lib/ui/resetScrollLock.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    resetScrollLockOnBoot();
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error || "Erreur inconnue");
      return (
        <div
          className="grid min-h-[100dvh] place-items-center bg-slate-100 px-6 py-10"
          role="alert"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h1 className="text-lg font-semibold text-slate-900">Justtrip — erreur d&apos;affichage</h1>
            <p className="mt-3 break-words text-sm leading-relaxed text-slate-600">{msg}</p>
            <button
              type="button"
              className="mt-6 w-full rounded-2xl bg-slate-900 py-3 text-sm font-medium text-white"
              onClick={() => {
                resetScrollLockOnBoot();
                window.location.reload();
              }}
            >
              Recharger l&apos;application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
