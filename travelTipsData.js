/**
 * Conseils voyage par destination — multilingues (fr/en/de/es/it/zh).
 * Priorité : entrées explicites > modèles liés aux lieux emblématiques > génériques.
 */

const LANG_FALLBACK = "en";

function pickLang(obj, lang) {
  const l = String(lang || "fr").toLowerCase().split("-")[0];
  return obj[l] || obj[LANG_FALLBACK] || obj.fr || "";
}

const GENERIC_DONT_ML = [
  {
    fr: "Évite les zones ultra-touristiques aux heures de pointe quand tu peux.",
    en: "Avoid ultra-touristy areas at peak hours when you can.",
    de: "Meide stark frequentierte Touristengebiete zu Stoßzeiten, wenn möglich.",
    es: "Evita las zonas más turísticas en horas punta cuando puedas.",
    it: "Evita le zone ultra-turistiche nelle ore di punta quando puoi.",
    zh: "尽量避开旅游高峰时段的热门景点。",
  },
  {
    fr: "Ne garde pas tous tes documents originaux dans le même sac.",
    en: "Don't keep all your original documents in the same bag.",
    de: "Bewahre nicht alle Originaldokumente in derselben Tasche auf.",
    es: "No lleves todos tus documentos originales en la misma bolsa.",
    it: "Non tenere tutti i documenti originali nella stessa borsa.",
    zh: "不要把所有原始证件放在同一个包里。",
  },
  {
    fr: "Méfie-toi des changeurs de rue et des offres trop pressantes.",
    en: "Be wary of street money changers and overly pushy offers.",
    de: "Sei vorsichtig bei Straßenwechslern und zu aufdringlichen Angeboten.",
    es: "Ten cuidado con los cambistas callejeros y las ofertas demasiado insistentes.",
    it: "Diffida dei cambiavalute di strada e delle offerte troppo insistenti.",
    zh: "小心街头换汇和过于急迫的推销。",
  },
];

function genericDont(lang) {
  return GENERIC_DONT_ML.map((o) => pickLang(o, lang));
}

/** Raccourcit un libellé de lieu pour l'insérer dans une phrase. */
function shortPlaceLabel(raw) {
  const s = String(raw || "")
    .split(/\s—\s|\s-\s|,/)[0]
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
  return s.slice(0, 62) || "the main sites";
}

const GENERIC_DO_ML = [
  {
    fr: (n) => `Pour ${n}, vérifie en amont les jours et heures d'ouverture des musées et monuments — beaucoup ferment un jour fixe ou l'après-midi.`,
    en: (n) => `For ${n}, check the opening days and hours of museums and monuments in advance — many close on a fixed day or in the afternoon.`,
    de: (n) => `Für ${n} die Öffnungszeiten von Museen und Sehenswürdigkeiten im Voraus prüfen — viele schließen an einem festen Tag oder nachmittags.`,
    es: (n) => `Para ${n}, consulta con antelación los días y horarios de apertura de museos y monumentos — muchos cierran un día fijo o por la tarde.`,
    it: (n) => `Per ${n}, verifica in anticipo i giorni e gli orari di apertura di musei e monumenti — molti chiudono un giorno fisso o nel pomeriggio.`,
    zh: (n) => `前往${n}前，提前确认博物馆和景点的开放日及开放时间——很多地方会固定闭馆一天或下午不开放。`,
  },
  {
    fr: () => "Privilégie marche, vélo ou transports en commun dans le centre : c'est souvent plus rapide et moins cher que la voiture.",
    en: () => "Prefer walking, cycling or public transport in the centre: it's often faster and cheaper than a car.",
    de: () => "Im Zentrum zu Fuß gehen, Fahrrad fahren oder öffentliche Verkehrsmittel nutzen: oft schneller und günstiger als das Auto.",
    es: () => "Prefiere caminar, ir en bicicleta o usar transporte público en el centro: suele ser más rápido y barato que el coche.",
    it: () => "Preferisci camminare, andare in bicicletta o usare i mezzi pubblici in centro: spesso è più veloce ed economico dell'auto.",
    zh: () => "在市中心优先选择步行、骑行或公共交通——通常比开车更快更省钱。",
  },
  {
    fr: () => "Télécharge une carte hors ligne ou repère une appli de transport locale avant d'arriver — le réseau n'est pas garanti partout.",
    en: () => "Download an offline map or find a local transport app before you arrive — connectivity isn't guaranteed everywhere.",
    de: () => "Vor der Anreise eine Offline-Karte herunterladen oder eine lokale Transport-App suchen — Netzabdeckung ist nicht überall gewährleistet.",
    es: () => "Descarga un mapa sin conexión o una aplicación de transporte local antes de llegar — no hay cobertura garantizada en todos lados.",
    it: () => "Scarica una mappa offline o trova un'app di trasporto locale prima di arrivare — la copertura non è garantita ovunque.",
    zh: () => "出发前下载离线地图或本地交通应用——网络信号不是随处都有保障的。",
  },
];

function genericDo(label, lang) {
  const n = String(label || "").trim() || (lang === "zh" ? "该目的地" : "this destination");
  return GENERIC_DO_ML.map((o) => (pickLang(o, lang))(n));
}

const TIPS_FROM_ICONIC_ML = [
  {
    fr: (label, a, b) => `À ${label}, pour ${a} et ${b}, réserve sur les sites officiels ou arrive à l'ouverture — les files explosent en haute saison.`,
    en: (label, a, b) => `In ${label}, for ${a} and ${b}, book on official websites or arrive at opening time — queues get very long in high season.`,
    de: (label, a, b) => `In ${label} für ${a} und ${b} auf offiziellen Websites buchen oder zur Öffnungszeit kommen — die Schlangen sind in der Hochsaison sehr lang.`,
    es: (label, a, b) => `En ${label}, para ${a} y ${b}, reserva en sitios oficiales o llega a la apertura — las colas se disparan en temporada alta.`,
    it: (label, a, b) => `A ${label}, per ${a} e ${b}, prenota sui siti ufficiali o arriva all'apertura — le code esplodono in alta stagione.`,
    zh: (label, a, b) => `在${label}，${a}和${b}建议提前在官方网站购票或在开门时到达——旺季排队时间很长。`,
  },
  {
    fr: (label, a, b) => `Relie ${a}, ${b} et le centre en métro, tram ou bus (ou à pied si c'est faisable) : garde une appli locale ou une carte hors ligne.`,
    en: (label, a, b) => `Get between ${a}, ${b} and the centre by metro, tram or bus (or on foot if feasible): keep a local app or offline map handy.`,
    de: (label, a, b) => `${a}, ${b} und das Zentrum mit Metro, Tram oder Bus verbinden (oder zu Fuß, wenn möglich): eine lokale App oder Offline-Karte bereithalten.`,
    es: (label, a, b) => `Desplázate entre ${a}, ${b} y el centro en metro, tranvía o autobús (o a pie si es posible): ten una app local o un mapa sin conexión.`,
    it: (label, a, b) => `Collegati tra ${a}, ${b} e il centro con metro, tram o bus (o a piedi se fattibile): tieni a portata di mano un'app locale o una mappa offline.`,
    zh: (label, a, b) => `在${a}、${b}与市中心之间，乘坐地铁、有轨电车或公交出行（可步行的话也可以）：准备好本地交通应用或离线地图。`,
  },
  {
    fr: (label, a, b, c) => `Anticipe les coupures (lundi fermé, fermeture à midi) avant de verrouiller ton emploi du temps à ${label}, surtout pour ${c}.`,
    en: (label, a, b, c) => `Check for closures (Mondays, midday breaks) before locking in your schedule at ${label}, especially for ${c}.`,
    de: (label, a, b, c) => `Schließungen (Montags, Mittagspausen) in ${label} vor der Reiseplanung prüfen, besonders für ${c}.`,
    es: (label, a, b, c) => `Comprueba los cierres (lunes, cierre al mediodía) antes de fijar tu agenda en ${label}, especialmente para ${c}.`,
    it: (label, a, b, c) => `Controlla le chiusure (lunedì, pausa pranzo) prima di bloccare il tuo programma a ${label}, specialmente per ${c}.`,
    zh: (label, a, b, c) => `在确定${label}行程前，确认是否有临时闭馆（如周一或午休时段），特别是${c}。`,
  },
];

function tipsFromIconicPlaces(displayLabel, places, lang) {
  const label = String(displayLabel || "").trim() || "this destination";
  const list = (places || []).map(String).filter(Boolean);
  if (list.length < 2) return null;
  const a = shortPlaceLabel(list[0]);
  const b = shortPlaceLabel(list[1]);
  const c = list[2] ? shortPlaceLabel(list[2]) : b;
  return TIPS_FROM_ICONIC_ML.map((o) => (pickLang(o, lang))(label, a, b, c));
}

/**
 * Conseils « experts » (3× do) pour une clé catalogue normalisée.
 * @param {string} normalizedCatalogKey
 * @param {string} displayLabel
 * @param {string[]} iconicPlaces
 * @param {string} [language] — fr | en | de | es | it | zh
 */
export function resolveTravelTips(normalizedCatalogKey, displayLabel, iconicPlaces = [], language = "fr") {
  const k = String(normalizedCatalogKey || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const label = String(displayLabel || "").trim() || "this destination";
  const lang = String(language || "fr").toLowerCase().split("-")[0];

  if (k === "berne" || k === "bern") {
    const berne = TRAVEL_TIPS_OVERRIDES_ML.berne || TRAVEL_TIPS_OVERRIDES_ML.bern;
    if (berne) {
      return { do: berne.do.map((o) => pickLang(o, lang)), dont: genericDont(lang) };
    }
  }

  const explicit = TRAVEL_TIPS_OVERRIDES_ML[k];
  if (explicit) {
    const dontList = explicit.dont
      ? explicit.dont.map((o) => pickLang(o, lang))
      : genericDont(lang);
    return { do: explicit.do.map((o) => pickLang(o, lang)), dont: dontList };
  }

  const fromIconic = tipsFromIconicPlaces(label, iconicPlaces, lang);
  if (fromIconic) {
    return { do: fromIconic, dont: genericDont(lang) };
  }

  return { do: genericDo(label, lang), dont: genericDont(lang) };
}

/** Multilingual city-specific tip overrides. */
const TRAVEL_TIPS_OVERRIDES_ML = {
  paris: {
    do: [
      {
        fr: "Réserve tes billets coupe-file en ligne pour la tour Eiffel, le Louvre ou l'Orsay — les files sur place sont très longues en saison.",
        en: "Book skip-the-line tickets online for the Eiffel Tower, the Louvre or the Orsay — on-site queues are very long in season.",
        de: "Online-Tickets ohne Anstehen für den Eiffelturm, den Louvre oder das Orsay buchen — die Schlangen vor Ort sind in der Saison sehr lang.",
        es: "Reserva entradas sin colas en línea para la Torre Eiffel, el Louvre o el Orsay — las filas in situ son muy largas en temporada.",
        it: "Prenota i biglietti salta-fila online per la Torre Eiffel, il Louvre o l'Orsay — le code in loco sono molto lunghe in stagione.",
        zh: "提前在网上购买埃菲尔铁塔、卢浮宫或奥赛博物馆的快速通道票——旺季现场排队时间非常长。",
      },
      {
        fr: "Utilise le métro pour les grands axes, mais arpente le Marais, Montmartre ou le canal Saint-Martin à pied pour le charme des quartiers.",
        en: "Use the metro for main routes, but walk through the Marais, Montmartre or Canal Saint-Martin to soak up the neighbourhood charm.",
        de: "Die Metro für die Hauptstrecken nutzen, aber das Marais, Montmartre oder den Canal Saint-Martin zu Fuß erkunden.",
        es: "Usa el metro para los grandes ejes, pero recorre el Marais, Montmartre o el Canal Saint-Martin a pie para disfrutar del encanto de los barrios.",
        it: "Usa la metro per i percorsi principali, ma esplora il Marais, Montmartre o il Canal Saint-Martin a piedi per il fascino dei quartieri.",
        zh: "乘坐地铁前往主要景点，但步行穿越玛莱区、蒙马特或圣马丁运河，感受各街区的独特魅力。",
      },
      {
        fr: "Quelques mots de politesse en français (« Bonjour », « Merci », « S'il vous plaît ») facilitent beaucoup les échanges dans les cafés et boutiques.",
        en: "A few polite words in French (\"Bonjour\", \"Merci\", \"S'il vous plaît\") go a long way in cafés and shops.",
        de: "Ein paar höfliche Worte auf Französisch (\"Bonjour\", \"Merci\", \"S'il vous plaît\") erleichtern den Umgang in Cafés und Geschäften sehr.",
        es: "Unas pocas palabras amables en francés («Bonjour», «Merci», «S'il vous plaît») facilitan mucho los intercambios en cafés y tiendas.",
        it: "Alcune parole gentili in francese («Bonjour», «Merci», «S'il vous plaît») facilitano molto gli scambi nei caffè e nei negozi.",
        zh: "学几句法语礼貌用语（「Bonjour」「Merci」「S'il vous plaît」）在咖啡馆和商店会有很大帮助。",
      },
    ],
  },
  tokyo: {
    do: [
      {
        fr: "Achète une carte Suica ou Pasmo dès l'aéroport : elle sert pour trains, métros et la plupart des konbini.",
        en: "Get a Suica or Pasmo card at the airport: it works for trains, subways and most convenience stores.",
        de: "Am Flughafen eine Suica- oder Pasmo-Karte kaufen: sie gilt für Züge, U-Bahnen und die meisten Konbini.",
        es: "Compra una tarjeta Suica o Pasmo en el aeropuerto: sirve para trenes, metros y la mayoría de los konbini.",
        it: "Compra una carta Suica o Pasmo all'aeroporto: funziona per treni, metro e la maggior parte dei konbini.",
        zh: "在机场购买Suica或Pasmo卡：可用于火车、地铁及大多数便利店消费。",
      },
      {
        fr: "Évite Shibuya et Shinjuku à 18 h–20 h si tu détestes la foule ; les premiers trains le matin sont plus calmes pour Senso-ji ou Meiji.",
        en: "Avoid Shibuya and Shinjuku between 18:00–20:00 if you hate crowds; early morning trains are much quieter for Senso-ji or Meiji Shrine.",
        de: "Shibuya und Shinjuku zwischen 18–20 Uhr meiden; frühe Morgenzüge sind ruhiger für Senso-ji oder den Meiji-Schrein.",
        es: "Evita Shibuya y Shinjuku entre las 18:00 y las 20:00 si odias las multitudes; los primeros trenes por la mañana son más tranquilos para Senso-ji o Meiji.",
        it: "Evita Shibuya e Shinjuku tra le 18:00 e le 20:00 se odi la folla; i primi treni del mattino sono più tranquilli per Senso-ji o Meiji.",
        zh: "如果不喜欢拥挤，避开18:00-20:00的涩谷和新宿；清晨的头班车去浅草寺或明治神宫更安静。",
      },
      {
        fr: "Beaucoup de restos n'acceptent que le cash : garde des yen sur toi, surtout dans les petites adresses.",
        en: "Many restaurants only accept cash: keep yen on you, especially at smaller places.",
        de: "Viele Restaurants akzeptieren nur Bargeld: Yen dabeihaben, besonders bei kleineren Lokalen.",
        es: "Muchos restaurantes solo aceptan efectivo: lleva yenes encima, sobre todo en los lugares más pequeños.",
        it: "Molti ristoranti accettano solo contanti: tieni degli yen con te, specialmente nei posti più piccoli.",
        zh: "很多餐厅只收现金：特别是在小店消费时，随时备好日元。",
      },
    ],
  },
  "new york": {
    do: [
      {
        fr: "Pour la Statue de la Liberté ou le sommet de l'Empire State / Edge, réserve des créneaux à l'avance sur les sites officiels.",
        en: "For the Statue of Liberty or the Empire State / Edge top, book time slots in advance on the official websites.",
        de: "Für die Freiheitsstatue oder die Spitze des Empire State / Edge, Zeitfenster auf den offiziellen Websites im Voraus buchen.",
        es: "Para la Estatua de la Libertad o la cima del Empire State / Edge, reserva franjas horarias con antelación en los sitios oficiales.",
        it: "Per la Statua della Libertà o la cima dell'Empire State / Edge, prenota le fasce orarie in anticipo sui siti ufficiali.",
        zh: "参观自由女神像或帝国大厦/边缘观景台，请提前在官方网站预订时段。",
      },
      {
        fr: "Le métro (MetroCard ou OMNY) est le plus fiable pour traverser Manhattan ; vérifie les travaux nocturnes le week-end.",
        en: "The subway (MetroCard or OMNY) is the most reliable way across Manhattan; check for weekend overnight works.",
        de: "Die U-Bahn (MetroCard oder OMNY) ist die zuverlässigste Möglichkeit durch Manhattan; nächtliche Wochenendarbeiten prüfen.",
        es: "El metro (MetroCard u OMNY) es lo más fiable para cruzar Manhattan; revisa los trabajos nocturnos del fin de semana.",
        it: "La metro (MetroCard o OMNY) è il mezzo più affidabile per attraversare Manhattan; controlla i lavori notturni nel weekend.",
        zh: "地铁（MetroCard或OMNY）是穿越曼哈顿最可靠的方式；注意周末夜间施工停运。",
      },
      {
        fr: "Central Park et Brooklyn Bridge sont gratuits : vise tôt le matin pour la lumière et moins de monde.",
        en: "Central Park and the Brooklyn Bridge are free: aim for early morning for the light and fewer crowds.",
        de: "Central Park und Brooklyn Bridge sind kostenlos: früh morgens für das Licht und weniger Menschenmassen.",
        es: "Central Park y el Puente de Brooklyn son gratuitos: ve temprano por la mañana para disfrutar de la luz y menos gente.",
        it: "Central Park e il Brooklyn Bridge sono gratuiti: punta al mattino presto per la luce e meno folla.",
        zh: "中央公园和布鲁克林大桥免费参观：清晨前往光线最好且人少。",
      },
    ],
  },
  istanbul: {
    do: [
      {
        fr: "Sainte-Sophie et la mosquée Bleue attirent la foule : passe en début de matinée et respecte tenue couvrante (foulard, pantalon long).",
        en: "Hagia Sophia and the Blue Mosque draw crowds: go early in the morning and dress modestly (headscarf, long trousers).",
        de: "Hagia Sophia und die Blaue Moschee sind sehr beliebt: früh morgens gehen und sich bedeckt kleiden (Kopftuch, lange Hose).",
        es: "Santa Sofía y la Mezquita Azul atraen mucha gente: ve a primera hora de la mañana y viste con ropa recatada (pañuelo, pantalón largo).",
        it: "Hagia Sophia e la Moschea Blu attirano le folle: vai la mattina presto e vesti in modo modesto (foulard, pantaloni lunghi).",
        zh: "圣索菲亚大教堂和蓝色清真寺人很多：清晨前往，并穿着得体（头巾、长裤）。",
      },
      {
        fr: "Négocie calmement au Grand Bazar et au marché aux épices, mais fixe ton prix max avant d'entrer dans la discussion.",
        en: "Bargain calmly at the Grand Bazaar and Spice Market, but decide your max price before entering the negotiation.",
        de: "Im Großen Basar und auf dem Gewürzmarkt ruhig verhandeln, aber den Höchstpreis festlegen, bevor man in die Verhandlung eintritt.",
        es: "Negocia tranquilamente en el Gran Bazar y el Mercado de las Especias, pero fija tu precio máximo antes de entrar en la discusión.",
        it: "Contratta con calma al Gran Bazaar e al Mercato delle Spezie, ma decidi il tuo prezzo massimo prima di entrare nella trattativa.",
        zh: "在大巴扎和香料市场冷静砍价，但在开口前先想好自己的最高接受价。",
      },
      {
        fr: "Le ferry sur le Bosphore vaut le détour pour la vue ; la carte Istanbulkart simplifie tram, métro et bateaux publics.",
        en: "The Bosphorus ferry is well worth it for the view; the Istanbulkart simplifies trams, metro and public ferries.",
        de: "Die Bosporus-Fähre lohnt sich für die Aussicht; die Istanbulkart vereinfacht Straßenbahn, U-Bahn und öffentliche Fähren.",
        es: "El ferry por el Bósforo merece la pena por las vistas; la Istanbulkart facilita tranvías, metro y ferries públicos.",
        it: "Il traghetto sul Bosforo vale la pena per il panorama; l'Istanbulkart semplifica tram, metro e traghetti pubblici.",
        zh: "博斯普鲁斯海峡渡轮风景绝佳，值得一乘；İstanbulkart卡可通行有轨电车、地铁和公共渡轮。",
      },
    ],
  },
  marrakech: {
    do: [
      {
        fr: "Fixe le prix des taxis (ou compteur) avant de monter, surtout depuis l'aéroport ou la médina.",
        en: "Agree on the taxi fare (or insist on the meter) before getting in, especially from the airport or medina.",
        de: "Den Taxipreis (oder Zähler) vor dem Einsteigen festlegen, besonders vom Flughafen oder der Medina.",
        es: "Acuerda el precio del taxi (o insiste en el taxímetro) antes de subir, especialmente desde el aeropuerto o la medina.",
        it: "Contratta il prezzo del taxi (o insisti sul tassametro) prima di salire, specialmente dall'aeroporto o dalla medina.",
        zh: "上车前先谈好车费（或坚持使用计价器），尤其是从机场或麦地那出发时。",
      },
      {
        fr: "La place Jemaa el-Fna vit le soir : garde tes affaires en vue et refuse les « guides » non sollicités vers les souks.",
        en: "Djemaa el-Fna square comes alive at night: keep your belongings in sight and decline unsolicited 'guides' to the souks.",
        de: "Der Djemaa el-Fna-Platz lebt abends auf: Sachen im Blick behalten und ungebetene „Führer“ zu den Souks ablehnen.",
        es: "La plaza Jemaa el-Fna cobra vida por la noche: vigila tus cosas y rechaza los «guías» no solicitados hacia los zocos.",
        it: "Piazza Djemaa el-Fna si anima la sera: tieni d'occhio le tue cose e rifiuta le «guide» non richieste verso i souk.",
        zh: "德杰马·弗纳广场入夜后十分热闹：看好随身物品，拒绝主动搭讪的\"导游\"带你去集市。",
      },
      {
        fr: "Le jardin Majorelle se visite mieux avec billet horaire réservé en ligne — souvent complet sur place.",
        en: "Majorelle Garden is best visited with a timed ticket booked online — it's often sold out on the spot.",
        de: "Den Majorelle-Garten besser mit einem online gebuchten Zeitticket besuchen — vor Ort oft ausverkauft.",
        es: "El Jardín Majorelle se visita mejor con entrada horaria reservada en línea — suele estar agotada en taquilla.",
        it: "Il Giardino Majorelle è meglio visitarlo con un biglietto a orario prenotato online — spesso esaurito in loco.",
        zh: "玛约尔花园建议提前网上购买定时票——现场经常售罄。",
      },
    ],
  },
  bali: {
    do: [
      {
        fr: "Respecte les offrandes et les cérémonies : ne marche pas sur les canang au sol et couvre épaules et jambes dans les temples.",
        en: "Respect offerings and ceremonies: don't walk on the canang on the ground and cover shoulders and legs in temples.",
        de: "Opfergaben und Zeremonien respektieren: nicht auf die Canang auf dem Boden treten und in Tempeln Schultern und Beine bedecken.",
        es: "Respeta las ofrendas y ceremonias: no pises los canang en el suelo y cúbrete hombros y piernas en los templos.",
        it: "Rispetta le offerte e le cerimonie: non camminare sui canang a terra e copri spalle e gambe nei templi.",
        zh: "尊重祭品和仪式：不要踩踏地面上的卡南供品，进寺庙要遮住肩膀和腿。",
      },
      {
        fr: "Les trajets Ubud–nord ou vers les temples prennent souvent plus longtemps que prévu : ne surcharge pas ta journée.",
        en: "Getting from Ubud northward or to temples often takes longer than expected: don't overpack your day.",
        de: "Fahrten von Ubud nach Norden oder zu Tempeln dauern oft länger als erwartet: den Tag nicht überladen.",
        es: "Los trayectos desde Ubud hacia el norte o hacia los templos suelen llevar más tiempo del previsto: no sobrecargues tu jornada.",
        it: "I tragitti da Ubud verso nord o verso i templi richiedono spesso più tempo del previsto: non sovraccaricare la giornata.",
        zh: "从乌布前往北部或寺庙的路程往往比预期更长：不要把行程安排得太满。",
      },
      {
        fr: "Hydrate-toi et protège-toi du soleil : la chaleur est forte dès 10 h ; privilégie tôt le matin pour les rizières et les sites.",
        en: "Stay hydrated and protect yourself from the sun: heat is intense from 10 am; head to rice fields and sites early in the morning.",
        de: "Hydrieren und vor der Sonne schützen: ab 10 Uhr ist die Hitze stark; Reisfelder und Sehenswürdigkeiten früh morgens besuchen.",
        es: "Manténte hidratado y protégete del sol: el calor es fuerte desde las 10 h; visita los arrozales y los sitios temprano por la mañana.",
        it: "Idratati e proteggiti dal sole: il caldo è intenso dalle 10:00; preferisci le prime ore del mattino per risaie e siti.",
        zh: "注意补水和防晒：早上10点后阳光强烈；建议清晨前往稻田和景点。",
      },
    ],
  },
  berne: {
    do: [
      {
        fr: "La vieille ville de Berne (inscrite à l'UNESCO) et la Zytglogge se parcourent à pied — prévois de bonnes chaussures sur les pavés.",
        en: "Berne's old town (UNESCO-listed) and the Zytglogge clock tower are best explored on foot — wear comfortable shoes on the cobblestones.",
        de: "Berns Altstadt (UNESCO-Welterbe) und die Zytglogge lassen sich zu Fuß erkunden — gutes Schuhwerk auf dem Kopfsteinpflaster empfohlen.",
        es: "El casco antiguo de Berna (Patrimonio UNESCO) y el Zytglogge se recorren mejor a pie — lleva calzado cómodo sobre los adoquines.",
        it: "Il centro storico di Berna (patrimonio UNESCO) e lo Zytglogge si percorrono a piedi — meglio scarpe comode sul selciato.",
        zh: "伯尔尼旧城（联合国教科文组织遗址）和齐特格洛格钟楼适合步行游览——石板路上建议穿舒适的鞋。",
      },
      {
        fr: "Les musées (Einstein, beaux-arts, Zentrum Paul Klee) sont bondés le week-end : réserve un créneau ou passe en matinée.",
        en: "Museums (Einstein, Fine Arts, Zentrum Paul Klee) are crowded on weekends: book a slot or visit in the morning.",
        de: "Museen (Einstein, Kunstmuseum, Zentrum Paul Klee) sind am Wochenende voll: einen Zeitplatz buchen oder morgens gehen.",
        es: "Los museos (Einstein, Bellas Artes, Zentrum Paul Klee) están concurridos el fin de semana: reserva un turno o visítalos por la mañana.",
        it: "I musei (Einstein, Belle Arti, Zentrum Paul Klee) sono affollati nel weekend: prenota uno slot o vai la mattina.",
        zh: "周末博物馆（爱因斯坦馆、艺术博物馆、保罗·克利中心）人很多：建议预约时段或上午参观。",
      },
      {
        fr: "Depuis la gare centrale, les cartes demi-tarif ou billets journée SBB valent souvent le coup si tu fais des excursions vers les lacs ou l'Oberland.",
        en: "From the main station, SBB half-fare cards or day passes are often worth it for day trips to the lakes or the Oberland.",
        de: "Vom Hauptbahnhof lohnen sich SBB-Halbstreckenabonnements oder Tageskarten für Ausflüge in die Seen oder das Oberland.",
        es: "Desde la estación principal, los abonos de media tarifa o los billetes de día SBB suelen merecer la pena para excursiones a los lagos o el Oberland.",
        it: "Dalla stazione principale, gli abbonamenti a metà tariffa o i biglietti giornalieri SBB spesso convengono per gite ai laghi o all'Oberland.",
        zh: "从中央车站出发，购买瑞铁半价卡或一日票往往物有所值，特别是前往湖区或奥伯兰游览时。",
      },
    ],
  },
};
