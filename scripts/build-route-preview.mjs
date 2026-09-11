// Genereert een sterk vereenvoudigde, voorgeprojecteerde versie van de route voor
// de mini-kaart op de homepage. Die kaart is een plaatje achter een link, geen
// interactieve kaart — daar hoeft geen Leaflet (en geen 261KB geojson) voor te
// laden. Output: src/data/route-preview.json, een paar kilobyte.
//
// Draaien na een wijziging in public/data/route.geojson of places.json:
//   node scripts/build-route-preview.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const W = 600;           // interne tekenbreedte; de SVG schaalt zelf mee
const PAD = 14;          // marge zodat stippen aan de rand niet half wegvallen
const MIN_STEP = 0.7;    // punten dichter dan dit op elkaar voegen niets toe

const route = JSON.parse(readFileSync('public/data/route.geojson', 'utf8'));
const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'));

// Web Mercator, genormaliseerd naar 0..1
const project = ([lon, lat]) => {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return {
    x: (lon + 180) / 360,
    y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2,
  };
};

const lines = route.features
  .filter((f) => f.geometry?.type === 'LineString')
  .map((f) => ({ mode: f.properties?.mode ?? 'bus', pts: f.geometry.coordinates.map(project) }));

const dots = places
  .filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
  .map((p) => project([p.lon, p.lat]));

// Gezamenlijke bounding box van route + stops
const all = [...lines.flatMap((l) => l.pts), ...dots];
const minX = Math.min(...all.map((p) => p.x));
const maxX = Math.max(...all.map((p) => p.x));
const minY = Math.min(...all.map((p) => p.y));
const maxY = Math.max(...all.map((p) => p.y));

const scale = (W - PAD * 2) / (maxX - minX);
const H = Math.round((maxY - minY) * scale + PAD * 2);
const toPx = (p) => ({
  x: +((p.x - minX) * scale + PAD).toFixed(1),
  y: +((p.y - minY) * scale + PAD).toFixed(1),
});

// Punten die na projectie toch vrijwel samenvallen weglaten
const thin = (pts) => {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= MIN_STEP) out.push(p);
  }
  if (out.length === 1 && pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
};

// Eén pad per vervoerswijze, zodat het streeppatroon per modus kan blijven
const byMode = {};
for (const line of lines) {
  const pts = thin(line.pts.map(toPx));
  if (pts.length < 2) continue;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
  byMode[line.mode] = (byMode[line.mode] ?? '') + d;
}

const out = {
  width: W,
  height: H,
  paths: byMode,
  dots: dots.map(toPx),
};

writeFileSync('src/data/route-preview.json', JSON.stringify(out));
const kb = (JSON.stringify(out).length / 1024).toFixed(1);
const punten = Object.values(byMode).join('').split('L').length;
console.log(`route-preview.json: ${kb} KB — ${Object.keys(byMode).length} modi, ~${punten} punten, ${out.dots.length} stops, ${W}x${H}`);
