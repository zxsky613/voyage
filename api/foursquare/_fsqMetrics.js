/** Compteur appels Foursquare Places — log journalier côté serveur. */

let dayKey = "";
let count = 0;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function noteFoursquarePlacesCall(meta = {}) {
  const dk = todayKey();
  if (dk !== dayKey) {
    if (dayKey && count > 0) {
      console.info(`[fsq-metrics] ${dayKey} total_places_api_calls=${count}`);
    }
    dayKey = dk;
    count = 0;
  }
  count += 1;
  if (count === 1 || count % 25 === 0) {
    console.info(
      `[fsq-metrics] ${dk} places_api_calls=${count}` +
        (meta.simulated ? " simulated=429" : "") +
        (meta.cached ? " cache=hit" : "")
    );
  }
  return count;
}

export function getFoursquarePlacesCallCountForToday() {
  return dayKey === todayKey() ? count : 0;
}
