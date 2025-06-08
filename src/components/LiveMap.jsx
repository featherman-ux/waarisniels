// src/components/LiveMap.jsx - HISTORY TRACKING VERSION
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
    const polylineInstance = useRef(null); // To hold the history line

    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState('');

    const fetchAndUpdateMap = async () => {
        try {
            const res = await fetch('/api/location.json');
            if (!res.ok) throw new Error(`Failed to fetch location: ${res.statusText}`);

            const history = await res.json();
            if (!Array.isArray(history) || history.length === 0) {
                throw new Error("No location history found.");
            }

            // The last point in the array is the most recent one
            const lastPoint = history[history.length - 1];
            const latLngs = history.map(p => [p.lat, p.lon]); // Create array of coordinates for the line

            if (L && mapContainer.current) {
                if (!mapInstance.current) {
                    // Create map, centering on the latest point
                    mapInstance.current = L.map(mapContainer.current).setView([lastPoint.lat, lastPoint.lon], 13);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    }).addTo(mapInstance.current);

                    // Create the line and the marker
                    polylineInstance.current = L.polyline(latLngs, { color: 'blue' }).addTo(mapInstance.current);
                    markerInstance.current = L.marker([lastPoint.lat, lastPoint.lon]).addTo(mapInstance.current);

                    // Zoom the map to fit the entire track
                    mapInstance.current.fitBounds(polylineInstance.current.getBounds());
                } else {
                    // If map exists, just update the data for the line and marker
                    polylineInstance.current.setLatLngs(latLngs);
                    markerInstance.current.setLatLng([lastPoint.lat, lastPoint.lon]);
                    mapInstance.current.setView([lastPoint.lat, lastPoint.lon]); // Center on new point
                }
            }

            setLastUpdated(new Date(lastPoint.tst * 1000).toLocaleString());
            setError(null);

        } catch (err) {
            console.error(err);
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