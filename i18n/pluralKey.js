/** @param {number} count */
export function pluralSuffix(count) {
  const n = Math.floor(Number(count) || 0);
  return Math.abs(n) === 1 ? "_one" : "_other";
}

/** @param {string} baseKey @param {number} count */
export function pluralKey(baseKey, count) {
  return `${String(baseKey || "")}${pluralSuffix(count)}`;
}
