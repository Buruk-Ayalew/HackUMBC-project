// Small fetch helpers. Always relative URLs; Vite proxies /api to the server.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

// These endpoints legitimately return 401 without meaning "go to login".
const NO_REDIRECT = ["/api/auth/me", "/api/auth/login", "/api/auth/password"];

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the CivicPulse server. Check your connection.");
  }

  if (res.status === 401 && !NO_REDIRECT.includes(path) && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`, data?.code);
  }
  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body ?? {});
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}
