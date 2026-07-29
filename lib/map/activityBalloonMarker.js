/** Orange activité JustTrip — épingle carte brand. */
export const ACTIVITY_BALLOON_ORANGE = "#F16A2E";
export const ACTIVITY_BALLOON_NUM = "#FFFFFF";

const MAX_ORDER = 10;

/** Teinte carte — J2 légèrement assombri pour contraste sur fond bleu (header inchangé). */
function dayMarkerMapFill(dayIndex, headerColor) {
  if (Number(dayIndex) === 1) return "#3A7BC8";
  return String(headerColor || "#142F5D");
}

/**
 * Épingle carte : pointe basse ancrée sur la position, numéro dans la tête, ring blanc.
 * @param {number|string} orderNum
 * @param {{ selected?: boolean, fill?: string, textColor?: string }} [opts]
 */
export function buildActivityBalloonSvg(orderNum, opts = {}) {
  const n = String(orderNum || "1");
  const selected = Boolean(opts.selected);
  const fill = String(opts.fill || ACTIVITY_BALLOON_ORANGE);
  const textColor = String(opts.textColor || ACTIVITY_BALLOON_NUM);
  const scale = selected ? 1.22 : 1;
  const w = Math.round(32 * scale);
  const h = Math.round(44 * scale);
  const strokeW = selected ? 3 : 2.5;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 44" role="img" aria-hidden="true">
  <path d="M16 41 C16 41 3.5 25.5 3.5 15.5 C3.5 7.5 9.5 2.5 16 2.5 C22.5 2.5 28.5 7.5 28.5 15.5 C28.5 25.5 16 41 16 41 Z" fill="${fill}" stroke="#FFFFFF" stroke-width="${strokeW}" stroke-linejoin="round"/>
  <text x="16" y="17.5" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="11.5" font-weight="700" fill="${textColor}">${n}</text>
</svg>`;
}

/** @param {number} order */
export function activityBalloonImageId(order, selected = false) {
  const o = Math.max(1, Math.min(MAX_ORDER, Number(order) || 1));
  return selected ? `activity-balloon-${o}-sel` : `activity-balloon-${o}`;
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {string} id
 * @param {string} svg
 * @param {number} timeoutMs
 */
function loadSvgImage(map, id, svg, timeoutMs) {
  if (map.hasImage(id)) return Promise.resolve();
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`loadImage timeout: ${id}`));
    }, timeoutMs);
    const img = new Image();
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 });
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`loadImage failed: ${id}`));
    };
    img.src = dataUrl;
  });
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<boolean>} true si toutes les pastilles sont enregistrées
 */
export async function registerActivityBalloonImages(map, opts = {}) {
  const timeoutMs = Math.max(1500, Number(opts.timeoutMs) || 4000);
  const jobs = [];
  for (let i = 1; i <= MAX_ORDER; i += 1) {
    for (const selected of [false, true]) {
      const id = activityBalloonImageId(i, selected);
      if (map.hasImage(id)) continue;
      jobs.push(loadSvgImage(map, id, buildActivityBalloonSvg(i, { selected }), timeoutMs));
    }
  }
  if (!jobs.length) return true;
  const results = await Promise.allSettled(jobs);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  return ok >= MAX_ORDER;
}

/** @param {number} dayIndex @param {number|string} dayNum @param {boolean} [selected] */
export function dayPinImageId(dayIndex, dayNum, selected = false) {
  const d = Math.max(0, Number(dayIndex) || 0);
  const n = Math.max(1, Math.min(MAX_ORDER, Number(dayNum) || 1));
  return selected ? `day-dot-${d}-${n}-sel` : `day-dot-${d}-${n}`;
}

/**
 * Pastille ronde vue d'ensemble — ~42px, numéro bold, ring blanc 3px + ombre marquée.
 * @param {number|string} dayNum
 * @param {string} fillColor couleur dayMarkerMapFillColor
 * @param {{ selected?: boolean, dayIndex?: number }} [opts]
 */
export function buildDayPinSvg(dayNum, fillColor, opts = {}) {
  const n = String(dayNum || "1");
  const selected = Boolean(opts.selected);
  const fill = String(fillColor || "#142F5D");
  const scale = selected ? 1.05 : 1;
  const size = Math.round(44 * scale);
  const strokeW = 3;
  const filterId = `day-dot-sh-${Number(opts.dayIndex) || 0}-${n}${selected ? "-sel" : ""}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44" role="img" aria-hidden="true">
  <defs>
    <filter id="${filterId}" x="-35%" y="-35%" width="170%" height="170%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="2.8" flood-color="#0f172a" flood-opacity="0.5"/>
      <feDropShadow dx="0" dy="0.5" stdDeviation="0.6" flood-color="#ffffff" flood-opacity="0.35"/>
    </filter>
  </defs>
  <circle cx="22" cy="22" r="17" fill="${fill}" stroke="#FFFFFF" stroke-width="${strokeW}" filter="url(#${filterId})"/>
  <text x="22" y="22.5" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="800" fill="#FFFFFF">${n}</text>
</svg>`;
}

/**
 * Pastilles-jour rondes (vue d'ensemble) — centrées sur le centroïde.
 * @param {import('maplibre-gl').Map} map
 * @param {Array<{ dayIndex: number, dayNum?: number, color: string }>} specs
 * @param {number} selectedDayIndex
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function registerDayPinImages(map, specs, selectedDayIndex, opts = {}) {
  const timeoutMs = Math.max(1500, Number(opts.timeoutMs) || 4000);
  const jobs = [];
  for (const spec of specs || []) {
    const dayIndex = Number(spec.dayIndex) || 0;
    const dayNum = Number(spec.dayNum) || dayIndex + 1;
    const color = dayMarkerMapFill(dayIndex, spec.color);
    for (const selected of [false, true]) {
      if (selected && dayIndex !== selectedDayIndex) continue;
      const id = dayPinImageId(dayIndex, dayNum, selected);
      if (map.hasImage(id)) continue;
      jobs.push(
        loadSvgImage(
          map,
          id,
          buildDayPinSvg(dayNum, color, { selected, dayIndex }),
          timeoutMs
        )
      );
    }
  }
  if (!jobs.length) return true;
  try {
    await Promise.all(jobs);
    return true;
  } catch {
    return false;
  }
}

export { MAX_ORDER as ACTIVITY_BALLOON_MAX_ORDER };
