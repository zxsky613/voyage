/** Goutte orange destination (sans numéro) — guide situation. */
export const DESTINATION_PIN_ORANGE = "#F16A2E";

export function buildDestinationPinSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="38" viewBox="0 0 32 38" role="img" aria-hidden="true">
  <path d="M16 36 C16 36 3.5 22.5 3.5 14.5 C3.5 7.5 9 3 16 3 C23 3 28.5 7.5 28.5 14.5 C28.5 22.5 16 36 16 36 Z" fill="${DESTINATION_PIN_ORANGE}"/>
  <circle cx="16" cy="13.5" r="4.5" fill="#FFFFFF"/>
</svg>`;
}

export const DESTINATION_PIN_IMAGE_ID = "destination-pin-orange";

/**
 * @param {import('maplibre-gl').Map} map
 * @returns {Promise<void>}
 */
export function registerDestinationPinImage(map) {
  if (map.hasImage(DESTINATION_PIN_IMAGE_ID)) return Promise.resolve();
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildDestinationPinSvg())}`;
  return new Promise((resolve, reject) => {
    map.loadImage(dataUrl, (err, image) => {
      if (err) {
        reject(err);
        return;
      }
      if (!map.hasImage(DESTINATION_PIN_IMAGE_ID)) {
        map.addImage(DESTINATION_PIN_IMAGE_ID, image, { pixelRatio: 2 });
      }
      resolve();
    });
  });
}
