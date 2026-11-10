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
    return 'আসন খালি নেই অথবা এই শ্রেণীতে আপনার ইতিমধ্যে একটি আবেদন রয়েছে (409 Conflict)।';
  }
  if (response.status === 404) {
    return 'তথ্যটি খুঁজে পাওয়া যায়নি (404 Not Found)।';
  }
  if (response.status === 400) {
    return 'ভুল তথ্য প্রদান করা হয়েছে (400 Bad Request)।';
  }
  return `সার্ভার ত্রুটি ঘটেছে (HTTP ${response.status})।`;
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
    throw new Error('সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না (Server is unreachable)।');
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
