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
  ibiza: {
    do: [
      {
        fr: "Loue un scooter ou une voiture pour explorer les calas (Cala Comte, Cala Salada, Cala d'Hort) — les plus belles plages sont isolées et mal desservies par les bus.",
        en: "Rent a scooter or car to explore the calas (Cala Comte, Cala Salada, Cala d'Hort) — the prettiest beaches are remote and poorly served by buses.",
        es: "Alquila una moto o un coche para explorar las calas (Cala Comte, Cala Salada, Cala d'Hort) — las mejores playas son remotas y mal comunicadas en bus.",
      },
      {
        fr: "Arrive tôt (avant 11 h) aux plages populaires comme Cala Comte ou Cala Bassa — le parking et les transats partent vite en été.",
        en: "Arrive early (before 11 am) at popular beaches like Cala Comte or Cala Bassa — parking and sun loungers fill up fast in summer.",
        es: "Llega temprano (antes de las 11 h) a las playas populares como Cala Comte o Cala Bassa — el aparcamiento y las tumbonas se llenan rápido en verano.",
      },
      {
        fr: "Visite Dalt Vila (vieille ville fortifiée, UNESCO) en fin de journée pour le coucher de soleil sur le port — c'est gratuit et magnifique.",
        en: "Visit Dalt Vila (UNESCO-listed old walled town) in the late afternoon for the sunset over the harbour — it's free and gorgeous.",
        es: "Visita Dalt Vila (casco antiguo amurallado, UNESCO) al final de la tarde para la puesta de sol sobre el puerto — es gratis y espectacular.",
      },
    ],
  },
  eivissa: {
    do: [
      {
        fr: "Loue un scooter ou une voiture pour explorer les calas (Cala Comte, Cala Salada, Cala d'Hort) — les plus belles plages sont isolées et mal desservies par les bus.",
        en: "Rent a scooter or car to explore the calas (Cala Comte, Cala Salada, Cala d'Hort) — the prettiest beaches are remote and poorly served by buses.",
        es: "Alquila una moto o un coche para explorar las calas (Cala Comte, Cala Salada, Cala d'Hort) — las mejores playas son remotas y mal comunicadas en bus.",
      },
      {
        fr: "Arrive tôt (avant 11 h) aux plages populaires comme Cala Comte ou Cala Bassa — le parking et les transats partent vite en été.",
        en: "Arrive early (before 11 am) at popular beaches like Cala Comte or Cala Bassa — parking and sun loungers fill up fast in summer.",
        es: "Llega temprano (antes de las 11 h) a las playas populares como Cala Comte o Cala Bassa — el aparcamiento y las tumbonas se llenan rápido en verano.",
      },
      {
        fr: "Visite Dalt Vila (vieille ville fortifiée, UNESCO) en fin de journée pour le coucher de soleil sur le port — c'est gratuit et magnifique.",
        en: "Visit Dalt Vila (UNESCO-listed old walled town) in the late afternoon for the sunset over the harbour — it's free and gorgeous.",
        es: "Visita Dalt Vila (casco antiguo amurallado, UNESCO) al final de la tarde para la puesta de sol sobre el puerto — es gratis y espectacular.",
      },
    ],
  },
  mykonos: {
    do: [
      {
        fr: "Réserve le bateau pour Délos tôt le matin (départs limités) — le site archéologique ferme l'après-midi et il n'y a pas d'ombre.",
        en: "Book the boat to Delos early morning (limited departures) — the archaeological site closes in the afternoon and there's no shade.",
        es: "Reserva el barco a Delos temprano por la mañana (salidas limitadas) — el sitio arqueológico cierra por la tarde y no hay sombra.",
      },
      {
        fr: "Petite Venise et les moulins à vent sont sublimes au coucher du soleil — arrive 30 min avant pour trouver une place en terrasse.",
        en: "Little Venice and the windmills are stunning at sunset — arrive 30 minutes early to get a terrace seat.",
        es: "La Pequeña Venecia y los molinos son sublimes al atardecer — llega 30 minutos antes para encontrar sitio en una terraza.",
      },
      {
        fr: "Le vent (meltemi) peut souffler fort en juillet-août : prévois un coupe-vent et choisis tes plages selon l'orientation.",
        en: "The meltemi wind can be strong in July–August: bring a windbreaker and choose your beaches based on wind direction.",
        es: "El viento (meltemi) puede soplar fuerte en julio-agosto: lleva un cortavientos y elige tus playas según la orientación.",
      },
    ],
  },
  santorini: {
    do: [
      {
        fr: "Le coucher de soleil à Oia est mythique mais bondé : arrive 1 h avant ou vise le fort byzantin de Fira pour la même vue sans la foule.",
        en: "The Oia sunset is iconic but packed: arrive 1 hour early or head to the Byzantine fortress in Fira for the same view without the crowds.",
        es: "La puesta de sol en Oia es mítica pero abarrotada: llega 1 hora antes o elige la fortaleza bizantina de Fira para la misma vista sin multitudes.",
      },
      {
        fr: "La randonnée Fira–Oia (10 km, 3 h) offre les meilleures vues de la caldeira — pars tôt le matin avec de l'eau et de la crème solaire.",
        en: "The Fira–Oia hike (10 km, 3 h) offers the best caldera views — start early in the morning with water and sunscreen.",
        es: "La caminata Fira–Oia (10 km, 3 h) ofrece las mejores vistas de la caldera — sal temprano por la mañana con agua y protector solar.",
      },
      {
        fr: "Les vignobles locaux (Assyrtiko) se visitent souvent sans réservation hors saison, mais réserve en ligne en été — les dégustations sont très demandées.",
        en: "Local vineyards (Assyrtiko) are often walkable off-season, but book online in summer — tastings are very popular.",
        es: "Las bodegas locales (Assyrtiko) se visitan a menudo sin reserva fuera de temporada, pero reserva en línea en verano — las catas son muy demandadas.",
      },
    ],
  },
  santorin: {
    do: [
      {
        fr: "Le coucher de soleil à Oia est mythique mais bondé : arrive 1 h avant ou vise le fort byzantin de Fira pour la même vue sans la foule.",
        en: "The Oia sunset is iconic but packed: arrive 1 hour early or head to the Byzantine fortress in Fira for the same view without the crowds.",
        es: "La puesta de sol en Oia es mítica pero abarrotada: llega 1 hora antes o elige la fortaleza bizantina de Fira para la misma vista sin multitudes.",
      },
      {
        fr: "La randonnée Fira–Oia (10 km, 3 h) offre les meilleures vues de la caldeira — pars tôt le matin avec de l'eau et de la crème solaire.",
        en: "The Fira–Oia hike (10 km, 3 h) offers the best caldera views — start early in the morning with water and sunscreen.",
        es: "La caminata Fira–Oia (10 km, 3 h) ofrece las mejores vistas de la caldera — sal temprano por la mañana con agua y protector solar.",
      },
      {
        fr: "Les vignobles locaux (Assyrtiko) se visitent souvent sans réservation hors saison, mais réserve en ligne en été — les dégustations sont très demandées.",
        en: "Local vineyards (Assyrtiko) are often walkable off-season, but book online in summer — tastings are very popular.",
        es: "Las bodegas locales (Assyrtiko) se visitan a menudo sin reserva fuera de temporada, pero reserva en línea en verano — las catas son muy demandadas.",
      },
    ],
  },
  cancun: {
    do: [
      {
        fr: "Réserve l'excursion à Chichén Itzá avec départ très tôt (6 h) pour arriver avant la foule et la chaleur — la différence est énorme.",
        en: "Book the Chichén Itzá excursion with an early departure (6 am) to arrive before the crowds and heat — the difference is huge.",
        es: "Reserva la excursión a Chichén Itzá con salida muy temprana (6 h) para llegar antes de la multitud y el calor — la diferencia es enorme.",
      },
      {
        fr: "Les cenotes (Ik Kil, Suytun, Dos Ojos) sont des piscines naturelles uniques — apporte un maillot et de l'anti-moustiques biodégradable.",
        en: "Cenotes (Ik Kil, Suytun, Dos Ojos) are unique natural swimming holes — bring a swimsuit and biodegradable insect repellent.",
        es: "Los cenotes (Ik Kil, Suytun, Dos Ojos) son piscinas naturales únicas — lleva bañador y repelente de mosquitos biodegradable.",
      },
      {
        fr: "Isla Mujeres (30 min de ferry) offre Playa Norte, l'une des plus belles plages du Mexique — vise la journée entière, c'est plus détente que Cancún.",
        en: "Isla Mujeres (30 min ferry) has Playa Norte, one of Mexico's most beautiful beaches — plan a full day, it's more laid-back than Cancún.",
        es: "Isla Mujeres (30 min en ferry) tiene Playa Norte, una de las playas más bonitas de México — planea un día entero, es más relajado que Cancún.",
      },
    ],
  },
  tulum: {
    do: [
      {
        fr: "Arrive aux ruines de Tulum dès l'ouverture (8 h) — la vue sur la plage turquoise depuis les falaises est époustouflante et la foule arrive vers 10 h.",
        en: "Get to the Tulum ruins at opening (8 am) — the view of the turquoise beach from the cliffs is breathtaking and crowds arrive around 10 am.",
        es: "Llega a las ruinas de Tulum a la apertura (8 h) — la vista de la playa turquesa desde los acantilados es impresionante y la multitud llega hacia las 10 h.",
      },
      {
        fr: "Loue un vélo pour te déplacer entre la plage, le pueblo et les cenotes proches (Gran Cenote, Cenote Calavera) — c'est plus pratique que le taxi.",
        en: "Rent a bike to get between the beach, the pueblo and the nearby cenotes (Gran Cenote, Cenote Calavera) — it's more convenient than taxis.",
        es: "Alquila una bici para moverte entre la playa, el pueblo y los cenotes cercanos (Gran Cenote, Cenote Calavera) — es más práctico que el taxi.",
      },
      {
        fr: "Applique uniquement de la crème solaire biodégradable dans les cenotes — c'est obligatoire et essentiel pour protéger ces écosystèmes uniques.",
        en: "Only use biodegradable sunscreen in the cenotes — it's mandatory and essential to protect these unique ecosystems.",
        es: "Usa solo protector solar biodegradable en los cenotes — es obligatorio y esencial para proteger estos ecosistemas únicos.",
      },
    ],
  },
  barcelona: {
    do: [
      {
        fr: "Réserve tes billets pour la Sagrada Família en ligne au moins 2 semaines à l'avance — c'est complet presque chaque jour en haute saison.",
        en: "Book your Sagrada Família tickets online at least 2 weeks ahead — it sells out almost every day in high season.",
        es: "Reserva tus entradas para la Sagrada Família en línea al menos 2 semanas antes — se agotan casi todos los días en temporada alta.",
      },
      {
        fr: "Le Barri Gòtic et El Born se découvrent à pied — le matin pour les boutiques et musées, le soir pour les tapas et l'ambiance des terrasses.",
        en: "The Gothic Quarter and El Born are best explored on foot — mornings for shops and museums, evenings for tapas and terrace vibes.",
        es: "El Barri Gòtic y El Born se descubren a pie — por la mañana para tiendas y museos, por la noche para tapas y el ambiente de las terrazas.",
      },
      {
        fr: "Attention aux pickpockets sur La Rambla et dans le métro — garde ton téléphone dans une poche intérieure, surtout aux heures de pointe.",
        en: "Watch out for pickpockets on La Rambla and in the metro — keep your phone in an inside pocket, especially at peak hours.",
        es: "Cuidado con los carteristas en La Rambla y en el metro — lleva el móvil en un bolsillo interior, especialmente en horas punta.",
      },
    ],
  },
  barcelone: {
    do: [
      {
        fr: "Réserve tes billets pour la Sagrada Família en ligne au moins 2 semaines à l'avance — c'est complet presque chaque jour en haute saison.",
        en: "Book your Sagrada Família tickets online at least 2 weeks ahead — it sells out almost every day in high season.",
        es: "Reserva tus entradas para la Sagrada Família en línea al menos 2 semanas antes — se agotan casi todos los días en temporada alta.",
      },
      {
        fr: "Le Barri Gòtic et El Born se découvrent à pied — le matin pour les boutiques et musées, le soir pour les tapas et l'ambiance des terrasses.",
        en: "The Gothic Quarter and El Born are best explored on foot — mornings for shops and museums, evenings for tapas and terrace vibes.",
        es: "El Barri Gòtic y El Born se descubren a pie — por la mañana para tiendas y museos, por la noche para tapas y el ambiente de las terrazas.",
      },
      {
        fr: "Attention aux pickpockets sur La Rambla et dans le métro — garde ton téléphone dans une poche intérieure, surtout aux heures de pointe.",
        en: "Watch out for pickpockets on La Rambla and in the metro — keep your phone in an inside pocket, especially at peak hours.",
        es: "Cuidado con los carteristas en La Rambla y en el metro — lleva el móvil en un bolsillo interior, especialmente en horas punta.",
      },
    ],
  },
  rome: {
    do: [
      {
        fr: "Le billet combiné Colisée + Forum + Palatin se réserve en ligne — sur place les files dépassent 1 h et les créneaux sont souvent pleins.",
        en: "The combined Colosseum + Forum + Palatine ticket should be booked online — on-site queues exceed 1 hour and slots often sell out.",
        es: "La entrada combinada Coliseo + Foro + Palatino se reserva en línea — en taquilla las colas superan 1 hora y las franjas suelen agotarse.",
      },
      {
        fr: "Explore le Trastevere en soirée pour la meilleure ambiance : traite-toi dans une trattoria à l'écart de la piazza principale pour du vrai romain.",
        en: "Explore Trastevere in the evening for the best vibes: treat yourself at a trattoria away from the main piazza for authentic Roman food.",
        es: "Explora el Trastevere por la noche para la mejor atmósfera: date un capricho en una trattoria alejada de la piazza principal para comida romana auténtica.",
      },
      {
        fr: "Les fontaines de Rome distribuent de l'eau potable gratuite (nasoni) — remplis ta gourde partout, surtout en été.",
        en: "Rome's fountains dispense free drinking water (nasoni) — refill your bottle everywhere, especially in summer.",
        es: "Las fuentes de Roma distribuyen agua potable gratis (nasoni) — rellena tu botella en cualquier sitio, sobre todo en verano.",
      },
    ],
  },
  roma: {
    do: [
      {
        fr: "Le billet combiné Colisée + Forum + Palatin se réserve en ligne — sur place les files dépassent 1 h et les créneaux sont souvent pleins.",
        en: "The combined Colosseum + Forum + Palatine ticket should be booked online — on-site queues exceed 1 hour and slots often sell out.",
        es: "La entrada combinada Coliseo + Foro + Palatino se reserva en línea — en taquilla las colas superan 1 hora y las franjas suelen agotarse.",
      },
      {
        fr: "Explore le Trastevere en soirée pour la meilleure ambiance : traite-toi dans une trattoria à l'écart de la piazza principale pour du vrai romain.",
        en: "Explore Trastevere in the evening for the best vibes: treat yourself at a trattoria away from the main piazza for authentic Roman food.",
        es: "Explora el Trastevere por la noche para la mejor atmósfera: date un capricho en una trattoria alejada de la piazza principal para comida romana auténtica.",
      },
      {
        fr: "Les fontaines de Rome distribuent de l'eau potable gratuite (nasoni) — remplis ta gourde partout, surtout en été.",
        en: "Rome's fountains dispense free drinking water (nasoni) — refill your bottle everywhere, especially in summer.",
        es: "Las fuentes de Roma distribuyen agua potable gratis (nasoni) — rellena tu botella en cualquier sitio, sobre todo en verano.",
      },
    ],
  },
  amsterdam: {
    do: [
      {
        fr: "La Maison d'Anne Frank affiche complet des semaines à l'avance — les billets en ligne s'ouvrent tous les mardis à 10 h, sois ponctuel.",
        en: "The Anne Frank House sells out weeks ahead — online tickets open every Tuesday at 10 am, be on time.",
        es: "La Casa de Ana Frank se agota semanas antes — las entradas online se abren cada martes a las 10 h, sé puntual.",
      },
      {
        fr: "Loue un vélo pour te fondre dans la ville — c'est le moyen de transport n°1, mais fais attention aux trams et aux sens de circulation.",
        en: "Rent a bike to blend into the city — it's the number one transport, but watch out for trams and one-way streets.",
        es: "Alquila una bici para integrarte en la ciudad — es el transporte n°1, pero cuidado con los tranvías y los sentidos de circulación.",
      },
      {
        fr: "Le Jordaan et De Pijp sont les quartiers les plus charmants pour manger et boire — préfère-les aux terrasses du Leidseplein (plus touristiques).",
        en: "The Jordaan and De Pijp are the most charming areas for food and drinks — prefer them over the more touristy Leidseplein terraces.",
        es: "El Jordaan y De Pijp son los barrios más encantadores para comer y beber — mejor que las terrazas más turísticas del Leidseplein.",
      },
    ],
  },
  dubai: {
    do: [
      {
        fr: "Réserve le créneau « At the Top » du Burj Khalifa au coucher du soleil pour la meilleure lumière — c'est plus cher mais spectaculaire.",
        en: "Book the Burj Khalifa 'At the Top' slot at sunset for the best light — it's more expensive but spectacular.",
        es: "Reserva la franja 'At the Top' del Burj Khalifa al atardecer para la mejor luz — es más caro pero espectacular.",
      },
      {
        fr: "Le souk de l'Or et le souk aux Épices à Deira valent le détour pour l'ambiance traditionnelle — négocie avec le sourire.",
        en: "The Gold Souk and Spice Souk in Deira are worth visiting for the traditional atmosphere — bargain with a smile.",
        es: "El Zoco del Oro y el Zoco de las Especias en Deira merecen la visita por el ambiente tradicional — negocia con una sonrisa.",
      },
      {
        fr: "Le safari dans le désert inclut souvent dîner, dromadaire et spectacle — réserve via l'hôtel ou un opérateur certifié, pas un rabatteur.",
        en: "Desert safaris usually include dinner, camel ride and show — book through your hotel or a certified operator, not a street tout.",
        es: "El safari en el desierto suele incluir cena, camello y espectáculo — reserva a través del hotel o un operador certificado, no un gancho callejero.",
      },
    ],
  },
  "dubaï": {
    do: [
      {
        fr: "Réserve le créneau « At the Top » du Burj Khalifa au coucher du soleil pour la meilleure lumière — c'est plus cher mais spectaculaire.",
        en: "Book the Burj Khalifa 'At the Top' slot at sunset for the best light — it's more expensive but spectacular.",
        es: "Reserva la franja 'At the Top' del Burj Khalifa al atardecer para la mejor luz — es más caro pero espectacular.",
      },
      {
        fr: "Le souk de l'Or et le souk aux Épices à Deira valent le détour pour l'ambiance traditionnelle — négocie avec le sourire.",
        en: "The Gold Souk and Spice Souk in Deira are worth visiting for the traditional atmosphere — bargain with a smile.",
        es: "El Zoco del Oro y el Zoco de las Especias en Deira merecen la visita por el ambiente tradicional — negocia con una sonrisa.",
      },
      {
        fr: "Le safari dans le désert inclut souvent dîner, dromadaire et spectacle — réserve via l'hôtel ou un opérateur certifié, pas un rabatteur.",
        en: "Desert safaris usually include dinner, camel ride and show — book through your hotel or a certified operator, not a street tout.",
        es: "El safari en el desierto suele incluir cena, camello y espectáculo — reserva a través del hotel o un operador certificado, no un gancho callejero.",
      },
    ],
  },
  london: {
    do: [
      {
        fr: "Les grands musées (British Museum, Tate Modern, National Gallery) sont gratuits — commence tôt et vise 2-3 salles max par visite.",
        en: "Major museums (British Museum, Tate Modern, National Gallery) are free — start early and aim for 2-3 rooms max per visit.",
        es: "Los grandes museos (British Museum, Tate Modern, National Gallery) son gratuitos — empieza temprano y apunta a 2-3 salas como máximo por visita.",
      },
      {
        fr: "Achète une Oyster Card ou utilise le sans-contact pour le métro et les bus — c'est bien moins cher que les billets à l'unité.",
        en: "Get an Oyster Card or use contactless for the Tube and buses — it's much cheaper than single tickets.",
        es: "Compra una Oyster Card o usa el pago sin contacto para el metro y los buses — es mucho más barato que los billetes sueltos.",
      },
      {
        fr: "Borough Market le samedi matin est un must pour les foodies — arrive avant 11 h pour éviter la cohue.",
        en: "Borough Market on Saturday morning is a must for foodies — arrive before 11 am to beat the rush.",
        es: "Borough Market el sábado por la mañana es imprescindible para los foodies — llega antes de las 11 h para evitar la aglomeración.",
      },
    ],
  },
  londres: {
    do: [
      {
        fr: "Les grands musées (British Museum, Tate Modern, National Gallery) sont gratuits — commence tôt et vise 2-3 salles max par visite.",
        en: "Major museums (British Museum, Tate Modern, National Gallery) are free — start early and aim for 2-3 rooms max per visit.",
        es: "Los grandes museos (British Museum, Tate Modern, National Gallery) son gratuitos — empieza temprano y apunta a 2-3 salas como máximo por visita.",
      },
      {
        fr: "Achète une Oyster Card ou utilise le sans-contact pour le métro et les bus — c'est bien moins cher que les billets à l'unité.",
        en: "Get an Oyster Card or use contactless for the Tube and buses — it's much cheaper than single tickets.",
        es: "Compra una Oyster Card o usa el pago sin contacto para el metro y los buses — es mucho más barato que los billetes sueltos.",
      },
      {
        fr: "Borough Market le samedi matin est un must pour les foodies — arrive avant 11 h pour éviter la cohue.",
        en: "Borough Market on Saturday morning is a must for foodies — arrive before 11 am to beat the rush.",
        es: "Borough Market el sábado por la mañana es imprescindible para los foodies — llega antes de las 11 h para evitar la aglomeración.",
      },
    ],
  },
  lisbonne: {
    do: [
      {
        fr: "Le tramway 28 est une attraction en soi, mais bondé aux heures de pointe — pars tôt le matin ou en fin d'après-midi.",
        en: "Tram 28 is a tourist attraction in itself, but packed at peak hours — go early morning or late afternoon.",
        es: "El tranvía 28 es una atracción en sí, pero abarrotado en horas punta — ve a primera hora de la mañana o a última hora de la tarde.",
      },
      {
        fr: "Goûte les pastéis de nata à la Pastéis de Belém mais aussi dans les pâtisseries de quartier (Manteigaria, par ex.) — souvent meilleures et moins de queue.",
        en: "Try the pastéis de nata at Pastéis de Belém but also at neighbourhood bakeries (Manteigaria, for instance) — often better and less queuing.",
        es: "Prueba los pastéis de nata en Pastéis de Belém, pero también en panaderías de barrio (Manteigaria, por ejemplo) — suelen estar mejores y hay menos cola.",
      },
      {
        fr: "L'Alfama se visite à pied en descendant depuis le Castelo São Jorge — les ruelles sont raides mais les miradouros valent chaque marche.",
        en: "Explore the Alfama on foot walking down from Castelo São Jorge — the lanes are steep but the miradouros are worth every step.",
        es: "El Alfama se visita a pie bajando desde el Castelo São Jorge — las callejuelas son empinadas pero los miradores valen cada paso.",
      },
    ],
  },
  lisbon: {
    do: [
      {
        fr: "Le tramway 28 est une attraction en soi, mais bondé aux heures de pointe — pars tôt le matin ou en fin d'après-midi.",
        en: "Tram 28 is a tourist attraction in itself, but packed at peak hours — go early morning or late afternoon.",
        es: "El tranvía 28 es una atracción en sí, pero abarrotado en horas punta — ve a primera hora de la mañana o a última hora de la tarde.",
      },
      {
        fr: "Goûte les pastéis de nata à la Pastéis de Belém mais aussi dans les pâtisseries de quartier (Manteigaria, par ex.) — souvent meilleures et moins de queue.",
        en: "Try the pastéis de nata at Pastéis de Belém but also at neighbourhood bakeries (Manteigaria, for instance) — often better and less queuing.",
        es: "Prueba los pastéis de nata en Pastéis de Belém, pero también en panaderías de barrio (Manteigaria, por ejemplo) — suelen estar mejores y hay menos cola.",
      },
      {
        fr: "L'Alfama se visite à pied en descendant depuis le Castelo São Jorge — les ruelles sont raides mais les miradouros valent chaque marche.",
        en: "Explore the Alfama on foot walking down from Castelo São Jorge — the lanes are steep but the miradouros are worth every step.",
        es: "El Alfama se visita a pie bajando desde el Castelo São Jorge — las callejuelas son empinadas pero los miradores valen cada paso.",
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
  strasbourg: {
    do: [
      {
        fr: "La montée de la cathédrale (plateforme) se réserve en ligne : les créneaux partent vite, surtout en week-end et à l'Avent.",
        en: "Book cathedral platform tickets online — slots sell out fast, especially on weekends and during Advent.",
        de: "Tickets für die Kathedralplattform online buchen — Zeitfenster sind schnell ausgebucht, besonders am Wochenende und zur Adventszeit.",
        es: "Reserva en línea la subida a la plataforma de la catedral: los huecos vuelan, sobre todo en fin de semana y en Adviento.",
        it: "Prenota online la salita alla piattaforma della cattedrale: i posti finiscono in fretta, soprattutto nel weekend e in Avvento.",
        zh: "大教堂观景平台门票建议网上预约——周末和将临期尤其紧俏。",
      },
      {
        fr: "Petite France et le centre historique sont piétons : privilégie marche ou tram ; gare un peu plus loin pour éviter les zones réservées.",
        en: "Petite France and the historic centre are pedestrian-friendly: walk or take trams; park slightly outside to avoid restricted zones.",
        de: "Petite France und die Altstadt sind fußgängerfreundlich: zu Fuß oder mit der Straßenbahn; etwas außerhalb parken.",
        es: "Petite France y el centro histórico se recorren mejor a pie o en tranvía; aparca un poco más lejos de las zonas restringidas.",
        it: "Petite France e il centro storico sono a misura di pedone: meglio a piedi o in tram; parcheggia fuori dalle zone a traffico limitato.",
        zh: "小法兰西与老城适合步行或有轨电车；建议停在限行区外。",
      },
      {
        fr: "Pour le Parlement européen, inscris-toi aux visites officielles (gratuites) plusieurs semaines à l'avance en haute saison.",
        en: "For the European Parliament, sign up for official (free) tours several weeks ahead in high season.",
        de: "Für das Europaparlament offizielle (kostenlose) Führungen in der Hochsaison mehrere Wochen im Voraus anmelden.",
        es: "Para el Parlamento Europeo, apúntate a las visitas oficiales (gratuitas) con varias semanas de antelación en temporada alta.",
        it: "Per il Parlamento europeo iscriviti alle visite ufficiali (gratuite) con settimane di anticipo in alta stagione.",
        zh: "欧洲议会免费导览旺季需提前数周在官网预约。",
      },
    ],
  },
  colmar: {
    do: [
      {
        fr: "Petite Venise est étroite : vise tôt le matin pour les photos ; le marché couvert vaut le détour le matin pour les producteurs.",
        en: "Petite Venise is narrow: go early for photos; the covered market is best in the morning for local producers.",
        de: "Petite Venise ist eng: für Fotos früh morgens gehen; die Markthalle lohnt sich am Vormittag bei den Erzeugern.",
        es: "Petite Venise es estrecha: ve temprano para fotos; el mercado cubierto merece la pena por la mañana con productores locales.",
        it: "Petite Venise è stretta: arriva presto per le foto; il mercato coperto vale la mattina dai produttori.",
        zh: "小威尼斯巷道狭窄，清晨拍照最佳；室内市场上午逛本地农户更有味道。",
      },
      {
        fr: "L'Unterlinden et la Maison Bartholdi : achète les billets en ligne ou arrive à l'ouverture en juillet-août.",
        en: "Unterlinden and Bartholdi House: buy tickets online or arrive at opening time in July–August.",
        de: "Unterlinden und Bartholdi-Museum: Tickets online kaufen oder zur Öffnungszeit kommen (Juli/August).",
        es: "Unterlinden y casa Bartholdi: compra entradas en línea o llega a la apertura en julio y agosto.",
        it: "Unterlinden e casa Bartholdi: biglietti online o all'apertura in luglio-agosto.",
        zh: "安特林登博物馆与巴尔托尔迪故居：七八月建议网上购票或开门即到。",
      },
      {
        fr: "Route des vins : ne conduit pas après dégustation ; préfère navettes, vélo doux ou excursion organisée depuis Colmar.",
        en: "Wine route: don't drive after tastings — use shuttles, easy cycling, or an organised tour from Colmar.",
        de: "Weinstraße: nach Verkostungen nicht fahren — Shuttle, gemütliches Rad oder organisierte Tour ab Colmar.",
        es: "Ruta del vino: no conduzcas tras catas; usa lanzaderas, bici suave o excursión organizada desde Colmar.",
        it: "Strada dei vini: non guidare dopo le degustazioni — navette, bici o tour organizzato da Colmar.",
        zh: "葡萄酒之路品鉴后勿开车；可选接驳、休闲骑行或科尔马出发的一日游。",
      },
    ],
  },
  mulhouse: {
    do: [
      {
        fr: "La Cité de l'automobile est immense : compte au moins 2 h ; billet souvent couplé avec Electropolis si tu aimes l'industrie et le design.",
        en: "The National Automobile Museum is huge: allow at least 2 hours; tickets are often bundled with Electropolis if you like industrial design.",
        de: "Das Automobilmuseum ist riesig: mindestens 2 Stunden einplanen; Tickets oft mit Electropolis kombinierbar.",
        es: "El museo del automóvil es enorme: prevé al menos 2 h; a menudo hay pase combinado con Electropolis.",
        it: "Il museo dell'automobile è enorme: conta almeno 2 ore; biglietto spesso cumulabile con Electropolis.",
        zh: "汽车博物馆体量很大，至少预留两小时；常与电力博物馆有联票。",
      },
      {
        fr: "Le zoo-parc est prisé le week-end : achète en ligne ; en tram depuis la gare (lignes vers Rebberg) pour éviter de chercher une place.",
        en: "The zoo is busy on weekends: book online; take the tram from the station (lines towards Rebberg) to skip parking hassle.",
        de: "Zoo am Wochenende stark frequentiert: online buchen; mit der Tram ab Bahnhof (Richtung Rebberg) fahren.",
        es: "El zoo se llena el fin de semana: compra online; tranvía desde la estación (hacia Rebberg) para evitar aparcar.",
        it: "Lo zoo è affollato nel weekend: acquista online; tram dalla stazione (verso Rebberg).",
        zh: "动物园周末拥挤，建议网上购票；从火车站乘有轨电车前往/Rebberg 方向更省心。",
      },
      {
        fr: "Depuis Mulhouse, Bâle (CH) et la Forêt-Noire sont accessibles en train : la carte européenne ou les billets régionaux Alsace valent le coup la journée.",
        en: "From Mulhouse, Basel (CH) and the Black Forest are easy by train: regional day tickets or cross-border passes often pay off.",
        de: "Von Mulhouse aus sind Basel und der Schwarzwald bequem per Zug erreichbar: Tageskarten lohnen sich oft.",
        es: "Desde Mulhouse, Basilea y la Selva Negra van bien en tren: los abonos regionales suelen compensar.",
        it: "Da Mulhouse, Basilea e Foresta Nera sono comodi in treno: i biglietti regionali a giornata spesso convengono.",
        zh: "从米卢斯乘火车可便捷前往巴塞尔与黑森林，跨境或区域日票常常划算。",
      },
    ],
  },
  cannes: {
    do: [
      {
        fr: "Les îles de Lérins : ferry depuis le vieux port — embarque tôt ; emporte eau et crème solaire, peu d'ombre sur les sentiers.",
        en: "Lérins islands: ferry from the old port — board early; bring water and sunscreen, little shade on paths.",
        de: "Lérins-Inseln: Fähre vom Alten Hafen — früh einsteigen; Wasser und Sonnenschutz mitnehmen.",
        es: "Islas de Lérins: ferry desde el puerto viejo — sube temprano; agua y protección solar.",
        it: "Isole Lérins: traghetto dal vecchio porto — parti presto; acqua e protezione solare.",
        zh: "莱兰群岛从老港渡轮出发，建议早班；步道遮阴少，备好水和防晒。",
      },
      {
        fr: "Pendant le festival (mai), les prix explosent : réserve l'hébergement très tôt ou loge à Antibes / Cannes la Bocca avec train ou bus.",
        en: "During the May festival, prices spike: book lodging very early or stay in Antibes / Cannes la Bocca with train or bus.",
        de: "Während des Festivals im Mai steigen die Preise: früh buchen oder in Antibes / Cannes la Bocca übernachten.",
        es: "En el festival de mayo los precios se disparan: reserva muy pronto o alójate en Antibes / Cannes la Bocca.",
        it: "Durante il festival di maggio i prezzi salgono: prenota molto in anticipo o soggiorna ad Antibes / Cannes la Bocca.",
        zh: "五月电影节期间房价飙升，务必尽早订房，或住昂蒂布/戛纳拉博卡乘公交火车往返。",
      },
      {
        fr: "La Croisette se marche au lever du soleil ou en fin de journée : midi en plein été, privilégie les plages ombragées ou le Suquet.",
        en: "Walk the Croisette at sunrise or late afternoon; at midday in summer, pick shaded beaches or the Suquet hill.",
        de: "Die Croisette bei Sonnenaufgang oder am späten Nachmittag; mittags im Sommer schattige Strände oder den Suquet wählen.",
        es: "Pasea la Croisette al amanecer o al atardecer; al mediodía en verano, playas con sombra o el Suquet.",
        it: "La Croisette all'alba o in tardo pomeriggio; a mezzogiorno d'estate spiagge ombreggiate o il Suquet.",
        zh: "海滨大道宜清晨或傍晚漫步；盛夏正午可选有荫海滩或苏凯高地。",
      },
    ],
  },
  visby: {
    do: [
      {
        fr: "Les remparts (Ringmur) ceinturent toute la vieille ville : parcours sur les chemins de ronde possible en saison — chaussures plates indispensables sur les pavés glissants.",
        en: "The Ringmur walls encircle the old town: you can walk sections of the battlements in season—flat shoes are a must on slippery cobblestones.",
        de: "Die Ringmur umschließt die Altweg: in der Saison sind Teile des Wehrgangs begehbar—flache Schuhe auf den rutschigen Kopfsteinen sind Pflicht.",
        es: "La Ringmur rodea el casco antiguo: en temporada se puede recorrer parte de las almurallas—calzado plano imprescindible en los adoquines resbaladizos.",
        it: "La Ringmur cinge la città vecchia: in stagione si percorrono tratti delle mura—scarpe basse obbligatorie sui ciottoli scivolosi.",
        zh: "环城墙（Ringmur）环绕老城，季节适宜时可走部分城垛步道——鹅卵石路面很滑，务必穿平底鞋。",
      },
      {
        fr: "Visby compte de nombreuses ruines d'églises médiévales au cœur de la ville — prends une carte au musée ou à l'office de tourisme pour enchaîner Sankta Karin, Drotten, San Lars sans te perdre.",
        en: "Visby has many medieval church ruins right in town—grab a map at the museum or tourist office to link Sankta Karin, Drotten, St Lars without getting lost.",
        de: "Visby hat mitten in der Stadt viele mittelalterliche Kirchenruinen—hol dir im Museum oder beim Tourismusbüro einen Plan für Sankta Karin, Drotten, St. Lars.",
        es: "Visby concentra ruinas de iglesias medievales en el centro—pide un plano en el museo u oficina de turismo para enlazar Sankta Karin, Drotten, San Lars.",
        it: "Visby ha molte rovine di chiese medievali in centro—prendi una mappa al museo o in ufficio turistico per collegare Sankta Karin, Drotten, San Lars.",
        zh: "维斯比城内遍布中世纪教堂遗址——在博物馆或旅游中心取地图，按图走访圣卡琳、德罗滕、圣拉尔斯等遗址。",
      },
      {
        fr: "Pour rejoindre Gotland depuis la Suède continentale : ferries depuis Nynäshamn ou Oskarshamn — réserve sur le site de la compagnie en haute saison ; hors saison les horaires se réduisent fortement.",
        en: "To reach Gotland from mainland Sweden: ferries from Nynäshamn or Oskarshamn—book with the operator online in high season; off-season schedules shrink sharply.",
        de: "Nach Gotland ab dem schwedischen Festland: Fähren ab Nynäshamn oder Oskarshamn—in der Hochsaison online buchen; außerhalb der Saison gibt es deutlich weniger Abfahrten.",
        es: "Para llegar a Gotland desde Suecia continental: ferris desde Nynäshamn u Oskarshamn—reserva en la web del operador en temporada alta; fuera de temporada los enlaces se reducen mucho.",
        it: "Per Gotland dalla Svezia continentale: traghetti da Nynäshamn o Oskarshamn—prenota sul sito della compagnia in alta stagione; fuori stagione i collegamenti calano molto.",
        zh: "从瑞典大陆前往哥得兰岛：从尼奈斯港或奥斯卡港乘渡轮——旺季务必在航运公司官网预订；淡季班次明显减少。",
      },
    ],
  },
  valencia: {
    do: [
      {
        fr: "La Cité des arts ferme un jour dans la semaine : vérifie le site ; combine avec le marché central le matin (fermé tôt).",
        en: "City of Arts closes one weekday — check the site; pair with the Central Market in the morning (closes early).",
        de: "Die Kunst- und Wissenschaftsstadt hat einen Ruhetag — Website prüfen; mit dem Zentralmarkt am Vormittag kombinieren.",
        es: "La Ciudad de las Artes cierra un día entre semana: mira la web; combina con el mercado central por la mañana.",
        it: "La Città delle Arti chiude un giorno feriale — controlla il sito; abbina al mercato centrale la mattina.",
        zh: "艺术科学城每周有一天闭馆，以官网为准；可上午先去中央市场（关门早）。",
      },
      {
        fr: "Paella : les adresses touristiques du front de mer sont inégales ; demande aux locaux ou va à Albufera pour l'expérience classique.",
        en: "Paella: waterfront tourist traps vary a lot; ask locals or head to Albufera for the classic experience.",
        de: "Paella: an der Promenade ist die Qualität uneinheitlich; Einheimische fragen oder zur Albufera fahren.",
        es: "Paella: en el paseo marítimo hay mucha variación; pregunta a locales o ve a l'Albufera.",
        it: "Paella: sul lungomare turistico è a corpo libero; chiedi ai locali o vai all'Albufera.",
        zh: "海鲜饭别只看海滨游客店，问问本地人或去阿尔布费拉更地道。",
      },
      {
        fr: "Le jardin du Turia est long : loue un vélo ou coupe en tronçons ; prévois de l'eau en été.",
        en: "Turia Gardens are long: rent a bike or split into sections; bring water in summer.",
        de: "Der Turia-Garten ist lang: Fahrrad mieten oder in Abschnitte teilen; im Sommer Wasser mitnehmen.",
        es: "El jardín del Turia es largo: alquila bici o divídelo en tramos; agua en verano.",
        it: "Il giardino del Turia è lungo: noleggia una bici o suddividi il percorso; acqua d'estate.",
        zh: "图里亚花园很长，可租车分段游览，夏季带水。",
      },
    ],
  },
};
