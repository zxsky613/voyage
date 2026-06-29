/**
 * Catalogue des destinations proposées dans la recherche (libellés canoniques + alias).
 * Source unique pour l’app et pour `npm run verify:catalog-hero`.
 */
export const CITY_CATALOG = [
  "Paris", "Lyon", "Marseille", "Nice", "Monaco", "Bordeaux", "Toulouse", "Lille", "Nantes",
  "Tokyo", "Kyoto", "Osaka", "Seoul", "Bangkok", "Singapore", "Bali", "Jakarta", "Beijing", "Shanghai", "Guangzhou",
  "New York", "Los Angeles", "San Francisco", "Miami", "Chicago", "Toronto", "Vancouver",
  "London", "Barcelona", "Madrid", "Rome", "Milan", "Venise", "Berlin", "Amsterdam",
  "Stockholm", "Visby", "Copenhague", "Oslo", "Helsinki", "Dublin",
  "Bruxelles", "Berne", "Lisbonne", "Porto", "Prague", "Vienne", "Budapest", "Athènes", "Istanbul",
  "Seville", "Valencia", "Naples", "Palermo", "Edinburgh", "Warsaw", "Krakow", "Turin",
  "Dubai", "Doha", "Abu Dhabi", "Le Caire", "Marrakech", "Tunis", "Alger",
  "Sydney", "Melbourne", "Mykonos", "Auckland", "Cape Town", "Rio de Janeiro", "Sao Paulo", "Phuket",
];

export const CITY_ALIASES = Object.freeze({
  Beijing: ["Pekin", "Pékin", "Peking"],
  "New York": ["NYC", "New York City"],
  Venise: ["Venice"],
  "Le Caire": ["Cairo"],
  Lisbonne: ["Lisbon"],
  Vienne: ["Vienna"],
  Athènes: ["Athens"],
  "Sao Paulo": ["São Paulo"],
  Guangzhou: ["Canton", "Kwangchow"],
  Monaco: ["Monte Carlo", "Monte-Carlo"],
  London: ["Londres"],
  Barcelona: ["Barcelone"],
  Rome: ["Roma"],
  Milan: ["Milano"],
  Berne: ["Bern"],
  Mykonos: ["Myconos"],
  Copenhague: ["Copenhagen", "København", "Kobenhavn"],
  Naples: ["Napoli"],
  Seville: ["Séville", "Sevilla"],
  Edinburgh: ["Édimbourg", "Edimbourg"],
  Warsaw: ["Varsovie", "Warszawa"],
  Krakow: ["Cracovie", "Kraków"],
  Turin: ["Torino"],
  Valencia: ["València"],
  Visby: ["Gotland"],
});
