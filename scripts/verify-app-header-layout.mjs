#!/usr/bin/env node
/**
 * Garde-fou layout : header flottant → une seule source de vérité (--app-header-height).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const errors = [];

const hook = read("lib/ui/useAppHeaderHeight.js");
if (!hook.includes("--app-header-height") || !hook.includes("ResizeObserver")) {
  errors.push("lib/ui/useAppHeaderHeight.js must set --app-header-height via ResizeObserver");
}

const css = read("index.css");
if (!css.includes("--app-header-height") || !css.includes(".app-main")) {
  errors.push("index.css must define --app-header-height fallback and .app-main padding");
}
if (!css.includes("--app-header-clearance: calc(var(--app-header-height)")) {
  errors.push("index.css --app-header-clearance must derive from --app-header-height");
}

const app = read("App.jsx");
if (!app.includes("useAppHeaderHeight")) {
  errors.push("App.jsx TopNav must use useAppHeaderHeight");
}
if (!app.includes('className="app-main')) {
  errors.push("App.jsx <main> must use app-main class");
}
if (/pt-\[calc\(var\(--app-header-clearance\)/.test(app)) {
  errors.push("App.jsx must not duplicate header clearance in pt-[calc(...)] on main");
}
if (/flex items-center justify-between pt-1 sm:pt-0/.test(app)) {
  errors.push("DestinationGuideView must not have local pt-1 header compensation");
}

if (errors.length) {
  console.error("verify-app-header-layout FAILED:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log("verify-app-header-layout OK");
