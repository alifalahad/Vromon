import { Link, useLocation } from 'react-router-dom';
import { MapPin, Compass, BookOpen, Plane } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Home', icon: Compass },
    { to: '/plan', label: 'Plan Trip', icon: Plane },
    { to: '/trips', label: 'My Trips', icon: BookOpen },
  ];

  return (
    <nav
      className="sticky top-0 z-50 glass"
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #2dd4bf)' }}
            >
              <MapPin size={16} className="text-white" />
            </div>
            <span
              className="text-xl font-bold gradient-text"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Vromon
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full ml-1"
              style={{
                background: 'rgba(14, 165, 233, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(14, 165, 233, 0.3)',
              }}
            >
              Demo
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {links.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to ||
                (to !== '/' && location.pathname.startsWith(to));
              return (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    color: isActive ? '#38bdf8' : '#94a3b8',
                    background: isActive ? 'rgba(14, 165, 233, 0.12)' : 'transparent',
                  }}
                >
                  <Icon size={16} />
                  <span className="hidden sm:block">{label}</span>
                </Link>
              );
            })}

            <Link
              to="/plan"
              className="ml-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, #0ea5e9, #2dd4bf)',
              }}
            >
              <Plane size={15} />
              <span className="hidden sm:block">Start Planning</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
