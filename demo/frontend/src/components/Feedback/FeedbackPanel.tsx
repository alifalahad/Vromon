import { useState } from 'react';
import { Star, MessageSquare, CheckCircle2, Send } from 'lucide-react';
import { tripsApi } from '../../services/api';

const FEEDBACK_TAGS = [
  'Too many activities',
  'Too much travel',
  'Too expensive',
  'Not enough nature',
  'Not enough food',
  'Loved it!',
  'Other',
];

interface FeedbackPanelProps {
  tripId: number;
  onFeedbackSubmitted?: () => void;
}

export default function FeedbackPanel({ tripId, onFeedbackSubmitted }: FeedbackPanelProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const submit = async () => {
    if (rating === 0) return;
    setLoading(true);
    try {
      await tripsApi.submitFeedback(tripId, { rating, tags, comment });
      setSubmitted(true);
      onFeedbackSubmitted?.();
    } catch {
      // swallow — non-critical
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-2xl p-6 text-center"
        style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
        <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: '#4ade80' }} />
        <h3 className="font-bold text-lg mb-1">Thanks for your feedback!</h3>
        <p className="text-sm" style={{ color: '#64748b' }}>
          Your feedback helps improve the planning algorithm.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5"
      style={{ background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <MessageSquare size={18} style={{ color: '#818cf8' }} />
        How useful was this itinerary?
      </h3>

      {/* Star rating */}
      <div className="flex items-center gap-2 mb-5">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s}
            onMouseEnter={() => setHoverRating(s)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(s)}
            className="transition-all duration-100 hover:scale-110"
          >
            <Star
              size={28}
              style={{
                color: s <= (hoverRating || rating) ? '#facc15' : '#334155',
                fill: s <= (hoverRating || rating) ? '#facc15' : 'transparent',
                transition: 'all 0.1s',
              }}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="text-sm ml-2" style={{ color: '#64748b' }}>
            {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
          </span>
        )}
      </div>

      {/* Tags */}
      <div className="mb-4">
        <p className="text-sm mb-3" style={{ color: '#64748b' }}>What should we improve? (optional)</p>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_TAGS.map(t => (
            <button
              key={t}
              onClick={() => toggleTag(t)}
              className="text-xs px-3 py-1.5 rounded-full transition-all duration-200"
              style={
                tags.includes(t)
                  ? { background: 'rgba(129,140,248,0.2)', border: '1px solid #818cf8', color: '#a5b4fc' }
                  : { background: '#1e293b', border: '1px solid #334155', color: '#64748b' }
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <textarea
        placeholder="Any additional comments..."
        value={comment}
        onChange={e => setComment(e.target.value)}
        rows={2}
        className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none mb-4"
        style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
      />

      <button
        onClick={submit}
        disabled={rating === 0 || loading}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg,#818cf8,#a78bfa)' }}
      >
        <Send size={14} />
        {loading ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  );
}
