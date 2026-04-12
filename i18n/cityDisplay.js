/**
 * Affichage des noms de villes selon la langue UI (le catalogue / les données peuvent être en forme française).
 */

const LANG_TAG = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
  zh: "zh-CN",
};

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Clé = normalizeTextForSearch du nom canonique du catalogue (ou variante usuelle). */
const NAMES = {
  paris: { fr: "Paris", en: "Paris", de: "Paris", es: "París", it: "Parigi", zh: "巴黎" },
  lyon: { fr: "Lyon", en: "Lyon", de: "Lyon", es: "Lyon", it: "Lione", zh: "里昂" },
  marseille: { fr: "Marseille", en: "Marseille", de: "Marseille", es: "Marsella", it: "Marsiglia", zh: "马赛" },
  nice: { fr: "Nice", en: "Nice", de: "Nizza", es: "Niza", it: "Nizza", zh: "尼斯" },
  monaco: { fr: "Monaco", en: "Monaco", de: "Monaco", es: "Mónaco", it: "Monaco", zh: "摩纳哥" },
  bordeaux: { fr: "Bordeaux", en: "Bordeaux", de: "Bordeaux", es: "Burdeos", it: "Bordeaux", zh: "波尔多" },
  toulouse: { fr: "Toulouse", en: "Toulouse", de: "Toulouse", es: "Toulouse", it: "Tolosa", zh: "图卢兹" },
  lille: { fr: "Lille", en: "Lille", de: "Lille", es: "Lille", it: "Lilla", zh: "里尔" },
  nantes: { fr: "Nantes", en: "Nantes", de: "Nantes", es: "Nantes", it: "Nantes", zh: "南特" },
  tokyo: { fr: "Tokyo", en: "Tokyo", de: "Tokio", es: "Tokio", it: "Tokyo", zh: "东京" },
  kyoto: { fr: "Kyoto", en: "Kyoto", de: "Kyoto", es: "Kioto", it: "Kyoto", zh: "京都" },
  osaka: { fr: "Osaka", en: "Osaka", de: "Osaka", es: "Osaka", it: "Osaka", zh: "大阪" },
  seoul: { fr: "Séoul", en: "Seoul", de: "Seoul", es: "Seúl", it: "Seul", zh: "首尔" },
  bangkok: { fr: "Bangkok", en: "Bangkok", de: "Bangkok", es: "Bangkok", it: "Bangkok", zh: "曼谷" },
  singapore: { fr: "Singapour", en: "Singapore", de: "Singapur", es: "Singapur", it: "Singapore", zh: "新加坡" },
  bali: { fr: "Bali", en: "Bali", de: "Bali", es: "Bali", it: "Bali", zh: "巴厘岛" },
  jakarta: { fr: "Jakarta", en: "Jakarta", de: "Jakarta", es: "Yakarta", it: "Giacarta", zh: "雅加达" },
  beijing: { fr: "Pékin", en: "Beijing", de: "Peking", es: "Pekín", it: "Pechino", zh: "北京" },
  shanghai: { fr: "Shanghai", en: "Shanghai", de: "Shanghai", es: "Shanghái", it: "Shanghai", zh: "上海" },
  guangzhou: { fr: "Canton", en: "Guangzhou", de: "Guangzhou", es: "Cantón", it: "Canton", zh: "广州" },
  "new york": { fr: "New York", en: "New York", de: "New York", es: "Nueva York", it: "New York", zh: "纽约" },
  "los angeles": { fr: "Los Angeles", en: "Los Angeles", de: "Los Angeles", es: "Los Ángeles", it: "Los Angeles", zh: "洛杉矶" },
  "san francisco": { fr: "San Francisco", en: "San Francisco", de: "San Francisco", es: "San Francisco", it: "San Francisco", zh: "旧金山" },
  miami: { fr: "Miami", en: "Miami", de: "Miami", es: "Miami", it: "Miami", zh: "迈阿密" },
  chicago: { fr: "Chicago", en: "Chicago", de: "Chicago", es: "Chicago", it: "Chicago", zh: "芝加哥" },
  toronto: { fr: "Toronto", en: "Toronto", de: "Toronto", es: "Toronto", it: "Toronto", zh: "多伦多" },
  vancouver: { fr: "Vancouver", en: "Vancouver", de: "Vancouver", es: "Vancouver", it: "Vancouver", zh: "温哥华" },
  london: { fr: "Londres", en: "London", de: "London", es: "Londres", it: "Londra", zh: "伦敦" },
  barcelona: { fr: "Barcelone", en: "Barcelona", de: "Barcelona", es: "Barcelona", it: "Barcellona", zh: "巴塞罗那" },
  madrid: { fr: "Madrid", en: "Madrid", de: "Madrid", es: "Madrid", it: "Madrid", zh: "马德里" },
  rome: { fr: "Rome", en: "Rome", de: "Rom", es: "Roma", it: "Roma", zh: "罗马" },
  milan: { fr: "Milan", en: "Milan", de: "Mailand", es: "Milán", it: "Milano", zh: "米兰" },
  venise: { fr: "Venise", en: "Venice", de: "Venedig", es: "Venecia", it: "Venezia", zh: "威尼斯" },
  berlin: { fr: "Berlin", en: "Berlin", de: "Berlin", es: "Berlín", it: "Berlino", zh: "柏林" },
  amsterdam: { fr: "Amsterdam", en: "Amsterdam", de: "Amsterdam", es: "Ámsterdam", it: "Amsterdam", zh: "阿姆斯特丹" },
  bruxelles: { fr: "Bruxelles", en: "Brussels", de: "Brüssel", es: "Bruselas", it: "Bruxelles", zh: "布鲁塞尔" },
  berne: { fr: "Berne", en: "Bern", de: "Bern", es: "Berna", it: "Berna", zh: "伯尔尼" },
  lisbonne: { fr: "Lisbonne", en: "Lisbon", de: "Lissabon", es: "Lisboa", it: "Lisbona", zh: "里斯本" },
  porto: { fr: "Porto", en: "Porto", de: "Porto", es: "Oporto", it: "Porto", zh: "波尔图" },
  prague: { fr: "Prague", en: "Prague", de: "Prag", es: "Praga", it: "Praga", zh: "布拉格" },
  vienne: { fr: "Vienne", en: "Vienna", de: "Wien", es: "Viena", it: "Vienna", zh: "维也纳" },
  budapest: { fr: "Budapest", en: "Budapest", de: "Budapest", es: "Budapest", it: "Budapest", zh: "布达佩斯" },
  athenes: { fr: "Athènes", en: "Athens", de: "Athen", es: "Atenas", it: "Atene", zh: "雅典" },
  istanbul: { fr: "Istanbul", en: "Istanbul", de: "Istanbul", es: "Estambul", it: "Istanbul", zh: "伊斯坦布尔" },
  dubai: { fr: "Dubaï", en: "Dubai", de: "Dubai", es: "Dubái", it: "Dubai", zh: "迪拜" },
  doha: { fr: "Doha", en: "Doha", de: "Doha", es: "Doha", it: "Doha", zh: "多哈" },
  "abu dhabi": { fr: "Abou Dabi", en: "Abu Dhabi", de: "Abu Dhabi", es: "Abu Dabi", it: "Abu Dhabi", zh: "阿布扎比" },
  "le caire": { fr: "Le Caire", en: "Cairo", de: "Kairo", es: "El Cairo", it: "Il Cairo", zh: "开罗" },
  marrakech: { fr: "Marrakech", en: "Marrakesh", de: "Marrakesch", es: "Marrakech", it: "Marrakech", zh: "马拉喀什" },
  tunis: { fr: "Tunis", en: "Tunis", de: "Tunis", es: "Túnez", it: "Tunisi", zh: "突尼斯" },
  alger: { fr: "Alger", en: "Algiers", de: "Algier", es: "Argel", it: "Algeri", zh: "阿尔及尔" },
  sydney: { fr: "Sydney", en: "Sydney", de: "Sydney", es: "Sídney", it: "Sydney", zh: "悉尼" },
  melbourne: { fr: "Melbourne", en: "Melbourne", de: "Melbourne", es: "Melbourne", it: "Melbourne", zh: "墨尔本" },
  auckland: { fr: "Auckland", en: "Auckland", de: "Auckland", es: "Auckland", it: "Auckland", zh: "奥克兰" },
  "cape town": { fr: "Le Cap", en: "Cape Town", de: "Kapstadt", es: "Ciudad del Cabo", it: "Città del Capo", zh: "开普敦" },
  "rio de janeiro": { fr: "Rio de Janeiro", en: "Rio de Janeiro", de: "Rio de Janeiro", es: "Río de Janeiro", it: "Rio de Janeiro", zh: "里约热内卢" },
  "sao paulo": { fr: "São Paulo", en: "São Paulo", de: "São Paulo", es: "São Paulo", it: "San Paolo", zh: "圣保罗" },
  phuket: { fr: "Phuket", en: "Phuket", de: "Phuket", es: "Phuket", it: "Phuket", zh: "普吉岛" },
  mykonos: { fr: "Mykonos", en: "Mykonos", de: "Mykonos", es: "Mykonos", it: "Mykonos", zh: "米科诺斯" },
};

/** Variantes de saisie / stockage → clé dans NAMES. */
const KEY_ALIASES = {
  barcelone: "barcelona",
  venice: "venise",
  londres: "london",
  pekin: "beijing",
  peking: "beijing",
  canton: "guangzhou",
  kwangchow: "guangzhou",
  cairo: "le caire",
  roma: "rome",
  milano: "milan",
  bern: "berne",
  lisbon: "lisbonne",
  vienna: "vienne",
  athens: "athenes",
  algiers: "alger",
  marrakesh: "marrakech",
  myconos: "mykonos",
};

/** Libellé catalogue App.jsx / CITY_CATALOG (une entrée par clé NAMES). */
const KEY_TO_CATALOG_CITY = {
  paris: "Paris",
  lyon: "Lyon",
  marseille: "Marseille",
  nice: "Nice",
  monaco: "Monaco",
  bordeaux: "Bordeaux",
  toulouse: "Toulouse",
  lille: "Lille",
  nantes: "Nantes",
  tokyo: "Tokyo",
  kyoto: "Kyoto",
  osaka: "Osaka",
  seoul: "Seoul",
  bangkok: "Bangkok",
  singapore: "Singapore",
  bali: "Bali",
  jakarta: "Jakarta",
  beijing: "Beijing",
  shanghai: "Shanghai",
  guangzhou: "Guangzhou",
  "new york": "New York",
  "los angeles": "Los Angeles",
  "san francisco": "San Francisco",
  miami: "Miami",
  chicago: "Chicago",
  toronto: "Toronto",
  vancouver: "Vancouver",
  london: "London",
  barcelona: "Barcelona",
  madrid: "Madrid",
  rome: "Rome",
  milan: "Milan",
  venise: "Venise",
  berlin: "Berlin",
  amsterdam: "Amsterdam",
  bruxelles: "Bruxelles",
  berne: "Berne",
  lisbonne: "Lisbonne",
  porto: "Porto",
  prague: "Prague",
  vienne: "Vienne",
  budapest: "Budapest",
  athenes: "Athènes",
  istanbul: "Istanbul",
  dubai: "Dubai",
  doha: "Doha",
  "abu dhabi": "Abu Dhabi",
  "le caire": "Le Caire",
  marrakech: "Marrakech",
  tunis: "Tunis",
  alger: "Alger",
  sydney: "Sydney",
  melbourne: "Melbourne",
  auckland: "Auckland",
  "cape town": "Cape Town",
  "rio de janeiro": "Rio de Janeiro",
  "sao paulo": "Sao Paulo",
  phuket: "Phuket",
  mykonos: "Mykonos",
};

function normalizeLocalSearchQuery(s) {
  return String(s || "").trim().toLowerCase();
}

/** Libellé localisé → libellés catalogue (plusieurs si collision rare). */
const LOCALIZED_LABEL_TO_CATALOG = new Map();

function registerLocalizedCityLabel(label, catalogCity) {
  const k = normalizeLocalSearchQuery(label);
  if (!k || !catalogCity) return;
  if (!LOCALIZED_LABEL_TO_CATALOG.has(k)) LOCALIZED_LABEL_TO_CATALOG.set(k, new Set());
  LOCALIZED_LABEL_TO_CATALOG.get(k).add(catalogCity);
}

(function buildLocalizedCitySearchIndex() {
  for (const key of Object.keys(NAMES)) {
    const catalog = KEY_TO_CATALOG_CITY[key];
    if (!catalog) continue;
    const row = NAMES[key];
    for (const label of Object.values(row)) {
      registerLocalizedCityLabel(label, catalog);
    }
  }
  for (const [aliasKey, targetKey] of Object.entries(KEY_ALIASES)) {
    const catalog = KEY_TO_CATALOG_CITY[targetKey];
    if (!catalog) continue;
    registerLocalizedCityLabel(aliasKey.replace(/_/g, " "), catalog);
  }
})();

/**
 * Recherche saisie dans la langue UI (ex. 首尔, Mailand, Londres) → villes du catalogue interne.
 */
export function catalogCityHitsForLocalizedQuery(query) {
  const q = normalizeLocalSearchQuery(query);
  if (q.length < 1) return [];
  const exact = LOCALIZED_LABEL_TO_CATALOG.get(q);
  if (exact && exact.size) return [...exact];
  const hits = new Set();
  for (const [key, set] of LOCALIZED_LABEL_TO_CATALOG.entries()) {
    if (key.startsWith(q)) {
      for (const c of set) hits.add(c);
    }
  }
  return [...hits];
}

function resolveNameKey(raw) {
  const k = norm(raw);
  if (NAMES[k]) return k;
  const alias = KEY_ALIASES[k];
  if (alias && NAMES[alias]) return alias;
  return k;
}

function titleCaseForLocale(raw, lang) {
  const tag = LANG_TAG[lang] || LANG_TAG.en;
  const s = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return "";
  return s
    .split(" ")
    .map((part) =>
      part
        .split("-")
        .map((seg) =>
          seg ? seg.charAt(0).toLocaleUpperCase(tag) + seg.slice(1).toLocaleLowerCase(tag) : seg
        )
        .join("-")
    )
    .join(" ");
}

/**
 * @param {string} raw — titre / destination tels qu’en base ou au catalogue
 * @param {string} language — code app : fr | en | de | es | it | zh
 */
export function displayCityForLocale(raw, language) {
  const code = String(language || "fr").toLowerCase();
  const k = resolveNameKey(raw);
  const row = NAMES[k];
  if (row && row[code]) return row[code];
  if (row) return row.en || row.fr || titleCaseForLocale(raw, code);
  return titleCaseForLocale(raw, code);
}
