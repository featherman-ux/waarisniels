// src/components/LiveMap.jsx
import { h } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';

// We only want to import Leaflet on the client-side, not on the server
let L;
if (typeof window !== 'undefined') {
  L = await import('leaflet');
  await import('leaflet/dist/leaflet.css');
}

// Default icon fix for modern bundlers
if (L) {
    // This is a common fix to make sure Leaflet's default marker icons work correctly.
    // You'll need to add the marker icon files to your `public/images/` directory.
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
    
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState('');

    const fetchAndUpdateMap = async () => {
        try {
            const res = await fetch('/api/location.json');
            if (!res.ok) {
                throw new Error(`Failed to fetch location: ${res.statusText}`);
            }
            const data = await res.json();

            // Ensure we have Leaflet and the container div ready
            if (L && mapContainer.current) {
                // If the map hasn't been created yet, create it
                if (!mapInstance.current) {
                    mapInstance.current = L.map(mapContainer.current).setView([data.lat, data.lon], 13);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }).addTo(mapInstance.current);
                    markerInstance.current = L.marker([data.lat, data.lon]).addTo(mapInstance.current);
                } else {
                    // If the map already exists, just move the view and marker
                    mapInstance.current.setView([data.lat, data.lon]);
                    markerInstance.current.setLatLng([data.lat, data.lon]);
                }
            }
            // Update the timestamp and clear any previous errors
            setLastUpdated(new Date(data.tst * 1000).toLocaleString());
            setError(null);

        } catch (err) {
            console.error(err);
            setError('Could not retrieve latest location. The tracker might be offline.');
        }
    };

    // This effect runs once when the component is first rendered
    useEffect(() => {
        // Fetch the location immediately on load
        fetchAndUpdateMap();

        // Then, set up an interval to fetch the location every 30 seconds
        const intervalId = setInterval(fetchAndUpdateMap, 30000);

        // This is a cleanup function that runs when the component is removed
        return () => clearInterval(intervalId);
    }, []);

    return (
        <div>
            {/* The ref tells Preact where to mount the map */}
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