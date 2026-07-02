/**
 * Retry Wikidata / Commons fetches on 429, 503, timeout.
 * Distinguishes throttling from definitive HTTP errors (404, 400).
 */

const DEFAULT_DELAYS_MS = [300, 800];

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
 * @param {{ delays?: number[], timeoutMs?: number }} [options]
 * @returns {Promise<{ response: Response|null, throttled: boolean, timedOut: boolean }>}
 */
export async function fetchWithRetry(url, init = {}, options = {}) {
  const delays = Array.isArray(options.delays) ? options.delays : DEFAULT_DELAYS_MS;
  const timeoutMs = Number(options.timeoutMs) || 15000;
  const maxAttempts = 1 + delays.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (isRetryableStatus(response.status) && attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      return {
        response,
        throttled: isRetryableStatus(response.status),
        timedOut: false,
      };
    } catch (err) {
      clearTimeout(timer);
      const timedOut = isAbortError(err);
      if (timedOut && attempt < delays.length) {
        await sleep(delays[attempt]);
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
 * @param {{ delays?: number[], timeoutMs?: number }} [options]
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
      throttled: isRetryableStatus(response.status),
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
