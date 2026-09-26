// Polite fetch for government sites: descriptive User-Agent, a timeout, and at
// most ~1 request per second per host.

export const USER_AGENT =
  "CivicPulseMD/0.1 (HackUMBC hackathon project; compliance helper for Maryland small businesses)";

const lastRequestAt = new Map<string, number>();
const hostQueues = new Map<string, Promise<unknown>>();
const MIN_GAP_MS = 1000;

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

export function politeFetch(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const host = new URL(url).host;
  const prev = hostQueues.get(host) ?? Promise.resolve();
  const run = prev
    .catch(() => {})
    .then(async () => {
      const wait = (lastRequestAt.get(host) ?? 0) + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequestAt.set(host, Date.now());
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new HttpError(res.status, url);
      return res;
    });
  hostQueues.set(host, run);
  return run;
}

export async function politeFetchJson<T>(url: string, timeoutMs?: number): Promise<T> {
  const res = await politeFetch(url, {}, timeoutMs);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some sites return an HTML maintenance page with a 200 status.
    throw new Error(`Non-JSON response from ${new URL(url).host}`);
  }
}
