import { useEffect, useRef, useMemo, Component, type ReactNode } from 'react';
import L from 'leaflet';
import type { Place, Hotel, ItineraryDay } from '../../types';

// Fix Leaflet default icon issue with Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const DAY_COLORS = ['#38bdf8', '#4ade80', '#f472b6', '#facc15', '#a78bfa', '#fb923c'];

// ---------------------------------------------------------------------------
// Error boundary so a map crash doesn't take down the whole page
// ---------------------------------------------------------------------------
class MapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(30,41,59,0.7)',
            borderRadius: 12,
            color: '#64748b',
            fontSize: 14,
          }}
        >
          Map could not be loaded.
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Vanilla Leaflet map component — avoids react-leaflet's React 19 issues
// ---------------------------------------------------------------------------
interface TripMapProps {
  days: ItineraryDay[];
  hotel?: Hotel | null;
  selectedDay?: number | null;
  height?: string;
}

function TripMapInner({ days, hotel, selectedDay, height = '400px' }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const activeDays = selectedDay != null
    ? days.filter(d => d.day_number === selectedDay)
    : days;

  // Collect all places to show
  const allPlaces: Place[] = [];
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
    return { pts, color: DAY_COLORS[di % DAY_COLORS.length] };
  });

  const center: [number, number] = hotel
    ? [hotel.latitude, hotel.longitude]
    : allPlaces.length > 0
    ? [allPlaces[0].latitude, allPlaces[0].longitude]
    : [21.43, 92.01];

  // Stable key for knowing when to rebuild markers/routes
  const dataKey = useMemo(
    () => `${selectedDay ?? 'all'}-${days.map(d => d.id).join(',')}`,
    [selectedDay, days]
  );

  // Initialize the Leaflet map once
  useEffect(() => {
    if (!containerRef.current) return;

    // If there's already a map, remove it first
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      center,
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;

    // Invalidate size after container is visible
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Update markers and polylines when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear all existing layers except the tile layer
    map.eachLayer(layer => {
      if (!(layer instanceof L.TileLayer)) {
        map.removeLayer(layer);
      }
    });

    // Add hotel marker
    if (hotel) {
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

      L.marker([hotel.latitude, hotel.longitude], { icon: hotelIcon })
        .bindPopup(`
          <div style="font-family:Inter,sans-serif;min-width:180px">
            <div style="font-weight:700;margin-bottom:4px">🏨 ${hotel.name}</div>
            <div style="font-size:12px;color:#94a3b8">${hotel.category} · ৳${hotel.price_per_night}/night</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:2px">⭐ ${hotel.rating}</div>
          </div>
        `)
        .addTo(map);
    }

    // Add route polylines
    routes.forEach(({ pts, color }) => {
      if (pts.length > 1) {
        L.polyline(pts, {
          color,
          weight: 3,
          opacity: 0.7,
          dashArray: '8, 4',
        }).addTo(map);
      }
    });

    // Add place markers
    const boundsPoints: [number, number][] = [];

    activeDays.forEach((day, di) => {
      const dayColor = DAY_COLORS[di % DAY_COLORS.length];

      day.items
        .filter(i => i.place)
        .forEach(item => {
          const place = item.place!;
          boundsPoints.push([place.latitude, place.longitude]);

          const icon = L.divIcon({
            className: '',
            html: `
              <div style="
                width:18px; height:18px;
                border-radius:50%;
                background:${dayColor};
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              "></div>
            `,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });

          const costHtml = place.estimated_cost > 0
            ? `<span>৳${place.estimated_cost}</span>`
            : '';

          const descHtml = place.description
            ? `<div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.4">${place.description.slice(0, 100)}...</div>`
            : '';

          L.marker([place.latitude, place.longitude], { icon })
            .bindPopup(`
              <div style="font-family:Inter,sans-serif;min-width:200px">
                <div style="font-weight:700;font-size:14px;margin-bottom:6px">Day ${day.day_number} · ${item.start_time}</div>
                <div style="font-weight:600;font-size:15px;margin-bottom:4px">${place.name}</div>
                <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">${place.category}</div>
                <div style="display:flex;gap:12px;font-size:12px">
                  <span>⭐ ${place.rating}</span>
                  <span>⏱ ${item.duration_minutes}min</span>
                  ${costHtml}
                </div>
                ${descHtml}
              </div>
            `)
            .addTo(map);
        });
    });

    // Fit bounds to show all markers
    if (boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    } else {
      map.setView(center, 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, hotel]);

  return (
    <div
      ref={containerRef}
      style={{ height, borderRadius: '12px', overflow: 'hidden' }}
    />
  );
}

export default function TripMap(props: TripMapProps) {
  return (
    <MapErrorBoundary>
      <TripMapInner {...props} />
    </MapErrorBoundary>
  );
}
