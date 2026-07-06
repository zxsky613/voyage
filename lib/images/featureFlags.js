export function isResolveGuideCleanupEnabled() {
  return import.meta.env.VITE_USE_RESOLVE_GUIDE_CLEANUP === "true";
}

export function isResolveHeroEnabled() {
  const v = String(import.meta.env.VITE_USE_RESOLVE_HERO ?? "").trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  return true;
}

export function isResolveLandmarkEnabled() {
  return import.meta.env.VITE_USE_RESOLVE_LANDMARK === "true";
}

export function isResolveActivityEnabled() {
  return import.meta.env.VITE_USE_RESOLVE_ACTIVITY === "true";
}

/** Retire les champs image d'un guide (cache texte seul). */
export function stripGuideImageFields(guide) {
  if (!guide || typeof guide !== "object") return guide;
  const { imageUrl: _i, landscapeImageUrl: _l, heroImageCandidates: _h, ...rest } = guide;
  return rest;
}
