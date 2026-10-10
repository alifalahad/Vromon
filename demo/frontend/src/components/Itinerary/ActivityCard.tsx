import type { ItineraryItem } from '../../types';
import {
  MapPin, Clock, Star, DollarSign, Utensils, Activity,
  ChevronDown, ChevronUp, Navigation, Trash2, Info, CheckCircle2
} from 'lucide-react';
import { useState } from 'react';

interface ActivityCardProps {
  item: ItineraryItem;
  onRemove?: (itemId: number) => void;
}

export default function ActivityCard({ item, onRemove }: ActivityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isMeal = item.item_type === 'meal';
  const isActivity = item.item_type === 'activity';

  const scorePercent = Math.round(item.recommendation_score * 100);

  const typeColor = isMeal ? '#facc15' : '#38bdf8';
  const typeBg = isMeal ? 'rgba(250,204,21,0.1)' : 'rgba(56,189,248,0.08)';

  return (
    <div
      className="relative rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'rgba(30,41,59,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: typeColor }}
      />

      <div className="pl-4 pr-4 py-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Time */}
          <div className="flex-shrink-0 text-right" style={{ minWidth: '52px' }}>
            <div className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{item.start_time}</div>
            <div className="text-xs" style={{ color: '#475569' }}>{item.end_time}</div>
          </div>

          {/* Icon */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: typeBg }}
          >
            {isMeal
              ? <Utensils size={16} style={{ color: typeColor }} />
              : <Activity size={16} style={{ color: typeColor }} />
            }
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-sm leading-snug">{item.title}</h4>
              <div className="flex items-center gap-1 flex-shrink-0">
                {isActivity && onRemove && (
                  <button
                    onClick={() => onRemove(item.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                    title="Remove"
                  >
                    <Trash2 size={13} style={{ color: '#ef4444' }} />
                  </button>
                )}
                {isActivity && item.recommendation_reasons.length > 0 && (
                  <button
                    onClick={() => setExpanded(e => !e)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: 'rgba(56,189,248,0.1)' }}
                    title="Why recommended?"
                  >
                    {expanded ? <ChevronUp size={13} style={{ color: '#38bdf8' }} /> : <ChevronDown size={13} style={{ color: '#38bdf8' }} />}
                  </button>
                )}
              </div>
            </div>

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {item.place && (
                <span className="text-xs flex items-center gap-1" style={{ color: '#64748b' }}>
                  <MapPin size={10} /> {item.place.category}
                </span>
              )}
              {item.restaurant && (
                <span className="text-xs flex items-center gap-1" style={{ color: '#64748b' }}>
                  <Utensils size={10} /> {item.restaurant.cuisine}
                </span>
              )}
              <span className="text-xs flex items-center gap-1" style={{ color: '#64748b' }}>
                <Clock size={10} /> {item.duration_minutes}min
              </span>
              {item.place && (
                <span className="text-xs flex items-center gap-1" style={{ color: '#facc15' }}>
                  <Star size={10} /> {item.place.rating}
                </span>
              )}
              {item.cost > 0 && (
                <span className="text-xs flex items-center gap-1" style={{ color: '#4ade80' }}>
                  <DollarSign size={10} /> ৳{Math.round(item.cost)}
                </span>
              )}
              {isActivity && scorePercent > 0 && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}
                >
                  {scorePercent}% match
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expanded reasons */}
        {expanded && item.recommendation_reasons.length > 0 && (
          <div
            className="mt-3 ml-16 rounded-xl p-3"
            style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}
          >
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#38bdf8' }}>
              <Info size={11} /> Why we recommend this:
            </div>
            <div className="space-y-1.5">
              {item.recommendation_reasons.filter(r => !r.includes('⚠')).map((r, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <CheckCircle2 size={11} className="flex-shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
                  <span style={{ color: '#94a3b8' }}>{r}</span>
                </div>
              ))}
              {item.recommendation_reasons.filter(r => r.includes('⚠')).map((r, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="flex-shrink-0" style={{ color: '#fbbf24' }}>⚠</span>
                  <span style={{ color: '#94a3b8' }}>{r.replace('⚠ ', '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Travel to next */}
        {item.travel_time_to_next > 0 && (
          <div
            className="mt-3 ml-16 flex items-center gap-2 text-xs"
            style={{ color: '#475569' }}
          >
            <Navigation size={10} />
            <span>~{Math.round(item.travel_time_to_next)} min drive · {item.distance_to_next.toFixed(1)} km to next</span>
            <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#334155' }}>
              Approximate
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
