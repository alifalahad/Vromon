import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, MapPin, Calendar, Users, Loader2,
  DollarSign, Zap, BookmarkPlus, AlertTriangle, Map as MapIcon,
  ChevronDown, ChevronUp, Activity
} from 'lucide-react';
import { tripsApi } from '../services/api';
import type { Trip, ItineraryDay, Hotel } from '../types';
import DayView from '../components/Itinerary/DayView';
import TripMap from '../components/Map/TripMap';
import BudgetDashboard from '../components/Budget/BudgetDashboard';
import FeedbackPanel from '../components/Feedback/FeedbackPanel';

const ADAPT_OPTIONS = [
  { type: 'relax', label: 'Make it more relaxed', icon: '😌', desc: 'Remove lowest-priority activity per day' },
  { type: 'reduce_budget', label: 'Reduce cost', icon: '💸', desc: 'Remove most expensive activity per day' },
  { type: 'avoid_crowds', label: 'Avoid crowded places', icon: '🚶', desc: 'Remove high-crowd attractions' },
];

export default function ItineraryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tripId = parseInt(id!);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [adapting, setAdapting] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [showAdapt, setShowAdapt] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadItinerary = useCallback(async () => {
    try {
      const { data: tripData } = await tripsApi.get(tripId);
      setTrip(tripData);
      setDays(tripData.itinerary_days);

      const { data: itinerary } = await tripsApi.getItinerary(tripId);
      if (itinerary.hotel) setHotel(itinerary.hotel as Hotel);
    } catch {
      setError('Failed to load itinerary.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadItinerary(); }, [loadItinerary]);

  const handleRemoveItem = async (itemId: number) => {
    try {
      await tripsApi.removeItem(tripId, itemId);
      // Update local state
      setDays(prev =>
        prev.map(d => ({
          ...d,
          items: d.items.filter(i => i.id !== itemId),
          total_cost: d.items
            .filter(i => i.id !== itemId)
            .reduce((s, i) => s + i.cost, 0),
        }))
      );
    } catch {
      alert('Failed to remove activity.');
    }
  };

  const handleRegenerateDay = async (dayId: number, dayNumber: number) => {
    setRegenerating(dayNumber);
    try {
      const { data: newDay } = await tripsApi.regenerateDay(tripId, dayId);
      setDays(prev => prev.map(d => d.day_number === dayNumber ? newDay : d));
    } catch {
      alert('Failed to regenerate day.');
    } finally {
      setRegenerating(null);
    }
  };

  const handleAdapt = async (type: string) => {
    setAdapting(true);
    try {
      const { data } = await tripsApi.adapt(tripId, type);
      setDays((data as { days: ItineraryDay[] }).days);
      setShowAdapt(false);
    } catch {
      alert('Adaptation failed.');
    } finally {
      setAdapting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await tripsApi.update(tripId, { status: 'saved' } as Partial<Trip>);
      setTrip(prev => prev ? { ...prev, status: 'saved' } : prev);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: '#0ea5e9' }} />
          <p style={{ color: '#64748b' }}>Loading your itinerary...</p>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={40} className="mx-auto mb-4" style={{ color: '#ef4444' }} />
          <p className="font-semibold mb-2">{error || 'Trip not found'}</p>
          <button onClick={() => navigate('/')} className="text-sm" style={{ color: '#38bdf8' }}>
            ← Go home
          </button>
        </div>
      </div>
    );
  }

  const currentDay = days.find(d => d.day_number === selectedDay) || days[0];

  return (
    <div className="min-h-screen pb-16">
      {/* Trip header */}
      <div className="sticky top-16 z-40" style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/trips')} className="p-2 rounded-lg hover:bg-white/5 transition-all">
                <ArrowLeft size={18} style={{ color: '#94a3b8' }} />
              </button>
              <div>
                <h1 className="font-bold text-lg flex items-center gap-2">
                  <MapPin size={16} style={{ color: '#38bdf8' }} />
                  {trip.destination}
                  {trip.status === 'saved' && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>
                      Saved
                    </span>
                  )}
                </h1>
                <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: '#64748b' }}>
                  <span className="flex items-center gap-1">
                    <Calendar size={11} /> {trip.start_date} – {trip.end_date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {trip.num_travelers}
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign size={11} /> ৳{trip.total_budget.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdapt(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}
              >
                <Zap size={13} /> Adapt
                {showAdapt ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || trip.status === 'saved'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
                style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80' }}
              >
                <BookmarkPlus size={13} />
                {trip.status === 'saved' ? 'Saved' : saving ? 'Saving...' : 'Save Trip'}
              </button>
            </div>
          </div>

          {/* Adapt panel */}
          {showAdapt && (
            <div className="mt-3 flex flex-wrap gap-2 pb-2">
              {ADAPT_OPTIONS.map(({ type, label, icon, desc }) => (
                <button
                  key={type}
                  onClick={() => handleAdapt(type)}
                  disabled={adapting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50 hover:opacity-90"
                  style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }}
                >
                  <span>{icon}</span>
                  <div className="text-left">
                    <div className="font-medium text-xs">{label}</div>
                    <div className="text-xs" style={{ color: '#475569' }}>{desc}</div>
                  </div>
                </button>
              ))}
              {adapting && <Loader2 size={18} className="animate-spin self-center" style={{ color: '#38bdf8' }} />}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 pt-6">
        {/* Day tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6">
          {days.map(d => (
            <button
              key={d.day_number}
              onClick={() => setSelectedDay(d.day_number)}
              className={`day-tab flex-shrink-0 ${selectedDay === d.day_number ? 'active' : ''}`}
            >
              <div className="font-semibold">Day {d.day_number}</div>
              {d.day_date && (
                <div className="text-xs opacity-70">{d.day_date}</div>
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Itinerary timeline */}
          <div className="lg:col-span-2 space-y-6">
            {/* Day header */}
            {currentDay && (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Day {currentDay.day_number}</h2>
                  {currentDay.theme && (
                    <p className="text-sm" style={{ color: '#64748b' }}>{currentDay.theme}</p>
                  )}
                </div>
                <button
                  onClick={() => currentDay && handleRegenerateDay(currentDay.id, currentDay.day_number)}
                  disabled={regenerating === currentDay.day_number}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
                  style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', color: '#818cf8' }}
                >
                  {regenerating === currentDay.day_number
                    ? <Loader2 size={13} className="animate-spin" />
                    : <RefreshCw size={13} />}
                  Regenerate Day
                </button>
              </div>
            )}

            {currentDay && (
              <DayView
                day={currentDay}
                onRemoveItem={handleRemoveItem}
              />
            )}
          </div>

          {/* Right: Map + Budget + Feedback */}
          <div className="space-y-5">
            {/* Map toggle */}
            <div>
              <button
                onClick={() => setShowMap(v => !v)}
                className="flex items-center gap-2 mb-3 text-sm font-semibold"
                style={{ color: '#94a3b8' }}
              >
                <MapIcon size={15} /> Map
                {showMap ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showMap && (
                <TripMap
                  days={days}
                  hotel={hotel}
                  selectedDay={selectedDay}
                  height="320px"
                />
              )}
            </div>

            {/* Planning summary */}
            <div className="rounded-2xl p-4"
              style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Activity size={14} style={{ color: '#38bdf8' }} /> Planning Summary
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: 'Total days', val: trip.num_days },
                  { label: 'Activities', val: days.reduce((s, d) => s + d.items.filter(i => i.item_type === 'activity').length, 0) },
                  { label: 'Meals', val: days.reduce((s, d) => s + d.items.filter(i => i.item_type === 'meal').length, 0) },
                  { label: 'Avg/day', val: `${Math.round(days.reduce((s, d) => s + d.items.filter(i => i.item_type === 'activity').length, 0) / Math.max(trip.num_days, 1))} acts` },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="text-xs" style={{ color: '#475569' }}>{label}</div>
                    <div className="font-bold">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Budget */}
            <BudgetDashboard
              trip={trip}
              days={days}
              hotelPricePerNight={hotel?.price_per_night}
            />

            {/* Feedback */}
            <FeedbackPanel tripId={tripId} onFeedbackSubmitted={loadItinerary} />
          </div>
        </div>
      </div>
    </div>
  );
}
