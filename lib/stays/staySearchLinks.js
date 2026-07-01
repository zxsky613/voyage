/**
 * Liens de recherche logement — redirection vers Booking, Airbnb et Agoda
 * (pas d’API partenaire : ouverture sur le site du fournisseur avec critères préremplis).
 */

/** @typedef {{ destination: string, checkIn: string, checkOut: string, adults: number, rooms: number }} StaySearchParams */

export const STAY_PROVIDERS = Object.freeze([
  {
    id: "booking",
    name: "Booking.com",
    accent: "#003580",
    logoLabel: "Booking",
  },
  {
    id: "airbnb",
    name: "Airbnb",
    accent: "#FF385C",
    logoLabel: "Airbnb",
  },
  {
    id: "agoda",
    name: "Agoda",
    accent: "#5542F6",
    logoLabel: "Agoda",
  },
]);

function cleanDate(ymd) {
  const s = String(ymd || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function cleanDestination(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

/**
 * @param {string} providerId
 * @param {StaySearchParams} params
 * @returns {string}
 */
export function buildStaySearchUrl(providerId, params) {
  const dest = cleanDestination(params?.destination);
  if (!dest) return "";
  const checkIn = cleanDate(params?.checkIn);
  const checkOut = cleanDate(params?.checkOut);
  const adults = Math.min(16, Math.max(1, Math.floor(Number(params?.adults) || 2)));
  const rooms = Math.min(8, Math.max(1, Math.floor(Number(params?.rooms) || 1)));
  const id = String(providerId || "").trim().toLowerCase();

  if (id === "booking") {
    const q = new URLSearchParams();
    q.set("ss", dest);
    if (checkIn) q.set("checkin", checkIn);
    if (checkOut) q.set("checkout", checkOut);
    q.set("group_adults", String(adults));
    q.set("no_rooms", String(rooms));
    q.set("lang", "fr");
    return `https://www.booking.com/searchresults.html?${q.toString()}`;
  }

  if (id === "airbnb") {
    const slug = encodeURIComponent(dest.replace(/,/g, " -"));
    const q = new URLSearchParams();
    if (checkIn) q.set("checkin", checkIn);
    if (checkOut) q.set("checkout", checkOut);
    q.set("adults", String(adults));
    const qs = q.toString();
    return `https://www.airbnb.com/s/${slug}/homes${qs ? `?${qs}` : ""}`;
  }

  if (id === "agoda") {
    const q = new URLSearchParams();
    q.set("city", dest);
    if (checkIn) q.set("checkIn", checkIn);
    if (checkOut) q.set("checkOut", checkOut);
    q.set("adults", String(adults));
    q.set("rooms", String(rooms));
    q.set("cid", "-1");
    return `https://www.agoda.com/search?${q.toString()}`;
  }

  return "";
}

/** @param {StaySearchParams} params */
export function buildAllStaySearchUrls(params) {
  return STAY_PROVIDERS.map((p) => ({
    ...p,
    url: buildStaySearchUrl(p.id, params),
  })).filter((row) => row.url);
}
