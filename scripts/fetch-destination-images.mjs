/**
 * Télécharge des photos (pas des drapeaux) dans public/destinations/.
 *
 * Deux modes par ligne dans ROWS :
 * - commons : fichier Wikimedia Commons exact (stable).
 * - searchLabel (+ optionnel cityKey / visualClass) : recherche Commons selon le profil
 *   (plage / skyline / patrimoine / monument emblématique) — voir destination-image-profiles.mjs
 *
 * Usage : npm run fetch:destinations
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getVisualClassForCity,
  buildCommonsSearchPhrases,
} from "./destination-image-profiles.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "destinations");

const UA = "Justtrip/1.0 (destination hero fetch; local dev; +https://github.com/)";

/**
 * Chaque entrée : soit { file, commons }, soit { file, searchLabel, cityKey?, visualClass? }
 */
const ROWS = [
  { file: "paris.jpg", commons: "Eiffel Tower, Paris, France.jpg" },
  { file: "tokyo.jpg", commons: "Tokyo Sky Tree 2012.JPG" },
  { file: "london.jpg", commons: "Big Ben London.jpg" },
  { file: "new-york.jpg", commons: "New York City skyline.jpg" },
  { file: "rome.jpg", commons: "Colosseum in Rome, Italy - April 2007.jpg" },
  { file: "berlin.jpg", commons: "Brandenburger Tor Berlin.jpg" },
  { file: "istanbul.jpg", commons: "Hagia Sophia, Istanbul.jpg" },
  { file: "pisa.jpg", commons: "Leaning Tower of Pisa.jpg" },
  { file: "los-angeles.jpg", searchLabel: "Los Angeles" },
  { file: "nice.jpg", commons: "Promenade des Anglais in Nice.jpg" },
  { file: "singapore.jpg", commons: "Singapore Marina Bay Dusk 2018-02-27.jpg" },
  {
    file: "amsterdam.jpg",
    commons: "Water reflection of canal houses at blue hour in Damrak Amsterdam the Netherlands.jpg",
  },
  { file: "prague.jpg", commons: "Prague old town square panorama.jpg" },
  {
    file: "lyon.jpg",
    commons: "Lyon - Colline de Fourvière depuis les Jardins de Perrache (mars 2019).jpg",
  },
  // Littoral : recherche orientée plage (profil beach dans destination-image-profiles.mjs)
  { file: "miami.jpg", searchLabel: "Miami" },
  { file: "sydney.jpg", searchLabel: "Sydney" },
  { file: "dubai.jpg", searchLabel: "Dubai" },
  { file: "barcelona.jpg", searchLabel: "Barcelona" },
  // Nouvelles villes (profil auto : skyline / heritage / beach)
  { file: "shanghai.jpg", searchLabel: "Shanghai" },
  {
    file: "beijing.jpg",
    commons: "Hall of Supreme Harmony Forbidden City.jpg",
  },
  { file: "marrakech.jpg", searchLabel: "Marrakech" },
  { file: "phuket.jpg", searchLabel: "Phuket" },
];

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isLikelyFlagOrSealUrl(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return true;
  return (
    u.includes("flag_of") ||
    u.includes("/flag/") ||
    u.includes("flag_of_") ||
    u.includes("seal_of") ||
    u.includes("coat_of_arms") ||
    u.includes("blason") ||
    u.includes("drapeau") ||
    u.includes("_seal.") ||
    u.includes("emblem_of") ||
    u.includes("logo_") ||
    u.includes("svg")
  );
}

function isBadCommonsFileTitle(title) {
  const t = String(title || "").toLowerCase();
  return (
    t.includes("flag of") ||
    t.includes("flag_of") ||
    t.includes("coat of arms") ||
    t.includes("coat_of_arms") ||
    t.includes("logo ") ||
    t.startsWith("logo ") ||
    t.includes("_logo") ||
    t.includes("seal of") ||
    t.includes("emblem of") ||
    t.endsWith(".svg") ||
    t.includes(".svg")
  );
}

async function resolveCommonsThumbUrl(fileName) {
  const title = fileName.startsWith("File:") ? fileName : `File:${fileName}`;
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
    encodeURIComponent(title) +
    "&prop=imageinfo&iiprop=url|mime&iiurlwidth=1920&format=json";
  const r = await fetch(api, { headers: { "User-Agent": UA } });
  if (!r.ok) return { error: `api ${r.status}`, url: "" };
  const j = await r.json();
  const page = Object.values(j?.query?.pages || {})[0];
  if (!page || page.missing) return { error: "fichier introuvable sur Commons", url: "" };
  const ii = page.imageinfo?.[0];
  const url = String(ii?.thumburl || ii?.url || "").trim();
  const mime = String(ii?.mime || "");
  if (!url) return { error: "pas d’URL image", url: "" };
  if (!mime.startsWith("image/")) return { error: `mime ${mime}`, url: "" };
  return { error: "", url };
}

async function commonsSearchTitles(phrase, limit = 14) {
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=" +
    encodeURIComponent(phrase) +
    "&srnamespace=6&srlimit=" +
    limit +
    "&format=json";
  const r = await fetch(api, { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const j = await r.json();
  const list = j?.query?.search || [];
  return list
    .map((x) => String(x.title || "").replace(/^File:/i, "").trim())
    .filter(Boolean);
}

async function searchCommonsBestMatch(searchLabel, visualClass, keyHint) {
  const phrases = buildCommonsSearchPhrases(visualClass, searchLabel, keyHint);
  for (const phrase of phrases) {
    const titles = await commonsSearchTitles(phrase);
    for (const title of titles) {
      if (isBadCommonsFileTitle(title)) continue;
      const { error, url } = await resolveCommonsThumbUrl(title);
      if (!error && url && !isLikelyFlagOrSealUrl(url)) {
        return { error: "", url, pickedTitle: title, phrase, visualClass };
      }
    }
    await delay(1400);
  }
  return {
    error: "aucune image Commons acceptable pour cette recherche",
    url: "",
    pickedTitle: "",
    phrase: "",
    visualClass,
  };
}

async function downloadToFile(imageUrl, destPath) {
  const r = await fetch(imageUrl, { headers: { "User-Agent": UA } });
  if (!r.ok) return `image ${r.status}`;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 2000) return "image trop petite";
  await writeFile(destPath, buf);
  return "";
}

async function resolveRow(row) {
  if (row.commons) {
    const out = await resolveCommonsThumbUrl(row.commons);
    return { ...out, mode: "commons", meta: row.commons };
  }
  const label = row.searchLabel || row.cityLabel;
  if (!label) {
    return { error: "searchLabel ou commons requis", url: "", mode: "none", meta: "" };
  }
  const vc = row.visualClass || getVisualClassForCity(row.cityKey || label);
  const keyHint = row.cityKey || label;
  const out = await searchCommonsBestMatch(label, vc, keyHint);
  return { ...out, mode: "search", meta: `${vc}: ${out.phrase || ""}` };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let ok = 0;
  let fail = 0;
  for (const row of ROWS) {
    const dest = join(OUT_DIR, row.file);
    process.stdout.write(`${row.file} … `);
    const { error: e1, url, mode, meta, pickedTitle, visualClass } = await resolveRow(row);
    if (e1 || !url) {
      process.stdout.write(`skip (${e1 || "pas d’url"})\n`);
      fail += 1;
      await delay(2800);
      continue;
    }
    if (isLikelyFlagOrSealUrl(url)) {
      process.stdout.write(`skip (URL ressemble à drapeau/blason)\n`);
      fail += 1;
      await delay(2800);
      continue;
    }
    const hint = mode === "search" ? `[${visualClass}] ${(pickedTitle || "").slice(0, 42)}` : `[fixe]`;
    process.stdout.write(`${hint} … `);
    const e2 = await downloadToFile(url, dest);
    if (e2) {
      process.stdout.write(`skip (${e2})\n`);
      fail += 1;
    } else {
      process.stdout.write("ok\n");
      ok += 1;
    }
    await delay(2800);
  }
  console.log(
    `\nTerminé : ${ok} ok, ${fail} ignorés. Profils : scripts/destination-image-profiles.mjs (plage, skyline, patrimoine, monuments)`
  );
  console.log("Puis : npm run upload:destinations si tu utilises Supabase.");
  process.exit(fail > ROWS.length - 3 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
