import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const { resolveWikimediaGeoPhoto } = await import("../api/images/_wikimediaGeoPhotos.js");
const lat = Number(process.argv[2] || 28.4085);
const lon = Number(process.argv[3] || -16.5642);
const name = process.argv[4] || "Loro Parque";
const r = await resolveWikimediaGeoPhoto({ latitude: lat, longitude: lon, placeName: name, logContext: "probe" });
console.log(JSON.stringify({ lat, lon, name, ...r }, null, 2));
