#!/usr/bin/env node
/**
 * Garde-fou : pas d'appel /api/ui-translate en prod sans garde explicite.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "i18n/userContentTranslate.jsx"), "utf8");

const errors = [];
if (!src.includes("isUiTranslateApiEnabled")) {
  errors.push("missing isUiTranslateApiEnabled guard");
}
if (!src.includes("uiTranslateApiCircuitOpen")) {
  errors.push("missing circuit breaker on 404/503");
}
if (!src.includes("import.meta.env?.DEV")) {
  errors.push("must enable API only in DEV or via VITE_UI_TRANSLATE_API");
}
if (/await fetch\("\/api\/ui-translate"/.test(src) && !src.includes("postUiTranslateBatch")) {
  errors.push("fetch /api/ui-translate must go through postUiTranslateBatch");
}

if (errors.length) {
  console.error("verify-ui-translate-guard FAILED:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log("verify-ui-translate-guard OK");
