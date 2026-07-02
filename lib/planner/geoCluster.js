const EARTH_RADIUS_KM = 6371;

/**
 * @param {{ latitude?: number|null, longitude?: number|null }} a
 * @param {{ latitude?: number|null, longitude?: number|null }} b
 * @returns {number}
 */
export function haversineKm(a, b) {
  const lat1 = Number(a?.latitude);
  const lon1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude);
  const lon2 = Number(b?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * s2 * s2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @param {Array<{ latitude?: number|null, longitude?: number|null }>} places
 */
export function inferGeoSpreadKm(places) {
  const pts = (places || []).filter(
    (p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude))
  );
  if (pts.length < 2) return 0;
  let maxD = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      maxD = Math.max(maxD, haversineKm(pts[i], pts[j]));
    }
  }
  return maxD;
}

/**
 * @param {number} spreadKm
 * @returns {{ clusterKm: number, sanityKm: number }}
 */
export function thresholdsForSpread(spreadKm) {
  const regional = spreadKm > 35;
  return {
    clusterKm: regional ? Math.max(12, spreadKm / 6) : 2.5,
    sanityKm: regional ? 40 : 5,
  };
}

/**
 * @param {Array<object>} places
 * @param {number} numDays
 * @param {{ clusterKm?: number }} [options]
 * @returns {object[][]}
 */
export function clusterPlacesIntoDays(places, numDays, options = {}) {
  const list = (Array.isArray(places) ? places : []).filter(
    (p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude))
  );
  const days = Math.max(1, Number(numDays) || 1);
  if (!list.length) return Array.from({ length: days }, () => []);

  const spread = inferGeoSpreadKm(list);
  const clusterKm = Number(options.clusterKm) || thresholdsForSpread(spread).clusterKm;

  /** @type {object[][]} */
  const clusters = Array.from({ length: days }, () => []);
  const seeds = [];
  const remaining = [...list].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  for (let d = 0; d < days && remaining.length; d++) {
    if (d === 0) {
      seeds.push(remaining.shift());
      continue;
    }
    let bestIdx = 0;
    let bestMin = -1;
    for (let i = 0; i < remaining.length; i++) {
      const minToSeeds = Math.min(...seeds.map((s) => haversineKm(remaining[i], s)));
      if (minToSeeds > bestMin) {
        bestMin = minToSeeds;
        bestIdx = i;
      }
    }
    seeds.push(remaining.splice(bestIdx, 1)[0]);
  }

  const all = [...seeds, ...remaining];
  for (const p of all) {
    let best = 0;
    let bestD = Infinity;
    for (let d = 0; d < seeds.length; d++) {
      const dist = haversineKm(p, seeds[d]);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    clusters[best].push(p);
  }

  /** Fusionner clusters trop petits avec voisin le plus proche (max 2 clusters/jour via merge). */
  for (let d = 0; d < clusters.length; d++) {
    if (clusters[d].length >= 1) continue;
    const donor = clusters.findIndex((c, i) => i !== d && c.length > 2);
    if (donor >= 0 && clusters[donor].length > 1) {
      clusters[d].push(clusters[donor].pop());
    }
  }

  /** Écarter les points trop loin du centroïde du cluster. */
  return clusters.map((cluster) => {
    if (cluster.length <= 2) return cluster;
    const lat = cluster.reduce((s, p) => s + Number(p.latitude), 0) / cluster.length;
    const lon = cluster.reduce((s, p) => s + Number(p.longitude), 0) / cluster.length;
    const center = { latitude: lat, longitude: lon };
    return cluster.filter((p) => haversineKm(p, center) <= clusterKm * 2.5);
  });
}

/**
 * Ordonne par plus proche voisin (matin → après-midi).
 * @param {object[]} places
 * @returns {object[]}
 */
export function orderDayNearestNeighbor(places) {
  const list = [...(places || [])];
  if (list.length <= 1) return list;
  const morning = list.filter((p) => p.period === "morning");
  const afternoon = list.filter((p) => p.period === "afternoon");
  const other = list.filter((p) => p.period !== "morning" && p.period !== "afternoon");
  const ordered = [];
  const pool = [...morning, ...other, ...afternoon];
  let cur = pool.shift();
  if (!cur) return list;
  ordered.push(cur);
  while (pool.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const d = haversineKm(cur, pool[i]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    cur = pool.splice(bestIdx, 1)[0];
    ordered.push(cur);
  }
  return ordered;
}

/**
 * @param {object[]} ordered
 * @param {number} sanityKm
 * @returns {boolean}
 */
export function dayOrderPassesSanityCheck(ordered, sanityKm) {
  for (let i = 1; i < ordered.length; i++) {
    if (haversineKm(ordered[i - 1], ordered[i]) > sanityKm) return false;
  }
  return true;
}
