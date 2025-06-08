// src/pages/api/location.json.js

// This is the public URL where your Nginx server is serving the location file.
// Replace the IP address with your server's Public IPv4 address.
const DATA_SOURCE_URL = 'http://56.228.30.107/latest_location.json';

export async function GET({ params, request }) {
  try {
    const response = await fetch(DATA_SOURCE_URL, {
      // Use 'no-cache' to ensure we always get the freshest data
      cache: 'no-cache', 
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const locationData = await response.json();

    return new Response(JSON.stringify(locationData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Set cache headers to prevent browsers and CDNs from storing the response
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Failed to fetch location data from source:", error);
    // Return a server error response if we can't fetch the data
    return new Response(JSON.stringify({ error: "Could not fetch location data." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}