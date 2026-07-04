/**
 * Garde-fou : PlannerView ne doit pas référencer persistResolvedActivityPhoto hors scope App.
 * Usage: node scripts/verify-planner-photo-prop.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appPath = path.join(root, "App.jsx");
const src = fs.readFileSync(appPath, "utf8");

const plannerStart = src.indexOf("function PlannerView(");
if (plannerStart < 0) throw new Error("PlannerView not found in App.jsx");

const nextFn = src.indexOf("\nfunction ", plannerStart + 1);
const plannerBlock = src.slice(plannerStart, nextFn > 0 ? nextFn : undefined);

const propsMatch = plannerBlock.match(/function PlannerView\(\{([\s\S]*?)\}\)/);
if (!propsMatch?.[1]?.includes("onPhotoResolved")) {
  throw new Error("PlannerView must declare onPhotoResolved in props");
}

if (/\bonPhotoResolved=\{persistResolvedActivityPhoto\}/.test(plannerBlock)) {
  throw new Error(
    "PlannerView references persistResolvedActivityPhoto directly — pass via onPhotoResolved prop from App"
  );
}

if (!/onPhotoResolved=\{onPhotoResolved\}/.test(plannerBlock)) {
  throw new Error("PlannerView must wire onPhotoResolved={onPhotoResolved} to PlannerDayActivityCard");
}

const appMain = src.slice(src.indexOf("export default function App"));
if (!/onPhotoResolved=\{persistResolvedActivityPhoto\}/.test(appMain)) {
  throw new Error("App must pass onPhotoResolved={persistResolvedActivityPhoto} to PlannerView");
}

console.log("verify-planner-photo-prop: OK");
