import axios from 'axios';
import type {
  Trip, TripSummary, TripFormData, ItineraryDay,
  Place, Restaurant, Hotel, Feedback
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── Destinations ─────────────────────────────────────────────────────────
export const destinationsApi = {
  list: () => api.get<Array<{ name: string; place_count: number }>>('/destinations'),
  getPlaces: (destination: string) =>
    api.get<Place[]>(`/destinations/${encodeURIComponent(destination)}/places`),
  getRestaurants: (destination: string) =>
    api.get<Restaurant[]>(`/destinations/${encodeURIComponent(destination)}/restaurants`),
  getHotels: (destination: string) =>
    api.get<Hotel[]>(`/destinations/${encodeURIComponent(destination)}/hotels`),
};

// ── Places ───────────────────────────────────────────────────────────────
export const placesApi = {
  list: (params?: { destination?: string; category?: string }) =>
    api.get<Place[]>('/places', { params }),
  get: (id: number) => api.get<Place>(`/places/${id}`),
  recommend: (payload: {
    destination: string;
    interests: string[];
    travel_style: string;
    activity_level: string;
    daily_budget: number;
    avoid_crowded: boolean;
    exclude_ids: number[];
    limit?: number;
  }) =>
    api.post<{
      recommendations: Array<{ place: Place; score: number; reasons: string[] }>;
      total_considered: number;
      algorithm: string;
    }>('/places/recommendations', payload),
};

// ── Trips ────────────────────────────────────────────────────────────────
export const tripsApi = {
  create: (data: TripFormData) =>
    api.post<Trip>('/trips', {
      destination: data.destination,
      start_date: data.start_date,
      end_date: data.end_date,
      num_travelers: data.num_travelers,
      total_budget: data.total_budget,
      preference: data.preference,
      constraints: data.constraints,
    }),

  list: () => api.get<TripSummary[]>('/trips'),
  get: (id: number) => api.get<Trip>(`/trips/${id}`),
  update: (id: number, data: Partial<Trip>) => api.put<Trip>(`/trips/${id}`, data),
  delete: (id: number) => api.delete(`/trips/${id}`),

  generate: (id: number) =>
    api.post<{ trip_id: number; days_generated: number; meta: object; itinerary: ItineraryDay[] }>(
      `/trips/${id}/generate`
    ),

  regenerate: (id: number) => api.post(`/trips/${id}/regenerate`),

  regenerateDay: (tripId: number, dayId: number) =>
    api.post<ItineraryDay>(`/trips/${tripId}/days/${dayId}/regenerate`),

  getItinerary: (id: number) =>
    api.get<{
      trip_id: number;
      destination: string;
      start_date: string;
      end_date: string;
      total_budget: number;
      estimated_cost: number;
      hotel: Hotel | null;
      days: ItineraryDay[];
    }>(`/trips/${id}/itinerary`),

  removeItem: (tripId: number, itemId: number) =>
    api.delete(`/trips/${tripId}/items/${itemId}`),

  submitFeedback: (tripId: number, data: { rating: number; tags: string[]; comment?: string }) =>
    api.post<Feedback>(`/trips/${tripId}/feedback`, data),

  getFeedback: (tripId: number) =>
    api.get<Feedback | null>(`/trips/${tripId}/feedback`),

  adapt: (tripId: number, adaptation_type: string, parameters: object = {}) =>
    api.post(`/trips/${tripId}/adapt`, { adaptation_type, parameters }),
};

export default api;
