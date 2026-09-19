import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import PlanTripPage from './pages/PlanTripPage';
import ItineraryPage from './pages/ItineraryPage';
import SavedTripsPage from './pages/SavedTripsPage';
import Navbar from './components/layout/Navbar';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen" style={{ background: '#0f172a' }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/plan" element={<PlanTripPage />} />
          <Route path="/trip/:id" element={<ItineraryPage />} />
          <Route path="/trips" element={<SavedTripsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
