import { applyComputedDayCosts } from "./activityPricing.js";

/**
 * @param {string} period
 * @param {string} description
 * @param {string} lang
 */
export function formatActivityBullet(period, description, lang = "fr") {
  const body = String(description || "").trim();
  if (!body) return "";
  const code = String(lang || "fr").slice(0, 2);
  const prefix =
    period === "morning"
      ? ({ fr: "Matin", en: "Morning", de: "Vormittag", es: "Mañana", it: "Mattina", zh: "上午" })[code] || "Matin"
      : period === "afternoon"
        ? ({ fr: "Après-midi", en: "Afternoon", de: "Nachmittag", es: "Tarde", it: "Pomeriggio", zh: "下午" })[code] ||
          "Après-midi"
        : "";
  if (prefix && !/^(matin|morning|après|afternoon)/i.test(body)) {
    return `${prefix} : ${body}`;
  }
  return body;
}

/**
 * @param {object} day
 * @param {string} [lang]
 */
export function deriveBulletsFromActivities(day, lang = "fr") {
  const acts = Array.isArray(day?.activities) ? day.activities : [];
  if (acts.length) {
    return acts
      .map((a) => {
        const desc = String(a?.description || a?.name || "").trim();
        return formatActivityBullet(a?.period, desc, lang);
      })
      .filter(Boolean)
      .slice(0, 6);
  }
  return Array.isArray(day?.bullets) ? day.bullets.map((b) => String(b || "").trim()).filter(Boolean) : [];
}

/**
 * Normalise dayIdeas verified : garantit bullets[] dérivés de activities[] + costEur = somme activités.
 * @param {object[]} dayIdeas
 * @param {string} lang
 */
export function normalizeVerifiedDayIdeas(dayIdeas, lang = "fr") {
  return applyComputedDayCosts(
    (Array.isArray(dayIdeas) ? dayIdeas : []).map((day) => {
      const activities = Array.isArray(day?.activities) ? day.activities : [];
      const bullets = deriveBulletsFromActivities(day, lang);
      return { ...day, activities, bullets };
    })
  );
}
