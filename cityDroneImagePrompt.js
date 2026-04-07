/**
 * Briefs « drone shot » pour l’app : scène narrative FR + requête Unsplash EN.
 * Classification balnéaire / urbaine-historique ; style technique constant (brief IA + stock).
 */

import { ICONIC_PLACES_CANONICAL } from "./iconicPlacesData.js";

export const STYLE_TECHNIQUE_FR =
  "Style technique : photographie de voyage haut de gamme, vue drone, résolution 8k, lumière cinématique, prise type DJI Mavic 3 Pro f/2.8, hyper-réaliste, couleurs vives mais naturelles, sans déformation des bâtiments.";

export const STYLE_TECHNIQUE_EN =
  "High-end travel photography, drone shot, 8k resolution, cinematic lighting, shot on DJI Mavic 3 Pro, f/2.8, hyper-realistic, vivid but natural colors, no distorted buildings.";

function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Villes / clés traitées comme scènes « balnéaire / île » pour le texte FR et le repli. */
const COASTAL_KEYS = new Set(
  [
    "phuket", "bali", "cancun", "nice", "miami", "antalya", "krabi", "pattaya", "cebu", "durban",
    "tel aviv", "majorque", "mallorca", "malaga", "agadir", "djerba", "curacao", "willemstad", "jeju",
    "male", "monaco", "lima", "dubrovnik", "sydney", "vancouver", "barcelone", "barcelona", "marseille",
    "copenhagen", "genoa", "genes", "porto", "lisbonne", "lisbon", "venise", "venice", "alicante",
    "rhodes", "lagos", "mactan", "caribbean", "hainan", "bora", "zanzibar", "seychelles", "maldives",
    "sentosa", "langkawi", "samui", "nha trang", "da nang", "varadero", "gold coast", "bondi", "phu quoc",
    "ibiza", "mykonos", "santorini", "santorin", "tulum", "hawaii", "honolulu", "maui",
    "barbados", "barbade", "martinique", "guadeloupe", "tahiti", "bora bora", "fiji", "fidji",
    "mauritius", "ile maurice", "maurice", "cabo san lucas", "cabo", "corfou", "corfu",
    "sardaigne", "sardinia", "crete", "koh samui", "koh phangan", "koh phi phi", "phi phi",
    "marbella", "tenerife", "fuerteventura", "lanzarote", "gran canaria", "formentera",
  ].map((x) => normalizeKey(x))
);

const COASTAL_SUBSTRINGS = [
  "plage", "beach", "island", "ile", "île", "atoll", "lagoon", "lagon", "cote d", "riviera",
  "caribbean", "mediterranean coast", "ocean drive", "bay ", " baie", "coast", "coral", "récif",
];

function inferSceneFr(displayCity, kind) {
  const name = String(displayCity || "").trim() || "la destination";
  if (kind === "coastal") {
    return `Composition en vue plongeante ou grand angle sur le littoral emblématique de ${name} : eau turquoise cristalline, sable fin, végétation tropicale ou méditerranéenne, embarcations locales, ambiance lumineuse, estivale et paradisiaque.`;
  }
  return `Vue aérienne stabilisée au golden hour, champ visuel large (type panorama urbain) sur le monument ou la skyline la plus célèbre de ${name}, ensemble de la ville et du paysage lisibles, sujet net comme point focal, tissu urbain caractéristique autour (toits, néons ou patrimoine), ambiance cinématique et prestigieuse.`;
}

/**
 * Scènes FR « sur mesure » (table fournie + catalogue app). Les autres passent par inferSceneFr.
 */
const CURATED_SCENE_FR = {
  paris:
    "Vue aérienne cinématique de la Tour Eiffel émergeant des toits de Paris au coucher du soleil, vues depuis le Trocadéro, immeubles haussmanniens, balcons en fer forgé et rues pavées romantiques.",
  phuket:
    "Drone shot de la baie de Phang Nga près de Phuket : eau émeraude, falaises de calcaire abruptes, bateaux long-tail sur le sable blanc, jungle luxuriante et plages de sable fin.",
  bangkok:
    "Survol du Grand Palais et de Wat Arun au crépuscule, temples dorés, fleuve Chao Phraya et architecture thaïlandaise ornée.",
  "hong kong":
    "Victoria Harbour et skyline depuis les hauteurs : gratte-ciel denses, néons urbains, montagnes verdoyantes et mer.",
  london:
    "Big Ben et Palais de Westminster : architecture gothique victorienne, Tamise, bus rouges et ambiance monumentale au golden hour.",
  londres:
    "Big Ben et Palais de Westminster : architecture gothique victorienne, Tamise, bus rouges et ambiance monumentale au golden hour.",
  macao: "Ruines de Saint-Paul et hôtels-casinos de Cotai : mix colonial portugais et architecture moderne démesurée.",
  macau: "Ruines de Saint-Paul et hôtels-casinos de Cotai : mix colonial portugais et architecture moderne démesurée.",
  istanbul:
    "Mosquée Bleue et Sainte-Sophie : dômes massifs, minarets, vue sur le Bosphore, contrastes entre Europe et Asie.",
  dubai: "Burj Khalifa et fontaines de Dubaï : futurisme extrême, acier et verre, luxe désertique, éclairage doré.",
  "abu dhabi": "Grande Mosquée Cheikh Zayed : marbre blanc, mosaïques florales, luxe désertique et architecture islamique moderne.",
  "abou dhabi": "Grande Mosquée Cheikh Zayed : marbre blanc, mosaïques florales, luxe désertique et architecture islamique moderne.",
  mecca: "Masjid al-Haram : architecture monumentale sacrée, marbre blanc, Kaaba centrale, vues aériennes respectueuses.",
  "la mecque": "Masjid al-Haram : architecture monumentale sacrée, marbre blanc, Kaaba centrale, vues aériennes respectueuses.",
  antalya: "Vieux port de Kaleiçi et falaises : toits de tuiles rouges, Méditerranée turquoise, montagnes au loin.",
  "kuala lumpur": "Tours Petronas : jumelles en acier et verre, parcs tropicaux au pied des gratte-ciel.",
  singapore:
    "Gardens by the Bay et Marina Bay Sands : Supertrees futuristes, verdure tropicale intégrée à l’urbain.",
  tokyo:
    "Carrefour de Shibuya et Tokyo Tower : écrans géants, technologie, foule ordonnée, skyline néon au crépuscule.",
  seoul:
    "Palais Gyeongbokgung et N Seoul Tower : pavillons traditionnels coréens entourés de gratte-ciel modernes.",
  "new york":
    "Statue de la Liberté et skyline de Manhattan : Empire State, taxis jaunes, gratte-ciel brique et verre.",
  madrid: "Palais Royal et Plaza Mayor : architecture royale imposante, pierre blanche, grandes places ensoleillées.",
  rome: "Colisée et Forum Romain : ruines antiques d’ocre, cyprès, places baroques, lumière chaude.",
  cancun: "Playa Delfines et mer des Caraïbes : sable blanc éclatant, eau bleu turquoise, front de mer.",
  barcelone: "Sagrada Família et parc Güell : architecture organique de Gaudí, Méditerranée au loin.",
  barcelona: "Sagrada Família et parc Güell : architecture organique de Gaudí, Méditerranée au loin.",
  milan: "Duomo di Milano : cathédrale gothique en marbre blanc, galeries élégantes, capitale de la mode.",
  milano: "Duomo di Milano : cathédrale gothique en marbre blanc, galeries élégantes, capitale de la mode.",
  osaka: "Château d’Osaka et Dotonbori : historique et douves, néons urbains et canaux.",
  amsterdam:
    "Canaux du centre et maisons étroites du XVIIe : ponts, briques rouges, vélos, atmosphère maritime.",
  vienne:
    "Palais de Schönbrunn et cathédrale Saint-Étienne : baroque autrichien impérial, jardins symétriques.",
  vienna:
    "Palais de Schönbrunn et cathédrale Saint-Étienne : baroque autrichien impérial, jardins symétriques.",
  taipei: "Tour Taipei 101 au crépuscule : gratte-ciel futuriste, montagnes brumeuses en arrière-plan.",
  pattaya: "Plage de Pattaya et Sanctuaire de la Vérité : littoral doré, temple massif en bois sculpté, mer tropicale.",
  prague: "Pont Charles et château : médiéval gothique, flèches, Vltava et toits de tuiles rouges.",
  shenzhen: "Tour Ping An et skyline de Nanshan : ultra-moderne, parcs technologiques, verdure tropicale urbaine.",
  berlin: "Porte de Brandebourg et Reichstag : larges avenues, néo-classique et moderne, histoire imposante.",
  seville: "Plaza de España et Giralda : azulejos colorés, briques chaudes, jardins d’orangers, soleil andalou.",
  medina: "Al-Masjid an-Nabawi : parasols blancs, marbre immaculé, minarets majestueux.",
  medine: "Al-Masjid an-Nabawi : parasols blancs, marbre immaculé, minarets majestueux.",
  florence: "Duomo Santa Maria del Fiore : Renaissance italienne, dôme de briques rouges, vue sur l’Arno.",
  dublin: "Temple Bar et Trinity College : façades de pubs colorées, pavés anciens, bibliothèques historiques.",
  "ho chi minh":
    "Cathédrale Notre-Dame et tour Bitexco : contraste architecture coloniale française et gratte-ciel modernes.",
  bali: "Rizières de Tegalalang et temple d’Uluwatu : jungle luxuriante, falaises sur l’océan Indien, temples balinais.",
  guangzhou: "Tour de Canton et rivière des Perles : structure torsadée lumineuse, ponts modernes, skyline dense.",
  lisbonne: "Tour de Belém et Alfama : azulejos bleus, tramways jaunes, collines escarpées, Tage.",
  lisbon: "Tour de Belém et Alfama : azulejos bleus, tramways jaunes, collines escarpées, Tage.",
  "los angeles":
    "Panneau Hollywood et jetée de Santa Monica : palmiers, coucher de soleil californien, Pacifique, collines.",
  johannesburg:
    "Pont Nelson Mandela et Sandton : urbain chic, gratte-ciel, savane au loin sous lumière dorée.",
  miami: "South Beach et baie de Miami : plage de sable blanc, eau turquoise, skyline sur la baie, palmiers.",
  "las vegas": "Le Strip et fontaines du Bellagio : démesure, casinos iconiques, lumières nocturnes, désert.",
  orlando: "Parcs Disney et Universal : châteaux féeriques, lacs, palmiers de Floride, ambiance spectaculaire.",
  venise: "Grand Canal et basilique Saint-Marc : palais gothiques sur l’eau, gondoles, pont du Rialto.",
  venice: "Grand Canal et basilique Saint-Marc : palais gothiques sur l’eau, gondoles, pont du Rialto.",
  budapest:
    "Parlement hongrois et Bastion des Pêcheurs : monumental, gothique, Danube bleu, ponts de fer.",
  marseille: "Notre-Dame de la Garde et Vieux-Port : calanques de calcaire, Méditerranée, forts historiques.",
  malaga: "Alcazaba et port moderne : forteresse mauresque, palmiers, plages de sable fin.",
  majorque: "Cathédrale de la Seu et baie de Palma : gothique méditerranéen, criques turquoise, montagnes.",
  mallorca: "Cathédrale de la Seu et baie de Palma : gothique méditerranéen, criques turquoise, montagnes.",
  valence: "Cité des Arts et des Sciences : structures blanches organiques de Calatrava, bassins d’eau plate.",
  valencia: "Cité des Arts et des Sciences : structures blanches organiques de Calatrava, bassins d’eau plate.",
  "tel aviv": "Plage Gordon et front de mer : urbain balnéaire, Bauhaus, sable doré, mer chaude.",
  riyadh: "Kingdom Centre et skyline financier : gratte-ciel en arche, désert ocre, lumières futuristes.",
  zhuhai: "Opéra de Zhuhai en forme de coquillage : design maritime, îles côtiennes, pont maritime.",
  moscow: "Place Rouge et cathédrale Saint-Basile : dômes en bulbe colorés, pavés, architecture impériale russe.",
  moscou: "Place Rouge et cathédrale Saint-Basile : dômes en bulbe colorés, pavés, architecture impériale russe.",
  "le caire": "Pyramides de Gizeh et Nil : antique, désert doré, palmiers, contraste avec la ville.",
  cairo: "Pyramides de Gizeh et Nil : antique, désert doré, palmiers, contraste avec la ville.",
  copenhagen: "Nyhavn : façades multicolores, voiliers, design scandinave épuré, lumière douce.",
  sofia: "Cathédrale Alexandre-Nevski : dômes dorés et verts, orthodoxe, montagnes Vitosha en arrière-plan.",
  hanoi: "Lac Hoan Kiem et vieux quartier : pagodes, arbres tropicaux, street-food, architecture coloniale.",
  marrakech: "Jemaa el-Fna et Koutoubia : ocre rouge, Majorelle, souks, palmeraie au pied de l’Atlas.",
  warsaw: "Vieille ville Stare Miasto : briques rouges, places royales, jardins de palais.",
  varsovie: "Vieille ville Stare Miasto : briques rouges, places royales, jardins de palais.",
  munich: "Marienplatz et nouvel hôtel de ville : néo-gothique, clochers bavarois, parcs verdoyants.",
  edinburgh: "Château et Royal Mile : pierre sombre médiévale, collines volcaniques, brume écossaise.",
  edimbourg: "Château et Royal Mile : pierre sombre médiévale, collines volcaniques, brume écossaise.",
  zurich: "Lac de Zurich et vieille ville : Alpes, eau cristalline, toits et clochers, ambiance luxe discret.",
  stockholm: "Gamla Stan et archipel : maisons ocre et rouges, canaux, architecture royale nordique.",
  "buenos aires": "La Boca et Obélisque : maisons colorées, tango, larges avenues européennes, parcs.",
  nice: "Promenade des Anglais et baie des Anges : galets, mer bleu azur, façades niçoises ocres, palmiers.",
  bruxelles: "Grand-Place et Atomium : architecture ornementée dorée, pavés, futurisme des années 50.",
  brussels: "Grand-Place et Atomium : architecture ornementée dorée, pavés, futurisme des années 50.",
  krabi: "Railay et pitons rocheux : falaises calcaires dans l’eau, jungle, long-tail boats, plages sauvages.",
  doha: "Musée d’art islamique et West Bay : géométrie, gratte-ciel brillants, baie.",
  "chiang mai": "Wat Phra That Doi Suthep : montagnes tropicales, temples dorés, nature du nord.",
  jeddah: "Fontaine du Roi Fahd et Al-Balad : corail sculpté, mer Rouge, gratte-ciel ultra-modernes.",
  curacao: "Quai Punda Willemstad : maisons multicolores, architecture hollandaise tropicale, eau bleu intense.",
  willemstad: "Quai Punda Willemstad : maisons multicolores, architecture hollandaise tropicale, eau bleu intense.",
  lagos: "Pont de l’île et plages : urbain dense, lagunes, énergie ouest-africaine, littoral.",
  athens: "Acropole et Parthénon : marbre blanc, oliviers, collines sèches, ville blanche dense.",
  athenes: "Acropole et Parthénon : marbre blanc, oliviers, collines sèches, ville blanche dense.",
  rhodes: "Palais des Grands Maîtres et Mandraki : citadelle médiévale, mer Égée, remparts en pierre.",
  ibiza: "Cala Comte au coucher du soleil : eau turquoise cristalline, rochers dorés, sable blanc, bateaux en bois, ambiance festive et paradisiaque des Baléares.",
  formentera: "Playa de Ses Illetes : eaux translucides bleu turquoise, banc de sable blanc, Méditerranée calme, paysage caribéen en Europe.",
  mykonos: "Plages de sable fin et eaux turquoise : moulins à vent blancs, architecture cycladique, Méditerranée scintillante.",
  santorini: "Caldeira et village blanc sur falaise : dômes bleus, eau d'un bleu profond, coucher de soleil volcanique emblématique.",
  santorin: "Caldeira et village blanc sur falaise : dômes bleus, eau d'un bleu profond, coucher de soleil volcanique emblématique.",
  tulum: "Ruines mayas sur falaise surplombant une plage de sable blanc et eau turquoise des Caraïbes, jungle tropicale.",
  hawaii: "Plage de Waikiki et Diamond Head : sable doré, eau turquoise, palmiers, montagnes verdoyantes.",
  honolulu: "Waikiki Beach et Diamond Head : sable doré, eaux turquoise du Pacifique, palmiers, volcans.",
  maui: "Plage de Ka'anapali : sable doré, eau turquoise, falaises verdoyantes, coucher de soleil hawaiien.",
  martinique: "Anse des Salines : cocotiers, sable blanc, eau turquoise des Caraïbes, île volcanique tropicale.",
  guadeloupe: "Plage de la Caravelle : lagon turquoise, sable blanc, cocotiers, île papillon tropicale.",
  tahiti: "Lagon de Moorea : eau turquoise cristalline, bungalows sur pilotis, montagnes verdoyantes.",
  "bora bora": "Lagon de Bora Bora : eau turquoise irréelle, bungalows sur pilotis, mont Otemanu volcanique.",
  fiji: "Plages de sable blanc et eaux turquoise : récifs coralliens, palmiers, paradis du Pacifique Sud.",
  fidji: "Plages de sable blanc et eaux turquoise : récifs coralliens, palmiers, paradis du Pacifique Sud.",
  mauritius: "Plage du Morne Brabant : eau turquoise, sable blanc, montagne volcanique, île tropicale de l'océan Indien.",
  "ile maurice": "Plage du Morne Brabant : eau turquoise, sable blanc, montagne volcanique, île tropicale de l'océan Indien.",
  maurice: "Plage du Morne Brabant : eau turquoise, sable blanc, montagne volcanique, île tropicale de l'océan Indien.",
  barbados: "Plages de la côte ouest : sable blanc, eau turquoise des Caraïbes, palmiers, ambiance tropicale.",
  barbade: "Plages de la côte ouest : sable blanc, eau turquoise des Caraïbes, palmiers, ambiance tropicale.",
  marbella: "Puerto Banus et plages dorées : Méditerranée bleue, palmiers, luxe de la Costa del Sol.",
  tenerife: "Plage de Las Teresitas : sable doré, eau turquoise, volcan Teide en arrière-plan, Canaries.",
  corfou: "Plages de Canal d'Amour : falaises de grès, eau turquoise, végétation méditerranéenne.",
  corfu: "Canal d'Amour beach : sandstone cliffs, turquoise water, Mediterranean vegetation.",
  sardaigne: "Costa Smeralda : criques de sable blanc, eau turquoise transparente, rochers de granit, maquis.",
  sardinia: "Costa Smeralda : white sand coves, crystal-clear turquoise water, granite rocks, Mediterranean.",
  crete: "Balos lagoon : plage de sable rose, eau turquoise peu profonde, paysage sauvage crétois.",
  djerba: "Houmt Souk et plages : maisons blanches à dômes, oliviers, Méditerranée calme.",
  agadir: "Baie et kasbah : longue plage, promenade, collines arides marocaines.",
  bucharest: "Palais du Parlement et arc de triomphe : architecture colossale, avenues, parcs.",
  bucarest: "Palais du Parlement et arc de triomphe : architecture colossale, avenues, parcs.",
  dubrovnik: "Remparts et mer Adriatique : pierres blanches, toits orange, eau turquoise.",
  "washington dc": "Capitole et Lincoln Memorial : néo-classique blanc, parcs et musées, monumental.",
  washington: "Capitole et Lincoln Memorial : néo-classique blanc, parcs et musées, monumental.",
  montreal: "Vieux-Port et Mont Royal : briques européennes, gratte-ciel, fleuve Saint-Laurent.",
  "saint-petersbourg": "Ermitage et canaux : baroque opulent, palais vert et blanc, reflets sur la Neva.",
  "saint petersbourg": "Ermitage et canaux : baroque opulent, palais vert et blanc, reflets sur la Neva.",
  manila: "Intramuros fortifié : remparts anciens contrastant avec les gratte-ciel de la baie.",
  beijing: "Cité interdite : symétrie des toits dorés et murs rouges impériaux, vue aérienne majestueuse.",
  pekin: "Cité interdite : symétrie des toits dorés et murs rouges impériaux, vue aérienne majestueuse.",
  shanghai:
    "Skyline de Lujiazui et Bund : vue panoramique sur le Huangpu, gratte-ciel futuristes et architecture coloniale, ensemble de la baie lisible.",
  toronto: "Tour CN et Harbourfront : gratte-ciel de verge et lac Ontario.",
  mexico: "Palacio de Bellas Artes et Zocalo : coloniale massive, avenues et parcs fleuris.",
  "mexico city": "Palacio de Bellas Artes et Zocalo : coloniale massive, avenues et parcs fleuris.",
  lima: "Falaises de Miraflores : Pacifique, vagues, jardins surplombant l’océan.",
  santiago: "Gran Torre et cordillère des Andes enneigée : skyline moderne et montagnes.",
  vilnius: "Vieille ville et tour de Gediminas : toits rouges, clochers baroques boisés.",
  porto: "Pont Luis I et Douro : Ribeira colorée, barcos rabelos, vallée viticole.",
  genoa: "Vieux-Port et palais : ruelles médiévales vers la mer Ligure.",
  genes: "Vieux-Port et palais : ruelles médiévales vers la mer Ligure.",
  kyoto: "Pavillon d’Or Kinkaku-ji : temple doré, lac miroir, jardins zen.",
  heraklion: "Forteresse vénitienne et port : pierre crétoise, mer turquoise.",
  jeju: "Pic Seongsan Ilchulbong : cratère vert émeraude plongeant dans l’océan.",
  alicante: "Château de Santa Barbara : ville blanche, marina, promenade.",
  cebu: "Plages de Mactan : récifs sous eau cristalline, églises coloniales.",
  durban: "Golden Mile : plages de surf, skyline subtropicale, océan.",
  male: "Malé : île-ville dense, lagon turquoise et récifs.",
  "san francisco": "Golden Gate dans la brume : collines, maisons victoriennes, baie.",
  sydney: "Opéra et Harbour Bridge : architecture voilée blanche, eaux bleues de la baie.",
  lyon: "Basilique de Fourvière et confluence : toits, Rhône et Saône.",
  bordeaux: "Place de la Bourse et miroir d’eau : pierre classique, Garonne.",
  toulouse: "Capitole : brique rose, Garonne, ambiance du Sud-Ouest.",
  lille: "Grand-Place : façades flamandes, ciel du Nord.",
  nantes: "Machines de l’île et Loire : créatif, fleuve, patrimoine industriel revisité.",
  monaco: "Port Hercule et falaises : yachts, Méditerranée, luxe.",
  jakarta: "Monas et skyline : tropiques et mégalopole.",
  chicago: "Skyline et lac Michigan : Willis Tower, rivière, architecture américaine.",
  vancouver: "Port, montagnes et Stanley Park : nature et urbain fusionnés.",
  tunis: "Sidi Bou Said : bleu et blanc, Méditerranée.",
  alger: "Baie d’Alger : ville blanche sur la mer.",
  melbourne: "Yarra et gratte-ciel : moderne, culture, lumière du sud.",
  auckland: "Sky Tower et voiliers : Waitemata, baie, îles au loin.",
  "cape town": "Table Mountain et port : océan, montagne plate, urbain.",
  "rio de janeiro": "Christ Rédempteur et baie : plages, forêt, icône mondiale.",
  "sao paulo":
    "Monument de l’Indépendance du Brésil (Ipiranga) : groupe sculpté emblématique, musée du Parc, allée et palmiers — repère historique de São Paulo.",
};

const CITY_DRONE_SCENES_EN = {
  bangkok: "Grand Palace Wat Arun Bangkok Chao Phraya river golden temples Thai architecture sunset aerial",
  "hong kong": "Victoria Harbour Hong Kong skyline Peak neon skyscrapers mountains harbor aerial drone",
  london: "Big Ben Westminster Palace London Thames aerial gothic Victorian skyline golden hour",
  londres: "Big Ben Westminster Palace London Thames aerial gothic Victorian skyline golden hour",
  macao: "Ruins St Paul Macau Cotai casino skyline Portuguese colonial modern towers aerial",
  macau: "Ruins St Paul Macau Cotai casino skyline Portuguese colonial modern towers aerial",
  istanbul: "Blue Mosque Hagia Sophia Istanbul Bosphorus domes minarets aerial Europe Asia sunset",
  dubai: "Burj Khalifa Dubai Fountain futuristic glass towers desert luxury night golden lights aerial",
  "abu dhabi": "Sheikh Zayed Grand Mosque Abu Dhabi white marble Islamic architecture aerial desert",
  "abou dhabi": "Sheikh Zayed Grand Mosque Abu Dhabi white marble Islamic architecture aerial desert",
  mecca: "Masjid al-Haram Kaaba Mecca white marble sacred mosque aerial islamic architecture",
  "la mecque": "Masjid al-Haram Kaaba Mecca white marble sacred mosque aerial islamic architecture",
  antalya: "Kaleici old harbor Antalya red tile roofs Mediterranean turquoise cliffs mountains aerial",
  paris: "Eiffel Tower Paris haussmann rooftops Trocadero aerial sunset cinematic cityscape",
  "kuala lumpur": "Petronas Twin Towers Kuala Lumpur tropical parks skyscrapers aerial Malaysia",
  singapore: "Marina Bay Sands Gardens by the Bay supertrees futuristic tropical aerial Singapore",
  tokyo: "Shibuya crossing Tokyo Tower neon skyline aerial wide angle Mount Fuji distant",
  seoul: "Gyeongbokgung palace N Seoul Tower traditional pavilions modern skyscrapers aerial",
  "new york": "Statue of Liberty Manhattan skyline Empire State aerial yellow taxis golden hour",
  madrid: "Royal Palace Madrid Plaza Mayor white stone sunny plazas aerial Spain",
  rome: "Colosseum Roman Forum Rome ancient ruins cypress aerial golden hour Italy",
  cancun: "Playa Delfines Cancun Caribbean white sand turquoise water beach resorts aerial",
  barcelone: "Sagrada Familia Park Guell Barcelona Mediterranean aerial Gaudi architecture Spain",
  barcelona: "Sagrada Familia Park Guell Barcelona Mediterranean aerial Gaudi architecture Spain",
  milan: "Duomo Milan white marble gothic cathedral galleria aerial fashion capital Italy",
  milano: "Duomo Milan white marble gothic cathedral galleria aerial fashion capital Italy",
  phuket: "Phang Nga bay Phuket limestone karsts long-tail boats jungle tropical beach aerial",
  osaka: "Osaka Castle Dotonbori neon canals historic moat aerial Japan night",
  amsterdam: "Amsterdam canals narrow houses bridges bicycles red brick aerial maritime",
  vienne: "Schonbrunn Palace St Stephen Cathedral Vienna baroque gardens imperial aerial Austria",
  vienna: "Schonbrunn Palace St Stephen Cathedral Vienna baroque gardens imperial aerial Austria",
  taipei: "Taipei 101 tower sunset misty mountains modern skyline aerial Taiwan",
  pattaya: "Pattaya beach Sanctuary of Truth wooden temple carved coastline tropical aerial Thailand",
  prague: "Charles Bridge Prague Castle Vltava river red rooftops gothic spires aerial",
  shenzhen: "Ping An tower Nanshan skyline Shenzhen modern tech parks tropical greenery aerial",
  berlin: "Berlin skyline Fernsehturm TV tower Spree river sunset panoramic aerial cityscape Germany",
  seville: "Plaza de Espana Giralda Seville azulejos orange trees Andalusian sun aerial Spain",
  medina: "Al-Masjid an-Nabawi Medina white marble minarets giant umbrellas aerial sacred",
  medine: "Al-Masjid an-Nabawi Medina white marble minarets giant umbrellas aerial sacred",
  florence: "Duomo Santa Maria del Fiore Florence red dome Arno river renaissance aerial Italy",
  dublin: "Temple Bar Trinity College Dublin colorful pub facades cobblestones aerial Ireland",
  "ho chi minh": "Notre-Dame Saigon Bitexco tower colonial French modern skyscrapers aerial Vietnam",
  bali: "Tegalalang rice terraces Uluwatu cliff temple Bali jungle Indian Ocean aerial Indonesia",
  guangzhou: "Canton Tower Pearl River Guangzhou twisted skyscraper bridges dense skyline aerial",
  lisbonne: "Belem Tower Alfama Lisbon azulejos yellow trams Tagus hills aerial Portugal",
  lisbon: "Belem Tower Alfama Lisbon azulejos yellow trams Tagus hills aerial Portugal",
  "los angeles": "Los Angeles skyline Griffith Observatory Hollywood Sign downtown aerial wide view California",
  johannesburg: "Nelson Mandela Bridge Sandton skyline Johannesburg savanna distant aerial South Africa",
  miami: "Miami Beach South Beach turquoise ocean white sand skyline palm trees aerial wide view Florida",
  "las vegas": "Las Vegas Strip Bellagio fountains neon night casinos desert aerial",
  orlando: "Disney castle Universal Orlando theme parks lakes palm trees aerial Florida",
  venise: "Grand Canal Venice St Mark basilica gothic palaces gondolas Rialto aerial Italy",
  venice: "Grand Canal Venice St Mark basilica gothic palaces gondolas Rialto aerial Italy",
  budapest: "Hungarian Parliament Fishermans Bastion Danube blue river gothic aerial Hungary",
  marseille: "Notre Dame de la Garde Vieux-Port Marseille calanques Mediterranean aerial France",
  malaga: "Alcazaba Malaga Moorish fortress palm gardens beach port aerial Spain",
  majorque: "La Seu cathedral Palma bay Mallorca turquoise coves mountains aerial Mediterranean",
  mallorca: "La Seu cathedral Palma bay Mallorca turquoise coves mountains aerial Mediterranean",
  valence: "City of Arts Sciences Calatrava Valencia white futuristic water pools aerial Spain",
  valencia: "City of Arts Sciences Calatrava Valencia white futuristic water pools aerial Spain",
  "tel aviv": "Gordon beach Tel Aviv waterfront Bauhaus skyscrapers golden sand Mediterranean aerial",
  riyadh: "Kingdom Centre Riyadh financial skyline desert ocre futuristic lights aerial Saudi",
  zhuhai: "Zhuhai opera shell-shaped coastal islands giant bridge modern maritime aerial China",
  moscow: "Red Square St Basil Cathedral Moscow colorful onion domes imperial aerial Russia",
  moscou: "Red Square St Basil Cathedral Moscow colorful onion domes imperial aerial Russia",
  "le caire": "Giza pyramids Nile river Cairo golden desert palm trees aerial Egypt",
  cairo: "Giza pyramids Nile river Cairo golden desert palm trees aerial Egypt",
  copenhagen: "Nyhavn Copenhagen colorful houses sailboats Scandinavian harbor aerial Denmark",
  sofia: "Alexander Nevsky Cathedral Sofia golden green domes orthodox Vitosha mountains aerial",
  hanoi: "Hoan Kiem lake old quarter Hanoi pagodas colonial tropical aerial Vietnam",
  marrakech: "Jemaa el-Fna Koutoubia Marrakech ocre red Majorelle souks palm aerial Morocco",
  warsaw: "Old Town Warsaw Stare Miasto red brick royal square reconstructed aerial Poland",
  varsovie: "Old Town Warsaw Stare Miasto red brick royal square reconstructed aerial Poland",
  munich: "Marienplatz New Town Hall Munich neo-gothic spires Bavarian parks aerial Germany",
  edinburgh: "Edinburgh Castle Royal Mile dark stone volcanic hill mist aerial Scotland",
  edimbourg: "Edinburgh Castle Royal Mile dark stone volcanic hill mist aerial Scotland",
  zurich: "Lake Zurich old town churches Swiss Alps crystal water aerial Switzerland",
  stockholm: "Gamla Stan Stockholm colorful houses canals royal architecture archipelago aerial",
  "buenos aires": "La Boca colorful houses Obelisk Buenos Aires wide avenues parks aerial Argentina",
  nice: "Promenade des Anglais Baie des Anges Nice azure sea ochre facades palm aerial France",
  bruxelles: "Grand Place Brussels gilded facades cobblestones Atomium aerial Belgium",
  brussels: "Grand Place Brussels gilded facades cobblestones Atomium aerial Belgium",
  krabi: "Railay beach Krabi limestone cliffs jungle long-tail boat tropical aerial Thailand",
  doha: "Museum of Islamic Art West Bay Doha geometric skyline bay aerial Qatar",
  "chiang mai": "Wat Phra That Doi Suthep Chiang Mai golden temple mountains jungle aerial Thailand",
  jeddah: "King Fahd Fountain Al Balad Jeddah coral houses Red Sea modern towers aerial Saudi",
  curacao: "Handelskade Willemstad Curacao colorful Dutch tropical neon blue water aerial",
  willemstad: "Handelskade Willemstad Curacao colorful Dutch tropical neon blue water aerial",
  lagos: "Lagos island bridge beaches lagoons dense coastal city aerial Nigeria",
  athens: "Acropolis Parthenon Athens white marble olive hills dense white city aerial Greece",
  athenes: "Acropolis Parthenon Athens white marble olive hills dense white city aerial Greece",
  rhodes: "Grand Masters Palace Mandraki Rhodes medieval walls Aegean sea aerial Greece",
  ibiza: "Ibiza Cala Comte turquoise crystal clear water white sand beach sunset Balearic islands paradise aerial",
  formentera: "Formentera Ses Illetes beach translucent turquoise water white sand Caribbean-like Mediterranean aerial",
  mykonos: "Mykonos beach turquoise water white sand windmills Cycladic architecture Greek island paradise aerial",
  santorini: "Santorini caldera white village blue domes deep blue sea volcanic sunset aerial Greece",
  santorin: "Santorini caldera white village blue domes deep blue sea volcanic sunset aerial Greece",
  tulum: "Tulum ruins Mayan cliff beach white sand turquoise Caribbean water tropical jungle aerial Mexico",
  hawaii: "Hawaii Waikiki beach turquoise water golden sand Diamond Head palm trees aerial Pacific",
  honolulu: "Honolulu Waikiki beach turquoise water golden sand Diamond Head palm trees aerial Hawaii",
  maui: "Maui Kaanapali beach golden sand turquoise water green cliffs Hawaiian sunset aerial",
  martinique: "Martinique Anse des Salines white sand turquoise Caribbean coconut palms tropical aerial",
  guadeloupe: "Guadeloupe Caravelle beach turquoise lagoon white sand coconut palms tropical aerial",
  tahiti: "Moorea lagoon turquoise crystal water overwater bungalows green mountains aerial Tahiti",
  "bora bora": "Bora Bora lagoon turquoise water overwater bungalows Mount Otemanu volcanic paradise aerial",
  fiji: "Fiji white sand beach turquoise water coral reef palm trees South Pacific paradise aerial",
  fidji: "Fiji white sand beach turquoise water coral reef palm trees South Pacific paradise aerial",
  mauritius: "Mauritius Le Morne beach turquoise water white sand volcanic mountain tropical aerial",
  "ile maurice": "Mauritius Le Morne beach turquoise water white sand volcanic mountain tropical aerial",
  maurice: "Mauritius Le Morne beach turquoise water white sand volcanic mountain tropical aerial",
  barbados: "Barbados west coast beach white sand turquoise Caribbean palm trees tropical aerial",
  barbade: "Barbados west coast beach white sand turquoise Caribbean palm trees tropical aerial",
  marbella: "Marbella Puerto Banus golden beach Mediterranean blue palm trees Costa del Sol aerial Spain",
  tenerife: "Tenerife Las Teresitas golden sand turquoise water Teide volcano Canary Islands aerial",
  corfou: "Corfu Canal d'Amour sandstone cliffs turquoise water Mediterranean beach aerial Greece",
  corfu: "Corfu Canal d'Amour sandstone cliffs turquoise water Mediterranean beach aerial Greece",
  sardaigne: "Sardinia Costa Smeralda white sand coves crystal turquoise water granite rocks aerial Italy",
  sardinia: "Sardinia Costa Smeralda white sand coves crystal turquoise water granite rocks aerial Italy",
  crete: "Crete Balos lagoon pink sand beach shallow turquoise water wild landscape aerial Greece",
  djerba: "Houmt Souk Djerba white domed houses olive trees Mediterranean calm aerial Tunisia",
  agadir: "Agadir bay kasbah long beach promenade arid hills Morocco aerial",
  bucharest: "Palace of Parliament Bucharest triumph arch wide avenues parks aerial Romania",
  bucarest: "Palace of Parliament Bucharest triumph arch wide avenues parks aerial Romania",
  dubrovnik: "Dubrovnik old town walls Adriatic white stone orange roofs turquoise aerial Croatia",
  "washington dc": "US Capitol Lincoln Memorial Washington DC neoclassical white monuments aerial",
  washington: "US Capitol Lincoln Memorial Washington DC neoclassical white monuments aerial",
  montreal: "Old Port Montreal Mount Royal brick European skyscrapers Saint Lawrence aerial Canada",
  "saint-petersburg": "Hermitage Winter Palace Neva river baroque green white palaces aerial Russia",
  "saint petersburg": "Hermitage Winter Palace Neva river baroque green white palaces aerial Russia",
  manila: "Intramuros walled city Manila bay modern skyscrapers contrast aerial Philippines",
  beijing: "Forbidden City Beijing golden tile roofs red walls symmetry imperial aerial China",
  pekin: "Forbidden City Beijing golden tile roofs red walls symmetry imperial aerial China",
  shanghai:
    "Shanghai Lujiazui Bund Huangpu wide panoramic skyline Oriental Pearl Tower night aerial China",
  toronto: "CN Tower Toronto waterfront Lake Ontario glass skyline aerial Canada",
  mexico: "Palacio Bellas Artes Zocalo Mexico City colonial avenues parks aerial",
  "mexico city": "Palacio Bellas Artes Zocalo Mexico City colonial avenues parks aerial",
  lima: "Miraflores cliffs Lima Pacific ocean waves coastal gardens aerial Peru",
  santiago: "Gran Torre Santiago snow-capped Andes modern skyscraper aerial Chile",
  vilnius: "Vilnius old town Gediminas tower red roofs baroque wood towers aerial Lithuania",
  porto: "Dom Luis bridge Douro Ribeira colorful houses port wine boats aerial Portugal",
  genoa: "Genoa old port palazzi medieval alleys Ligurian sea aerial Italy",
  genes: "Genoa old port palazzi medieval alleys Ligurian sea aerial Italy",
  kyoto: "Kinkaku-ji golden pavilion Kyoto mirror pond zen garden aerial Japan",
  heraklion: "Venetian fortress Heraklion port Crete turquoise sea stone walls aerial Greece",
  jeju: "Seongsan Ilchulbong crater Jeju green volcano blue ocean aerial South Korea",
  alicante: "Santa Barbara castle Alicante white city marina promenade aerial Spain",
  cebu: "Mactan beaches Cebu coral clear water colonial churches aerial Philippines",
  durban: "Golden Mile Durban surf beaches subtropical skyline aerial South Africa",
  male: "Male Maldives city island dense turquoise lagoon reef aerial Indian Ocean",
  "san francisco": "Golden Gate Bridge fog San Francisco bay Victorian hills aerial California",
  sydney: "Sydney Opera House Harbour Bridge blue harbor sails aerial Australia",
  lyon: "Basilica Fourviere Rhone confluence Lyon rooftops aerial France",
  bordeaux: "Place de la Bourse Garonne river Bordeaux classical stone mirror water facades aerial France",
  toulouse: "Capitole Toulouse pink brick Garonne aerial France",
  lille: "Grand Place Lille Flemish facades aerial France",
  nantes: "Machines Isle Loire Nantes mechanical elephant aerial France",
  monaco: "Monaco harbor yachts cliff Mediterranean luxury aerial",
  jakarta: "Monas National Monument Jakarta skyline tropical aerial Indonesia",
  chicago: "Chicago skyline Lake Michigan Willis Tower river aerial USA",
  vancouver: "Vancouver harbor mountains Stanley Park aerial Canada",
  tunis: "Sidi Bou Said blue white Tunis Mediterranean aerial Tunisia",
  alger: "Algiers bay white city Mediterranean aerial Algeria",
  melbourne: "Melbourne Yarra skyline modern aerial Australia",
  auckland: "Auckland Sky Tower harbor sails Waitemata aerial New Zealand",
  "cape town": "Table Mountain Cape Town harbor aerial South Africa",
  "rio de janeiro": "Christ Redeemer Rio bay beaches aerial Brazil",
  "sao paulo":
    "Avenida Paulista MASP Sao Paulo Brazil skyline skyscrapers dense urban aerial metropolis",
};

function inferSceneEn(displayCity, kind) {
  const name = String(displayCity || "").trim() || "city";
  if (kind === "coastal") {
    return `${name} iconic beach wide panoramic coastline turquoise water white sand palm aerial drone tropical`;
  }
  return `${name} famous skyline wide panoramic aerial establishing shot golden hour urban cityscape cinematic architecture`;
}

function resolveEntryKeys(raw) {
  const k = normalizeKey(raw);
  const first = normalizeKey(String(raw || "").split(",")[0] || raw);
  return { k, first };
}

function sceneFrForCity(raw) {
  const { k, first } = resolveEntryKeys(raw);
  const curated = CURATED_SCENE_FR[k] || CURATED_SCENE_FR[first];
  if (curated) return curated;
  const kind = kindForCity(raw);
  return inferSceneFr(raw, kind);
}

function kindForCity(raw) {
  const { k, first } = resolveEntryKeys(raw);
  if (COASTAL_KEYS.has(k) || COASTAL_KEYS.has(first)) return "coastal";
  const nk = normalizeKey(raw);
  if (COASTAL_SUBSTRINGS.some((s) => nk.includes(s))) return "coastal";
  return "urban";
}

/** Types pour `inferAestheticCityQueryType` (métadonnées ; la requête héros utilise `kindForCity`). */
export const AESTHETIC_CITY_QUERY_TYPE = {
  MONUMENT: "monument",
  COASTAL: "coastal",
  METROPOLIS: "metropolis",
};

/**
 * Monuments / sujets en anglais pour l’amorce Unsplash (priorité sur l’extraction auto depuis CITY_DRONE_SCENES_EN).
 */
const HERO_LANDMARK_EN_OVERRIDES = Object.freeze({
  paris: "Paris Eiffel Tower cityscape aerial panoramic sunset",
  tokyo: "Tokyo skyline Tokyo Tower aerial cityscape wide view",
  kyoto: "Kinkaku-ji Golden Pavilion Kyoto panoramic garden view",
  osaka: "Osaka Castle skyline cityscape aerial panoramic Japan",
  seoul: "Seoul skyline Gyeongbokgung Palace panoramic wide view",
  bangkok: "Bangkok Wat Arun Grand Palace skyline aerial panoramic",
  singapore: "Singapore Marina Bay Sands skyline aerial panoramic",
  "hong kong": "Hong Kong Victoria Harbour skyline panoramic aerial",
  hongkong: "Hong Kong Victoria Harbour skyline panoramic aerial",
  "kuala lumpur": "Kuala Lumpur Petronas Twin Towers skyline panoramic",
  taipei: "Taipei 101 skyline panoramic cityscape aerial",
  "new york": "New York Manhattan skyline Statue of Liberty aerial panoramic",
  london: "London Big Ben Westminster skyline Thames panoramic",
  londres: "London Big Ben Westminster skyline Thames panoramic",
  rome: "Rome Colosseum cityscape panoramic aerial wide view",
  roma: "Rome Colosseum cityscape panoramic aerial wide view",
  barcelona: "Barcelona skyline Sagrada Familia panoramic cityscape Mediterranean",
  barcelone: "Barcelona skyline Sagrada Familia panoramic cityscape Mediterranean",
  madrid: "Madrid Royal Palace skyline panoramic aerial cityscape sunny colorful",
  amsterdam: "Amsterdam canals panoramic aerial cityscape wide view",
  prague: "Prague Charles Bridge Castle panoramic aerial Vltava",
  vienna: "Vienna skyline Schonbrunn Palace panoramic cityscape aerial",
  vienne: "Vienna skyline Schonbrunn Palace panoramic cityscape aerial",
  berlin: "Berlin skyline panoramic aerial Fernsehturm Spree river sunset cityscape wide view",
  budapest: "Budapest Parliament Danube panoramic skyline aerial",
  athens: "Athens Acropolis Parthenon panoramic cityscape aerial",
  athenes: "Athens Acropolis Parthenon panoramic cityscape aerial",
  istanbul: "Istanbul Hagia Sophia Blue Mosque Bosphorus panoramic aerial",
  florence: "Florence Duomo panoramic skyline Arno river aerial",
  firenze: "Florence Duomo panoramic skyline Arno river aerial",
  milan: "Milan Cathedral Duomo skyline panoramic aerial cityscape",
  milano: "Milan Cathedral Duomo skyline panoramic aerial cityscape",
  venise: "Venice Grand Canal gondola panoramic aerial wide view",
  venice: "Venice Grand Canal gondola panoramic aerial wide view",
  dubai: "Dubai Burj Khalifa skyline panoramic aerial cityscape",
  "abu dhabi": "Abu Dhabi Sheikh Zayed Mosque skyline panoramic aerial",
  "abou dhabi": "Abu Dhabi Sheikh Zayed Mosque skyline panoramic aerial",
  doha: "Doha skyline Museum of Islamic Art panoramic aerial",
  cairo: "Pyramids of Giza Cairo panoramic desert wide view",
  "le caire": "Pyramids of Giza Cairo panoramic desert wide view",
  moscow: "Moscow Red Square Saint Basil Cathedral panoramic aerial",
  moscou: "Moscow Red Square Saint Basil Cathedral panoramic aerial",
  sydney: "Sydney Opera House Harbour Bridge panoramic aerial",
  melbourne: "Melbourne Flinders Street skyline panoramic aerial",
  auckland: "Auckland Sky Tower skyline harbour panoramic aerial",
  "cape town": "Cape Town Table Mountain panoramic aerial wide view",
  "rio de janeiro": "Rio de Janeiro Christ Redeemer Sugarloaf panoramic aerial",
  "sao paulo": "Sao Paulo skyline Avenida Paulista panoramic aerial",
  "buenos aires": "Buenos Aires Obelisk La Boca skyline panoramic aerial",
  "mexico city": "Mexico City Palacio Bellas Artes panoramic aerial skyline",
  mexico: "Mexico City Palacio Bellas Artes panoramic aerial skyline",
  lyon: "Lyon Basilica Fourviere Saone panoramic aerial cityscape",
  marseille: "Marseille Notre-Dame de la Garde Vieux-Port panoramic aerial",
  nice: "Nice Promenade des Anglais Baie des Anges panoramic aerial",
  bordeaux: "Bordeaux Place de la Bourse mirror panoramic aerial",
  toulouse: "Toulouse Capitole Garonne panoramic aerial cityscape",
  bruxelles: "Brussels Grand Place panoramic cityscape aerial",
  brussels: "Brussels Grand Place panoramic cityscape aerial",
  berne: "Bern old town Zytglogge Aare panoramic aerial",
  bern: "Bern old town Zytglogge Aare panoramic aerial",
  lisbon: "Lisbon Belem Tower Alfama panoramic aerial cityscape",
  lisbonne: "Lisbon Belem Tower Alfama panoramic aerial cityscape",
  porto: "Porto Dom Luis Bridge Ribeira panoramic aerial",
  valencia: "Valencia City of Arts and Sciences panoramic aerial",
  copenhagen: "Copenhagen Nyhavn panoramic colorful aerial cityscape",
  stockholm: "Stockholm Gamla Stan panoramic aerial cityscape",
  zurich: "Zurich lake old town panoramic aerial cityscape Alps",
  dublin: "Dublin Temple Bar cityscape panoramic aerial wide view",
  edinburgh: "Edinburgh Castle Royal Mile panoramic aerial cityscape",
  edimbourg: "Edinburgh Castle Royal Mile panoramic aerial cityscape",
  warsaw: "Warsaw Old Town panoramic aerial cityscape wide view",
  varsovie: "Warsaw Old Town panoramic aerial cityscape wide view",
  sofia: "Sofia Alexander Nevsky Cathedral panoramic aerial cityscape",
  bucharest: "Bucharest Palace of Parliament panoramic aerial skyline",
  bucarest: "Bucharest Palace of Parliament panoramic aerial skyline",
  marrakech: "Marrakech Koutoubia Mosque Jemaa el-Fna panoramic aerial",
  tunis: "Sidi Bou Said Tunis blue white panoramic Mediterranean aerial",
  alger: "Algiers bay white city panoramic Mediterranean aerial",
  hanoi: "Hanoi Hoan Kiem Lake Old Quarter panoramic aerial",
  "ho chi minh": "Ho Chi Minh Saigon skyline Bitexco Tower panoramic aerial",
  bali: "Bali Uluwatu Temple rice terraces panoramic aerial ocean",
  phuket: "Phuket beach panoramic aerial turquoise water wide view",
  jakarta: "Jakarta Monas skyline panoramic aerial cityscape",
  "los angeles": "Los Angeles skyline Griffith Observatory Hollywood Sign panoramic aerial",
  "san francisco": "San Francisco Golden Gate Bridge panoramic aerial bay",
  miami: "Miami Beach South Beach skyline panoramic aerial ocean",
  chicago: "Chicago skyline Lake Michigan panoramic aerial cityscape",
  seattle: "Seattle Space Needle skyline panoramic aerial Mount Rainier",
  boston: "Boston skyline harbour panoramic aerial cityscape",
  philadelphia: "Philadelphia skyline City Hall panoramic aerial cityscape",
  washington: "Washington DC Capitol Monument panoramic aerial cityscape",
  "washington dc": "Washington DC Capitol Monument panoramic aerial cityscape",
  toronto: "Toronto CN Tower skyline panoramic aerial cityscape",
  montreal: "Montreal Old Port skyline panoramic aerial cityscape",
  vancouver: "Vancouver skyline waterfront mountains panoramic aerial",
  atlanta: "Atlanta skyline Midtown panoramic aerial cityscape",
  denver: "Denver skyline Rocky Mountains panoramic aerial cityscape",
  dallas: "Dallas skyline Reunion Tower panoramic aerial cityscape",
  houston: "Houston skyline downtown panoramic aerial cityscape",
  "las vegas": "Las Vegas Strip Bellagio panoramic aerial night",
  seville: "Seville Plaza de Espana panoramic aerial cityscape",
  malaga: "Malaga Alcazaba beach panoramic aerial cityscape",
  ibiza: "Ibiza beach Cala Comte turquoise water white sand paradise sunset aerial panoramic",
  formentera: "Formentera Ses Illetes beach turquoise water white sand panoramic aerial",
  mykonos: "Mykonos beach turquoise water windmills white village panoramic aerial Greece",
  santorini: "Santorini Oia caldera blue domes panoramic aerial Greece sunset",
  santorin: "Santorini Oia caldera blue domes panoramic aerial Greece sunset",
  tulum: "Tulum beach ruins Caribbean turquoise water white sand panoramic aerial Mexico",
  hawaii: "Hawaii beach turquoise water golden sand palm trees panoramic aerial",
  honolulu: "Honolulu Waikiki beach Diamond Head turquoise water panoramic aerial",
  maui: "Maui beach Kaanapali turquoise water panoramic aerial Hawaii",
  martinique: "Martinique Anse des Salines turquoise Caribbean beach panoramic aerial",
  guadeloupe: "Guadeloupe beach turquoise lagoon panoramic aerial Caribbean",
  tahiti: "Tahiti Moorea turquoise lagoon overwater bungalows panoramic aerial",
  "bora bora": "Bora Bora lagoon turquoise water overwater bungalows panoramic aerial",
  fiji: "Fiji beach turquoise water white sand coral reef panoramic aerial",
  mauritius: "Mauritius Le Morne beach turquoise water panoramic aerial",
  "ile maurice": "Mauritius Le Morne beach turquoise water panoramic aerial",
  barbados: "Barbados beach turquoise Caribbean white sand panoramic aerial",
  marbella: "Marbella beach golden sand Mediterranean panoramic aerial Spain",
  tenerife: "Tenerife beach turquoise water Teide volcano panoramic aerial Canaries",
  sardaigne: "Sardinia Costa Smeralda beach turquoise water panoramic aerial",
  sardinia: "Sardinia Costa Smeralda beach turquoise water panoramic aerial",
  crete: "Crete Balos lagoon turquoise water panoramic aerial Greece",
  corfou: "Corfu beach turquoise water cliffs panoramic aerial Greece",
  corfu: "Corfu beach turquoise water cliffs panoramic aerial Greece",
  dubrovnik: "Dubrovnik old town walls panoramic aerial Adriatic",
  santiago: "Santiago skyline Andes mountains panoramic aerial",
  lima: "Lima Miraflores cliffs Pacific panoramic aerial cityscape",
});

/** Extrait un libellé monument depuis la phrase EN drone (avant « aerial »), sans répéter le nom de la ville en fin de chaîne. */
function clipLandmarkFromSceneEn(sceneEn, cityStem) {
  const s = String(sceneEn || "")
    .replace(/\s+aerial(\s+.*)?$/i, "")
    .trim();
  const words = s.split(/\s+/).filter(Boolean);
  const cityN = normalizeKey(cityStem);
  const out = [];
  for (let i = 0; i < words.length && out.length < 6; i++) {
    const w = words[i];
    if (out.length >= 2 && normalizeKey(w) === cityN) break;
    out.push(w);
  }
  if (out.length >= 2) return out.join(" ");
  return words.slice(0, 4).join(" ");
}

/** Premier repère du catalogue (libellé FR ou mixte) — segment court avant « & ». */
function firstIconicPlaceLabel(cityKey) {
  const list = ICONIC_PLACES_CANONICAL[cityKey];
  if (!list?.[0]) return "";
  return String(list[0])
    .split(/&/)[0]
    .replace(/–/g, "-")
    .trim()
    .slice(0, 55);
}

function resolveHeroLandmarkEnglish(cityInput) {
  const raw = String(cityInput || "").trim();
  if (!raw) return "";
  const { k, first } = resolveEntryKeys(raw);
  const stem = raw.split(",")[0].trim();
  const keys = [k, first, normalizeKey(stem)].filter(Boolean);
  for (const key of keys) {
    if (HERO_LANDMARK_EN_OVERRIDES[key]) return HERO_LANDMARK_EN_OVERRIDES[key];
  }
  for (const key of keys) {
    const scene = CITY_DRONE_SCENES_EN[key];
    if (scene) return clipLandmarkFromSceneEn(scene, stem);
  }
  for (const key of keys) {
    const iconic = firstIconicPlaceLabel(key);
    if (iconic) return iconic;
  }
  return "";
}

/** Synonymes / lieux durs : la légende Unsplash ne cite pas toujours le libellé complet du monument. */
const HERO_UNSPLASH_EXTRA_DESC_BOOST = Object.freeze({
  "sao paulo": [
    "paulista",
    "masp",
    "skyline",
    "skyscraper",
    "avenida",
    "downtown",
    "urban",
    "aerial",
  ],
  "rio de janeiro": ["cristo", "redeemer", "corcovado", "sugarloaf", "copacabana"],
  tokyo: ["shibuya", "shinjuku", "asakusa", "sensoji"],
  paris: ["eiffel", "trocadero", "haussmann", "louvre", "champs"],
  london: ["westminster", "thames", "parliament", "tower bridge"],
  rome: ["colosseum", "coliseum", "forum", "pantheon"],
  barcelona: ["sagrada", "familia", "skyline", "panoramic", "guell", "mediterranean", "cityscape", "aerial"],
  barcelone: ["sagrada", "familia", "skyline", "panoramic", "guell", "mediterranean", "cityscape", "aerial"],
  istanbul: ["hagia", "sophia", "bosphorus", "mosque"],
  dubai: ["burj", "khalifa", "marina"],
  "new york": ["manhattan", "empire", "liberty", "brooklyn bridge", "central park"],
  moscow: ["kremlin", "basil", "red square"],
  moscou: ["kremlin", "basil", "red square"],
  cairo: ["pyramid", "giza", "sphinx"],
  "le caire": ["pyramid", "giza", "sphinx"],
  beijing: ["forbidden", "tiananmen", "temple"],
  pekin: ["forbidden", "tiananmen", "temple"],
  bangkok: ["wat arun", "grand palace", "temple"],
  singapore: ["marina bay", "garden", "supertree"],
  sydney: ["opera", "harbour bridge"],
  amsterdam: ["canal", "rijksmuseum"],
  prague: ["charles bridge", "castle", "vltava"],
  budapest: ["parliament", "danube", "fisherman"],
  athens: ["acropolis", "parthenon"],
  athenes: ["acropolis", "parthenon"],
  lisbon: ["belem", "alfama", "tram"],
  lisbonne: ["belem", "alfama", "tram"],
  marrakech: ["koutoubia", "jemaa", "medina"],
  seoul: ["gyeongbokgung", "palace", "namsan", "bukchon", "hanok"],
  copenhagen: ["nyhavn", "colorful", "harbour"],
  vienna: ["schonbrunn", "hofburg", "stephansdom"],
  vienne: ["schonbrunn", "hofburg", "stephansdom"],
  dublin: ["temple bar", "trinity", "college"],
  edinburgh: ["castle", "royal mile"],
  edimbourg: ["castle", "royal mile"],
  miami: ["beach", "south beach", "ocean", "turquoise", "skyline", "biscayne", "palm", "aerial"],
  ibiza: ["beach", "cala", "turquoise", "crystal", "sand", "sunset", "balearic", "paradise", "ocean", "coast"],
  mykonos: ["beach", "turquoise", "windmill", "cycladic", "sand", "paradise", "crystal"],
  santorini: ["caldera", "oia", "blue dome", "turquoise", "sunset", "volcanic", "cliff"],
  santorin: ["caldera", "oia", "blue dome", "turquoise", "sunset", "volcanic", "cliff"],
  tulum: ["beach", "ruins", "turquoise", "caribbean", "sand", "jungle", "cliff"],
  hawaii: ["beach", "turquoise", "palm", "tropical", "waikiki", "diamond head", "ocean"],
  honolulu: ["beach", "waikiki", "turquoise", "diamond head", "palm", "ocean"],
  maui: ["beach", "turquoise", "tropical", "sunset", "ocean", "coast"],
  martinique: ["beach", "turquoise", "caribbean", "tropical", "palm", "sand"],
  guadeloupe: ["beach", "turquoise", "lagoon", "caribbean", "tropical", "palm"],
  tahiti: ["lagoon", "turquoise", "overwater", "bungalow", "tropical", "paradise"],
  "bora bora": ["lagoon", "turquoise", "overwater", "bungalow", "paradise", "volcanic"],
  fiji: ["beach", "turquoise", "coral", "reef", "palm", "paradise", "tropical"],
  fidji: ["beach", "turquoise", "coral", "reef", "palm", "paradise", "tropical"],
  mauritius: ["beach", "turquoise", "morne", "tropical", "lagoon", "ocean"],
  "ile maurice": ["beach", "turquoise", "morne", "tropical", "lagoon", "ocean"],
  barbados: ["beach", "turquoise", "caribbean", "sand", "tropical", "palm"],
  barbade: ["beach", "turquoise", "caribbean", "sand", "tropical", "palm"],
  marbella: ["beach", "golden", "mediterranean", "coast", "puerto banus", "palm"],
  tenerife: ["beach", "turquoise", "teide", "volcano", "canary", "sand"],
  sardaigne: ["beach", "turquoise", "costa smeralda", "cove", "crystal", "sand"],
  sardinia: ["beach", "turquoise", "costa smeralda", "cove", "crystal", "sand"],
  crete: ["balos", "lagoon", "turquoise", "beach", "sand", "crystal"],
  corfou: ["beach", "turquoise", "cliff", "crystal", "mediterranean"],
  corfu: ["beach", "turquoise", "cliff", "crystal", "mediterranean"],
  formentera: ["beach", "turquoise", "ses illetes", "sand", "crystal", "paradise"],
  venise: ["grand canal", "canal", "gondola", "rialto", "st mark", "san marco", "basilica", "palazzo", "lagoon"],
  venice: ["grand canal", "canal", "gondola", "rialto", "st mark", "san marco", "basilica", "palazzo", "lagoon"],
  "los angeles": ["griffith", "observatory", "hollywood", "skyline", "downtown", "aerial", "panorama", "cityscape"],
  nice: ["promenade", "anglais", "baie"],
  bordeaux: ["bourse", "miroir", "garonne"],
  madrid: ["royal palace", "palacio", "plaza mayor", "gran via", "prado"],
  berlin: ["brandenburg", "gate", "brandenburger", "tor", "reichstag", "berlin wall", "alexanderplatz", "landmark"],
  florence: ["duomo", "florence", "ponte vecchio", "brunelleschi", "dome", "cathedral"],
  firenze: ["duomo", "florence", "ponte vecchio", "brunelleschi", "dome", "cathedral"],
  dubai: ["burj", "khalifa", "marina", "skyline", "downtown"],
  "san francisco": ["golden gate", "bridge", "bay", "fog", "cable car"],
  chicago: ["willis", "sears", "skyline", "millennium", "bean", "lake michigan"],
  "cape town": ["table mountain", "waterfront", "cape"],
  "rio de janeiro": ["cristo", "redeemer", "sugarloaf", "copacabana", "ipanema"],
  porto: ["dom luis", "ribeira", "douro", "bridge"],
  stockholm: ["gamla stan", "old town", "palace"],
  lyon: ["fourviere", "basilica", "rhone", "saone"],
  marseille: ["notre-dame", "garde", "vieux port"],
  taipei: ["taipei 101", "tower", "skyline"],
  seattle: ["space needle", "skyline", "mount rainier"],
  "buenos aires": ["obelisco", "la boca", "caminito", "plaza de mayo"],
});

const HERO_BOOST_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "city",
  "town",
  "iconic",
  "landmark",
]);

function heroLandmarkTokensForUnsplashBoost(cityInput) {
  const monument = resolveHeroLandmarkEnglish(cityInput);
  if (!monument) return [];
  return String(monument)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !HERO_BOOST_STOPWORDS.has(w));
}

/**
 * Mots à valoriser dans description / alt_description Unsplash pour coller au monument (évite les « ciel seul »).
 */
export function getHeroUnsplashDescBoostTokens(cityInput) {
  const raw = String(cityInput || "").trim();
  if (!raw) return [];
  const { k, first } = resolveEntryKeys(raw);
  const stem = raw.split(",")[0].trim();
  const keys = [k, first, normalizeKey(stem)].filter(Boolean);
  const extra = [];
  for (const key of keys) {
    const arr = HERO_UNSPLASH_EXTRA_DESC_BOOST[key];
    if (Array.isArray(arr)) extra.push(...arr);
  }
  const fromMonument = heroLandmarkTokensForUnsplashBoost(raw);
  const seen = new Set();
  const out = [];
  for (const t of [...extra, ...fromMonument]) {
    const n = String(t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 16) break;
  }
  return out;
}

/** Queue de requête : cadrage rue / architecture, lumière chaude (pas de « blue sky »), matière urbaine dense. */
const CITY_HERO_ARCH_TAIL_URBAN =
  "panorama cityscape travel photography landmark wide angle";

const CITY_HERO_ARCH_TAIL_COASTAL =
  "panorama waterfront travel photography landmark wide angle";

/** Libellé ville en anglais dans la requête Unsplash (meilleur rappel que les exonymes FR). */
const HERO_QUERY_CITY_EN = Object.freeze({
  lisbonne: "Lisbon",
  lisbon: "Lisbon",
  roma: "Rome",
  rome: "Rome",
  venise: "Venice",
  venice: "Venice",
  milano: "Milan",
  milan: "Milan",
  napoli: "Naples",
  naples: "Naples",
  florence: "Florence",
  firenze: "Florence",
  pekin: "Beijing",
  moscou: "Moscow",
  moscow: "Moscow",
  vienne: "Vienna",
  vienna: "Vienna",
  bruxelles: "Brussels",
  brussels: "Brussels",
  munich: "Munich",
  munchen: "Munich",
  cologne: "Cologne",
  koln: "Cologne",
  athenes: "Athens",
  athens: "Athens",
  "le caire": "Cairo",
  cairo: "Cairo",
  canton: "Guangzhou",
  guangzhou: "Guangzhou",
  valencia: "Valencia",
  varsovie: "Warsaw",
  warsaw: "Warsaw",
  edimbourg: "Edinburgh",
  edinburgh: "Edinburgh",
  bucarest: "Bucharest",
  bucharest: "Bucharest",
  genes: "Genoa",
  genoa: "Genoa",
  "ho chi minh": "Ho Chi Minh City",
  "buenos aires": "Buenos Aires",
  "sao paulo": "Sao Paulo",
  "kuala lumpur": "Kuala Lumpur",
  "mexico city": "Mexico City",
  mexico: "Mexico City",
  "le cap": "Cape Town",
  "cape town": "Cape Town",
  copenhague: "Copenhagen",
  copenhagen: "Copenhagen",
  "saint-petersbourg": "Saint Petersburg",
  "saint petersbourg": "Saint Petersburg",
});

/**
 * Requête Unsplash « photographe d’architecture » : monument + ville, lumière dorée, sans insister sur le ciel vide.
 * @param {string} cityInput — « Ville » ou « Ville, Pays »
 */
export function buildCityHeroUnsplashQuery(cityInput) {
  const rawCity = String(cityInput || "")
    .split(",")[0]
    .trim();
  if (!rawCity) return "";
  const cityNorm = normalizeKey(rawCity);
  const city = HERO_QUERY_CITY_EN[cityNorm] || rawCity;
  const kind = kindForCity(cityInput);
  const monument = resolveHeroLandmarkEnglish(cityInput);
  const lead = monument ? `${monument}, ${city}` : `${city} iconic landmark`;
  const tail = kind === "coastal" ? CITY_HERO_ARCH_TAIL_COASTAL : CITY_HERO_ARCH_TAIL_URBAN;
  return `${lead} ${tail}`.replace(/\s+/g, " ").trim();
}

/**
 * Métropoles où la skyline / néons / towers priment sur « monument unique » pour la recherche stock.
 * (Les villes balnéaires du set côtier passent déjà en `coastal` via `kindForCity`.)
 */
const METROPOLIS_KEYS = new Set(
  [
    "tokyo",
    "osaka",
    "seoul",
    "singapore",
    "dubai",
    "abu dhabi",
    "abou dhabi",
    "new york",
    "chicago",
    "los angeles",
    "san francisco",
    "toronto",
    "shanghai",
    "beijing",
    "shenzhen",
    "guangzhou",
    "hong kong",
    "taipei",
    "mumbai",
    "delhi",
    "kuala lumpur",
    "frankfurt",
    "atlanta",
    "houston",
    "dallas",
    "philadelphia",
    "las vegas",
    "denver",
    "seattle",
    "melbourne",
    "johannesburg",
    "mexico city",
    "moscow",
    "tel aviv",
    "doha",
  ].map((x) => normalizeKey(x))
);

/**
 * @deprecated Conservé pour compatibilité : délègue à `buildCityHeroUnsplashQuery`.
 */
export function buildAestheticCityUnsplashQuery(cityName, _cityType) {
  return buildCityHeroUnsplashQuery(cityName);
}

/**
 * Déduit le type esthétique à partir d’une entrée utilisateur (ville, « Ville, Pays », etc.).
 */
export function inferAestheticCityQueryType(cityInput) {
  const raw = String(cityInput || "").trim();
  if (!raw) return AESTHETIC_CITY_QUERY_TYPE.MONUMENT;
  if (kindForCity(raw) === "coastal") return AESTHETIC_CITY_QUERY_TYPE.COASTAL;
  const { k, first } = resolveEntryKeys(raw);
  if (METROPOLIS_KEYS.has(k) || METROPOLIS_KEYS.has(first)) {
    return AESTHETIC_CITY_QUERY_TYPE.METROPOLIS;
  }
  return AESTHETIC_CITY_QUERY_TYPE.MONUMENT;
}

/**
 * Chaîne query-string pour `GET /search/photos` (sans auth — le Client-ID reste en header).
 * @param {{ perPage?: number }} options — défaut 1 (meilleur résultat Unsplash) ; max 30.
 */
export function buildAestheticCityUnsplashApiQueryString(cityName, cityType, options = {}) {
  const query = buildCityHeroUnsplashQuery(cityName);
  if (!query) return "";
  const perPage = Math.min(30, Math.max(1, Number(options.perPage) || 1));
  const params = new URLSearchParams();
  params.set("query", query);
  params.set("orientation", "landscape");
  params.set("content_filter", "high");
  params.set("per_page", String(perPage));
  return params.toString();
}

/**
 * Prompt FR complet (scène + style technique) — brief pour IA image ou documentation.
 */
export function buildCityDronePromptFR(cityInput) {
  const raw = String(cityInput || "").trim();
  if (!raw) return STYLE_TECHNIQUE_FR;
  const scene = sceneFrForCity(raw);
  return `${scene} ${STYLE_TECHNIQUE_FR}`.replace(/\s+/g, " ").trim();
}

function sceneEnKeywordsOnly(cityInput) {
  const raw = String(cityInput || "").trim();
  if (!raw) return "";
  const { k, first } = resolveEntryKeys(raw);
  const kind = kindForCity(raw);
  const specific =
    CITY_DRONE_SCENES_EN[k] || CITY_DRONE_SCENES_EN[first] || inferSceneEn(raw, kind);
  const words = specific.split(/\s+/).filter(Boolean);
  const maxWords = 16;
  return words.slice(0, maxWords).join(" ");
}

/**
 * Requête courte pour l’API Unsplash (sans le bloc « style technique » qui dilue la recherche).
 */
export function buildCityUnsplashStockQuery(cityInput) {
  const core = sceneEnKeywordsOnly(cityInput);
  if (!core) return "city skyline wide panoramic aerial landmark cityscape";
  return `${core} wide panoramic aerial cityscape`.replace(/\s+/g, " ").trim();
}

/**
 * Requête complète (scène EN + style) — brief / métadonnées, pas idéal pour Unsplash.
 */
export function buildCityDroneUnsplashQuery(cityInput) {
  const raw = String(cityInput || "").trim();
  if (!raw) return STYLE_TECHNIQUE_EN;
  const specific = sceneEnKeywordsOnly(cityInput);
  if (!specific) return STYLE_TECHNIQUE_EN;
  return `${specific} ${STYLE_TECHNIQUE_EN}`.replace(/\s+/g, " ").trim();
}

/**
 * Objet unique pour l’app : classification, textes, recherche stock.
 */
export function getCityDroneImagePackage(cityInput) {
  const raw = String(cityInput || "").trim();
  const { k, first } = resolveEntryKeys(raw);
  const kind = kindForCity(raw);
  const sceneFr = sceneFrForCity(raw);
  const displayName = raw.split(",")[0].trim() || raw;
  const aestheticType = inferAestheticCityQueryType(raw);
  return {
    key: k || first,
    displayName,
    classification: kind,
    sceneFr,
    promptFr: `${sceneFr} ${STYLE_TECHNIQUE_FR}`.replace(/\s+/g, " ").trim(),
    unsplashQuery: buildCityDroneUnsplashQuery(raw),
    unsplashStockQuery: buildCityUnsplashStockQuery(raw),
    aestheticUnsplashType: aestheticType,
    aestheticUnsplashQuery: buildCityHeroUnsplashQuery(raw),
    cityHeroUnsplashQuery: buildCityHeroUnsplashQuery(raw),
  };
}

export { normalizeKey as normalizeCityDroneKey };
export const CITY_DRONE_STYLE_SUFFIX = STYLE_TECHNIQUE_EN;
