/**
 * Vromon Mobile — Shared TypeScript types.
 * Mirrors the actual backend response shapes from trips.py serializers.
 */

export interface Destination {
  id: number;
  name: string;
  country: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  image_url?: string;
  place_count?: number;
}

export interface Place {
  id: number;
  name: string;
  destination_name: string;
  category: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  review_count?: number;
  average_visit_duration?: number;
  estimated_cost?: number;
  currency?: string;
  opening_time?: string;
  closing_time?: string;
  best_time?: string;
  crowd_level?: string;
  activity_level?: string;
  tags?: string[];
  image_url?: string;
}

export interface TripPreferenceInput {
  interests?: string[];
  travel_style?: string;
  activity_level?: string;
  accommodation_preference?: string;
  preferred_start_time?: string;
  preferred_end_time?: string;
}

export interface TripConstraintInput {
  max_activities_per_day?: number;
  max_daily_budget?: number;
  avoid_crowded?: boolean;
  must_visit?: number[];
  excluded_places?: number[];
}

export interface TripCreate {
  destination: string;
  start_date: string;
  end_date: string;
  num_travelers?: number;
  total_budget?: number;
  preference?: TripPreferenceInput;
  constraints?: TripConstraintInput;
}

// Matches _trip_summary_out / _trip_out in trips.py
export interface Trip {
  id: number;
  destination: string;
  title?: string;
  start_date: string;
  end_date: string;
  num_travelers: number;
  total_budget: number;
  currency: string;
  status: string;
  num_days: number;
  created_at: string;
  updated_at?: string;
  preference?: {
    id: number;
    interests: string[];
    travel_style: string;
    activity_level: string;
    accommodation_preference: string;
    preferred_start_time: string;
    preferred_end_time: string;
  };
  constraints?: {
    id: number;
    max_activities_per_day: number;
    max_daily_budget: number;
    must_visit: number[];
    excluded_places: number[];
    avoid_crowded: boolean;
    avoid_high_activity: boolean;
  };
}

// Matches _item_out in trips.py
export interface ItineraryItem {
  id: number;
  item_type: string;           // "activity" | "meal"
  place_id?: number;
  restaurant_id?: number;
  title: string;               // place name or meal label
  start_time: string;
  end_time: string;
  duration_minutes: number;
  cost: number;
  travel_time_to_next: number;
  distance_to_next: number;
  notes?: string;
  recommendation_score: number;
  recommendation_reasons: string[];
  order_index: number;
  category?: string | null;     // place category, or "Meal"
  currency: string;
  /** "placeholder" = no restaurant/place record; the cost is an estimate, not real data */
  cost_source: 'data' | 'placeholder';
  place?: Place;
}

// Matches _day_out in trips.py
export interface ItineraryDay {
  id: number;
  trip_id: number;
  day_number: number;
  day_date?: string;
  theme?: string;
  total_cost: number;
  total_travel_time: number;
  items: ItineraryItem[];
}

// Matches GenerationStatus in schemas.py
export type GenerationStatus = 'valid' | 'valid_with_warnings' | 'invalid';

// Matches ItineraryResponse (GET /trips/{id}/itinerary)
export interface Itinerary {
  trip_id: number;
  destination: string;
  start_date: string;
  end_date: string;
  num_days: number;
  currency: string;
  trip_status: string;
  status: GenerationStatus | null;
  total_budget: number;
  estimated_cost: number;
  hotel?: {
    id: number;
    name: string;
    category: string;
    price_per_night: number;
    currency?: string;
    rating: number;
    latitude?: number;
    longitude?: number;
    amenities: string[];
  };
  days: ItineraryDay[];
  validation: ValidationReport | null;
}

export type Algorithm = 'heuristic' | 'cpsat';

// Matches ViolationOut. "info" is a data limitation (placeholder price, estimate), never a violation.
export interface Violation {
  severity: 'hard' | 'soft' | 'info';
  code: string;
  message: string;
  day_number?: number | null;
  item_id?: number | null;
}

export interface ValidationReport {
  trip_id: number;
  valid: boolean;
  hard_violation_count: number;
  soft_violation_count: number;
  violations: Violation[];
}

// Matches SolverResult.meta() (CP-SAT)
export interface SolverMeta {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN' | 'MODEL_INVALID';
  objective: number | null;
  best_bound: number | null;
  optimality_gap: number | null;
  wall_time_s: number;
  time_limit_s: number;
  deterministic_limit: number;
  reproducible: boolean;
  diagnostics: string[];
}

// Matches GenerateResponse (POST /trips/{id}/generate)
export interface GenerateResult {
  trip_id: number;
  status: GenerationStatus;
  replaced_previous: boolean;
  days_generated: number;
  valid: boolean;
  warnings: string[];
  meta: {
    total_places_selected: number;
    estimated_total_activity_cost: number;
    estimated_total_cost_per_person: number;
    algorithm: 'heuristic_v1' | 'cpsat_v1';
    hard_violations: number;
    soft_violations: number;
    solver: SolverMeta | null;
  };
  validation: ValidationReport;
  itinerary: ItineraryDay[];
}

// Response of remove / replace / regenerate-day
export interface EditResult {
  success: boolean;
  message: string;
  day: ItineraryDay;
  validation: ValidationReport;
}

export interface Alternative {
  place: Place;
  recommendation_score: number;
  recommendation_reasons: string[];
  start_time: string;
  end_time: string;
  travel_from_previous_min: number;
}

export interface AlternativesResult {
  item_id: number;
  is_must_visit: boolean;
  alternatives: Alternative[];
}

export type AdaptationType = 'relax' | 'reduce_budget' | 'avoid_crowds' | 'energise';

export interface AdaptChange {
  action: 'added' | 'removed';
  day_number: number;
  title: string;
  place_id: number | null;
  start_time: string;
  cost: number;
}

export interface AdaptResult {
  trip_id: number;
  adaptation_applied: AdaptationType;
  changed: boolean;
  changes: AdaptChange[];
  message: string;
  days: ItineraryDay[];
  validation: ValidationReport;
}

// Matches GET /trips/{id}/budget
export interface BudgetBreakdown {
  trip_id: number;
  currency: string;
  num_travelers: number;
  nights: number;
  total_budget: number;
  categories: {
    activities: number;
    meals: number;
    accommodation: number;
    transport: number | null;
  };
  /** Costs from real records in the trip currency */
  known_total: number;
  /** Placeholder meal prices (no restaurant data), for the group */
  placeholder_total: number;
  placeholder_meals: number;
  excluded_other_currency: number;
  /** known_total + placeholder_total */
  estimated_total: number;
  remaining: number;
  over_budget: boolean;
  per_day: {
    day_number: number;
    activities_per_person: number;
    meals_per_person: number;
    placeholder_per_person: number;
    total_for_group: number;
    daily_cap_per_person: number;
  }[];
  hotel: Itinerary['hotel'] | null;
  assumptions: string[];
  not_included: string[];
  incomplete_reasons: string[];
  free_activities: number;
}

export interface Feedback {
  id: number;
  trip_id: number;
  rating: number;
  tags: string[];
  comment?: string | null;
  created_at: string;
}

// Matches GroundedAnswer (POST /rag/trips/{id}/items/{item}/explanation)
export interface SourceReference {
  label: string;
  chunk_id: number;
  source_document_id: number;
  title: string;
  source_type: string;
  destination: string;
  url: string | null;
  score: number | null;
  snippet: string;
}

export interface GroundedAnswer {
  status: 'answered' | 'insufficient_evidence';
  answer: string | null;
  claims: { text: string; source_labels: string[] }[];
  sources: SourceReference[];
  warnings: string[];
  llm_model: string | null;
  embedding_model: string | null;
}
