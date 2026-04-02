/**
 * Vérifie les URLs du catalogue Wikimedia : joignabilité + ratio largeur/hauteur
 * des fichiers **tels que servis** (souvent miniature 1920px), proches du rendu réel du bandeau.
 *
 * Usage : npm run verify:city-heroes
 * Variables :
 *   MIN_HERO_WH_RATIO — défaut 1.4 (bandeau très horizontal ; surcharger pour assouplir en local si besoin)
 *   HERO_PROBE_DELAY_MS — défaut 900
 *
 * Politique User-Agent : https://foundation.wikimedia.org/wiki/Policy:User-Agent_Policy
 */

import probe from "probe-image-size";
import { WIKIMEDIA_CURATED_CITY_HEROES } from "../cityWikimediaHeroes.js";

const MIN_RATIO = Number(process.env.MIN_HERO_WH_RATIO || "1.4");
const DELAY_MS = Number(process.env.HERO_PROBE_DELAY_MS || "900");

const UA =
  "TriPlanner/1.0 (https://github.com/; verify-city-heroes; +https://foundation.wikimedia.org/wiki/Policy:User-Agent_Policy)";

const probeOpts = { headers: { "User-Agent": UA } };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function collectUniqueUrls() {
  const byUrl = new Map();
  for (const [city, urls] of Object.entries(WIKIMEDIA_CURATED_CITY_HEROES)) {
    for (const u of urls) {
      const url = String(u || "").trim();
      if (!url) continue;
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url).push(city);
    }
  }
  return byUrl;
}

function is429(err) {
  const m = String(err?.message || "");
  return m.includes("429") || err?.statusCode === 429;
}

async function probeWithRetry(url, attempts = 8) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await probe(url, probeOpts);
    } catch (e) {
      lastErr = e;
      const wait = is429(e) ? 12000 + i * 4000 : 1000 * (i + 1);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function main() {
  const byUrl = collectUniqueUrls();
  const urls = [...byUrl.keys()].sort();
  const failures = [];
  let ok = 0;

  console.error(
    `verify-city-heroes: ${urls.length} URL(s), min width/height ≥ ${MIN_RATIO}, ${DELAY_MS}ms entre requêtes\n`
  );

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const cities = byUrl.get(url);
    await sleep(DELAY_MS);
    try {
      const { width, height } = await probeWithRetry(url);
      if (!width || !height) {
        failures.push({ url, cities, reason: "dimensions manquantes" });
        continue;
      }
      const ratio = width / height;
      if (ratio + 1e-9 < MIN_RATIO) {
        failures.push({
          url,
          cities,
          reason: `ratio ${ratio.toFixed(2)} < ${MIN_RATIO} (${width}×${height})`,
        });
      } else {
        ok++;
      }
    } catch (e) {
      failures.push({ url, cities, reason: e?.message || String(e) });
    }
  }

  console.error(`Réussi: ${ok} / ${urls.length}`);

  if (failures.length) {
    console.error("\n--- Échecs ---\n");
    for (const f of failures) {
      console.error(`[${f.cities.join(", ")}]\n  ${f.reason}\n  ${f.url}\n`);
    }
    process.exit(1);
  }

  console.error("Toutes les URLs passent.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
