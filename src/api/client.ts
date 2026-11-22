/**
 * Typed API Client for Bepari (/api/v1/*)
 * Security invariant: Bearer session token is held exclusively in JavaScript memory.
 * Never persisted in localStorage or sessionStorage.
 */

let inMemorySessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  inMemorySessionToken = token;
}

export function getSessionToken(): string | null {
  return inMemorySessionToken;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  messageEn?: string;
  details?: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiErrorPayload;
  requestId?: string;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    idempotencyKey?: string;
  } = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (inMemorySessionToken) {
    headers['Authorization'] = `Bearer ${inMemorySessionToken}`;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  try {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: json.error || {
          code: `HTTP_${res.status}`,
          message: 'অনুরোধটি সম্পন্ন করা যায়নি।',
        },
        data: json.data,
        requestId: json.error?.requestId || res.headers.get('x-request-id') || undefined,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: json.data as T,
      requestId: json.meta?.requestId || res.headers.get('x-request-id') || undefined,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: {
        code: 'NETWORK_ERROR',
        message: 'সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না।',
        messageEn: err instanceof Error ? err.message : 'Network connection failed',
      },
    };
  }
}
