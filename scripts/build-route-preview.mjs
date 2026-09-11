// Genereert een sterk vereenvoudigde, voorgeprojecteerde versie van de kaart voor
// het blok op de homepage. Dat is een plaatje achter een link, geen interactieve
// kaart — daar hoeft geen Leaflet (en geen 261KB geojson) voor te laden.
//
// Output: src/data/route-preview.json — landcontouren + route + stops, samen een
// paar tientallen kilobytes, klaar om als inline SVG uitgetekend te worden.
//
// Draaien na een wijziging in public/data/route.geojson of places.json:
//   node scripts/build-route-preview.mjs
//
// De landcontouren komen van Natural Earth (110m) via world-atlas. Die data is
// publiek domein. Het bestand wordt bij het draaien opgehaald en niet bewaard;
// alleen het bewerkte resultaat gaat de repo in.

import { readFileSync, writeFileSync } from 'node:fs';

const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const W = 600;            // interne tekenbreedte; de SVG schaalt zelf mee
const PAD = 16;           // marge zodat stippen aan de rand niet half wegvallen
const MIN_STEP_ROUTE = 0.7;
const MIN_STEP_LAND = 1.2; // contouren mogen grover dan de route zelf
const LAND_MARGIN = 0.55;  // hoeveel land er buiten de route in beeld komt (fractie)

// --- projectie ------------------------------------------------------------
// Web Mercator, genormaliseerd naar 0..1
const project = ([lon, lat]) => {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return {
    x: (lon + 180) / 360,
    y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2,
  };
};

// --- topojson uitpakken ---------------------------------------------------
// Arcs zijn delta-gecodeerde gehele getallen; een negatieve index betekent
// "deze arc achterstevoren" (~i, oftewel -i-1).
function decodeArcs(topology) {
  const { scale: [sx, sy], translate: [tx, ty] } = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

function ringFromArcs(arcIndexes, arcs) {
  const out = [];
  for (const idx of arcIndexes) {
    const reversed = idx < 0;
    const arc = arcs[reversed ? ~idx : idx];
    const pts = reversed ? [...arc].reverse() : arc;
    // Eindpunt van de vorige arc is beginpunt van de volgende: niet dubbel opnemen
    for (let i = out.length ? 1 : 0; i < pts.length; i += 1) out.push(pts[i]);
  }
  return out;
}

function polygonsOf(geometry, arcs) {
  if (geometry.type === 'Polygon') return [geometry.arcs.map((r) => ringFromArcs(r, arcs))];
  if (geometry.type === 'MultiPolygon') {
    return geometry.arcs.map((poly) => poly.map((r) => ringFromArcs(r, arcs)));
  }
  return [];
}

// --- route en stops -------------------------------------------------------
const route = JSON.parse(readFileSync('public/data/route.geojson', 'utf8'));
const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'));

const lines = route.features
  .filter((f) => f.geometry?.type === 'LineString')
  .map((f) => ({ mode: f.properties?.mode ?? 'bus', pts: f.geometry.coordinates.map(project) }));

const dots = places
  .filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
  .map((p) => project([p.lon, p.lat]));

// Kader: de route bepaalt de uitsnede, met wat lucht eromheen zodat er ook land
// naast de route in beeld staat. Zonder die marge zweeft de lijn in het niets.
const routePts = [...lines.flatMap((l) => l.pts), ...dots];
const rx0 = Math.min(...routePts.map((p) => p.x));
const rx1 = Math.max(...routePts.map((p) => p.x));
const ry0 = Math.min(...routePts.map((p) => p.y));
const ry1 = Math.max(...routePts.map((p) => p.y));
const mx = (rx1 - rx0) * LAND_MARGIN;
const my = (ry1 - ry0) * LAND_MARGIN;
const minX = rx0 - mx;
const maxX = rx1 + mx;
const minY = ry0 - my;
const maxY = ry1 + my;

const scale = (W - PAD * 2) / (maxX - minX);
const H = Math.round((maxY - minY) * scale + PAD * 2);
const toPx = (p) => ({
  x: +((p.x - minX) * scale + PAD).toFixed(1),
  y: +((p.y - minY) * scale + PAD).toFixed(1),
});

const thin = (pts, minStep) => {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minStep) out.push(p);
  }
  if (out.length === 1 && pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
};

// --- landcontouren --------------------------------------------------------
const res = await fetch(WORLD_URL);
if (!res.ok) throw new Error(`Kon wereldkaart niet ophalen: HTTP ${res.status}`);
const topo = await res.json();
const arcs = decodeArcs(topo);
const countries = topo.objects.countries.geometries;

// Alles wat het kader niet raakt kan weg — dat scheelt het leeuwendeel.
const VIEW = { x0: minX, x1: maxX, y0: minY, y1: maxY };
const landPaths = [];

for (const geom of countries) {
  for (const poly of polygonsOf(geom, arcs)) {
    for (const ring of poly) {
      const projected = ring.map(project);
      const inView = projected.some(
        (p) => p.x >= VIEW.x0 && p.x <= VIEW.x1 && p.y >= VIEW.y0 && p.y <= VIEW.y1
      );
      if (!inView) continue;
      const pts = thin(projected.map(toPx), MIN_STEP_LAND);
      if (pts.length < 3) continue;
      landPaths.push(`${pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('')}Z`);
    }
  }
}

// --- route naar paden -----------------------------------------------------
const byMode = {};
for (const line of lines) {
  const pts = thin(line.pts.map(toPx), MIN_STEP_ROUTE);
  if (pts.length < 2) continue;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
  byMode[line.mode] = (byMode[line.mode] ?? '') + d;
}

const out = {
  width: W,
  height: H,
  land: landPaths,
  paths: byMode,
  dots: dots.map(toPx),
};

writeFileSync('src/data/route-preview.json', JSON.stringify(out));
const kb = (JSON.stringify(out).length / 1024).toFixed(1);
console.log(
  `route-preview.json: ${kb} KB — ${landPaths.length} landvormen, ` +
    `${Object.keys(byMode).length} modi, ${out.dots.length} stops, ${W}x${H}`
);
