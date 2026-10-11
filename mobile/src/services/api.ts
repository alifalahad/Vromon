/**
 * Vromon Mobile — API client.
 *
 * Single typed Axios instance. Backend URL comes from EXPO_PUBLIC_API_URL
 * (see mobile/.env) so we can point at different hosts per environment.
 */

import { create } from 'axios';
import type {
  AdaptationType,
  AdaptResult,
  Algorithm,
  AlternativesResult,
  BudgetBreakdown,
  Destination,
  EditResult,
  Feedback,
  GenerateResult,
  GroundedAnswer,
  Itinerary,
  Place,
  Trip,
  TripCreate,
} from '../types';

// ---------------------------------------------------------------------------
// Base URL — defaults to local dev server; override with EXPO_PUBLIC_API_URL
// ---------------------------------------------------------------------------
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

const api = create({
  baseURL: `${BASE_URL}/api/v1`,
  // CP-SAT generation can take a few seconds; allow up to its 15 s safety cap
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Errors — keep the HTTP status and structured detail for the UI
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  status?: number;
  detail?: unknown;

  constructor(message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** One Pydantic validation issue, e.g. {loc: ['body','constraints','max_activities_per_day'], msg}. */
function validationIssue(d: unknown): string {
  if (!d || typeof d !== 'object' || !('msg' in d)) return String(d);
  const msg = String((d as { msg: unknown }).msg).replace(/^Value error, /, '');
  const loc = 'loc' in d && Array.isArray(d.loc) ? d.loc : [];
  const field = [...loc].reverse().find((p): p is string => typeof p === 'string' && p !== 'body');
  return field ? `${field.replace(/_/g, ' ')}: ${msg}` : msg;
}

/** Human-readable message from a FastAPI error body (string, validation list, or object). */
export function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(validationIssue).join('\n');
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

api.interceptors.request.use((config) => {
  if (__DEV__) {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status: number | undefined = error.response?.status;
    const detail = error.response?.data?.detail;
    const fallback = error.response
      ? `Request failed (${status})`
      : `Cannot reach the server at ${BASE_URL}. Is the backend running and EXPO_PUBLIC_API_URL correct?`;
    return Promise.reject(new ApiError(errorMessage(detail, fallback), status, detail));
  },
);

// ---------------------------------------------------------------------------
// Destinations & places
// ---------------------------------------------------------------------------
export const destinationsApi = {
  list: () => api.get<Destination[]>('/destinations').then((r) => r.data),
  get: (id: number) => api.get<Destination>(`/destinations/${id}`).then((r) => r.data),
  places: (id: number) => api.get<Place[]>(`/destinations/${id}/places`).then((r) => r.data),
};

export const placesApi = {
  list: (params?: { destination?: string; category?: string }) =>
    api.get<Place[]>('/places', { params }).then((r) => r.data),
  get: (id: number) => api.get<Place>(`/places/${id}`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------
export const tripsApi = {
  list: () => api.get<Trip[]>('/trips').then((r) => r.data),
  get: (id: number) => api.get<Trip>(`/trips/${id}`).then((r) => r.data),
  create: (payload: TripCreate) => api.post<Trip>('/trips', payload).then((r) => r.data),
  update: (id: number, payload: Partial<TripCreate>) =>
    api.patch<Trip>(`/trips/${id}`, payload).then((r) => r.data),
  delete: (id: number) => api.delete(`/trips/${id}`).then((r) => r.data),
  duplicate: (id: number) => api.post<Trip>(`/trips/${id}/duplicate`).then((r) => r.data),

  // Generation (heuristic = fast greedy planner, cpsat = OR-Tools optimizer)
  generate: (id: number, algorithm: Algorithm = 'heuristic') =>
    api.post<GenerateResult>(`/trips/${id}/generate`, null, { params: { algorithm } }).then((r) => r.data),
  regenerate: (id: number, algorithm: Algorithm = 'heuristic') =>
    api.post<GenerateResult>(`/trips/${id}/regenerate`, null, { params: { algorithm } }).then((r) => r.data),
  regenerateDay: (tripId: number, dayId: number) =>
    api.post<EditResult>(`/trips/${tripId}/days/${dayId}/regenerate`).then((r) => r.data),

  getItinerary: (id: number) => api.get<Itinerary>(`/trips/${id}/itinerary`).then((r) => r.data),
  budget: (id: number) => api.get<BudgetBreakdown>(`/trips/${id}/budget`).then((r) => r.data),

  // Item editing
  removeItem: (tripId: number, itemId: number) =>
    api.delete<EditResult>(`/trips/${tripId}/items/${itemId}`).then((r) => r.data),
  alternatives: (tripId: number, itemId: number) =>
    api.get<AlternativesResult>(`/trips/${tripId}/items/${itemId}/alternatives`).then((r) => r.data),
  replaceItem: (tripId: number, itemId: number, placeId?: number) =>
    api
      .post<EditResult>(`/trips/${tripId}/items/${itemId}/replace`, { place_id: placeId ?? null })
      .then((r) => r.data),

  adapt: (tripId: number, adaptationType: AdaptationType) =>
    api
      .post<AdaptResult>(`/trips/${tripId}/adapt`, { adaptation_type: adaptationType, parameters: {} })
      .then((r) => r.data),

  // Feedback
  getFeedback: (tripId: number) =>
    api.get<Feedback | null>(`/trips/${tripId}/feedback`).then((r) => r.data),
  submitFeedback: (tripId: number, rating: number, tags: string[], comment?: string) =>
    api.post<Feedback>(`/trips/${tripId}/feedback`, { rating, tags, comment }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Grounded explanations (Phase 8; returns 503 when no LLM is configured)
// ---------------------------------------------------------------------------
export const ragApi = {
  explainItem: (tripId: number, itemId: number) =>
    api
      .post<GroundedAnswer>(`/rag/trips/${tripId}/items/${itemId}/explanation`)
      .then((r) => r.data),
};

export default api;
