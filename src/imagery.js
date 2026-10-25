// Imágenes satelitales en el tiempo y coberturas del suelo (servicios ArcGIS ImageServer con CORS, ver docs/servicios-verificados.md),
// superficies por clase, matriz de cambios entre años y clasificación propia no supervisada (k-means) en el navegador.
import { fromArrayBuffer } from 'geotiff';
import { transformExtent } from 'ol/proj.js';

const today = () => new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export const SENSORS = {
  s2: {
    id: 's2', name: 'Sentinel-2', res: 10, url: 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer',
    dateField: 'acquisitiondate', cloudField: 'cloudcover', oidField: 'objectid', where: 'category = 1', span: 'escenas del último año (archivo móvil)',
    attribution: 'Sentinel-2 (Copernicus/ESA), Esri', cite: 'Imagen Sentinel-2, nivel 2A (Programa Copernicus, Agencia Espacial Europea), servida por Esri Sentinel-2 Views (https://sentinel.arcgis.com)',
    renders: [
      ['Natural Color with DRA', 'Color natural'], ['Agriculture with DRA', 'Agricultura (SWIR, infrarrojo, azul)'], ['Color Infrared with DRA', 'Infrarrojo color'],
      ['Short-wave Infrared with DRA', 'Infrarrojo de onda corta'], ['Geology with DRA', 'Geología'], ['Bathymetric with DRA', 'Batimétrica (aguas someras)'],
      ['NDVI Colormap', 'NDVI: vigor de la vegetación'], ['NDMI Colorized', 'NDMI: humedad de la vegetación'], ['Normalized Difference Built-Up Index (NDBI)', 'NDBI: superficie construida'],
      ['Normalized Burn Ratio', 'NBR: áreas quemadas'],
    ],
    // índices de banda (desde 0): B2 azul, B3 verde, B4 rojo, B8 infrarrojo cercano, B11 y B12 infrarrojo de onda corta
    // nivel 2A desde 2022: reflectancia = (DN − 1000) / 10000
    bands: [1, 2, 3, 7, 11, 12], scale: 1 / 10000, offset: 1000,
  },
  landsat: {
    id: 'landsat', name: 'Landsat', res: 30, url: 'https://landsat2.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer',
    dateField: 'AcquisitionDate', cloudField: 'CloudCover', oidField: 'OBJECTID', sensorField: 'SensorName', where: '', span: 'desde 1972 (MSS, TM, ETM+, OLI)',
    attribution: 'Landsat (USGS/NASA), Esri', cite: 'Imagen Landsat (Servicio Geológico de los Estados Unidos y NASA), servida por Esri Landsat Multispectral (https://landsat2.arcgis.com)',
    renders: [
      ['Natural Color with DRA', 'Color natural'], ['Agriculture with DRA', 'Agricultura (SWIR, infrarrojo, azul)'], ['Color Infrared with DRA', 'Infrarrojo color'],
      ['Short-wave Infrared with DRA', 'Infrarrojo de onda corta'], ['Geology with DRA', 'Geología'], ['NDVI Colorized', 'NDVI: vigor de la vegetación'],
      ['Normalized Difference Moisture Index Colorized', 'NDMI: humedad'], ['Band 10 Surface Temperature in Celsius', 'Temperatura de superficie (°C, desde 2013)'],
    ],
    bands: [1, 2, 3, 4, 5, 6], scale: 1 / 10000,
  },
};

export const LANDCOVER = {
  url: 'https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer',
  years: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  attribution: 'Cobertura del suelo 10 m (Impact Observatory, Microsoft, Esri)',
  cite: 'Karra, K. et al. (2021). Global land use/land cover with Sentinel-2 and deep learning. Impact Observatory, Microsoft y Esri. Serie anual de cobertura del suelo a 10 m (https://livingatlas.arcgis.com/landcover)',
  classes: [
    { v: 1, name: 'Agua', color: '#3f7fc1' }, { v: 2, name: 'Árboles', color: '#2f6b3a' }, { v: 4, name: 'Vegetación inundable', color: '#7fb0a1' },
    { v: 5, name: 'Cultivos', color: '#e6c65c' }, { v: 7, name: 'Construido', color: '#c0483a' }, { v: 8, name: 'Suelo desnudo', color: '#b9ab95' },
    { v: 9, name: 'Nieve y hielo', color: '#e8eef2' }, { v: 10, name: 'Nubes', color: '#cfd3d6' }, { v: 11, name: 'Pastizal y arbustal', color: '#b7c98a' },
  ],
};

// Paletas alternativas para las coberturas
export const LC_PALETTES = {
  oficial: { name: 'Colores de Esri', colors: { 1: '#419bdf', 2: '#397d49', 4: '#7a87c6', 5: '#e49635', 7: '#c4281b', 8: '#a59b8f', 9: '#a8ebff', 10: '#616161', 11: '#e3e2c3' } },
  tesis: { name: 'Pampeana sobria', colors: { 1: '#3f7fc1', 2: '#2f6b3a', 4: '#7fb0a1', 5: '#e6c65c', 7: '#c0483a', 8: '#b9ab95', 9: '#e8eef2', 10: '#cfd3d6', 11: '#b7c98a' } },
  grises: { name: 'Grises para imprenta', colors: { 1: '#4d4d4d', 2: '#262626', 4: '#737373', 5: '#d9d9d9', 7: '#000000', 8: '#bfbfbf', 9: '#f2f2f2', 10: '#e0e0e0', 11: '#a6a6a6' } },
};

export const EOX_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

// ---------- red ----------
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'error del servidor');
  return j;
}
const hexRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const ymd = (ts) => new Date(ts).toISOString().slice(0, 10);

// ---------- escenas disponibles en la vista ----------
export async function searchScenes(sensorId, bboxLL, { from, to, maxCloud = 0.2, months = null } = {}) {
  const s = SENSORS[sensorId];
  const where = [`${s.cloudField} <= ${Number(maxCloud).toFixed(3)}`, s.where].filter(Boolean).join(' AND ');
  const p = new URLSearchParams({
    where, geometry: bboxLL.map((v) => v.toFixed(5)).join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: [s.oidField, s.dateField, s.cloudField, s.sensorField].filter(Boolean).join(','), returnGeometry: 'false', orderByFields: `${s.dateField} DESC`,
    resultRecordCount: '400', f: 'json',
  });
  if (from || to) p.set('time', `${from ? Date.parse(`${from}T00:00:00Z`) : 0},${to ? Date.parse(`${to}T23:59:59Z`) : Date.now()}`);
  const j = await getJSON(`${s.url}/query?${p}`);
  const oid = j.objectIdFieldName || s.oidField;
  const byDay = new Map();
  for (const f of j.features || []) {
    const a = f.attributes;
    const ts = a[s.dateField];
    if (!ts) continue;
    const d = ymd(ts);
    const m = Number(d.slice(5, 7));
    if (months && months.length && !months.includes(m)) continue;
    if (!byDay.has(d)) byDay.set(d, { date: d, ts, ids: [], clouds: [], sensor: a[s.sensorField] || s.name });
    const g = byDay.get(d);
    g.ids.push(a[oid] != null ? a[oid] : a.OBJECTID != null ? a.OBJECTID : a.objectid);
    g.clouds.push(Math.max(0, Number(a[s.cloudField]) || 0));
  }
  return [...byDay.values()].map((g) => ({ ...g, cloud: g.clouds.reduce((x, y) => x + y, 0) / g.clouds.length, count: g.ids.length }))
    .sort((a, b) => b.ts - a.ts);
}

// ---------- definiciones de capa ----------
// fill: completa los huecos de la escena con las fechas más cercanas (± días) para cubrir toda la vista
export function sceneLayerDef(sensorId, scene, render, { fill = false, days = 20, maxCloud = 0.2 } = {}) {
  const s = SENSORS[sensorId];
  const rName = (s.renders.find((r) => r[0] === render) || [render, render])[1];
  const when = scene ? scene.date.split('-').reverse().join('/') : 'mosaico más reciente';
  let mosaic, note;
  if (!scene) {
    mosaic = { mosaicMethod: 'esriMosaicAttribute', sortField: s.cloudField, ascending: true, where: `${s.cloudField} <= 0.1${s.where ? ` AND ${s.where}` : ''}` };
    note = 'Mosaico de las escenas más despejadas';
  } else if (fill) {
    const d0 = new Date(`${scene.date}T00:00:00Z`);
    const a = new Date(d0.getTime() - days * 864e5).toISOString().slice(0, 10), b = new Date(d0.getTime() + days * 864e5).toISOString().slice(0, 10);
    mosaic = {
      mosaicMethod: 'esriMosaicAttribute', sortField: s.dateField, sortValue: scene.date.replace(/-/g, '/'), ascending: true,
      where: [`${s.cloudField} <= ${maxCloud}`, s.where, `${s.dateField} >= timestamp '${a} 00:00:00'`, `${s.dateField} <= timestamp '${b} 23:59:59'`].filter(Boolean).join(' AND '),
    };
    note = `Escena del ${scene.date}, con los huecos completados por las escenas más cercanas entre ${a} y ${b}`;
  } else {
    mosaic = { mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: scene.ids };
    note = `Fecha de adquisición: ${scene.date}`;
  }
  return {
    id: 'svc', kind: 'raster', type: 'svc-image', name: `${s.name} ${when}: ${rName.split(':')[0].toLowerCase()}`, url: s.url, sensor: sensorId,
    render, mosaic, fill: !!(scene && fill),
    date: scene ? scene.date : '', cloud: scene ? scene.cloud : null, provider: { id: sensorId, short: s.name, name: s.name },
    attribution: s.attribution, cite: `${s.cite}. ${note}; representación «${rName}». Consultado el ${today()}`,
  };
}

export function landcoverLayerDef(year, paletteId = 'tesis') {
  const pal = LC_PALETTES[paletteId] || LC_PALETTES.tesis;
  return {
    id: 'svc', kind: 'raster', type: 'svc-landcover', name: `Cobertura del suelo ${year}`, url: LANDCOVER.url, year,
    provider: { id: 'landcover', short: 'Cobertura 10 m', name: LANDCOVER.attribution },
    attribution: LANDCOVER.attribution, cite: `${LANDCOVER.cite}. Año ${year}. Consultado el ${today()}`,
    classes: LANDCOVER.classes.filter((c) => c.v !== 9 && c.v !== 10).map((c) => ({ v: c.v, name: c.name, color: pal.colors[c.v] || c.color, show: true })),
  };
}

export function eoxLayerDef(year) {
  return {
    id: 'svc', kind: 'raster', type: 'xyz', name: `Sentinel-2 sin nubes ${year} (EOX)`, url: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`,
    projection: 'EPSG:3857', maxZoom: 16, provider: { id: 'eox', short: 'EOX', name: 'EOX IT Services' },
    attribution: `Sentinel-2 cloudless ${year} by EOX IT Services GmbH (Copernicus Sentinel data ${year})`,
    cite: `EOX IT Services GmbH. Sentinel-2 cloudless ${year} (contiene datos modificados de Copernicus Sentinel ${year}). https://s2maps.eu. Consultado el ${today()}`,
  };
}

export function landcoverRenderingRule(classes) {
  const shown = (classes || []).filter((c) => c.show !== false);
  return { rasterFunction: 'Colormap', rasterFunctionArguments: { Colormap: shown.map((c) => [c.v, ...hexRgb(c.color)]) }, variableName: 'Raster' };
}
export function yearTime(year) { return `${Date.UTC(year, 0, 1)},${Date.UTC(year, 11, 31, 23, 59, 59)}`; }

// ---------- lectura de píxeles ----------
function gridFor(bboxLL, maxPx) {
  const b = transformExtent(bboxLL, 'EPSG:4326', 'EPSG:3857');
  const W = b[2] - b[0], H = b[3] - b[1];
  const k = maxPx / Math.max(W, H);
  return { b, w: Math.max(16, Math.round(W * k)), h: Math.max(16, Math.round(H * k)) };
}
// superficie real de cada fila de píxeles en Mercator (m²): se corrige por cos² de la latitud
function rowAreas(b, w, h) {
  const dx = (b[2] - b[0]) / w, dy = (b[3] - b[1]) / h;
  const R = 6378137;
  const out = new Float64Array(h);
  for (let r = 0; r < h; r++) {
    const y = b[3] - (r + 0.5) * dy;
    const lat = 2 * Math.atan(Math.exp(y / R)) - Math.PI / 2;
    out[r] = dx * dy * Math.cos(lat) ** 2;
  }
  return out;
}

export async function landcoverValues(year, bboxLL, maxPx = 1400) {
  const { b, w, h } = gridFor(bboxLL, maxPx);
  const p = new URLSearchParams({ bbox: b.join(','), bboxSR: '3857', imageSR: '3857', size: `${w},${h}`, format: 'png8', f: 'image', renderingRule: JSON.stringify({ rasterFunction: 'None' }), time: yearTime(year), interpolation: 'RSP_NearestNeighbor' });
  const r = await fetch(`${LANDCOVER.url}/exportImage?${p}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const values = new Uint8Array(c.width * c.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) values[j] = d[i + 3] ? d[i] : 0;
  return { w: c.width, h: c.height, values, b, areas: rowAreas(b, c.width, c.height), pxMeters: (b[2] - b[0]) / c.width };
}

export function areaByClass(grid) {
  const out = new Map();
  const { w, h, values, areas } = grid;
  for (let r = 0; r < h; r++) {
    const a = areas[r];
    for (let c = 0; c < w; c++) { const v = values[r * w + c]; if (!v) continue; out.set(v, (out.get(v) || 0) + a); }
  }
  return out; // valor → m²
}

export function changeMatrix(g1, g2) {
  const m = new Map();
  const { w, h, areas } = g1;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const a = g1.values[i], b = g2.values[i];
      if (!a || !b) continue;
      const k = `${a}>${b}`;
      m.set(k, (m.get(k) || 0) + areas[r]);
    }
  }
  return m; // 'de>a' → m²
}

// Imagen de cambios: píxeles que cambiaron de clase, pintados con la clase de llegada (los estables, en gris muy claro o transparentes)
export async function changeImage(g1, g2, classes, { stable = 'transparent' } = {}) {
  const col = new Map(classes.map((c) => [c.v, hexRgb(c.color)]));
  const c = document.createElement('canvas'); c.width = g1.w; c.height = g1.h;
  const x = c.getContext('2d');
  const img = x.createImageData(g1.w, g1.h);
  for (let i = 0; i < g1.values.length; i++) {
    const a = g1.values[i], b = g2.values[i];
    const o = i * 4;
    if (!a || !b) continue;
    if (a !== b) { const rgb = col.get(b) || [255, 0, 255]; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255; }
    else if (stable === 'gray') { img.data[o] = 236; img.data[o + 1] = 236; img.data[o + 2] = 236; img.data[o + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  return new Promise((res) => c.toBlob((bl) => res({ blob: bl, w: c.width, h: c.height }), 'image/png'));
}

// ---------- clasificación propia ----------
// El servidor compone las bandas al vuelo: con 560 px de lado tarda entre 20 s y un minuto la primera vez
export async function exportBands(sensorId, bboxLL, mosaic, maxPx = 560, signal) {
  const s = SENSORS[sensorId];
  const { b, w, h } = gridFor(bboxLL, maxPx);
  const p = new URLSearchParams({
    bbox: b.join(','), bboxSR: '3857', imageSR: '3857', size: `${w},${h}`, format: 'tiff', pixelType: 'U16', f: 'image',
    renderingRule: JSON.stringify({ rasterFunction: 'None' }), bandIds: s.bands.join(','), mosaicRule: JSON.stringify(mosaic), interpolation: 'RSP_BilinearInterpolation',
  });
  const r = await fetch(`${s.url}/exportImage?${p}`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength < 2000) {
    const t = new TextDecoder().decode(buf);
    throw new Error(/error|exception/i.test(t) ? t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160) : 'el servidor no devolvió la imagen');
  }
  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  const bands = Array.from({ length: rasters.length }, (_, i) => rasters[i]);
  return { w: image.getWidth(), h: image.getHeight(), bands, b, scale: s.scale, offset: s.offset || 0, areas: rowAreas(b, image.getWidth(), image.getHeight()), pxMeters: (b[2] - b[0]) / image.getWidth() };
}

// k-means con inicio k-means++ sobre una muestra; rasgos: 6 bandas de reflectancia normalizadas + NDVI + NDWI
export function classify(img, k = 6, { iters = 14, sample = 24000, seed = 7 } = {}) {
  const { w, h, bands, scale } = img;
  const off = img.offset || 0;
  const n = w * h;
  const F = 8;
  const feat = new Float32Array(n * F);
  const valid = new Uint8Array(n);
  let rnd = seed;
  const rand = () => { rnd = (rnd * 1664525 + 1013904223) % 4294967296; return rnd / 4294967296; };
  const [B0, B1, B2, B3, B4, B5] = bands;
  for (let i = 0; i < n; i++) {
    if (!B0[i] || !B3[i]) continue; // sin dato
    const bl = (B0[i] - off) * scale, gr = (B1[i] - off) * scale, rd = (B2[i] - off) * scale, nir = (B3[i] - off) * scale, sw1 = (B4[i] - off) * scale, sw2 = (B5[i] - off) * scale;
    if (!(bl > -0.05 && gr > 0 && rd > 0 && nir > 0 && sw1 > 0 && sw2 > 0)) continue;
    const ndvi = (nir - rd) / (nir + rd || 1);
    const ndwi = (gr - nir) / (gr + nir || 1);
    const o = i * F;
    feat[o] = bl; feat[o + 1] = gr; feat[o + 2] = rd; feat[o + 3] = nir; feat[o + 4] = sw1; feat[o + 5] = sw2; feat[o + 6] = ndvi; feat[o + 7] = ndwi;
    valid[i] = 1;
  }
  // normalización por desvío estándar de cada rasgo
  const mean = new Float64Array(F), sd = new Float64Array(F);
  let cnt = 0;
  for (let i = 0; i < n; i++) if (valid[i]) { cnt++; for (let f = 0; f < F; f++) mean[f] += feat[i * F + f]; }
  if (cnt < k * 10) throw new Error('la imagen no tiene píxeles válidos suficientes (¿nubes o fuera de cobertura?)');
  for (let f = 0; f < F; f++) mean[f] /= cnt;
  for (let i = 0; i < n; i++) if (valid[i]) for (let f = 0; f < F; f++) sd[f] += (feat[i * F + f] - mean[f]) ** 2;
  for (let f = 0; f < F; f++) sd[f] = Math.sqrt(sd[f] / cnt) || 1;
  const z = (i, f) => (feat[i * F + f] - mean[f]) / sd[f];
  // muestra
  const idx = [];
  for (let i = 0; i < n; i++) if (valid[i]) idx.push(i);
  const S = idx.length > sample ? Array.from({ length: sample }, () => idx[Math.floor(rand() * idx.length)]) : idx;
  // k-means++
  const C = [];
  C.push(Array.from({ length: F }, (_, f) => z(S[Math.floor(rand() * S.length)], f)));
  const d2 = new Float64Array(S.length).fill(Infinity);
  while (C.length < k) {
    const last = C[C.length - 1];
    let sum = 0;
    for (let s = 0; s < S.length; s++) { let d = 0; for (let f = 0; f < F; f++) d += (z(S[s], f) - last[f]) ** 2; if (d < d2[s]) d2[s] = d; sum += d2[s]; }
    let t = rand() * sum, pick = 0;
    for (let s = 0; s < S.length; s++) { t -= d2[s]; if (t <= 0) { pick = s; break; } }
    C.push(Array.from({ length: F }, (_, f) => z(S[pick], f)));
  }
  const nearest = (i) => { let best = 0, bd = Infinity; for (let c = 0; c < k; c++) { let d = 0; for (let f = 0; f < F; f++) d += (z(i, f) - C[c][f]) ** 2; if (d < bd) { bd = d; best = c; } } return best; };
  for (let it = 0; it < iters; it++) {
    const acc = Array.from({ length: k }, () => new Float64Array(F + 1));
    for (const i of S) { const c = nearest(i); for (let f = 0; f < F; f++) acc[c][f] += z(i, f); acc[c][F]++; }
    let moved = 0;
    for (let c = 0; c < k; c++) if (acc[c][F]) for (let f = 0; f < F; f++) { const nv = acc[c][f] / acc[c][F]; moved += Math.abs(nv - C[c][f]); C[c][f] = nv; }
    if (moved < 1e-3) break;
  }
  // asignación de todos los píxeles y estadísticas por clase (en unidades reales)
  const labels = new Uint8Array(n);
  const stats = Array.from({ length: k }, () => ({ area: 0, n: 0, sum: new Float64Array(F) }));
  for (let i = 0; i < n; i++) {
    if (!valid[i]) continue;
    const c = nearest(i);
    labels[i] = c + 1;
    const st = stats[c]; st.n++; st.area += img.areas[Math.floor(i / w)];
    for (let f = 0; f < F; f++) st.sum[f] += feat[i * F + f];
  }
  const classes = stats.map((st, c) => {
    const m = Array.from(st.sum, (x) => (st.n ? x / st.n : 0));
    return { id: c + 1, n: st.n, area: st.area, ndvi: m[6], ndwi: m[7], swir: m[4], nir: m[3] };
  });
  // nombre y color sugeridos según los índices medios (orden por NDVI)
  classes.sort((a, b) => a.ndvi - b.ndvi);
  const used = new Map();
  classes.forEach((c) => {
    let name, color;
    if (c.ndwi > 0.05 && c.ndvi < 0.2) { name = 'Agua'; color = '#3f7fc1'; }
    else if (c.ndvi < 0.15) { name = c.swir > 0.25 ? 'Suelo desnudo o rastrojo' : 'Construido o suelo húmedo'; color = c.swir > 0.25 ? '#c9b48f' : '#a8473a'; }
    else if (c.ndvi < 0.3) { name = 'Vegetación rala o pastizal seco'; color = '#d9cf8f'; }
    else if (c.ndvi < 0.5) { name = 'Pastizal o cultivo en desarrollo'; color = '#a9c46c'; }
    else if (c.ndvi < 0.7) { name = 'Cultivo o pastura vigorosa'; color = '#5f9a3f'; }
    else { name = 'Vegetación densa (monte, cultivo pleno)'; color = '#2f6b3a'; }
    const nUsed = (used.get(name) || 0) + 1;
    used.set(name, nUsed);
    c.name = nUsed > 1 ? `${name} ${nUsed}` : name;
    c.color = nUsed > 1 ? shade(color, (nUsed - 1) * 0.18) : color;
    c.show = true;
  });
  return { labels, classes, w, h };
}
function shade(hex, t) { const [r, g, b] = hexRgb(hex); const f = (x) => Math.round(x + (255 - x) * t).toString(16).padStart(2, '0'); return `#${f(r)}${f(g)}${f(b)}`; }

// Etiquetas como PNG en grises (valor = clase; 0 = sin dato) para guardarlas con el proyecto
export function labelsToPng(labels, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const img = x.createImageData(w, h);
  for (let i = 0; i < labels.length; i++) { const v = labels[i]; const o = i * 4; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255; }
  x.putImageData(img, 0, 0);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

// Pinta las etiquetas con los colores de cada clase (las ocultas, transparentes)
export async function paintLabels(blobOrUrl, classes) {
  const bmp = await createImageBitmap(typeof blobOrUrl === 'string' ? await (await fetch(blobOrUrl)).blob() : blobOrUrl);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height);
  const col = new Map(classes.filter((k) => k.show !== false).map((k) => [k.id != null ? k.id : k.v, hexRgb(k.color)]));
  for (let o = 0; o < img.data.length; o += 4) {
    const v = img.data[o];
    const rgb = col.get(v);
    if (!rgb) { img.data[o + 3] = 0; continue; }
    img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return new Promise((res) => c.toBlob((bl) => res(URL.createObjectURL(bl)), 'image/png'));
}

export function fmtHa(m2) { const ha = m2 / 1e4; return ha >= 100 ? Math.round(ha).toLocaleString('es-AR') : ha.toLocaleString('es-AR', { maximumFractionDigits: 1 }); }
