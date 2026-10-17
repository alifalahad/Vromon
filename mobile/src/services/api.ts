/**
 * Vromon Mobile — API client.
 *
 * Single typed Axios instance. Backend URL comes from EXPO_PUBLIC_API_URL
 * (see mobile/.env) so we can point at different hosts per environment.
 */

import { create, type AxiosRequestConfig } from 'axios';

import { getAccessToken } from '../features/auth/session';
import { supabase } from '../features/auth/supabase';
import type {
  AdaptationType,
  AdaptResult,
  Algorithm,
  AlternativesResult,
  BudgetBreakdown,
  Destination,
  EditResult,
  Compare,
  Feedback,
  Friend,
  FriendProfile,
  FriendRequest,
  GenerateResult,
  GeoCity,
  GeoRegion,
  GroundedAnswer,
  Itinerary,
  Me,
  MeUpdate,
  Person,
  Photo,
  PhotoFilter,
  PhotoTarget,
  Place,
  PlaceType,
  PublicProfile,
  TravelStats,
  Trip,
  TripCreate,
  TripStats,
  TripStopInput,
  UserSettings,
  UsernameAvailability,
  Visit,
  VisitInput,
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

api.interceptors.request.use(async (config) => {
  // Every request carries the Supabase access token (refreshed by supabase-js near expiry)
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (__DEV__) {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // A 401 with a session: refresh once and retry; if that fails, the session is over.
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && supabase && original && !original._retried) {
      original._retried = true;
      const { data } = await supabase.auth.refreshSession();
      if (data.session) return api(original);
      await supabase.auth.signOut();
    }
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
  setStops: (id: number, stops: TripStopInput[]) => api.put<Trip>(`/trips/${id}/stops`, { stops }).then((r) => r.data),
  markVisited: (id: number, mark: boolean) =>
    api.post<{ visited_prompt: string; places_marked: number }>(`/trips/${id}/mark-visited`, { mark }).then((r) => r.data),
  /** Completed trips only; `today` is the phone's local date */
  stats: (today: string, userId?: string) =>
    api.get<TripStats>(userId ? `/users/${userId}/trips/stats` : '/me/trips/stats', { params: { today } }).then((r) => r.data),

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
// Account (/me) — profile, settings, export, deletion
// ---------------------------------------------------------------------------
export const meApi = {
  get: () => api.get<Me>('/me').then((r) => r.data),
  update: (payload: MeUpdate) => api.patch<Me>('/me', payload).then((r) => r.data),
  delete: () => api.delete('/me').then(() => undefined),
  export: () => api.get<Record<string, unknown>>('/me/export').then((r) => r.data),
  getSettings: () => api.get<UserSettings>('/me/settings').then((r) => r.data),
  putSettings: (settings: Omit<UserSettings, 'updated_at'>) => api.put<UserSettings>('/me/settings', settings).then((r) => r.data),
  usernameAvailable: (username: string) =>
    api.get<UsernameAvailability>(`/usernames/${encodeURIComponent(username)}/available`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Friends — search, codes, requests, friends, blocks, push tokens
// ---------------------------------------------------------------------------
export const friendsApi = {
  search: (q: string) => api.get<Person[]>('/users/search', { params: { q } }).then((r) => r.data),
  byCode: (code: string) => api.get<Person>(`/friend-codes/${encodeURIComponent(code)}`).then((r) => r.data),
  rotateCode: () => api.post<Me>('/me/friend-code/rotate').then((r) => r.data),
  request: (target: { user_id: string } | { friend_code: string }) =>
    api.post<FriendRequest>('/friend-requests', target).then((r) => r.data),
  requests: (direction: 'in' | 'out') => api.get<FriendRequest[]>('/friend-requests', { params: { direction } }).then((r) => r.data),
  respond: (id: number, action: 'accept' | 'decline' | 'cancel') =>
    api.post<FriendRequest>(`/friend-requests/${id}/${action}`).then((r) => r.data),
  list: () => api.get<Friend[]>('/friends').then((r) => r.data),
  remove: (userId: string) => api.delete(`/friends/${userId}`).then(() => undefined),
  blocks: () => api.get<PublicProfile[]>('/blocks').then((r) => r.data),
  block: (userId: string) => api.post('/blocks', { user_id: userId }).then(() => undefined),
  unblock: (userId: string) => api.delete(`/blocks/${userId}`).then(() => undefined),
  profile: (userId: string) => api.get<FriendProfile>(`/users/${userId}/profile`).then((r) => r.data),
  compare: (userId: string) => api.get<Compare>(`/users/${userId}/compare`).then((r) => r.data),
  trips: (userId: string) => api.get<Trip[]>(`/users/${userId}/trips`).then((r) => r.data),
  registerDevice: (token: string, platform: string) =>
    api.post('/me/devices', { expo_push_token: token, platform }).then(() => undefined),
  unregisterDevice: (token: string) => api.delete(`/me/devices/${encodeURIComponent(token)}`).then(() => undefined),
};

// ---------------------------------------------------------------------------
// Travel map — visits, stats, reference data
// ---------------------------------------------------------------------------
export const visitsApi = {
  forUser: (userId: string) => api.get<Visit[]>(`/users/${userId}/visits`).then((r) => r.data),
  upsert: (visits: VisitInput[]) => api.put<Visit[]>('/me/visits', { visits }).then((r) => r.data),
  remove: (type: PlaceType, code: string) => api.delete(`/me/visits/${type}/${encodeURIComponent(code)}`).then(() => undefined),
  stats: (userId: string) => api.get<TravelStats>(`/users/${userId}/stats`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Photos — the server re-encodes uploads (EXIF and GPS removed); URLs are signed
// ---------------------------------------------------------------------------
export interface PhotoUpload {
  uri: string;
  takenOn?: string | null;
}

export const photosApi = {
  forUser: (userId: string, filter: PhotoFilter = {}) =>
    api.get<Photo[]>(`/users/${userId}/photos`, { params: { ...filter, limit: 200 } }).then((r) => r.data),
  upload: (photo: PhotoUpload, target: PhotoTarget, onProgress?: (fraction: number) => void) => {
    const form = new FormData();
    // React Native's FormData takes a file as {uri, name, type}
    form.append('file', { uri: photo.uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
    for (const [key, value] of Object.entries(target)) if (value != null) form.append(key, String(value));
    if (photo.takenOn) form.append('taken_on', photo.takenOn);
    return api
      .post<Photo>('/me/photos', form, {
        // Not JSON: axios would serialise the form. The native layer adds the boundary.
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(e.loaded / e.total);
        },
      })
      .then((r) => r.data);
  },
  remove: (photoId: string) => api.delete(`/me/photos/${photoId}`).then(() => undefined),
};

export const geoApi = {
  regions: (country: string) => api.get<GeoRegion[]>('/geo/regions', { params: { country } }).then((r) => r.data),
  cities: (q: string, country?: string) => api.get<GeoCity[]>('/geo/cities', { params: { q, country } }).then((r) => r.data),
};

/** PMTiles archive URL for MapLibre (must be absolute). */
export const tilesUrl = (name: 'regions' | 'cities') =>
  `pmtiles://${process.env.EXPO_PUBLIC_TILES_URL ?? `${BASE_URL}/api/v1/geo/tiles`}/${name}.pmtiles`;

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
