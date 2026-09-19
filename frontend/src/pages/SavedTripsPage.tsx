import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, MapPin, Calendar, Users, Loader2,
  FolderOpen, Trash2, BookOpen, CheckCircle2
} from 'lucide-react';
import { tripsApi } from '../services/api';
import type { TripSummary } from '../types';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'rgba(250,204,21,0.1)', text: '#fbbf24', label: 'Draft' },
  generated: { bg: 'rgba(56,189,248,0.1)', text: '#38bdf8', label: 'Generated' },
  saved: { bg: 'rgba(74,222,128,0.1)', text: '#4ade80', label: 'Saved' },
};

export default function SavedTripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    tripsApi.list()
      .then(r => setTrips(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this trip?')) return;
    setDeleting(id);
    try {
      await tripsApi.delete(id);
      setTrips(prev => prev.filter(t => t.id !== id));
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin" style={{ color: '#0ea5e9' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <BookOpen size={28} style={{ color: '#38bdf8' }} />
              My Trips
            </h1>
            <p className="mt-1 text-sm" style={{ color: '#64748b' }}>
              {trips.length} trip{trips.length !== 1 ? 's' : ''} planned
            </p>
          </div>
          <button
            onClick={() => navigate('/plan')}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#0ea5e9,#2dd4bf)' }}
          >
            <Plus size={16} /> Plan New Trip
          </button>
        </div>

        {/* Empty state */}
        {trips.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <FolderOpen size={36} style={{ color: '#475569' }} />
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: '#e2e8f0' }}>No trips yet</h2>
            <p className="mb-8" style={{ color: '#64748b' }}>Start planning your perfect Cox's Bazar getaway.</p>
            <button
              onClick={() => navigate('/plan')}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-bold text-white mx-auto transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#0ea5e9,#2dd4bf)' }}
            >
              <Plus size={20} /> Plan My First Trip
            </button>
          </div>
        )}

        {/* Trip cards */}
        <div className="space-y-4">
          {trips.map(trip => {
            const status = STATUS_COLORS[trip.status] || STATUS_COLORS.draft;
            const perDay = Math.round(trip.total_budget / Math.max(trip.num_days, 1));
            return (
              <div
                key={trip.id}
                className="rounded-2xl p-5 card-hover"
                style={{
                  background: 'rgba(30,41,59,0.7)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: status.bg, color: status.text }}
                      >
                        {status.label}
                      </span>
                      {trip.status === 'saved' && (
                        <CheckCircle2 size={14} style={{ color: '#4ade80' }} />
                      )}
                    </div>

                    <h2 className="text-lg font-bold mb-1">{trip.title || trip.destination}</h2>

                    <div className="flex flex-wrap gap-4 text-sm" style={{ color: '#64748b' }}>
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} style={{ color: '#38bdf8' }} />
                        {trip.destination}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar size={13} />
                        {trip.start_date} → {trip.end_date}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users size={13} />
                        {trip.num_travelers} traveler{trip.num_travelers > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="flex gap-4 mt-3 text-sm">
                      <div className="rounded-lg px-3 py-1.5"
                        style={{ background: 'rgba(14,165,233,0.08)', color: '#38bdf8' }}>
                        <span className="font-bold">৳{trip.total_budget.toLocaleString()}</span>
                        <span className="text-xs ml-1 opacity-70">total</span>
                      </div>
                      <div className="rounded-lg px-3 py-1.5"
                        style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8' }}>
                        <span className="font-bold">{trip.num_days}</span>
                        <span className="text-xs ml-1 opacity-70">days</span>
                      </div>
                      <div className="rounded-lg px-3 py-1.5"
                        style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8' }}>
                        <span className="font-bold">৳{perDay.toLocaleString()}</span>
                        <span className="text-xs ml-1 opacity-70">/day</span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => navigate(`/trip/${trip.id}`)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg,#0ea5e9,#2dd4bf)' }}
                    >
                      <FolderOpen size={14} /> Open
                    </button>
                    <button
                      onClick={() => handleDelete(trip.id)}
                      disabled={deleting === trip.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-all hover:bg-red-500/10 disabled:opacity-40"
                      style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                    >
                      {deleting === trip.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
