import test from "node:test";
import assert from "node:assert/strict";
import { categoryForActivityTitle, normalizeActivityTitleForCategory } from "./activityCategoryThumb.js";

test("normalizeActivityTitleForCategory strips accents", () => {
  assert.equal(normalizeActivityTitleForCategory("Dîner chez un ami"), "diner chez un ami");
});

test("restaurant category", () => {
  const fr = categoryForActivityTitle("Brunch au café");
  assert.equal(fr.iconKey, "UtensilsCrossed");
  assert.equal(fr.bgClass, "bg-amber-50");
  const en = categoryForActivityTitle("Dinner with locals");
  assert.equal(en.iconKey, "UtensilsCrossed");
});

test("social category beats restaurant for chez un ami", () => {
  const hit = categoryForActivityTitle("Dîner chez un ami");
  assert.equal(hit.iconKey, "Users");
  assert.equal(hit.bgClass, "bg-brand-orange-tint");
});

test("relax and spa", () => {
  assert.equal(categoryForActivityTitle("Repos à l'hôtel").iconKey, "BedDouble");
  assert.equal(categoryForActivityTitle("Spa détente").iconKey, "Waves");
  assert.equal(categoryForActivityTitle("Piscine de l'hôtel").iconKey, "Waves");
});

test("shopping and hiking", () => {
  assert.equal(categoryForActivityTitle("Shopping au marché").iconKey, "ShoppingBag");
  assert.equal(categoryForActivityTitle("Randonnée en montagne").iconKey, "Mountain");
});

test("landmark and transport", () => {
  assert.equal(categoryForActivityTitle("Visite du musée").iconKey, "Landmark");
  assert.equal(categoryForActivityTitle("Vol Paris — Athènes").iconKey, "Plane");
  assert.equal(categoryForActivityTitle("Train vers la gare").iconKey, "TrainFront");
});

test("party sport beach", () => {
  assert.equal(categoryForActivityTitle("Soirée concert").iconKey, "PartyPopper");
  assert.equal(categoryForActivityTitle("Bike tour").iconKey, "Bike");
  assert.equal(categoryForActivityTitle("Journée plage").iconKey, "Waves");
});

test("port castle calanque viewpoint categories", () => {
  assert.equal(categoryForActivityTitle("Port de Cassis").iconKey, "Anchor");
  assert.equal(categoryForActivityTitle("Château d'If").iconKey, "Castle");
  assert.equal(categoryForActivityTitle("Calanque d'En-Vau").iconKey, "Mountain");
  assert.equal(categoryForActivityTitle("Point de vue panoramique").iconKey, "Camera");
});

test("default fallback", () => {
  const hit = categoryForActivityTitle("Temps libre");
  assert.equal(hit.iconKey, "MapPin");
  assert.equal(hit.bgClass, "bg-brand-blue-tint");
  assert.equal(hit.fgClass, "text-brand-blue");
});
