/**
 * Shared fetch helper for the client.
 *
 * Every route in this app reports failures as `{ error: string }`, so the
 * message is surfaced here rather than at each call site, and the status is
 * attached so the query client can tell a transient failure from a permanent
 * one.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // Not every failure carries a JSON body; keep the status message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiPost<T>(input: string, body?: unknown): Promise<T> {
  return apiFetch<T>(input, {
    method: 'POST',
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
}

export function apiPut<T>(input: string, body: unknown): Promise<T> {
  return apiFetch<T>(input, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function apiPatch<T>(input: string, body: unknown): Promise<T> {
  return apiFetch<T>(input, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(input: string): Promise<T> {
  return apiFetch<T>(input, { method: 'DELETE' });
}
