import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { geminiDevApiPlugin } from "./gemini-dev-plugin.js";

export default defineConfig({
  // Chemins relatifs requis pour que le bundle Capacitor (WKWebView) charge JS/CSS depuis `dist/`.
  base: "./",
  plugins: [react(), geminiDevApiPlugin()],
  // Permet d’ouvrir le site depuis le téléphone (même Wi‑Fi) : http://IP_DU_PC:5173
  // Les appels /api/groq/* et /api/gemini/* passent par le même origine.
  server: { host: true },
  preview: { host: true },
});
