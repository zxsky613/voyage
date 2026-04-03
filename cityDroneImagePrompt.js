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
  berlin: "Brandenburg Gate Reichstag Berlin wide avenues neoclassical aerial Germany",
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
  paris: "Eiffel Tower",
  tokyo: "Tokyo Tower",
  kyoto: "Kinkaku-ji Golden Pavilion",
  osaka: "Osaka Castle",
  seoul: "Gyeongbokgung Palace Seoul wide view",
  bangkok: "Wat Arun Grand Palace",
  singapore: "Marina Bay Sands",
  "hong kong": "Victoria Harbour",
  hongkong: "Victoria Harbour",
  "kuala lumpur": "Petronas Twin Towers",
  taipei: "Taipei 101",
  "new york": "Statue of Liberty",
  london: "Big Ben Westminster Palace",
  londres: "Big Ben Westminster Palace",
  rome: "Colosseum",
  roma: "Colosseum",
  barcelona: "Sagrada Familia Barcelona Gaudi facade close view",
  barcelone: "Sagrada Familia Barcelona Gaudi facade close view",
  madrid: "Royal Palace Plaza Mayor Madrid",
  amsterdam: "Amsterdam canals Rijksmuseum",
  prague: "Charles Bridge Prague Castle",
  vienna: "Schonbrunn Palace",
  vienne: "Schonbrunn Palace",
  berlin: "Brandenburg Gate",
  budapest: "Hungarian Parliament Danube",
  athens: "Acropolis Parthenon",
  athenes: "Acropolis Parthenon",
  istanbul: "Hagia Sophia Blue Mosque",
  florence: "Duomo Santa Maria del Fiore",
  firenze: "Duomo Santa Maria del Fiore",
  milan: "Milan Cathedral Duomo",
  milano: "Milan Cathedral Duomo",
  venise: "Venice Grand Canal gondola Rialto Bridge wide view",
  venice: "Venice Grand Canal gondola Rialto Bridge wide view",
  dubai: "Burj Khalifa",
  "abu dhabi": "Sheikh Zayed Grand Mosque",
  "abou dhabi": "Sheikh Zayed Grand Mosque",
  doha: "Museum of Islamic Art Doha",
  cairo: "Pyramids of Giza",
  "le caire": "Pyramids of Giza",
  moscow: "Red Square Saint Basil Cathedral",
  moscou: "Red Square Saint Basil Cathedral",
  sydney: "Sydney Opera House",
  melbourne: "Flinders Street Station Melbourne",
  auckland: "Sky Tower Auckland",
  "cape town": "Table Mountain",
  "rio de janeiro": "Christ the Redeemer",
  "sao paulo": "Avenida Paulista MASP Sao Paulo skyline",
  "buenos aires": "La Boca Obelisk Buenos Aires",
  "mexico city": "Palacio Bellas Artes Mexico City",
  mexico: "Palacio Bellas Artes Mexico City",
  lyon: "Basilica Notre-Dame de Fourviere",
  marseille: "Notre-Dame de la Garde",
  nice: "Promenade des Anglais",
  bordeaux: "Place de la Bourse mirror Bordeaux",
  toulouse: "Capitole Toulouse",
  bruxelles: "Grand Place Brussels",
  brussels: "Grand Place Brussels",
  berne: "Zytglogge Bern old town",
  bern: "Zytglogge Bern old town",
  lisbon: "Belem Tower",
  lisbonne: "Belem Tower",
  porto: "Dom Luis Bridge Ribeira Porto",
  valencia: "City of Arts and Sciences Valencia",
  copenhagen: "Nyhavn Copenhagen",
  stockholm: "Gamla Stan Stockholm",
  zurich: "Lake Zurich old town",
  dublin: "Temple Bar Trinity College Dublin",
  edinburgh: "Edinburgh Castle Royal Mile",
  edimbourg: "Edinburgh Castle Royal Mile",
  warsaw: "Old Town Warsaw Stare Miasto",
  varsovie: "Old Town Warsaw Stare Miasto",
  sofia: "Alexander Nevsky Cathedral Sofia",
  bucharest: "Palace of Parliament Bucharest",
  bucarest: "Palace of Parliament Bucharest",
  marrakech: "Koutoubia Mosque Jemaa el-Fna",
  tunis: "Sidi Bou Said Medina Tunis",
  alger: "Algiers bay white city",
  hanoi: "Hoan Kiem Lake Hanoi old quarter",
  "ho chi minh": "Notre-Dame Cathedral Bitexco Tower Saigon",
  bali: "Uluwatu Temple rice terraces Bali",
  phuket: "Big Buddha Phuket beach",
  jakarta: "Monas National Monument Jakarta",
  "los angeles": "Los Angeles skyline Griffith Observatory Hollywood Sign wide view",
  "san francisco": "Golden Gate Bridge",
  miami: "Miami Beach South Beach ocean skyline",
  chicago: "Chicago skyline Willis Tower Lake Michigan",
  seattle: "Space Needle",
  boston: "Faneuil Hall Boston skyline",
  philadelphia: "Philadelphia City Hall",
  washington: "United States Capitol Washington DC",
  "washington dc": "United States Capitol Washington DC",
  toronto: "CN Tower",
  montreal: "Old Montreal Old Port",
  vancouver: "Canada Place Vancouver waterfront",
  atlanta: "Atlanta skyline Midtown",
  denver: "Denver skyline Rocky Mountains",
  dallas: "Reunion Tower Dallas",
  houston: "Houston downtown skyline",
  "las vegas": "Las Vegas Strip Bellagio",
  seville: "Plaza de Espana Seville",
  malaga: "Alcazaba Malaga",
  dubrovnik: "Dubrovnik old town walls",
  santiago: "Gran Torre Santiago Andes",
  lima: "Miraflores cliffs Lima Pacific",
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
  barcelona: ["sagrada", "familia", "gaudi", "guell", "gothic", "rambla", "facade", "cathedral"],
  barcelone: ["sagrada", "familia", "gaudi", "guell", "gothic", "rambla", "facade", "cathedral"],
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
  venise: ["grand canal", "canal", "gondola", "rialto", "st mark", "san marco", "basilica", "palazzo", "lagoon"],
  venice: ["grand canal", "canal", "gondola", "rialto", "st mark", "san marco", "basilica", "palazzo", "lagoon"],
  "los angeles": ["griffith", "observatory", "hollywood", "skyline", "downtown", "aerial", "panorama", "cityscape"],
  nice: ["promenade", "anglais", "baie"],
  bordeaux: ["bourse", "miroir", "garonne"],
  madrid: ["royal palace", "palacio", "plaza mayor", "gran via", "prado"],
  berlin: ["brandenburg", "gate", "reichstag", "berlin wall", "alexanderplatz"],
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
