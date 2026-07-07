/**
 * Override héros destination — forcer URL ou bannir sans toucher au code.
 *
 * Usage:
 *   node scripts/set-hero.mjs "Crete, Greece" "https://upload.wikimedia.org/..."
 *   node scripts/set-hero.mjs "Crete, Greece" --ban "https://bad-url..."
 *   node scripts/set-hero.mjs "Crete, Greece" --clear
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../lib/scripts/loadEnvLocal.mjs";
import { normalizeLabel } from "../lib/images/normalizeLabel.js";
import {
  banHeroUrl,
  clearHeroOverride,
  isHeroOverridesConfigured,
  readHeroOverride,
  upsertHeroOverride,
} from "../api/images/_heroOverrides.js";
import { resolveImage } from "../api/images/_resolveImage.js";
import { purgeImageResolveCacheByLabels } from "../api/images/_cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnvLocal();

const [destinationArg, actionArg, ...rest] = process.argv.slice(2);

if (!destinationArg) {
  console.error(`Usage:
  node scripts/set-hero.mjs "<destination>" "<url>"
  node scripts/set-hero.mjs "<destination>" --ban "<url>"
  node scripts/set-hero.mjs "<destination>" --clear`);
  process.exit(1);
}

if (!isHeroOverridesConfigured()) {
  console.error("hero_overrides: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis (.env.local)");
  process.exit(1);
}

const labelNormalized = normalizeLabel(destinationArg, "");
if (!labelNormalized) {
  console.error("Destination invalide (normalizeLabel vide)");
  process.exit(1);
}

async function main() {
  if (actionArg === "--clear") {
    const r = await clearHeroOverride(labelNormalized, "hero");
    if (!r.ok) {
      console.error(`clear failed: ${r.error}`);
      process.exit(1);
    }
    console.log(`OK cleared override for ${destinationArg} (${labelNormalized})`);
    return;
  }

  if (actionArg === "--ban") {
    const banUrl = rest[0] || "";
    if (!banUrl) {
      console.error("--ban requires URL");
      process.exit(1);
    }
    const r = await banHeroUrl(labelNormalized, banUrl, "hero");
    if (!r.ok) {
      console.error(`ban failed: ${r.error}`);
      process.exit(1);
    }
    await purgeImageResolveCacheByLabels([labelNormalized], "hero");
    const o = await readHeroOverride(labelNormalized, "hero");
    console.log(`OK banned URL for ${destinationArg} (${labelNormalized})`);
    console.log(`  banned: ${o?.bannedUrls?.length || 0} URL(s)`);
    return;
  }

  const forcedUrl = actionArg || "";
  if (!forcedUrl.startsWith("http")) {
    console.error("Second argument must be a full http(s) URL, --ban, or --clear");
    process.exit(1);
  }

  const r = await upsertHeroOverride({
    labelNormalized,
    kind: "hero",
    forcedImageUrl: forcedUrl,
    note: `set-hero CLI ${new Date().toISOString()}`,
  });
  if (!r.ok) {
    console.error(`upsert failed: ${r.error}`);
    process.exit(1);
  }

  await purgeImageResolveCacheByLabels([labelNormalized], "hero");

  const outcome = await resolveImage({
    kind: "hero",
    label: destinationArg,
    context: "",
    uiLang: "en",
  });

  console.log(`OK forced hero for ${destinationArg} (${labelNormalized})`);
  console.log(`  url: ${outcome.image?.url || "(none)"}`);
  console.log(`  heroSource: ${outcome.heroSource || "fallback"}`);
  if (outcome.heroSource !== "override") {
    console.warn("WARN: resolve did not return heroSource=override — vérifier URL HEAD + table hero_overrides");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
