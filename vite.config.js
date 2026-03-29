import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { geminiDevApiPlugin } from "./gemini-dev-plugin.js";

export default defineConfig({
  plugins: [react(), geminiDevApiPlugin()],
});
