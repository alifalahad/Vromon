import type { Trip, ItineraryDay } from '../../types';
import { DollarSign, Home, Utensils, Activity, Car } from 'lucide-react';

interface BudgetDashboardProps {
  trip: Trip;
  days: ItineraryDay[];
  hotelPricePerNight?: number;
}

export default function BudgetDashboard({ trip, days, hotelPricePerNight = 3000 }: BudgetDashboardProps) {
  const totalBudget = trip.total_budget;
  const numDays = trip.num_days;

  // Calculate breakdown
  const accommodation = hotelPricePerNight * numDays;

  const foodCost = days.reduce((sum, day) => {
    return sum + day.items
      .filter(i => i.item_type === 'meal')
      .reduce((s, i) => s + i.cost, 0);
  }, 0);

  const activityCost = days.reduce((sum, day) => {
    return sum + day.items
      .filter(i => i.item_type === 'activity')
      .reduce((s, i) => s + i.cost, 0);
  }, 0);

  const transportEstimate = numDays * 500; // ৳500/day estimate

  const total = accommodation + foodCost + activityCost + transportEstimate;
  const remaining = totalBudget - total;
  const utilization = Math.min(100, Math.round((total / totalBudget) * 100));

  const items = [
    { label: 'Accommodation', amount: accommodation, icon: Home, color: '#818cf8' },
    { label: 'Food & Dining', amount: foodCost, icon: Utensils, color: '#facc15' },
    { label: 'Activities', amount: activityCost, icon: Activity, color: '#38bdf8' },
    { label: 'Transportation', amount: transportEstimate, icon: Car, color: '#4ade80' },
  ];

  const barColor = utilization > 90 ? '#ef4444' : utilization > 70 ? '#facc15' : '#4ade80';

  return (
    <div className="rounded-2xl p-5"
      style={{
        background: 'rgba(30,41,59,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <DollarSign size={18} style={{ color: '#4ade80' }} />
        Estimated Trip Cost
      </h3>

      {/* Breakdown rows */}
      <div className="space-y-3 mb-5">
        {items.map(({ label, amount, icon: Icon, color }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon size={14} style={{ color }} />
              <span className="text-sm" style={{ color: '#94a3b8' }}>{label}</span>
            </div>
            <span className="text-sm font-semibold">৳{Math.round(amount).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t my-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* Total row */}
      <div className="flex justify-between items-center mb-2">
        <span className="font-semibold">Total Estimate</span>
        <span className="font-bold text-lg">৳{Math.round(total).toLocaleString()}</span>
      </div>
      <div className="flex justify-between items-center mb-2 text-sm">
        <span style={{ color: '#64748b' }}>Budget</span>
        <span style={{ color: '#64748b' }}>৳{totalBudget.toLocaleString()}</span>
      </div>
      <div className="flex justify-between items-center mb-4 text-sm">
        <span style={{ color: remaining >= 0 ? '#4ade80' : '#ef4444' }}>
          {remaining >= 0 ? 'Remaining' : 'Over budget'}
        </span>
        <span
          className="font-semibold"
          style={{ color: remaining >= 0 ? '#4ade80' : '#ef4444' }}
        >
          {remaining >= 0 ? '+' : ''}৳{Math.round(Math.abs(remaining)).toLocaleString()}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs mb-1.5" style={{ color: '#64748b' }}>
          <span>Budget utilization</span>
          <span style={{ color: barColor }}>{utilization}%</span>
        </div>
        <div className="budget-bar">
          <div
            className="budget-bar-fill"
            style={{
              width: `${utilization}%`,
              background: `linear-gradient(to right, ${barColor}, ${barColor}88)`,
            }}
          />
        </div>
        {utilization > 90 && remaining < 0 && (
          <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>
            ⚠ Estimate slightly exceeds budget. Consider reducing accommodation tier or days.
          </p>
        )}
        <p className="text-xs mt-2" style={{ color: '#475569' }}>
          * Transportation is an approximate estimate of ৳500/day. Sample data — not verified pricing.
        </p>
      </div>
    </div>
  );
}
