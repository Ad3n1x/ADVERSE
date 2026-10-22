const API = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!response.ok) {
    let message = 'Request failed';
    try {
      const body = await response.json();
      message = body.error?.message || message;
      if (body.error?.details?.fieldErrors) {
        message += ' ' + JSON.stringify(body.error.details.fieldErrors);
      }
    } catch {
      // Some proxy failures return non-JSON responses.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export { API, request };
