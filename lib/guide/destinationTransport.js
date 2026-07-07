/**
 * Profils transport par destination — évite « métro/tram » sur îles / régions sans réseau urbain.
 */

const METRO_CITY_KEYS = new Set([
  "paris", "lyon", "marseille", "lille", "toulouse", "bordeaux", "nice", "nantes",
  "london", "barcelona", "madrid", "rome", "milan", "berlin", "munich", "hamburg",
  "amsterdam", "brussels", "bruxelles", "vienna", "vienne", "prague", "budapest",
  "warsaw", "stockholm", "oslo", "copenhagen", "copenhague", "helsinki", "dublin",
  "lisbon", "lisbonne", "porto", "athens", "athenes", "istanbul", "tokyo", "osaka",
  "kyoto", "seoul", "beijing", "shanghai", "guangzhou", "new york", "chicago",
  "san francisco", "los angeles", "toronto", "vancouver", "montreal", "singapore",
  "hong kong", "bangkok", "mumbai", "sydney", "melbourne",
]);

const ISLAND_OR_REGIONAL_KEYS = new Set([
  "crete", "santorini", "mykonos", "rhodes", "corfu", "bali", "phuket",
  "sicily", "sicile", "sardinia", "sardaigne", "corsica", "corse", "tenerife",
  "mallorca", "majorque", "ibiza", "malta", "malte", "cyprus", "chypre",
  "dubrovnik", "faroe", "iceland", "islande", "marrakech", "marrakesh",
]);

/**
 * @param {string} normalizedCatalogKey
 * @returns {'metro'|'island'|'general'}
 */
export function getDestinationTransportProfile(normalizedCatalogKey) {
  const k = String(normalizedCatalogKey || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (METRO_CITY_KEYS.has(k)) return "metro";
  if (ISLAND_OR_REGIONAL_KEYS.has(k)) return "island";
  return "general";
}

const LANG_FALLBACK = "en";

function pickLang(obj, lang) {
  const l = String(lang || "fr").toLowerCase().split("-")[0];
  return obj[l] || obj[LANG_FALLBACK] || obj.fr || "";
}

/**
 * Conseil liaison entre lieux — adapté au profil transport.
 * @param {string} profile
 * @param {string} label
 * @param {string} a
 * @param {string} b
 * @param {string} lang
 */
export function buildTransportLinkTip(profile, label, a, b, lang = "fr") {
  if (profile === "metro") {
    return pickLang(
      {
        fr: (l, x, y) =>
          `Relie ${x}, ${y} et le centre en métro, tram ou bus (ou à pied si c'est faisable) : garde une appli locale ou une carte hors ligne.`,
        en: (l, x, y) =>
          `Get between ${x}, ${y} and the centre by metro, tram or bus (or on foot if feasible): keep a local app or offline map handy.`,
        de: (l, x, y) =>
          `${x}, ${y} und das Zentrum mit Metro, Tram oder Bus verbinden (oder zu Fuß, wenn möglich): eine lokale App oder Offline-Karte bereithalten.`,
        es: (l, x, y) =>
          `Desplázate entre ${x}, ${y} y el centro en metro, tranvía o autobús (o a pie si es posible): ten una app local o un mapa sin conexión.`,
        it: (l, x, y) =>
          `Collegati tra ${x}, ${y} e il centro con metro, tram o bus (o a piedi se fattibile): tieni a portata di mano un'app locale o una mappa offline.`,
        zh: (l, x, y) =>
          `在${x}、${y}与市中心之间，乘坐地铁、有轨电车或公交出行（可步行的话也可以）：准备好本地交通应用或离线地图。`,
      },
      lang
    )(label, a, b);
  }

  if (profile === "island") {
    return pickLang(
      {
        fr: (l, x, y) =>
          `Sur ${l}, prévois voiture de location, bus interurbain ou ferry entre ${x} et ${y} — les distances sont longues, sans réseau urbain dense.`,
        en: (l, x, y) =>
          `On ${l}, plan a rental car, regional bus or ferry between ${x} and ${y} — distances are long and there is no dense urban rail network.`,
        de: (l, x, y) =>
          `Auf ${l} Mietwagen, Regionalbus oder Fähre zwischen ${x} und ${y} einplanen — die Strecken sind lang, es gibt kein U-Bahn-Netz.`,
        es: (l, x, y) =>
          `En ${l}, prevé coche de alquiler, autobús regional o ferry entre ${x} y ${y} — las distancias son largas y no hay metro.`,
        it: (l, x, y) =>
          `A ${l}, prevedi auto a noleggio, bus regionale o traghetto tra ${x} e ${y} — le distanze sono lunghe e non c'è metropolitana.`,
        zh: (l, x, y) =>
          `在${l}，${x}与${y}之间建议租车、区域巴士或渡轮——距离较远，没有地铁网络。`,
      },
      lang
    )(label, a, b);
  }

  return pickLang(
    {
      fr: (l, x, y) =>
        `Entre ${x}, ${y} et le centre, privilégie la marche dans les vieux quartiers et le bus régional — vérifie les horaires la veille.`,
      en: (l, x, y) =>
        `Between ${x}, ${y} and the centre, walk historic areas where you can and use regional buses — check timetables the day before.`,
      de: (l, x, y) =>
        `Zwischen ${x}, ${y} und dem Zentrum in Altstädten zu Fuß gehen und Regionalbusse nutzen — Fahrpläne am Vortag prüfen.`,
      es: (l, x, y) =>
        `Entre ${x}, ${y} y el centro, camina por los cascos históricos y usa autobuses regionales — consulta horarios la víspera.`,
      it: (l, x, y) =>
        `Tra ${x}, ${y} e il centro, cammina nei quartieri storici e usa bus regionali — controlla gli orari il giorno prima.`,
      zh: (l, x, y) =>
        `在${x}、${y}与市中心之间，老城步行结合区域公交——前一天确认班次。`,
    },
    lang
  )(label, a, b);
}
