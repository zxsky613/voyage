/**
 * Recette homonymes héros — ancrage QID (hors catalogue pièges).
 * Usage: node scripts/verify-hero-homonym-recipe.mjs
 * Live Wikidata: VERIFY_HOMONYM_LIVE=1 node scripts/verify-hero-homonym-recipe.mjs
 */
import { loadEnvLocal } from "../lib/scripts/loadEnvLocal.mjs";
import { resolveEntity } from "../api/images/_entityResolver.js";
import {
  passesEntityImageGuards,
  forbiddenToponymsForAnchor,
} from "../lib/images/imageEntityGuard.js";
import { buildHeroVisionJudgePrompt } from "../lib/images/heroVisionJudge.js";

loadEnvLocal();

const HOMONYM_CASES = [
  {
    id: "palermo-italy",
    label: "Palermo",
    context: "Italy",
    expectedQid: "Q2656",
    forbiddenQids: ["Q1010212", "Q1486"],
    country: "Italie",
  },
  {
    id: "palerme-fr",
    label: "Palerme",
    context: "Italie",
    expectedQid: "Q2656",
    forbiddenQids: ["Q1010212", "Q1486"],
    country: "Italie",
  },
  {
    id: "valence-france",
    label: "Valence",
    context: "France",
    expectedQid: "Q8848",
    forbiddenQids: ["Q8818"],
    country: "France",
  },
  {
    id: "valencia-spain",
    label: "Valencia",
    context: "Spain",
    expectedQid: "Q8818",
    forbiddenQids: ["Q8848"],
    country: "Espagne",
  },
  {
    id: "cordoba-spain",
    label: "Córdoba",
    context: "Spain",
    expectedQid: "Q5818",
    forbiddenQids: ["Q44232"],
    country: "Espagne",
  },
  {
    id: "cordoba-argentina",
    label: "Córdoba",
    context: "Argentina",
    expectedQid: "Q44210",
    forbiddenQids: ["Q5818"],
    country: "Argentina",
  },
  {
    id: "tripoli-greece",
    label: "Tripoli",
    context: "Greece",
    expectedQid: "Q193409",
    forbiddenQids: ["Q3579"],
    country: "Grèce",
  },
  {
    id: "tripoli-libya",
    label: "Tripoli",
    context: "Libya",
    expectedQid: "Q3579",
    forbiddenQids: ["Q193409"],
    country: "Libye",
  },
];

const PALERMO_BA_CANDIDATE = {
  url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Palermo_Buenos_Aires.jpg/1280px-Palermo_Buenos_Aires.jpg",
  categories: "palermo buenos aires argentina city neighborhoods",
};

async function main() {
  const live = process.argv.includes("--live") || process.env.VERIFY_HOMONYM_LIVE === "1";
  let failed = 0;

  const prompt = buildHeroVisionJudgePrompt("Palermo, Italy", "Italie");
  if (!prompt.includes("Italie")) {
    console.error("FAIL vision prompt missing expected country");
    failed += 1;
  } else {
    console.log("OK vision prompt includes expected country");
  }

  const italyForbidden = forbiddenToponymsForAnchor("italy", ["sicily", "italy"]);
  const palermoBaBlocked = !passesEntityImageGuards(
    PALERMO_BA_CANDIDATE,
    {
      qid: "Q2656",
      coordinates: { lat: 38.1157, lon: 13.3615 },
      forbiddenToponyms: italyForbidden,
    },
    "hero"
  );
  if (!palermoBaBlocked) {
    console.error("FAIL Palermo Buenos Aires photo must lose category guard");
    failed += 1;
  } else {
    console.log("OK Palermo BA photo rejected by entity guards (offline)");
  }

  if (!live) {
    console.log("SKIP live QID cases (set VERIFY_HOMONYM_LIVE=1)");
    process.exit(failed ? 1 : 0);
  }

  for (const c of HOMONYM_CASES) {
    const entity = await resolveEntity(c.label, "en", "hero", c.context);
    if (!entity?.qid) {
      console.error(`FAIL ${c.id}: no entity resolved`);
      failed += 1;
      continue;
    }
    console.log(`entityAnchor: ${entity.qid} — ${c.label} (${c.context})`);
    if (entity.qid !== c.expectedQid) {
      console.error(`FAIL ${c.id}: expected ${c.expectedQid}, got ${entity.qid}`);
      failed += 1;
      continue;
    }
    if ((c.forbiddenQids || []).includes(entity.qid)) {
      console.error(`FAIL ${c.id}: homonym QID ${entity.qid}`);
      failed += 1;
      continue;
    }
    if (!entity.geoAnchor?.coordinates) {
      console.error(`FAIL ${c.id}: missing P625 on entity`);
      failed += 1;
      continue;
    }
    console.log(`OK ${c.id} → ${entity.qid}`);
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
