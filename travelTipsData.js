/**
 * Conseils voyage par destination : priorité aux entrées explicites,
 * sinon modèles alimentés par les repères emblématiques (noms réels).
 */

const GENERIC_DONT = [
  "Évite les zones ultra-touristiques aux heures de pointe quand tu peux.",
  "Ne garde pas tous tes documents originaux dans le même sac.",
  "Méfie-toi des changeurs de rue et des offres trop pressantes.",
];

/** Raccourcit un libellé de lieu pour l’insérer dans une phrase. */
function shortPlaceLabel(raw) {
  const s = String(raw || "")
    .split(/\s—\s|\s-\s|,/)[0]
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
  return s.slice(0, 62) || "les sites phares";
}

/** Conseils génériques mais nommant la ville (villes hors catalogue / sans repères). */
function genericDo(label) {
  const n = String(label || "").trim() || "cette destination";
  return [
    `Pour ${n}, vérifie en amont les jours et heures d’ouverture des musées et monuments — beaucoup ferment un jour fixe ou l’après-midi.`,
    `Privilégie marche, vélo ou transports en commun dans le centre : c’est souvent plus rapide et moins cher que la voiture.`,
    `Télécharge une carte hors ligne ou repère une appli de transport locale avant d’arriver — le réseau n’est pas garanti partout.`,
  ];
}

function tipsFromIconicPlaces(displayLabel, places) {
  const label = String(displayLabel || "").trim() || "cette destination";
  const list = (places || []).map(String).filter(Boolean);
  if (list.length < 2) return null;
  const a = shortPlaceLabel(list[0]);
  const b = shortPlaceLabel(list[1]);
  const c = list[2] ? shortPlaceLabel(list[2]) : b;
  return [
    `À ${label}, pour ${a} et ${b}, réserve sur les sites officiels ou arrive à l’ouverture — les files explosent en haute saison.`,
    `Relie ${a}, ${b} et le centre en métro, tram ou bus (ou à pied si c’est faisable) : garde une appli locale ou une carte hors ligne.`,
    `Anticipe les coupures (lundi fermé, fermeture à midi) avant de verrouiller ton emploi du temps à ${label}, surtout pour ${c}.`,
  ];
}

/**
 * Conseils « experts » (3× do) pour une clé catalogue normalisée (cf. normalizeTextForSearch).
 * @param {string} normalizedCatalogKey
 * @param {string} displayLabel — nom affiché (canonique ou saisie)
 * @param {string[]} iconicPlaces — repères depuis iconicPlacesData.js ou repli exploration
 */
export function resolveTravelTips(normalizedCatalogKey, displayLabel, iconicPlaces = []) {
  const k = String(normalizedCatalogKey || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const label = String(displayLabel || "").trim() || "cette destination";

  if (k === "berne" || k === "bern") {
    return {
      do: [
        "La vieille ville de Berne (inscrite à l’UNESCO) et la Zytglogge se parcourent à pied — prévois de bonnes chaussures sur les pavés.",
        "Les musées (Einstein, beaux-arts, Zentrum Paul Klee) sont bondés le week-end : réserve un créneau ou passe en matinée.",
        "Depuis la gare centrale, les cartes demi-tarif ou billets journée SBB valent souvent le coup si tu fais des excursions vers les lacs ou l’Oberland.",
      ],
      dont: [...GENERIC_DONT],
    };
  }

  const explicit = TRAVEL_TIPS_OVERRIDES[k];
  if (explicit) {
    return { do: [...explicit.do], dont: [...(explicit.dont || GENERIC_DONT)] };
  }

  const fromIconic = tipsFromIconicPlaces(label, iconicPlaces);
  if (fromIconic) {
    return { do: fromIconic, dont: [...GENERIC_DONT] };
  }

  return { do: genericDo(label), dont: [...GENERIC_DONT] };
}

/**
 * Villes où les modèles génériques + lieux ne suffisent pas : nuances locales.
 * Clés = même normalisation que le catalogue / iconicPlacesData.
 */
const TRAVEL_TIPS_OVERRIDES = {
  paris: {
    do: [
      "Réserve tes billets coupe-file en ligne pour la tour Eiffel, le Louvre ou l’Orsay — les files sur place sont très longues en saison.",
      "Utilise le métro pour les grands axes, mais arpente le Marais, Montmartre ou le canal Saint-Martin à pied pour le charme des quartiers.",
      "Quelques mots de politesse en français (« Bonjour », « Merci », « S’il vous plaît ») facilitent beaucoup les échanges dans les cafés et boutiques.",
    ],
  },
  tokyo: {
    do: [
      "Achète une carte Suica ou Pasmo dès l’aéroport : elle sert pour trains, métros et la plupart des konbini.",
      "Évite Shibuya et Shinjuku à 18 h–20 h si tu détestes la foule ; les premiers trains le matin sont plus calmes pour Senso-ji ou Meiji.",
      "Beaucoup de restos n’acceptent que le cash : garde des yen sur toi, surtout dans les petites adresses.",
    ],
  },
  "new york": {
    do: [
      "Pour la Statue de la Liberté ou le sommet de l’Empire State / Edge, réserve des créneaux à l’avance sur les sites officiels.",
      "Le métro (MetroCard ou OMNY) est le plus fiable pour traverser Manhattan ; vérifie les travaux nocturnes le week-end.",
      "Central Park et Brooklyn Bridge sont gratuits : vise tôt le matin pour la lumière et moins de monde.",
    ],
  },
  istanbul: {
    do: [
      "Sainte-Sophie et la mosquée Bleue attirent la foule : passe en début de matinée et respecte tenue couvrante (foulard, pantalon long).",
      "Négocie calmement au Grand Bazar et au marché aux épices, mais fixe ton prix max avant d’entrer dans la discussion.",
      "Le ferry sur le Bosphore vaut le détour pour la vue ; la carte Istanbulkart simplifie tram, métro et bateaux publics.",
    ],
  },
  marrakech: {
    do: [
      "Fixe le prix des taxis (ou compteur) avant de monter, surtout depuis l’aéroport ou la médina.",
      "La place Jemaa el-Fna vit le soir : garde tes affaires en vue et refuse les « guides » non sollicités vers les souks.",
      "Le jardin Majorelle se visite mieux avec billet horaire réservé en ligne — souvent complet sur place.",
    ],
  },
  bali: {
    do: [
      "Respecte les offrandes et les cérémonies : ne marche pas sur les canang au sol et couvre épaules et jambes dans les temples.",
      "Les trajets Ubud–nord ou vers les temples prennent souvent plus longtemps que prévu : ne surcharge pas ta journée.",
      "Hydrate-toi et protège-toi du soleil : la chaleur est forte dès 10 h ; privilégie tôt le matin pour les rizières et les sites.",
    ],
  },
};
