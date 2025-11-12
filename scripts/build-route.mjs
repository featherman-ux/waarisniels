#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const placesPath = path.join(projectRoot, 'public', 'data', 'places.json');
const legsPath = path.join(projectRoot, 'travel_legs.json');
const outputPath = path.join(projectRoot, 'public', 'data', 'route.geojson');

const fetchImpl = globalThis.fetch ?? (await import('node-fetch')).default;

const ROAD_MODES = new Set(['bus', 'car', 'motor']);
const SYMBOLS = {
  bus: '➜',
  car: '➜',
  motor: '➜',
  flight: '✈',
  boat: '⇢',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function buildLineString(coords) {
  return coords.map(([lon, lat]) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
}

async function fetchRoadPolyline(start, end, { retries = 3 } = {}) {
  const coordStr = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordStr}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');

  try {
    const res = await fetchImpl(url, {
      headers: {
        'User-Agent': 'route-builder/1.0 (+https://your-travel-blog.local)',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = await res.json();
    if (body.code !== 'Ok' || !body.routes?.[0]) {
      throw new Error(body.message || 'OSRM error');
    }
    return buildLineString(body.routes[0].geometry.coordinates);
  } catch (error) {
    if (retries > 0) {
      await delay(500);
      return fetchRoadPolyline(start, end, { retries: retries - 1 });
    }
    console.warn(`[route-builder] Fallback to straight line for ${start.name} -> ${end.name}: ${error.message}`);
    return buildLineString([
      [start.lon, start.lat],
      [end.lon, end.lat],
    ]);
  }
}

async function main() {
  const [places, legs] = await Promise.all([loadJson(placesPath), loadJson(legsPath)]);
  const placeMap = new Map(places.map((p) => [p.name, p]));

  const features = [];

  for (const [index, leg] of legs.entries()) {
    const from = placeMap.get(leg.from);
    const to = placeMap.get(leg.to);
    if (!from || !to) {
      const missing = !from ? leg.from : leg.to;
      throw new Error(`Unknown place "${missing}" referenced in travel_legs.json`);
    }

    const mode = leg.mode;
    const symbol = SYMBOLS[mode] ?? '➜';

    let coordinates;
    if (ROAD_MODES.has(mode)) {
      coordinates = await fetchRoadPolyline(from, to);
      await delay(200); // be a bit nicer to the OSRM demo server
    } else {
      coordinates = buildLineString([
        [from.lon, from.lat],
        [to.lon, to.lat],
      ]);
    }

    features.push({
      type: 'Feature',
      properties: {
        name: `${leg.from} ${symbol} ${leg.to}`,
        mode,
        order: index + 1,
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    });
  }

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  await writeFile(outputPath, JSON.stringify(geojson, null, 2) + '\n', 'utf8');
  console.log(`[route-builder] Generated ${features.length} legs to ${path.relative(projectRoot, outputPath)}`);
}

main().catch((err) => {
  console.error('[route-builder] Failed:', err);
  process.exitCode = 1;
});
