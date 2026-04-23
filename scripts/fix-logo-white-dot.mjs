/**
 * Retire un petit point / reflet clair en bas à droite de public/logo-justtrip.png
 * en le fusionnant avec la couleur du fond bleu proche (échantillon intérieur).
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pngPath = join(__dirname, "..", "public", "logo-justtrip.png");

const input = readFileSync(pngPath);
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const buf = Buffer.from(data);

function getPx(x, y) {
  const i = (Math.min(y, height - 1) * width + Math.min(x, width - 1)) * channels;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

function setPx(x, y, r, g, b, a) {
  const i = (y * width + x) * channels;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

// Moyenne du fond bleu uniquement (pixels sombres — exclut lettres blanches)
let sr = 0,
  sg = 0,
  sb = 0,
  sc = 0;
for (let y = Math.floor(height * 0.78); y < height; y++) {
  for (let x = 0; x < Math.floor(width * 0.35); x++) {
    const [r, g, b, a] = getPx(x, y);
    if (a < 128) continue;
    const s = r + g + b;
    if (s > 135) continue;
    sr += r;
    sg += g;
    sb += b;
    sc++;
  }
}
let br = sc ? Math.round(sr / sc) : 11;
let bg_ = sc ? Math.round(sg / sc) : 36;
let bb = sc ? Math.round(sb / sc) : 71;
if (!sc) {
  br = 11;
  bg_ = 36;
  bb = 71;
}
const bgSum = br + bg_ + bb;

// Quart de disque bas-droit : remplit le coin arrondi (étincelle) sans grignoter le texte au centre
const R = Math.min(width, height) * 0.135;
const cx = width - 1;
const cy = height - 1;
const R2 = R * R;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const dx = cx - x;
    const dy = cy - y;
    if (dx < 0 || dy < 0) continue;
    if (dx * dx + dy * dy <= R2) {
      setPx(x, y, br, bg_, bb, 255);
    }
  }
}

const out = await sharp(buf, { raw: { width, height, channels } })
  .png()
  .toBuffer();

const tmp = join(tmpdir(), `logo-justtrip-${Date.now()}.png`);
writeFileSync(tmp, out);
try {
  copyFileSync(tmp, pngPath);
  unlinkSync(tmp);
  console.log("OK:", pngPath);
} catch (e) {
  console.error("Impossible d’écrire public/ ; fichier généré ici :", tmp);
  throw e;
}
