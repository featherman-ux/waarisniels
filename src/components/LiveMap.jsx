// src/components/LiveMap.jsx

import { h } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';

let L;
if (typeof window !== 'undefined') {
  L = await import('leaflet');
  await import('leaflet/dist/leaflet.css');
}

if (L) {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/images/marker-icon-2x.png',
    iconUrl: '/images/marker-icon.png',
    shadowUrl: '/images/marker-shadow.png',
  });
}

export default function LiveMap() {
  const mapContainer = useRef(null);
  const mapInstance = useRef(null);
  const markerInstance = useRef(null);
  const polylineInstance = useRef(null);

  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');

  const fetchAndUpdateMap = async () => {
    try {
      const res = await fetch('https://map.waarisniels.nl/location_history.json');

      console.log("Fetching from: https://map.waarisniels.nl/location_history.json");
      console.log("Response status:", res.status);

      if (!res.ok) throw new Error(`Failed to fetch location: ${res.statusText}`);

      const history = await res.json();
      console.log("Fetched location history:", history);

      if (!Array.isArray(history) || history.length === 0) {
        throw new Error("No location history found.");
      }

      const lastPoint = history[history.length - 1];
      const latLngs = history.map(p => [p.lat, p.lon]);

      if (L && mapContainer.current) {
        if (!mapInstance.current) {
          mapInstance.current = L.map(mapContainer.current).setView([lastPoint.lat, lastPoint.lon], 13);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          }).addTo(mapInstance.current);

          polylineInstance.current = L.polyline(latLngs, { color: 'blue' }).addTo(mapInstance.current);
          markerInstance.current = L.marker([lastPoint.lat, lastPoint.lon]).addTo(mapInstance.current);

          if (latLngs.length > 1) {
            mapInstance.current.fitBounds(polylineInstance.current.getBounds());
          } else {
            mapInstance.current.setView([lastPoint.lat, lastPoint.lon], 13);
          }
        } else {
          polylineInstance.current.setLatLngs(latLngs);
          markerInstance.current.setLatLng([lastPoint.lat, lastPoint.lon]);
          mapInstance.current.panTo([lastPoint.lat, lastPoint.lon]);
        }
      }

      setLastUpdated(new Date(lastPoint.tst * 1000).toLocaleString());
      setError(null);
    } catch (err) {
      console.error("Map fetch error:", err);
      setError('Could not retrieve location history. The tracker might be offline.');
    }
  };

  useEffect(() => {
    fetchAndUpdateMap();
    const intervalId = setInterval(fetchAndUpdateMap, 30000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div>
      <div ref={mapContainer} style={{ height: '600px', width: '100%', borderRadius: '8px' }} />
      {error && <p class="text-center text-red-500 mt-2">{error}</p>}
      {lastUpdated && !error && (
        <p class="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">
          Last Updated: {lastUpdated}
        </p>
      )}
    </div>
  );
}