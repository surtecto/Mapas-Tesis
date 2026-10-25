// Análisis espacial y geoestadística en el navegador: clases (Jenks, cuantiles, intervalos), áreas de influencia,
// densidad (hexágonos y núcleo), Thiessen, conteo en polígonos, vecino más próximo, elipse de desvío, medición y perfil topográfico.
import buffer from '@turf/buffer';
import voronoi from '@turf/voronoi';
import hexGrid from '@turf/hex-grid';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import isobands from '@turf/isobands';
import turfArea from '@turf/area';
import turfLength from '@turf/length';
import nearestNeighborAnalysis from '@turf/nearest-neighbor-analysis';
import standardDeviationalEllipse from '@turf/standard-deviational-ellipse';
import centerMean from '@turf/center-mean';
import along from '@turf/along';
import { featureCollection, point } from '@turf/helpers';
import GeoJSON from 'ol/format/GeoJSON.js';
import { defOf } from './catalog.js';

const fmt = new GeoJSON();

// ---------- datos de una capa (en WGS 84) ----------
export function layerFC(app, ls) {
  if (ls.def === 'user') return ls.data;
  const l = app.mainCtx && app.mainCtx.olLayers.get(ls.uid);
  const src = l && l.getSource && l.getSource();
  const feats = src && src.getFeatures ? src.getFeatures() : [];
  const obj = fmt.writeFeaturesObject(feats, { featureProjection: app.mainCtx.projection, dataProjection: 'EPSG:4326', decimals: 7 });
  obj.features.forEach((f) => { if (f.properties) delete f.properties.geometry; });
  return obj;
}
export function sitesFC(state) {
  return featureCollection(state.sites.map((s) => point([s.lon, s.lat], { nombre: s.name, nota: s.note || '' })));
}
export function vectorLayers(state) {
  return state.layers.filter((l) => {
    if (l.def === 'user') return true;
    const d = defOf(l);
    return d && d.kind === 'vector' && d.type !== 'generated' && l.def !== 'graticule';
  });
}
export function geomKind(fc) {
  const f = (fc.features || []).find((x) => x.geometry);
  const t = f ? f.geometry.type : '';
  return /Point/.test(t) ? 'point' : /Line/.test(t) ? 'line' : /Polygon/.test(t) ? 'polygon' : null;
}
export function numericFields(fc) {
  const feats = (fc.features || []).slice(0, 400);
  if (!feats.length) return [];
  const keys = new Set();
  feats.forEach((f) => Object.keys(f.properties || {}).forEach((k) => keys.add(k)));
  return [...keys].filter((k) => {
    let num = 0, tot = 0;
    for (const f of feats) { const v = f.properties[k]; if (v == null || v === '') continue; tot++; if (Number.isFinite(Number(v))) num++; }
    return tot > 0 && num / tot >= 0.8;
  });
}

// ---------- clases ----------
function jenks(sorted, k) {
  const n = sorted.length;
  const lower = Array.from({ length: n + 1 }, () => new Int32Array(k + 1));
  const vari = Array.from({ length: n + 1 }, () => new Float64Array(k + 1));
  for (let i = 1; i <= k; i++) { lower[1][i] = 1; for (let j = 2; j <= n; j++) vari[j][i] = Infinity; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0, v = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const val = sorted[i3 - 1];
      s2 += val * val; s1 += val; w++;
      v = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) for (let j = 2; j <= k; j++) if (vari[l][j] >= v + vari[i4][j - 1]) { lower[l][j] = i3; vari[l][j] = v + vari[i4][j - 1]; }
    }
    lower[l][1] = 1; vari[l][1] = v;
  }
  const br = new Array(k + 1);
  br[k] = sorted[n - 1]; br[0] = sorted[0];
  let kk = n;
  for (let j = k; j >= 2; j--) { const id = lower[kk][j] - 2; br[j - 1] = sorted[Math.max(0, id)]; kk = lower[kk][j] - 1; }
  return br;
}
export const METHODS = [['jenks', 'Cortes naturales (Jenks)'], ['quantile', 'Cuantiles (igual cantidad por clase)'], ['equal', 'Intervalos iguales'], ['stddev', 'Desvío estándar']];
export function classBreaks(values, k, method) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const uniq = [...new Set(v)];
  k = Math.max(2, Math.min(k, uniq.length));
  const min = v[0], max = v[v.length - 1];
  if (method === 'equal') return Array.from({ length: k + 1 }, (_, i) => min + ((max - min) * i) / k);
  if (method === 'quantile') return Array.from({ length: k + 1 }, (_, i) => v[Math.min(v.length - 1, Math.round(((v.length - 1) * i) / k))]);
  if (method === 'stddev') {
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) || 1;
    const half = k / 2;
    const br = Array.from({ length: k + 1 }, (_, i) => mean + (i - half) * sd);
    br[0] = Math.min(min, br[0]); br[k] = Math.max(max, br[k]);
    return br.map((x, i) => (i === 0 ? min : i === k ? max : Math.min(max, Math.max(min, x))));
  }
  // Jenks sobre una muestra ordenada si hay muchos valores
  const sample = v.length > 1500 ? Array.from({ length: 1500 }, (_, i) => v[Math.floor((i * (v.length - 1)) / 1499)]) : v;
  const br = jenks(sample, k);
  br[0] = min; br[k] = max;
  return br;
}

export const RAMPS = {
  tierra: ['#f6eedc', '#e3c99a', '#c99b5e', '#a06b34', '#6b4422', '#3d2614'],
  verdes: ['#f2f7e6', '#cfe4a8', '#9cc96f', '#5f9e45', '#2f6b3a', '#173f22'],
  azules: ['#eef5fb', '#c4ddef', '#86b9dc', '#4a90c4', '#22609c', '#0e3666'],
  rojos: ['#fdf0ea', '#f7c3a8', '#ec8b67', '#d2513a', '#a42a24', '#651514'],
  grises: ['#f4f4f4', '#d0d0d0', '#a6a6a6', '#7a7a7a', '#4d4d4d', '#1f1f1f'],
  divergente: ['#2c62a0', '#8db4d8', '#f2f0eb', '#eaa27e', '#b8452e'],
};
export const RAMP_NAMES = { tierra: 'Tierras', verdes: 'Verdes', azules: 'Azules', rojos: 'Rojos', grises: 'Grises', divergente: 'Divergente (azul–rojo)' };
const hex2 = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function rampColors(id, k) {
  const r = RAMPS[id] || RAMPS.tierra;
  return Array.from({ length: k }, (_, i) => {
    const t = k === 1 ? 0.5 : i / (k - 1);
    const x = t * (r.length - 1), a = Math.floor(x), b = Math.min(r.length - 1, a + 1), f = x - a;
    const ca = hex2(r[a]), cb = hex2(r[b]);
    return `#${ca.map((c, j) => Math.round(c + (cb[j] - c) * f).toString(16).padStart(2, '0')).join('')}`;
  });
}
export function niceNum(x) {
  const a = Math.abs(x);
  const d = a >= 1000 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return Number(x.toFixed(d));
}
export function rangesFor(values, k, method, rampId) {
  const br = classBreaks(values, k, method);
  if (br.length < 2) return [];
  const n = br.length - 1;
  const cols = rampColors(rampId, n);
  const f = (x) => niceNum(x).toLocaleString('es-AR');
  return Array.from({ length: n }, (_, i) => ({ min: br[i], max: br[i + 1], color: cols[i], label: `${f(br[i])} – ${f(br[i + 1])}` }));
}

// ---------- geoprocesos ----------
export function bufferRings(fc, kms) {
  const out = [];
  const sorted = [...kms].sort((a, b) => b - a); // las mayores primero, para que las menores queden encima
  for (const km of sorted) {
    for (const f of fc.features || []) {
      if (!f.geometry) continue;
      try {
        const b = buffer(f, km, { units: 'kilometers', steps: 24 });
        if (b) { b.properties = { ...(f.properties || {}), dist_km: km }; out.push(b); }
      } catch (e) { /* geometría inválida */ }
    }
  }
  return featureCollection(out);
}

export function thiessen(points, bbox) {
  const pts = featureCollection((points.features || []).filter((f) => f.geometry && f.geometry.type === 'Point'));
  if (pts.features.length < 2) throw new Error('hacen falta al menos dos puntos');
  const v = voronoi(pts, { bbox });
  const feats = [];
  v.features.forEach((cell, i) => { if (cell) { cell.properties = { ...(pts.features[i].properties || {}) }; feats.push(cell); } });
  return featureCollection(feats);
}

export function hexDensity(points, bbox, cellKm) {
  const grid = hexGrid(bbox, cellKm, { units: 'kilometers' });
  const pts = (points.features || []).filter((f) => f.geometry && f.geometry.type === 'Point');
  const cellArea = (3 * Math.sqrt(3) / 2) * cellKm * cellKm; // km² de un hexágono de radio cellKm
  const feats = [];
  for (const h of grid.features) {
    const c = h.geometry.coordinates[0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    c.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    let n = 0;
    for (const p of pts) {
      const [x, y] = p.geometry.coordinates;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (booleanPointInPolygon(p, h)) n++;
    }
    if (n > 0) { h.properties = { n, dens_km2: Number((n / cellArea).toFixed(4)) }; feats.push(h); }
  }
  return featureCollection(feats);
}

// Densidad por núcleo gaussiano (puntos por km²) sobre una grilla, y bandas iguales
export function kernelBands(points, bbox, bandwidthKm, nLevels = 5) {
  const pts = (points.features || []).filter((f) => f.geometry && f.geometry.type === 'Point').map((f) => f.geometry.coordinates);
  if (pts.length < 3) throw new Error('hacen falta al menos tres puntos');
  const [W, S, E, N] = bbox;
  const lat0 = ((S + N) / 2) * Math.PI / 180;
  const kx = 111.32 * Math.cos(lat0), ky = 110.57;
  const nx = 90, ny = Math.max(30, Math.round(90 * ((N - S) * ky) / ((E - W) * kx)));
  const h2 = 2 * bandwidthKm * bandwidthKm;
  const norm = 1 / (Math.PI * h2);
  const cut = (3 * bandwidthKm) ** 2;
  const grid = [];
  let max = 0;
  for (let j = 0; j < ny; j++) {
    const y = S + ((N - S) * j) / (ny - 1);
    for (let i = 0; i < nx; i++) {
      const x = W + ((E - W) * i) / (nx - 1);
      let d = 0;
      for (const [px, py] of pts) {
        const dx = (x - px) * kx, dy = (y - py) * ky;
        const r2 = dx * dx + dy * dy;
        if (r2 < cut) d += Math.exp(-r2 / h2);
      }
      d *= norm;
      if (d > max) max = d;
      grid.push(point([x, y], { d }));
    }
  }
  if (!max) throw new Error('no hay densidad para mostrar en la vista');
  const breaks = Array.from({ length: nLevels + 1 }, (_, i) => (max * i) / nLevels);
  breaks[0] = max * 0.04; // lo casi nulo queda transparente
  const bands = isobands(featureCollection(grid), breaks, { zProperty: 'd' });
  bands.features = bands.features.filter((f) => f.geometry && f.geometry.coordinates && f.geometry.coordinates.length);
  bands.features.forEach((f, i) => { const [a, b] = String(f.properties.d || '').split('-').map(Number); f.properties = { nivel: i + 1, desde: niceNum(a || breaks[i]), hasta: niceNum(b || breaks[i + 1]) }; });
  return { fc: bands, breaks, max };
}

export function countInPolygons(polys, points) {
  const pts = (points.features || []).filter((f) => f.geometry && f.geometry.type === 'Point');
  const out = [];
  for (const pg of polys.features || []) {
    if (!pg.geometry || !/Polygon/.test(pg.geometry.type)) continue;
    let n = 0;
    for (const p of pts) if (booleanPointInPolygon(p, pg)) n++;
    let a = 0;
    try { a = turfArea(pg) / 1e6; } catch (e) { /* noop */ }
    out.push({ ...pg, properties: { ...(pg.properties || {}), n, dens_km2: a ? Number((n / a).toFixed(4)) : 0 } });
  }
  return featureCollection(out);
}

// Índice de vecino más próximo (Clark y Evans): R < 1 agrupado, R ≈ 1 aleatorio, R > 1 disperso
export function nnIndex(points, studyArea) {
  const pts = featureCollection((points.features || []).filter((f) => f.geometry && f.geometry.type === 'Point'));
  if (pts.features.length < 3) throw new Error('hacen falta al menos tres puntos');
  const r = nearestNeighborAnalysis(pts, { studyArea, units: 'kilometers' });
  return r.properties.nearestNeighborAnalysis;
}

export function ellipse(points) {
  const pts = featureCollection((points.features || []).filter((f) => f.geometry && f.geometry.type === 'Point'));
  if (pts.features.length < 3) throw new Error('hacen falta al menos tres puntos');
  const e = standardDeviationalEllipse(pts, { steps: 72 });
  const c = centerMean(pts);
  e.properties = { tipo: 'Elipse de desvío estándar', ...Object.fromEntries(Object.entries(e.properties.standardDeviationalEllipse || {}).filter(([k]) => typeof e.properties.standardDeviationalEllipse[k] === 'number').map(([k, v]) => [k, Number(v.toFixed(4))])) };
  c.properties = { tipo: 'Centro medio' };
  return featureCollection([e, c]);
}

export const measureLength = (geojsonLine) => turfLength(geojsonLine, { units: 'kilometers' });
export const measureArea = (geojsonPoly) => turfArea(geojsonPoly);

// ---------- perfil topográfico (teselas Terrarium) ----------
const tileCache = new Map();
function lon2tile(lon, z) { return ((lon + 180) / 360) * 2 ** z; }
function lat2tile(lat, z) { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; }
function tilePixels(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!tileCache.has(k)) {
    tileCache.set(k, new Promise((resolve, reject) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x2 = c.getContext('2d', { willReadFrequently: true }); x2.drawImage(im, 0, 0); resolve(x2.getImageData(0, 0, 256, 256).data); };
      im.onerror = () => reject(new Error('teselas de elevación no disponibles'));
      im.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
    }));
  }
  return tileCache.get(k);
}
export async function elevationProfile(lineCoords, n = 240, z = 13) {
  const line = { type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords }, properties: {} };
  const total = turfLength(line, { units: 'kilometers' });
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = (total * i) / (n - 1);
    const p = along(line, d, { units: 'kilometers' }).geometry.coordinates;
    const tx = lon2tile(p[0], z), ty = lat2tile(p[1], z);
    const X = Math.floor(tx), Y = Math.floor(ty);
    const px = Math.min(255, Math.floor((tx - X) * 256)), py = Math.min(255, Math.floor((ty - Y) * 256));
    const data = await tilePixels(z, X, Y);
    const o = (py * 256 + px) * 4;
    out.push([d, data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768, p[0], p[1]]);
  }
  // suavizado leve (el modelo tiene ruido de ±1 m en la llanura)
  const sm = out.map((r, i) => { const a = out.slice(Math.max(0, i - 2), i + 3); return [r[0], a.reduce((s, x) => s + x[1], 0) / a.length, r[2], r[3]]; });
  return { total, points: sm };
}
