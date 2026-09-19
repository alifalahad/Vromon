import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Calendar, Users, DollarSign, Heart, Zap,
  Settings, Eye, ArrowLeft, ArrowRight, Loader2,
  CheckCircle2, Navigation, Clock, AlertCircle
} from 'lucide-react';
import type { TripFormData } from '../types';
import { tripsApi } from '../services/api';

const INTERESTS = [
  'Beach', 'Nature', 'Adventure', 'Culture', 'History',
  'Food', 'Shopping', 'Photography', 'Relaxation', 'Family', 'Nightlife',
];

const TRAVEL_STYLES = [
  { value: 'Relaxed', label: 'Relaxed', desc: '2–3 activities/day, plenty of free time', icon: '😌' },
  { value: 'Balanced', label: 'Balanced', desc: '3–4 activities/day, mix of exploration & rest', icon: '⚖️' },
  { value: 'Packed', label: 'Packed', desc: '5–6 activities/day, maximum exploration', icon: '⚡' },
];

const ACTIVITY_LEVELS = [
  { value: 'Low', label: 'Low', desc: 'Easy walks, minimal exertion', icon: '🚶' },
  { value: 'Medium', label: 'Medium', desc: 'Some hiking, moderate energy', icon: '🧗' },
  { value: 'High', label: 'High', desc: 'Active adventures, high energy', icon: '🏃' },
];

const ACCOMMODATION = [
  { value: 'Budget', label: 'Budget', desc: 'Guesthouses (৳800–1,500/night)', icon: '🏠' },
  { value: 'Standard', label: 'Standard', desc: 'Hotels (৳2,000–4,500/night)', icon: '🏨' },
  { value: 'Luxury', label: 'Luxury', desc: 'Resorts (৳6,000+/night)', icon: '🏖️' },
];

const BUDGET_PRESETS = [
  { value: 15000, label: '৳15,000', desc: 'Budget trip' },
  { value: 25000, label: '৳25,000', desc: 'Comfortable' },
  { value: 50000, label: '৳50,000', desc: 'Premium' },
  { value: 0, label: 'Custom', desc: 'Set your own' },
];

const STEPS = [
  { num: 1, label: 'Destination', icon: MapPin },
  { num: 2, label: 'Budget', icon: DollarSign },
  { num: 3, label: 'Interests', icon: Heart },
  { num: 4, label: 'Style', icon: Zap },
  { num: 5, label: 'Constraints', icon: Settings },
  { num: 6, label: 'Review', icon: Eye },
];

const LOADING_STEPS = [
  '✓ Reading your preferences',
  '✓ Finding matching places',
  '✓ Checking time constraints',
  '✓ Estimating travel times',
  '✓ Building your schedule',
  '✓ Preparing your trip...',
];

const defaultForm: TripFormData = {
  destination: "Cox's Bazar",
  start_date: '',
  end_date: '',
  num_travelers: 2,
  total_budget: 15000,
  preference: {
    interests: ['Beach', 'Nature', 'Food'],
    travel_style: 'Relaxed',
    activity_level: 'Medium',
    accommodation_preference: 'Standard',
    preferred_start_time: '09:00',
    preferred_end_time: '20:00',
  },
  constraints: {
    max_activities_per_day: 4,
    max_daily_budget: 0,
    must_visit: [],
    excluded_places: [],
    avoid_crowded: false,
    avoid_high_activity: false,
  },
};

export default function PlanTripPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<TripFormData>(defaultForm);
  const [customBudget, setCustomBudget] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');

  const updatePref = (key: string, val: unknown) =>
    setForm(f => ({ ...f, preference: { ...f.preference, [key]: val } }));
  const updateCons = (key: string, val: unknown) =>
    setForm(f => ({ ...f, constraints: { ...f.constraints, [key]: val } }));

  const toggleInterest = (i: string) => {
    const cur = form.preference.interests;
    const next = cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i];
    updatePref('interests', next);
  };

  const handleBudgetPreset = (val: number) => {
    if (val === 0) return; // Custom — keep current
    setForm(f => ({ ...f, total_budget: val }));
  };

  const validate = (): string => {
    if (step === 1) {
      if (!form.start_date) return 'Please select a start date.';
      if (!form.end_date) return 'Please select an end date.';
      if (new Date(form.end_date) < new Date(form.start_date))
        return 'End date must be after start date.';
      if (form.num_travelers < 1) return 'At least 1 traveler required.';
    }
    if (step === 2) {
      if (form.total_budget <= 0) return 'Please enter a valid budget.';
    }
    if (step === 3) {
      if (form.preference.interests.length === 0)
        return 'Please select at least one interest.';
    }
    return '';
  };

  const next = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
  };

  const prev = () => { setError(''); setStep(s => s - 1); };

  const generate = async () => {
    setLoading(true);
    setLoadingStep(0);
    setError('');
    try {
      // Animate loading steps
      for (let i = 0; i < LOADING_STEPS.length; i++) {
        await new Promise(r => setTimeout(r, 500));
        setLoadingStep(i + 1);
      }
      // Create trip
      const { data: trip } = await tripsApi.create(form);
      // Generate itinerary
      await tripsApi.generate(trip.id);
      navigate(`/trip/${trip.id}`);
    } catch (e: unknown) {
      setLoading(false);
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || 'Failed to generate itinerary. Please try again.');
    }
  };

  const numDays = form.start_date && form.end_date
    ? Math.max(1, Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md w-full">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #2dd4bf)' }}>
            <Loader2 size={40} className="text-white animate-spin" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Creating your itinerary...</h2>
          <p className="mb-8" style={{ color: '#64748b' }}>
            Personalizing your trip to {form.destination}
          </p>
          <div className="rounded-2xl p-6 text-left space-y-3"
            style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {LOADING_STEPS.map((s, i) => (
              <div key={i}
                className="flex items-center gap-3 transition-all duration-300"
                style={{ opacity: i < loadingStep ? 1 : 0.3 }}>
                {i < loadingStep
                  ? <CheckCircle2 size={16} style={{ color: '#4ade80' }} />
                  : <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: '#334155' }} />
                }
                <span className="text-sm" style={{ color: i < loadingStep ? '#e2e8f0' : '#64748b' }}>{s}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs" style={{ color: '#475569' }}>
            Note: This uses a heuristic scheduling engine — not a live AI/RAG system.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Step indicator */}
        <div className="flex items-center justify-center mb-10 gap-1 sm:gap-2">
          {STEPS.map(({ num, label, icon: Icon }) => {
            const done = step > num;
            const active = step === num;
            return (
              <div key={num} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300"
                    style={
                      done
                        ? { background: '#14b8a6', color: 'white' }
                        : active
                        ? { background: 'linear-gradient(135deg, #0ea5e9, #2dd4bf)', color: 'white' }
                        : { background: '#1e293b', color: '#475569', border: '2px solid #334155' }
                    }
                  >
                    {done ? <CheckCircle2 size={16} /> : <Icon size={14} />}
                  </div>
                  <span className="text-xs mt-1 hidden sm:block" style={{ color: active ? '#38bdf8' : '#475569' }}>
                    {label}
                  </span>
                </div>
                {num < 6 && (
                  <div className="w-6 sm:w-10 h-0.5 mx-1"
                    style={{ background: done ? '#14b8a6' : '#334155' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="rounded-3xl p-6 sm:p-8"
          style={{
            background: 'rgba(30,41,59,0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
          }}>
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6 text-sm"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* ── Step 1: Destination + Dates ─────────────────────── */}
          {step === 1 && (
            <div className="fade-in-up">
              <h2 className="text-2xl font-bold mb-2">Where & When?</h2>
              <p className="mb-8" style={{ color: '#64748b' }}>Choose your destination and travel dates.</p>

              {/* Destination */}
              <label className="block mb-6">
                <span className="text-sm font-medium mb-2 flex items-center gap-2"
                  style={{ color: '#94a3b8' }}>
                  <MapPin size={14} /> Destination
                </span>
                <div className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.3)' }}>
                  <MapPin size={18} style={{ color: '#38bdf8' }} />
                  <span className="font-semibold">Cox's Bazar, Bangladesh</span>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8' }}>
                    Demo destination
                  </span>
                </div>
              </label>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: 'Start Date', key: 'start_date' },
                  { label: 'End Date', key: 'end_date' },
                ].map(({ label, key }) => (
                  <label key={key}>
                    <span className="text-sm font-medium mb-2 flex items-center gap-2"
                      style={{ color: '#94a3b8' }}>
                      <Calendar size={14} /> {label}
                    </span>
                    <input
                      type="date"
                      value={form[key as 'start_date' | 'end_date']}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200 focus:outline-none"
                      style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        color: '#e2e8f0',
                        colorScheme: 'dark',
                      }}
                    />
                  </label>
                ))}
              </div>

              {numDays > 0 && (
                <div className="mb-6 text-sm px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(45,212,191,0.08)', color: '#2dd4bf' }}>
                  📅 {numDays} day{numDays > 1 ? 's' : ''} selected
                </div>
              )}

              {/* Travelers */}
              <label>
                <span className="text-sm font-medium mb-2 flex items-center gap-2"
                  style={{ color: '#94a3b8' }}>
                  <Users size={14} /> Number of Travelers
                </span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setForm(f => ({ ...f, num_travelers: Math.max(1, f.num_travelers - 1) }))}
                    className="w-10 h-10 rounded-xl font-bold text-xl transition-all hover:bg-white/10"
                    style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
                  >−</button>
                  <span className="text-2xl font-bold w-12 text-center">{form.num_travelers}</span>
                  <button
                    onClick={() => setForm(f => ({ ...f, num_travelers: f.num_travelers + 1 }))}
                    className="w-10 h-10 rounded-xl font-bold text-xl transition-all hover:bg-white/10"
                    style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
                  >+</button>
                </div>
              </label>
            </div>
          )}

          {/* ── Step 2: Budget ───────────────────────────────────── */}
          {step === 2 && (
            <div className="fade-in-up">
              <h2 className="text-2xl font-bold mb-2">What's your budget?</h2>
              <p className="mb-8" style={{ color: '#64748b' }}>Total budget for the trip (in Bangladeshi Taka).</p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {BUDGET_PRESETS.map(({ value, label, desc }) => {
                  const isSelected = value !== 0 && form.total_budget === value;
                  const isCustom = value === 0;
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        if (!isCustom) handleBudgetPreset(value);
                        else {
                          // Toggle custom input focus
                          const el = document.getElementById('custom-budget');
                          el?.focus();
                        }
                      }}
                      className="rounded-2xl p-4 text-left transition-all duration-200"
                      style={{
                        background: isSelected
                          ? 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(45,212,191,0.2))'
                          : 'rgba(30,41,59,0.8)',
                        border: isSelected ? '2px solid #0ea5e9' : '2px solid #334155',
                      }}
                    >
                      <div className="font-bold text-lg">{label}</div>
                      <div className="text-xs mt-1" style={{ color: '#64748b' }}>{desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Custom budget input */}
              <label>
                <span className="text-sm font-medium mb-2 block" style={{ color: '#94a3b8' }}>
                  Or enter custom amount (৳):
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold px-3" style={{ color: '#64748b' }}>৳</span>
                  <input
                    id="custom-budget"
                    type="number"
                    placeholder="e.g. 30000"
                    value={customBudget}
                    onChange={e => {
                      setCustomBudget(e.target.value);
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v > 0) setForm(f => ({ ...f, total_budget: v }));
                    }}
                    className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#e2e8f0',
                    }}
                  />
                </div>
              </label>

              <div className="mt-4 text-sm px-3 py-2 rounded-lg"
                style={{ background: 'rgba(14,165,233,0.08)', color: '#38bdf8' }}>
                Selected: ৳{form.total_budget.toLocaleString()}
                {numDays > 0 && ` · ৳${Math.round(form.total_budget / numDays).toLocaleString()}/day`}
              </div>

              {/* Accommodation */}
              <div className="mt-6">
                <span className="text-sm font-medium mb-3 block" style={{ color: '#94a3b8' }}>
                  Accommodation preference:
                </span>
                <div className="grid grid-cols-3 gap-3">
                  {ACCOMMODATION.map(({ value, label, desc, icon }) => (
                    <button
                      key={value}
                      onClick={() => updatePref('accommodation_preference', value)}
                      className="rounded-xl p-3 text-center transition-all duration-200"
                      style={{
                        background: form.preference.accommodation_preference === value
                          ? 'rgba(14,165,233,0.15)' : '#1e293b',
                        border: form.preference.accommodation_preference === value
                          ? '2px solid #0ea5e9' : '2px solid #334155',
                      }}
                    >
                      <div className="text-2xl mb-1">{icon}</div>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#475569' }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Interests ────────────────────────────────── */}
          {step === 3 && (
            <div className="fade-in-up">
              <h2 className="text-2xl font-bold mb-2">What do you love?</h2>
              <p className="mb-8" style={{ color: '#64748b' }}>
                Select all your interests. These shape every recommendation.
              </p>
              <div className="flex flex-wrap gap-3">
                {INTERESTS.map(i => (
                  <button
                    key={i}
                    onClick={() => toggleInterest(i)}
                    className="interest-chip"
                    style={
                      form.preference.interests.includes(i)
                        ? { background: 'linear-gradient(135deg,#0ea5e9,#2dd4bf)', border: '2px solid transparent', color: 'white' }
                        : {}
                    }
                  >
                    {i}
                  </button>
                ))}
              </div>
              {form.preference.interests.length > 0 && (
                <div className="mt-6 text-sm px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(14,165,233,0.08)', color: '#38bdf8' }}>
                  ✓ {form.preference.interests.length} interest{form.preference.interests.length > 1 ? 's' : ''} selected:
                  {' '}{form.preference.interests.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Travel Style ─────────────────────────────── */}
          {step === 4 && (
            <div className="fade-in-up">
              <h2 className="text-2xl font-bold mb-2">Your travel style</h2>
              <p className="mb-8" style={{ color: '#64748b' }}>
                This controls how many activities are packed into each day.
              </p>

              <div className="space-y-3 mb-8">
                {TRAVEL_STYLES.map(({ value, label, desc, icon }) => (
                  <button
                    key={value}
                    onClick={() => updatePref('travel_style', value)}
                    className="w-full flex items-center gap-4 rounded-2xl p-4 text-left transition-all duration-200"
                    style={{
                      background: form.preference.travel_style === value
                        ? 'linear-gradient(135deg,rgba(14,165,233,0.15),rgba(45,212,191,0.15))'
                        : 'rgba(30,41,59,0.8)',
                      border: form.preference.travel_style === value
                        ? '2px solid #0ea5e9' : '2px solid #334155',
                    }}
                  >
                    <span className="text-3xl">{icon}</span>
                    <div>
                      <div className="font-semibold">{label}</div>
                      <div className="text-sm mt-0.5" style={{ color: '#64748b' }}>{desc}</div>
                    </div>
                    {form.preference.travel_style === value && (
                      <CheckCircle2 size={20} className="ml-auto" style={{ color: '#0ea5e9' }} />
                    )}
                  </button>
                ))}
              </div>

              <h3 className="font-semibold mb-3">Activity Level</h3>
              <div className="grid grid-cols-3 gap-3">
                {ACTIVITY_LEVELS.map(({ value, label, desc, icon }) => (
                  <button
                    key={value}
                    onClick={() => updatePref('activity_level', value)}
                    className="rounded-xl p-3 text-center transition-all duration-200"
                    style={{
                      background: form.preference.activity_level === value
                        ? 'rgba(14,165,233,0.15)' : '#1e293b',
                      border: form.preference.activity_level === value
                        ? '2px solid #0ea5e9' : '2px solid #334155',
                    }}
                  >
                    <div className="text-2xl mb-1">{icon}</div>
                    <div className="text-sm font-semibold">{label}</div>
                    <div className="text-xs mt-0.5" style={{ color: '#475569' }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 5: Constraints ──────────────────────────────── */}
          {step === 5 && (
            <div className="fade-in-up">
              <h2 className="text-2xl font-bold mb-2">Any preferences?</h2>
              <p className="mb-8" style={{ color: '#64748b' }}>
                Fine-tune your schedule with optional constraints.
              </p>

              {/* Time window */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: 'Preferred start time', key: 'preferred_start_time', icon: Clock },
                  { label: 'Preferred end time', key: 'preferred_end_time', icon: Clock },
                ].map(({ label, key, icon: Icon }) => (
                  <label key={key}>
                    <span className="text-sm font-medium mb-2 flex items-center gap-2"
                      style={{ color: '#94a3b8' }}>
                      <Icon size={14} /> {label}
                    </span>
                    <input
                      type="time"
                      value={form.preference[key as 'preferred_start_time' | 'preferred_end_time']}
                      onChange={e => updatePref(key, e.target.value)}
                      className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                      style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', colorScheme: 'dark' }}
                    />
                  </label>
                ))}
              </div>

              {/* Max activities per day */}
              <div className="mb-6">
                <span className="text-sm font-medium mb-3 flex items-center gap-2"
                  style={{ color: '#94a3b8' }}>
                  <Navigation size={14} /> Max activities per day: {form.constraints.max_activities_per_day}
                </span>
                <input
                  type="range"
                  min={2} max={7} step={1}
                  value={form.constraints.max_activities_per_day}
                  onChange={e => updateCons('max_activities_per_day', parseInt(e.target.value))}
                  className="w-full accent-cyan-500"
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: '#475569' }}>
                  <span>2</span><span>7</span>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                {[
                  { key: 'avoid_crowded', label: 'Avoid crowded places', desc: 'Penalises high-crowd attractions in scoring' },
                  { key: 'avoid_high_activity', label: 'Avoid high-activity places', desc: 'Suitable for low-energy or accessibility needs' },
                ].map(({ key, label, desc }) => (
                  <button
                    key={key}
                    onClick={() => updateCons(key, !form.constraints[key as 'avoid_crowded' | 'avoid_high_activity'])}
                    className="w-full flex items-center justify-between rounded-xl p-4 text-left transition-all"
                    style={{
                      background: '#1e293b',
                      border: form.constraints[key as 'avoid_crowded' | 'avoid_high_activity']
                        ? '2px solid #0ea5e9' : '2px solid #334155',
                    }}
                  >
                    <div>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#475569' }}>{desc}</div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-all duration-300 flex items-center ${form.constraints[key as 'avoid_crowded' | 'avoid_high_activity'] ? 'justify-end bg-cyan-500' : 'justify-start bg-slate-700'}`}
                      style={{ padding: '2px' }}>
                      <div className="w-5 h-5 rounded-full bg-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 6: Review ───────────────────────────────────── */}
          {step === 6 && (
            <div className="fade-in-up">
              <h2 className="text-2xl font-bold mb-2">Review your trip</h2>
              <p className="mb-8" style={{ color: '#64748b' }}>
                Everything looks good? Let's generate your itinerary.
              </p>

              <div className="space-y-3">
                {[
                  { label: 'Destination', value: form.destination },
                  { label: 'Dates', value: form.start_date && form.end_date ? `${form.start_date} → ${form.end_date} (${numDays} days)` : '—' },
                  { label: 'Travelers', value: `${form.num_travelers} person${form.num_travelers > 1 ? 's' : ''}` },
                  { label: 'Budget', value: `৳${form.total_budget.toLocaleString()}` },
                  { label: 'Accommodation', value: form.preference.accommodation_preference },
                  { label: 'Interests', value: form.preference.interests.join(', ') || '—' },
                  { label: 'Travel Style', value: `${form.preference.travel_style} · ${form.preference.activity_level} activity` },
                  { label: 'Daily window', value: `${form.preference.preferred_start_time} – ${form.preference.preferred_end_time}` },
                  { label: 'Max activities/day', value: form.constraints.max_activities_per_day },
                  { label: 'Avoid crowded', value: form.constraints.avoid_crowded ? 'Yes' : 'No' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-start rounded-xl px-4 py-3"
                    style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-sm" style={{ color: '#64748b' }}>{label}</span>
                    <span className="text-sm font-semibold text-right ml-4">{String(value)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)', color: '#fbbf24' }}>
                ℹ️ The itinerary will be generated using our rule-based recommendation + heuristic scheduling engine.
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center mt-8 pt-6"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={prev}
              disabled={step === 1}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' }}
            >
              <ArrowLeft size={16} /> Back
            </button>

            {step < 6
              ? <button
                  onClick={next}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#0ea5e9,#2dd4bf)' }}
                >
                  Continue <ArrowRight size={16} />
                </button>
              : <button
                  onClick={generate}
                  className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#0ea5e9,#2dd4bf)', boxShadow: '0 0 30px rgba(14,165,233,0.3)' }}
                >
                  <Zap size={16} /> Generate My Itinerary
                </button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
