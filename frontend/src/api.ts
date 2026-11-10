import { ClassSummary, CreateClassResponse, HoldResponse, MyHoldItem } from './types';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

export const API_BASE_URL = (
  env.VITE_API_URL ||
  env.VITE_BACKEND_URL ||
  env.VITE_API_BASE_URL ||
  'http://localhost:8080'
).replace(/\/+$/, '');

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.message === 'string') {
      return data.message;
    }
  } catch {
    // Fallback below
  }

  if (response.status === 409) {
    return '\u0986\u09b8\u09a8 \u0996\u09be\u09b2\u09bf \u09a8\u09c7\u0987 \u0985\u09a5\u09ac\u09be \u098f\u0987 \u09b6\u09cd\u09b0\u09c7\u09a3\u09c0\u09a4\u09c7 \u0986\u09aa\u09a8\u09be\u09b0 \u0987\u09a4\u09bf\u09ae\u09a7\u09cd\u09af\u09c7 \u098f\u0995\u099f\u09bf \u0986\u09ac\u09c7\u09a6\u09a8 \u09b0\u09df\u09c7\u099b\u09c7 (409 Conflict)\u09f7';
  }
  if (response.status === 404) {
    return '\u09a4\u09a5\u09cd\u09af\u099f\u09bf \u0996\u09c1\u0981\u099c\u09c7 \u09aa\u09be\u0993\u09df\u09be \u09af\u09be\u09df\u09a8\u09bf (404 Not Found)\u09f7';
  }
  if (response.status === 400) {
    return '\u09ad\u09c1\u09b2 \u09a4\u09a5\u09cd\u09af \u09aa\u09cd\u09b0\u09a6\u09be\u09a8 \u0995\u09b0\u09be \u09b9\u09df\u09c7\u099b\u09c7 (400 Bad Request)\u09f7';
  }
  return `\u09b8\u09be\u09b0\u09cd\u09ad\u09be\u09b0 \u09a4\u09cd\u09b0\u09c1\u099f\u09bf \u0998\u099f\u09c7\u099b\u09c7 (HTTP ${response.status})\u09f7`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error('\u09b8\u09be\u09b0\u09cd\u09ad\u09be\u09b0\u09c7\u09b0 \u09b8\u09be\u09a5\u09c7 \u09af\u09cb\u0997\u09be\u09af\u09cb\u0997 \u0995\u09b0\u09be \u09af\u09be\u099a\u09cd\u099b\u09c7 \u09a8\u09be (Server is unreachable)\u09f7');
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getClasses: () => request<ClassSummary[]>('/classes'),

  getClassById: (classId: string) => request<ClassSummary>(`/classes/${classId}`),

  createClass: (name: string, totalSeats: number) =>
    request<CreateClassResponse>('/classes', {
      method: 'POST',
      body: JSON.stringify({ name, totalSeats })
    }),

  createHold: (classId: string, studentId: string) =>
    request<HoldResponse>(`/classes/${classId}/holds`, {
      method: 'POST',
      headers: { 'X-Student-Id': studentId }
    }),

  getHold: (holdId: string) => request<HoldResponse>(`/holds/${holdId}`),

  confirmHold: (holdId: string, studentId: string) =>
    request<{ holdId: string; status: 'CONFIRMED' }>(`/holds/${holdId}/confirm`, {
      method: 'POST',
      headers: { 'X-Student-Id': studentId }
    }),

  cancelHold: (holdId: string, studentId: string) =>
    request<void>(`/holds/${holdId}`, {
      method: 'DELETE',
      headers: { 'X-Student-Id': studentId }
    }),

  getMyHolds: (studentId: string) =>
    request<MyHoldItem[]>('/me/holds', {
      headers: { 'X-Student-Id': studentId }
    })
};
