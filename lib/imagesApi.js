/** URL POST pour les routes /api/images/* (dev Vite + prod Vercel). */
export function getImagesApiPostUrl(segment) {
  const path = `/api/images/${String(segment || "").replace(/^\/+/, "")}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/$/, "")}${path}`;
  }
  const base = String(import.meta.env.VITE_INVITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

export function isWikimediaImageUrl(url) {
  return /upload\.wikimedia\.org/i.test(String(url || ""));
}
