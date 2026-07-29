/**
 * Enregistre un GIF de la transition J1→J2 (cadre carte uniquement).
 * Usage: npm run dev, then node scripts/capture-day-fly-gif.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "assets");
const tmpDir = path.join(outDir, "_fly-frames");
const base = process.env.PREVIEW_URL?.replace(/\?.*$/, "") || "http://localhost:5173";
const url = `${base}/?preview=planner-sheet&scenario=marseille&scope=day&snap=mid`;

await mkdir(tmpDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector(".maplibregl-canvas", { timeout: 20000 });
await page.waitForTimeout(2200);

const mapBox = await page.locator("[data-effective-map-view] .maplibregl-canvas").boundingBox()
  || await page.locator(".maplibregl-canvas").boundingBox();
if (!mapBox) throw new Error("Canvas carte introuvable");

await page.screenshot({
  path: path.join(tmpDir, "frame-00.png"),
  clip: mapBox,
});

await page.getByRole("button", { name: /Jour 2/i }).first().click();

for (let i = 1; i <= 10; i++) {
  await page.waitForTimeout(80);
  await page.screenshot({
    path: path.join(tmpDir, `frame-${String(i).padStart(2, "0")}.png`),
    clip: mapBox,
  });
}

await browser.close();

const gifOut = path.join(outDir, "planner-day-fly-j1-j2.gif");
try {
  await execFileAsync("ffmpeg", [
    "-y",
    "-framerate", "12",
    "-i", path.join(tmpDir, "frame-%02d.png"),
    "-loop", "0",
    gifOut,
  ], { stdio: "pipe" });
  console.log("OK →", gifOut);
} catch {
  const manifest = {
    note: "ffmpeg absent — séquence PNG dans assets/_fly-frames/",
    durationMs: 700,
    easing: "ease-out cubic (1-(1-t)³)",
    frames: 11,
    intervalMs: 80,
  };
  await writeFile(path.join(outDir, "planner-day-fly-j1-j2.meta.json"), JSON.stringify(manifest, null, 2));
  console.log("ffmpeg absent — meta → assets/planner-day-fly-j1-j2.meta.json");
  console.log("Frames → assets/_fly-frames/frame-*.png");
}

await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
