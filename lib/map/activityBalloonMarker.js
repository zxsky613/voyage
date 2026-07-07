/** Orange activité JustTrip + numéro sur pastille blanche. */
export const ACTIVITY_BALLOON_ORANGE = "#F16A2E";
export const ACTIVITY_BALLOON_NUM = "#C2551F";

const MAX_ORDER = 10;

/**
 * Goutte / ballon avec pastille blanche et numéro d'ordre.
 * @param {number|string} orderNum
 * @param {{ selected?: boolean }} [opts]
 */
export function buildActivityBalloonSvg(orderNum, opts = {}) {
  const n = String(orderNum || "1");
  const selected = Boolean(opts.selected);
  const scale = selected ? 1.25 : 1;
  const w = Math.round(32 * scale);
  const h = Math.round(38 * scale);
  const ring = selected
    ? `<ellipse cx="16" cy="15" rx="15.5" ry="17.5" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 38" role="img" aria-hidden="true">
  ${ring}
  <path d="M16 36 C16 36 3.5 22.5 3.5 14.5 C3.5 7.5 9 3 16 3 C23 3 28.5 7.5 28.5 14.5 C28.5 22.5 16 36 16 36 Z" fill="${ACTIVITY_BALLOON_ORANGE}"/>
  <circle cx="16" cy="13.5" r="7.25" fill="#FFFFFF"/>
  <text x="16" y="17" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="700" fill="${ACTIVITY_BALLOON_NUM}">${n}</text>
</svg>`;
}

/** @param {number} order */
export function activityBalloonImageId(order, selected = false) {
  const o = Math.max(1, Math.min(MAX_ORDER, Number(order) || 1));
  return selected ? `activity-balloon-${o}-sel` : `activity-balloon-${o}`;
}

/**
 * @param {import('maplibre-gl').Map} map
 * @returns {Promise<void>}
 */
export function registerActivityBalloonImages(map) {
  const jobs = [];
  for (let i = 1; i <= MAX_ORDER; i += 1) {
    for (const selected of [false, true]) {
      const id = activityBalloonImageId(i, selected);
      if (map.hasImage(id)) continue;
      const svg = buildActivityBalloonSvg(i, { selected });
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      jobs.push(
        new Promise((resolve, reject) => {
          map.loadImage(dataUrl, (err, image) => {
            if (err) {
              reject(err);
              return;
            }
            if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 });
            resolve();
          });
        })
      );
    }
  }
  return Promise.all(jobs);
}

export { MAX_ORDER as ACTIVITY_BALLOON_MAX_ORDER };
