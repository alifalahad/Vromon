import type { ItineraryDay } from '../../types';
import { Activity, DollarSign, Clock, Navigation } from 'lucide-react';
import ActivityCard from './ActivityCard';

interface DayViewProps {
  day: ItineraryDay;
  onRemoveItem?: (itemId: number) => void;
}

export default function DayView({ day, onRemoveItem }: DayViewProps) {
  const activityCount = day.items.filter(i => i.item_type === 'activity').length;

  return (
    <div>
      {/* Day stats bar */}
      <div className="flex flex-wrap gap-4 mb-6 px-1">
        {[
          { icon: Activity, val: `${activityCount} activities`, color: '#38bdf8' },
          { icon: DollarSign, val: `৳${Math.round(day.total_cost).toLocaleString()}`, color: '#4ade80' },
          { icon: Clock, val: `${Math.round(day.total_travel_time)} min travel`, color: '#facc15' },
          { icon: Navigation, val: `${day.items.length} stops`, color: '#a78bfa' },
        ].map(({ icon: Icon, val, color }) => (
          <div key={val} className="flex items-center gap-2 text-sm">
            <Icon size={14} style={{ color }} />
            <span style={{ color: '#94a3b8' }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Theme badge */}
      {day.theme && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-6"
          style={{
            background: 'rgba(56,189,248,0.1)',
            border: '1px solid rgba(56,189,248,0.2)',
            color: '#38bdf8',
          }}>
          🌊 {day.theme}
        </div>
      )}

      {/* Timeline items */}
      <div className="space-y-3">
        {day.items.length === 0 && (
          <div className="text-center py-12 rounded-2xl"
            style={{ background: 'rgba(30,41,59,0.4)', border: '1px dashed #334155', color: '#475569' }}>
            No activities scheduled for this day.
          </div>
        )}
        {[...day.items]
          .sort((a, b) => a.order_index - b.order_index)
          .map(item => (
            <ActivityCard
              key={item.id}
              item={item}
              onRemove={onRemoveItem}
            />
          ))}
      </div>
    </div>
  );
}
