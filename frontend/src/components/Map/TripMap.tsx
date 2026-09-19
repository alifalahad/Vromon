import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Place, Hotel, ItineraryDay } from '../../types';

// Fix Leaflet default icon issue with Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom colored markers
const createIcon = (color: string, size: number = 10) =>
  L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size + 8}px; height:${size + 8}px;
        border-radius:50%;
        background:${color};
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
      "></div>
    `,
    iconSize: [size + 8, size + 8],
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
  });

const hotelIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width:32px; height:32px; border-radius:8px;
      background: linear-gradient(135deg,#818cf8,#a78bfa);
      border: 2px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:16px;
    ">🏨</div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function AutoFitBounds({ places }: { places: Place[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length > 0) {
      const bounds = L.latLngBounds(places.map(p => [p.latitude, p.longitude]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [places, map]);
  return null;
}

interface TripMapProps {
  days: ItineraryDay[];
  hotel?: Hotel | null;
  selectedDay?: number | null;
  height?: string;
}

export default function TripMap({ days, hotel, selectedDay, height = '400px' }: TripMapProps) {
  const activeDays = selectedDay != null
    ? days.filter(d => d.day_number === selectedDay)
    : days;

  // Collect all places to show
  const allPlaces: Place[] = [];
  const dayColors = ['#38bdf8', '#4ade80', '#f472b6', '#facc15', '#a78bfa', '#fb923c'];

  activeDays.forEach(day => {
    day.items.forEach(item => {
      if (item.place) allPlaces.push(item.place);
    });
  });

  // Route polylines per day
  const routes = activeDays.map((day, di) => {
    const pts = day.items
      .filter(i => i.place)
      .map(i => [i.place!.latitude, i.place!.longitude] as [number, number]);
    return { pts, color: dayColors[di % dayColors.length] };
  });

  const center: [number, number] = hotel
    ? [hotel.latitude, hotel.longitude]
    : allPlaces.length > 0
    ? [allPlaces[0].latitude, allPlaces[0].longitude]
    : [21.43, 92.01];

  return (
    <div style={{ height, borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Route polylines */}
        {routes.map(({ pts, color }, i) =>
          pts.length > 1 ? (
            <Polyline
              key={i}
              positions={pts}
              pathOptions={{ color, weight: 3, opacity: 0.7, dashArray: '8, 4' }}
            />
          ) : null
        )}

        {/* Hotel marker */}
        {hotel && (
          <Marker position={[hotel.latitude, hotel.longitude]} icon={hotelIcon}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '180px' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>🏨 {hotel.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{hotel.category} · ৳{hotel.price_per_night}/night</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: 2 }}>⭐ {hotel.rating}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Place markers */}
        {activeDays.map((day, di) =>
          day.items
            .filter(i => i.place)
            .map((item) => (
              <Marker
                key={`${day.id}-${item.id}`}
                position={[item.place!.latitude, item.place!.longitude]}
                icon={createIcon(dayColors[di % dayColors.length])}
              >
                <Popup>
                  <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '200px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: 6 }}>
                      Day {day.day_number} · {item.start_time}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: 4 }}>
                      {item.place!.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 4 }}>
                      {item.place!.category}
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: '12px' }}>
                      <span>⭐ {item.place!.rating}</span>
                      <span>⏱ {item.duration_minutes}min</span>
                      {item.place!.estimated_cost > 0 && (
                        <span>৳{item.place!.estimated_cost}</span>
                      )}
                    </div>
                    {item.place!.description && (
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                        {item.place!.description.slice(0, 100)}...
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))
        )}

        {allPlaces.length > 0 && <AutoFitBounds places={allPlaces} />}
      </MapContainer>
    </div>
  );
}
