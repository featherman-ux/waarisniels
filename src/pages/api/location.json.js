
// src/pages/api/location.json.js - ROBUST VERSION
const DATA_SOURCE_URL = 'http://56.228.30.107/location_history.json';

export async function GET() {
  try {
    const response = await fetch(DATA_SOURCE_URL, { cache: 'no-cache' });

    // If the file is not found, return an empty array instead of an error
    if (response.status === 404) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // If the response is anything else but not okay, throw an error
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const locationData = await response.json();
    return new Response(JSON.stringify(locationData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (error) {
    console.error("Failed to fetch location data from source:", error);
    // If there's any other error, return an empty array to be safe
    return new Response(JSON.stringify([]), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}