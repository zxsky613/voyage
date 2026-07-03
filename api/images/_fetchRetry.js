/**
 * Retry Wikidata / Commons fetches on 429, 503, timeout.
 * Distinguishes throttling from definitive HTTP errors (404, 400).
 * User-Agent Wikimedia centralisé pour toutes les requêtes vers leurs domaines.
 */

import { isWikimediaApiUrl, wikiUserAgent } from "./_headCheck.js";

/** @type {readonly number[]} */
const THROTTLE_DELAYS_MS = [500, 1500, 3500];
/** @type {readonly number[]} */
const TIMEOUT_DELAYS_MS = [300];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

function isAbortError(err) {
  return err?.name === "AbortError" || /aborted|timeout/i.test(String(err?.message || ""));
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
export function withWikimediaHeaders(url, init = {}) {
  if (!isWikimediaApiUrl(url)) return init;
  const headers = new Headers(init.headers || {});
  headers.set("User-Agent", wikiUserAgent());
  return { ...init, headers };
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{ throttleDelays?: number[], timeoutDelays?: number[], timeoutMs?: number }} [options]
 * @returns {Promise<{ response: Response|null, throttled: boolean, timedOut: boolean }>}
 */
export async function fetchWithRetry(url, init = {}, options = {}) {
  const throttleDelays = Array.isArray(options.throttleDelays) ? options.throttleDelays : THROTTLE_DELAYS_MS;
  const timeoutDelays = Array.isArray(options.timeoutDelays) ? options.timeoutDelays : TIMEOUT_DELAYS_MS;
  const timeoutMs = Number(options.timeoutMs) || 15000;
  const mergedInit = withWikimediaHeaders(url, init);
  const maxAttempts = 1 + Math.max(throttleDelays.length, timeoutDelays.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...mergedInit, signal: ctrl.signal });
      clearTimeout(timer);
      if (response.status === 429 && attempt < throttleDelays.length) {
        await sleep(throttleDelays[attempt]);
        continue;
      }
      if (
        response.status !== 429 &&
        isRetryableStatus(response.status) &&
        attempt < throttleDelays.length
      ) {
        await sleep(throttleDelays[attempt]);
        continue;
      }
      return {
        response,
        throttled: response.status === 429 || isRetryableStatus(response.status),
        timedOut: false,
      };
    } catch (err) {
      clearTimeout(timer);
      const timedOut = isAbortError(err);
      if (timedOut && attempt < timeoutDelays.length) {
        await sleep(timeoutDelays[attempt]);
        continue;
      }
      return { response: null, throttled: timedOut, timedOut };
    }
  }
  return { response: null, throttled: true, timedOut: false };
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{ throttleDelays?: number[], timeoutDelays?: number[], timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, json: object|null, throttled: boolean, timedOut: boolean }>}
 */
export async function fetchJsonWithRetry(url, init = {}, options = {}) {
  const { response, throttled, timedOut } = await fetchWithRetry(url, init, options);
  if (!response) {
    return { ok: false, status: 0, json: null, throttled, timedOut };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      json: null,
      throttled: response.status === 429 || isRetryableStatus(response.status),
      timedOut: false,
    };
  }
  try {
    const json = await response.json();
    return { ok: true, status: response.status, json, throttled: false, timedOut: false };
  } catch {
    return { ok: false, status: response.status, json: null, throttled: false, timedOut: false };
  }
}

/** Thrown when Wikidata/Commons remain throttled after retries — not « entity not found ». */
export class WikiApiThrottledError extends Error {
  constructor(message = "Wiki API throttled or timed out") {
    super(message);
    this.name = "WikiApiThrottledError";
  }
}
