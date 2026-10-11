/**
 * Vromon Mobile — trip-planning option lists.
 *
 * Values must match what the backend accepts (schemas.py / seed data).
 */

import type { AdaptationType } from '../types';

/** Interests the ranking can match: categories and tags present in the seed data. */
export const INTERESTS = [
  'Beach',
  'Nature',
  'Adventure',
  'Culture',
  'History',
  'Food',
  'Shopping',
  'Photography',
  'Relaxation',
  'Family',
  'Wildlife',
  'Scenic',
  'Sunset',
  'Nightlife',
] as const;

/** Total trip budget presets (BDT), as in the demo. */
export const BUDGET_PRESETS = [
  { value: 15000, label: '৳15,000', desc: 'Budget trip' },
  { value: 25000, label: '৳25,000', desc: 'Comfortable' },
  { value: 50000, label: '৳50,000', desc: 'Premium' },
] as const;

/** Backend travel styles (recommendation_service.TRAVEL_STYLE_ACTIVITY_DENSITY). */
export const TRAVEL_STYLES = ['Relaxed', 'Balanced', 'Packed'] as const;
export const ACTIVITY_LEVELS = ['Low', 'Medium', 'High'] as const;
/** Hotel categories present in the seed data. */
export const ACCOMMODATION = ['Budget', 'Standard', 'Luxury'] as const;

export const ADAPTATIONS: { type: AdaptationType; label: string; emoji: string; desc: string }[] = [
  { type: 'relax', label: 'More relaxed', emoji: '😌', desc: 'Remove the lowest-ranked activity each day' },
  { type: 'reduce_budget', label: 'Reduce cost', emoji: '💸', desc: 'Remove the most expensive paid activity each day' },
  { type: 'avoid_crowds', label: 'Avoid crowds', emoji: '🚶', desc: 'Remove places that are usually very crowded' },
  { type: 'energise', label: 'More active', emoji: '⚡', desc: 'Add one more activity where it fits' },
];

export const FEEDBACK_TAGS = [
  'Great places',
  'Good pacing',
  'Too rushed',
  'Too slow',
  'Over budget',
  'Good value',
  'Too much travel',
  'Great food',
] as const;
