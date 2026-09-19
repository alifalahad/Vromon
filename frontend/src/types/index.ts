// Types for Vromon frontend

export interface Place {
  id: number;
  name: string;
  destination: string;
  category: string;
  description?: string;
  latitude: number;
  longitude: number;
  rating: number;
  review_count: number;
  average_visit_duration: number;
  estimated_cost: number;
  opening_time: string;
  closing_time: string;
  best_time?: string;
  crowd_level: 'Low' | 'Medium' | 'High';
  activity_level: 'Low' | 'Medium' | 'High';
  tags: string[];
  image_url?: string;
}

export interface Restaurant {
  id: number;
  name: string;
  destination: string;
  cuisine?: string;
  price_level: 'Budget' | 'Medium' | 'Premium';
  rating: number;
  review_count: number;
  latitude: number;
  longitude: number;
  average_meal_cost: number;
  opening_time: string;
  closing_time: string;
  tags: string[];
  description?: string;
}

export interface Hotel {
  id: number;
  name: string;
  destination: string;
  category: 'Budget' | 'Standard' | 'Luxury';
  price_per_night: number;
  rating: number;
  review_count: number;
  latitude: number;
  longitude: number;
  description?: string;
  amenities: string[];
}

export interface TripPreference {
  id: number;
  interests: string[];
  travel_style: 'Relaxed' | 'Balanced' | 'Packed';
  activity_level: 'Low' | 'Medium' | 'High';
  accommodation_preference: 'Budget' | 'Standard' | 'Luxury';
  preferred_start_time: string;
  preferred_end_time: string;
}

export interface TripConstraint {
  id: number;
  max_activities_per_day: number;
  max_daily_budget: number;
  must_visit: number[];
  excluded_places: number[];
  avoid_crowded: boolean;
  avoid_high_activity: boolean;
}

export interface ItineraryItem {
  id: number;
  item_type: 'activity' | 'meal' | 'transport' | 'break';
  place_id?: number;
  restaurant_id?: number;
  title: string;
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
  place?: Place;
  restaurant?: Restaurant;
}

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

export interface Feedback {
  id: number;
  trip_id: number;
  rating: number;
  tags: string[];
  comment?: string;
  created_at: string;
}

export interface Trip {
  id: number;
  title?: string;
  destination: string;
  start_date: string;
  end_date: string;
  num_travelers: number;
  total_budget: number;
  status: 'draft' | 'generated' | 'saved';
  created_at: string;
  updated_at: string;
  num_days: number;
  preference?: TripPreference;
  constraints?: TripConstraint;
  itinerary_days: ItineraryDay[];
  feedback?: Feedback;
}

export interface TripSummary {
  id: number;
  title?: string;
  destination: string;
  start_date: string;
  end_date: string;
  num_travelers: number;
  total_budget: number;
  status: string;
  num_days: number;
  created_at: string;
}

// Form types
export interface TripFormData {
  destination: string;
  start_date: string;
  end_date: string;
  num_travelers: number;
  total_budget: number;
  custom_budget?: number;
  preference: {
    interests: string[];
    travel_style: string;
    activity_level: string;
    accommodation_preference: string;
    preferred_start_time: string;
    preferred_end_time: string;
  };
  constraints: {
    max_activities_per_day: number;
    max_daily_budget: number;
    must_visit: number[];
    excluded_places: number[];
    avoid_crowded: boolean;
    avoid_high_activity: boolean;
  };
}

export interface ScoredPlace {
  place: Place;
  score: number;
  reasons: string[];
}

export interface BudgetBreakdown {
  accommodation: number;
  food: number;
  activities: number;
  transportation: number;
  total: number;
  budget: number;
  remaining: number;
  utilization_pct: number;
}
