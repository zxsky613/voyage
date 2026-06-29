/**
 * Images héros « hors API » : bundles locaux + URLs Commons listées dans l’app.
 * Import partagé par App.jsx et les scripts de vérification.
 */

/** Couche 1 — `public/destinations/{slug}.jpg` (npm run fetch:destinations). */
export const BUNDLED_CITY_HERO_PATHS = Object.freeze({
  tokyo: "/destinations/tokyo.jpg",
  london: "/destinations/london.jpg",
  "new york": "/destinations/new-york.jpg",
  dubai: "/destinations/dubai.jpg",
  sydney: "/destinations/sydney.jpg",
  rome: "/destinations/rome.jpg",
  berlin: "/destinations/berlin.jpg",
  istanbul: "/destinations/istanbul.jpg",
  "los angeles": "/destinations/los-angeles.jpg",
  nice: "/destinations/nice.jpg",
  miami: "/destinations/miami.jpg",
  singapore: "/destinations/singapore.jpg",
  amsterdam: "/destinations/amsterdam.jpg",
  prague: "/destinations/prague.jpg",
  lyon: "/destinations/lyon.jpg",
  pisa: "/destinations/pisa.jpg",
  pise: "/destinations/pisa.jpg",
  shanghai: "/destinations/shanghai.jpg",
  beijing: "/destinations/beijing.jpg",
  pekin: "/destinations/beijing.jpg",
  marrakech: "/destinations/marrakech.jpg",
  phuket: "/destinations/phuket.jpg",
});

/** Couche 2 (b) — une URL figée par clé. */
export const CITY_HERO_IMAGE_URLS = Object.freeze({
  nice: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Nice_vue_du_Ch%C3%A2teau.jpg/1600px-Nice_vue_du_Ch%C3%A2teau.jpg",
});

/** Couche 2 (c) — listes par clé. */
export const CITY_HERO_IMAGE_URL_LISTS = Object.freeze({
  "los angeles": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Los_Angeles_Panorama_from_Griffith_Observatory_2013.jpg/1920px-Los_Angeles_Panorama_from_Griffith_Observatory_2013.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Hollywood_Sign.jpg/1920px-Hollywood_Sign.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Griffith_Observatory%2C_Los_Angeles_2011.jpg/1920px-Griffith_Observatory%2C_Los_Angeles_2011.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Griffith_Observatory%2C_Los_Angeles_2011.jpg/1280px-Griffith_Observatory%2C_Los_Angeles_2011.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/d/d0/Griffith_Observatory%2C_Los_Angeles_2011.jpg",
  ],
});
