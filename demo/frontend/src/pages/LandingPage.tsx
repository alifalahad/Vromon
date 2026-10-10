import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Map, Clock, DollarSign, Brain, RefreshCw,
  ArrowRight, Star, CheckCircle2, ChevronRight, Waves,
  Camera, Utensils, Mountain
} from 'lucide-react';

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Personalized Planning',
    desc: 'Your interests, budget, and travel style shape every recommendation.',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.1)',
  },
  {
    icon: Brain,
    title: 'Smart Recommendations',
    desc: 'Weighted scoring engine matches places to your exact preferences with transparent reasoning.',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.1)',
  },
  {
    icon: DollarSign,
    title: 'Budget Awareness',
    desc: 'Real-time cost tracking ensures your itinerary stays within budget.',
    color: '#4ade80',
    bg: 'rgba(74, 222, 128, 0.1)',
  },
  {
    icon: Clock,
    title: 'Time-Aware Itineraries',
    desc: 'Scheduling respects opening hours, travel time, and your preferred start/end times.',
    color: '#facc15',
    bg: 'rgba(250, 204, 21, 0.1)',
  },
  {
    icon: Map,
    title: 'Interactive Maps',
    desc: 'Visualize your route on an interactive map with markers for every stop.',
    color: '#f472b6',
    bg: 'rgba(244, 114, 182, 0.1)',
  },
  {
    icon: RefreshCw,
    title: 'Adaptive Planning',
    desc: 'Modify, regenerate, and adapt your itinerary with a single click based on feedback.',
    color: '#2dd4bf',
    bg: 'rgba(45, 212, 191, 0.1)',
  },
];

const HOW_IT_WORKS = [
  { step: 1, label: 'Set your preferences', desc: 'Destination, dates, budget, interests' },
  { step: 2, label: 'Recommend places', desc: 'Weighted scoring finds the best matches' },
  { step: 3, label: 'Build schedule', desc: 'Heuristic planner respects all constraints' },
  { step: 4, label: 'Review & adapt', desc: 'Edit, regenerate, and save your perfect trip' },
];

const DEMO_TAGS = ['Beach', 'Nature', 'Food', 'Photography', 'Culture'];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 py-20">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
            style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-15"
            style={{ background: 'radial-gradient(circle, #2dd4bf, transparent)' }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl opacity-5"
            style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }}
          />
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 text-sm font-medium"
            style={{
              background: 'rgba(14, 165, 233, 0.12)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              color: '#38bdf8',
            }}>
            <span className="notification-dot" />
            Research Demo — Cox's Bazar, Bangladesh
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold leading-tight mb-6"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Plan trips that{' '}
            <span className="gradient-text">fit YOU</span>
          </h1>

          <p className="text-xl sm:text-2xl mb-4" style={{ color: '#94a3b8' }}>
            Your preferences. Your budget. Your time.
          </p>
          <p className="text-lg mb-10 max-w-2xl mx-auto" style={{ color: '#64748b' }}>
            Your <span style={{ color: '#38bdf8' }}>perfect itinerary</span>.
          </p>

          {/* Tags */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {DEMO_TAGS.map(tag => (
              <span key={tag}
                className="px-3 py-1 rounded-full text-sm"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#94a3b8',
                }}>
                {tag}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/plan')}
              className="group flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-lg font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #0ea5e9, #2dd4bf)',
                boxShadow: '0 0 40px rgba(14, 165, 233, 0.3)',
              }}
            >
              Plan My Trip
              <ArrowRight size={20} className="transition-transform duration-200 group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => navigate('/trips')}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-lg font-semibold transition-all duration-200 hover:bg-white/5"
              style={{
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#e2e8f0',
              }}
            >
              View Demo Trips
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-md mx-auto">
            {[
              { val: '25+', label: 'Places' },
              { val: '10', label: 'Restaurants' },
              { val: '8', label: 'Hotels' },
            ].map(({ val, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-bold gradient-text">{val}</div>
                <div className="text-sm mt-1" style={{ color: '#64748b' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About the research ───────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl p-8 sm:p-12 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(45,212,191,0.08))',
              border: '1px solid rgba(14, 165, 233, 0.2)',
            }}>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(14, 165, 233, 0.15)' }}>
                <Brain size={32} style={{ color: '#38bdf8' }} />
              </div>
            </div>
            <h2 className="text-3xl font-bold mb-4">From preferences to a practical itinerary</h2>
            <p className="text-lg mb-6" style={{ color: '#94a3b8' }}>
              Our system combines personalized recommendations, travel constraints, and intelligent planning
              to create a trip designed around your needs.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
              style={{
                background: 'rgba(250, 204, 21, 0.1)',
                border: '1px solid rgba(250, 204, 21, 0.3)',
                color: '#facc15',
              }}>
              <Star size={14} />
              Currently: Rule-based recommendation + Heuristic scheduling
              · Future: RAG + Constraint Optimization
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything you need</h2>
            <p className="text-lg" style={{ color: '#64748b' }}>
              A complete travel planning experience, built for the research demo.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
              <div
                key={title}
                className="rounded-2xl p-6 card-hover"
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: bg }}>
                  <Icon size={24} style={{ color }} />
                </div>
                <h3 className="text-lg font-semibold mb-2">{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How it works</h2>
            <p style={{ color: '#64748b' }}>The intelligent planning pipeline — transparent by design.</p>
          </div>
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute top-8 left-8 right-8 h-0.5 hidden sm:block"
              style={{ background: 'linear-gradient(to right, #0ea5e9, #2dd4bf, #818cf8, #f472b6)' }} />
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
              {HOW_IT_WORKS.map(({ step, label, desc }) => (
                <div key={step} className="relative text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-4 relative z-10"
                    style={{
                      background: 'linear-gradient(135deg, #0ea5e9, #2dd4bf)',
                      color: 'white',
                    }}>
                    {step}
                  </div>
                  <h3 className="font-semibold mb-2">{label}</h3>
                  <p className="text-sm" style={{ color: '#64748b' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Demo Destination ─────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">
              Demo Destination: <span className="gradient-text">Cox's Bazar</span>
            </h2>
            <p style={{ color: '#64748b' }}>
              The world's longest natural sea beach — 120 km of golden sand along the Bay of Bengal.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Waves, label: 'Laboni Beach', sub: 'Main city beach', color: '#38bdf8' },
              { icon: Mountain, label: 'Himchari Park', sub: 'National park + waterfall', color: '#4ade80' },
              { icon: Camera, label: 'Inani Beach', sub: 'Coral stone formations', color: '#f472b6' },
              { icon: Utensils, label: 'Mermaid Café', sub: 'Fresh seafood & BBQ', color: '#facc15' },
            ].map(({ icon: Icon, label, sub, color }) => (
              <div key={label}
                className="rounded-2xl p-5 card-hover flex items-center gap-4"
                style={{
                  background: 'rgba(30,41,59,0.5)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}22` }}>
                  <Icon size={22} style={{ color }} />
                </div>
                <div>
                  <div className="font-semibold text-sm">{label}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Explainability callout ────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-3xl p-8 sm:p-12"
            style={{
              background: 'rgba(30,41,59,0.6)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
            <h2 className="text-2xl font-bold mb-6 text-center">Transparent Recommendations</h2>
            <p className="text-center mb-8" style={{ color: '#64748b' }}>
              For every recommended place, you'll see <em>exactly why</em> it was chosen.
            </p>
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}>
              <div className="text-sm font-semibold mb-3" style={{ color: '#38bdf8' }}>
                Why we recommend Inani Beach:
              </div>
              <div className="space-y-2">
                {[
                  '85% preference match',
                  'Matches your interest in Beach & Photography',
                  'Fits relaxed travel style',
                  'Low crowd level (matches your preference)',
                  'Excellent rating (4.8★)',
                ].map(r => (
                  <div key={r} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 size={14} style={{ color: '#4ade80' }} />
                    <span style={{ color: '#94a3b8' }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to plan your perfect trip?
          </h2>
          <p className="text-lg mb-10" style={{ color: '#64748b' }}>
            Start with Cox's Bazar. 3 days. ৳15,000. Nature + Beach + Food.
          </p>
          <button
            onClick={() => navigate('/plan')}
            className="group flex items-center justify-center gap-3 px-10 py-5 rounded-2xl text-xl font-bold text-white mx-auto transition-all duration-300 hover:scale-105 hover:shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9, #2dd4bf)',
              boxShadow: '0 0 60px rgba(14, 165, 233, 0.25)',
            }}
          >
            Plan My Trip
            <ArrowRight size={22} className="transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', color: '#475569' }}>
        <p className="text-sm">
          Vromon — Intelligent Adaptive Travel Itinerary Planning Demo ·{' '}
          <span style={{ color: '#38bdf8' }}>Research Project</span> ·{' '}
          Sample data, heuristic engine, Cox's Bazar focus
        </p>
      </footer>
    </div>
  );
}
