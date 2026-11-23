// Importación de ráster propios: imágenes satelitales procesadas, clasificaciones, índices, modelos de elevación.
// GeoTIFF (con su georreferencia interna) e imágenes PNG/JPG con archivo de georreferencia (.pgw, .jgw, .wld, .tfw).
// El archivo se lee en el navegador, se reduce al tamaño de trabajo y queda guardado junto al proyecto como imagen;
// las clasificaciones se guardan como etiquetas, así cada clase se puede recolorear, renombrar u ocultar después.
import { fromBlob } from 'geotiff';
import proj4 from 'proj4';
import { ensureProjection, registerProjections } from './projections.js';
import { get as getProjection } from 'ol/proj.js';

export const MAX_SIDE = 3600;

// ---------- sistemas de coordenadas ----------
const GEOGRAPHIC = new Set([4326, 4674, 4686, 5340, 4618, 4248, 4269, 4170, 6318, 4490, 4258]);
// SIRGAS 2000 / UTM y afines equivalen a WGS 84 / UTM para la precisión de una figura
function utmAlias(epsg) {
  if (epsg >= 31965 && epsg <= 31976) return 32600 + (epsg - 31965 + 11); // SIRGAS 2000 UTM 11N–22N
  if (epsg >= 31977 && epsg <= 31985) return 32700 + (epsg - 31977 + 17); // SIRGAS 2000 UTM 17S–25S
  if (epsg >= 5382 && epsg <= 5383) return 32700 + (epsg - 5382 + 21); // SIRGAS-ROU98 UTM 21S–22S
  if (epsg >= 5361 && epsg <= 5362) return epsg === 5361 ? 32719 : 32718; // SIRGAS-Chile UTM 19S / 18S
  if (epsg >= 6366 && epsg <= 6372 && epsg !== 6372) return 32600 + (epsg - 6366 + 11); // México ITRF2008 UTM 11N–16N
  if (epsg >= 3116 && epsg <= 3118) return null;
  return null;
}
// Devuelve el código que la aplicación puede dibujar, o null si no lo conoce
export function usableCrs(epsg) {
  registerProjections();
  const n = Number(epsg);
  if (!n) return null;
  if (GEOGRAPHIC.has(n)) return 'EPSG:4326';
  if (n === 3857 || n === 900913 || n === 3785) return 'EPSG:3857';
  const alias = utmAlias(n);
  const code = `EPSG:${alias || n}`;
  if (getProjection(code)) return code;
  if (/^EPSG:32[67]\d\d$/.test(code)) { const c = ensureProjection(code); return c === code ? code : null; }
  return null;
}
// Lee un .prj (WKT) hasta donde alcanza: geográficas, UTM y las fajas argentinas
export function crsFromWkt(wkt) {
  const t = String(wkt || '');
  if (!t.trim()) return null;
  const auth = [...t.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/g)].pop() || /ID\["EPSG",(\d+)\]\s*\]\s*$/.exec(t);
  if (auth) { const c = usableCrs(auth[1]); if (c) return c; }
  const utm = /UTM[_ ]zone[_ ](\d{1,2})\s*([NS])?/i.exec(t);
  if (utm) { const south = utm[2] ? /s/i.test(utm[2]) : /false_northing"?,\s*10000000/i.test(t); return usableCrs((south ? 32700 : 32600) + Number(utm[1])); }
  const faja = /POSGAR[_ ]?(?:20)?07[^"]*faja[_ ]?(\d)/i.exec(t);
  if (faja) return usableCrs(5342 + Number(faja[1]));
  if (/Mercator_Auxiliary_Sphere|Popular Visualisation|Pseudo-Mercator/i.test(t)) return 'EPSG:3857';
  if (/^\s*GEOGCS|^\s*GEOGCRS/i.test(t)) return 'EPSG:4326';
  return null;
}
function crsOfImage(image) {
  let gk = {};
  try { gk = image.getGeoKeys() || {}; } catch (e) { gk = {}; }
  const pc = gk.ProjectedCSTypeGeoKey, gc = gk.GeographicTypeGeoKey;
  if (pc && pc !== 32767) return { code: usableCrs(pc), epsg: pc };
  if (gk.GTModelTypeGeoKey === 2 || (!pc && gc)) return { code: gc && gc !== 32767 ? usableCrs(gc) || 'EPSG:4326' : 'EPSG:4326', epsg: gc || 4326 };
  const cit = `${gk.PCSCitationGeoKey || ''} ${gk.GTCitationGeoKey || ''}`;
  const c = crsFromWkt(cit);
  return { code: c, epsg: pc || gc || null, citation: cit.trim() };
}
export function bboxToLonLat(extent, code) {
  if (code === 'EPSG:4326') return extent.slice();
  const pts = [[extent[0], extent[1]], [extent[2], extent[1]], [extent[2], extent[3]], [extent[0], extent[3]], [(extent[0] + extent[2]) / 2, extent[1]], [(extent[0] + extent[2]) / 2, extent[3]]].map((p) => proj4(code, 'EPSG:4326', p));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

// ---------- rampas y paletas ----------
export const RAMPS = {
  viridis: { name: 'Viridis (apta para daltonismo)', stops: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  ndvi: { name: 'Vegetación (marrón a verde)', stops: ['#8c510a', '#d8b365', '#f6e8c3', '#c7e9a0', '#5aae61', '#1b7837'] },
  agua: { name: 'Agua (claro a azul)', stops: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'] },
  terreno: { name: 'Terreno (verde, ocre, blanco)', stops: ['#3c7a4a', '#a8c686', '#efe3a8', '#c89b63', '#8c6a4f', '#f5f5f5'] },
  calor: { name: 'Calor (amarillo a rojo)', stops: ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'] },
  divergente: { name: 'Divergente (azul, blanco, rojo)', stops: ['#2166ac', '#92c5de', '#f7f7f7', '#f4a582', '#b2182b'] },
  grises: { name: 'Grises', stops: ['#111111', '#f2f2f2'] },
};
const hexRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export function rampColor(rampId, t) {
  const st = (RAMPS[rampId] || RAMPS.viridis).stops.map(hexRgb);
  const x = Math.max(0, Math.min(1, t)) * (st.length - 1);
  const i = Math.min(st.length - 2, Math.floor(x)), f = x - i;
  return [0, 1, 2].map((k) => st[i][k] + (st[i + 1][k] - st[i][k]) * f);
}
const AUTO = ['#1f78b4', '#33a02c', '#e31a1c', '#ff7f00', '#6a3d9a', '#b15928', '#a6cee3', '#b2df8a', '#fb9a99', '#fdbf6f', '#cab2d6', '#ffff99', '#8dd3c7', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#bc80bd'];
// Leyendas de productos de cobertura conocidos: valor → [nombre, color]
export const CLASS_SCHEMES = {
  auto: { name: 'Colores automáticos (nombro las clases después)', map: null },
  mapbiomas: { name: 'MapBiomas (cobertura y uso del suelo)', map: {
    1: ['Bosque', '#1f8d49'], 3: ['Formación boscosa', '#1f8d49'], 4: ['Formación sabánica / bosque abierto', '#7dc975'], 5: ['Manglar', '#04381d'], 6: ['Bosque inundable', '#026975'],
    9: ['Silvicultura / plantación forestal', '#7a5900'], 10: ['Formación natural no boscosa', '#d6bc74'], 11: ['Humedal / área inundable', '#519799'], 12: ['Pastizal / formación campestre', '#d6bc74'],
    13: ['Otra formación natural no boscosa', '#d89f5c'], 14: ['Uso agropecuario', '#ffefc3'], 15: ['Pastura', '#edde8e'], 18: ['Agricultura', '#e974ed'], 19: ['Cultivos anuales', '#c27ba0'],
    21: ['Mosaico de agricultura y pastura', '#ffefc3'], 22: ['Área sin vegetación', '#d4271e'], 23: ['Playa, duna o arenal', '#ffa07a'], 24: ['Infraestructura urbana', '#d4271e'],
    25: ['Otra área sin vegetación', '#db4d4f'], 26: ['Cuerpo de agua', '#2532e4'], 27: ['No observado', '#ffffff'], 29: ['Afloramiento rocoso', '#ffaa5f'], 30: ['Minería', '#9c0027'],
    31: ['Acuicultura', '#091077'], 32: ['Salina', '#fc8114'], 33: ['Río, lago u océano', '#2532e4'], 34: ['Glaciar / nieve', '#93dfe6'], 36: ['Cultivos perennes', '#d082de'],
    39: ['Soja', '#f5b3c8'], 41: ['Otros cultivos anuales', '#f54ca9'], 43: ['Pastizal cerrado', '#c6c746'], 44: ['Pastizal abierto', '#d6bc74'], 45: ['Arbustal', '#807a40'], 66: ['Estepa', '#a89358'],
  } },
  worldcover: { name: 'ESA WorldCover 10 m', map: {
    10: ['Arbolado', '#006400'], 20: ['Arbustal', '#ffbb22'], 30: ['Pastizal', '#ffff4c'], 40: ['Cultivos', '#f096ff'], 50: ['Área construida', '#fa0000'], 60: ['Suelo desnudo o vegetación escasa', '#b4b4b4'],
    70: ['Nieve y hielo', '#f0f0f0'], 80: ['Agua permanente', '#0064c8'], 90: ['Humedal herbáceo', '#0096a0'], 95: ['Manglar', '#00cf75'], 100: ['Musgos y líquenes', '#fae6a0'],
  } },
  esri: { name: 'Esri / Impact Observatory (cobertura 10 m)', map: {
    1: ['Agua', '#419bdf'], 2: ['Árboles', '#397d49'], 4: ['Vegetación inundada', '#7a87c6'], 5: ['Cultivos', '#e49635'], 7: ['Área construida', '#c4281b'], 8: ['Suelo desnudo', '#a59b8f'],
    9: ['Nieve y hielo', '#a8ebff'], 10: ['Nubes', '#616161'], 11: ['Pastizal y arbustal', '#e3e2c3'],
  } },
  dynamicworld: { name: 'Dynamic World (Google)', map: {
    0: ['Agua', '#419bdf'], 1: ['Árboles', '#397d49'], 2: ['Pastizal', '#88b053'], 3: ['Vegetación inundada', '#7a87c6'], 4: ['Cultivos', '#e49635'], 5: ['Arbustal y matorral', '#dfc35a'],
    6: ['Área construida', '#c4281b'], 7: ['Suelo desnudo', '#a59b8f'], 8: ['Nieve y hielo', '#b39fe1'],
  } },
};

// ---------- lectura ----------
// Abre el GeoTIFF y describe lo que trae, sin leer todavía los píxeles
export async function inspectTiff(file, { tfw = null, prj = null } = {}) {
  const tiff = await fromBlob(file);
  const count = await tiff.getImageCount();
  const image = await tiff.getImage(0);
  const W = image.getWidth(), H = image.getHeight(), bands = image.getSamplesPerPixel();
  let extent = null;
  try { extent = image.getBoundingBox(); } catch (e) { extent = null; }
  if ((!extent || extent.some((v) => !Number.isFinite(v))) && tfw) extent = worldFileExtent(tfw, W, H);
  if (!extent) throw new Error('el archivo no trae georreferencia (no es un GeoTIFF). Exportalo desde QGIS como GeoTIFF o sumá su archivo .tfw');
  if (extent[0] > extent[2]) extent = [extent[2], extent[1], extent[0], extent[3]];
  if (extent[1] > extent[3]) extent = [extent[0], extent[3], extent[2], extent[1]];
  const crs = crsOfImage(image);
  if (!crs.code && prj) crs.code = crsFromWkt(prj);
  const fd = image.fileDirectory || {};
  const fmt = Array.isArray(fd.SampleFormat) || ArrayBuffer.isView(fd.SampleFormat) ? fd.SampleFormat[0] : (fd.SampleFormat || 1);
  const bits = Array.isArray(fd.BitsPerSample) || ArrayBuffer.isView(fd.BitsPerSample) ? fd.BitsPerSample[0] : (fd.BitsPerSample || 8);
  let nodata = null;
  try { nodata = image.getGDALNoData(); } catch (e) { nodata = null; }
  const k = Math.min(1, MAX_SIDE / Math.max(W, H));
  const outW = Math.max(1, Math.round(W * k)), outH = Math.max(1, Math.round(H * k));
  // una vista general (overview) del propio archivo ahorra leerlo entero
  let src = image, level = 0;
  for (let i = 1; i < count; i++) {
    try {
      const im = await tiff.getImage(i);
      if (im.getSamplesPerPixel() !== bands) continue;
      if (im.getWidth() >= outW && im.getWidth() < src.getWidth()) { src = im; level = i; }
    } catch (e) { /* máscara u otra página */ }
  }
  return {
    tiff, image, src, level, W, H, outW, outH, bands, extent, crs, bits, float: fmt === 3, signed: fmt === 2, nodata: nodata != null && Number.isFinite(Number(nodata)) ? Number(nodata) : null,
    colorMap: fd.ColorMap || null, photometric: fd.PhotometricInterpretation, alphaBand: fd.ExtraSamples && bands === 4 ? 3 : (bands === 2 ? 1 : -1),
  };
}

// Lee las bandas pedidas ya reducidas al tamaño de trabajo (por tiras, para no cargar el archivo entero en memoria)
async function readBands(info, samples) {
  const { src, outW, outH } = info;
  const sw = src.getWidth(), sh = src.getHeight();
  const out = samples.map(() => new Float32Array(outW * outH));
  const rowsPerStrip = Math.max(16, Math.floor(6e6 / sw));
  let oy = 0;
  while (oy < outH) {
    const y0 = Math.floor((oy * sh) / outH);
    const oyEnd = Math.min(outH, Math.max(oy + 1, Math.floor(((y0 + rowsPerStrip) * outH) / sh)));
    const y1 = Math.min(sh, Math.max(y0 + 1, Math.ceil((oyEnd * sh) / outH)));
    const r = await src.readRasters({ window: [0, y0, sw, y1], width: outW, height: oyEnd - oy, samples, resampleMethod: 'nearest', interleave: false });
    for (let b = 0; b < samples.length; b++) out[b].set(r[b], oy * outW);
    oy = oyEnd;
  }
  return out;
}
function percentiles(arr, isNo, lo = 0.02, hi = 0.98) {
  const step = Math.max(1, Math.floor(arr.length / 200000));
  const s = [];
  for (let i = 0; i < arr.length; i += step) { const v = arr[i]; if (Number.isFinite(v) && !isNo(v)) s.push(v); }
  if (!s.length) return { min: 0, max: 1, p2: 0, p98: 1, n: 0 };
  s.sort((a, b) => a - b);
  return { min: s[0], max: s[s.length - 1], p2: s[Math.floor(lo * (s.length - 1))], p98: s[Math.floor(hi * (s.length - 1))], n: s.length };
}

// Mira una banda para proponer si son clases o valores continuos
export async function sampleBand(info, band = 0) {
  const k = Math.min(1, 700 / Math.max(info.outW, info.outH));
  const small = { ...info, outW: Math.max(1, Math.round(info.outW * k)), outH: Math.max(1, Math.round(info.outH * k)) };
  const [d] = await readBands(small, [band]);
  const isNo = noDataTest(info);
  const uniq = new Map();
  let integer = true;
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (!Number.isFinite(v) || isNo(v)) continue;
    if (integer && v !== Math.round(v)) integer = false;
    if (uniq.size <= 300) uniq.set(v, (uniq.get(v) || 0) + 1);
  }
  const st = percentiles(d, isNo);
  return { integer, unique: uniq.size, values: [...uniq.keys()].sort((a, b) => a - b), stats: st, categorical: integer && uniq.size > 0 && uniq.size <= 64 };
}
function noDataTest(info) {
  const nd = info.nodata;
  return nd == null ? () => false : (v) => v === nd || (Math.abs(nd) > 1e30 && Math.abs(v) > 1e30);
}
const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Superficie en m² de un píxel de la imagen reducida (aproximada en coordenadas geográficas)
function pixelArea(info, code) {
  const dx = (info.extent[2] - info.extent[0]) / info.outW, dy = (info.extent[3] - info.extent[1]) / info.outH;
  if (code === 'EPSG:4326') { const lat = (info.extent[1] + info.extent[3]) / 2; return dx * 111320 * Math.cos((lat * Math.PI) / 180) * dy * 110540; }
  if (code === 'EPSG:3857') { const lat = bboxToLonLat(info.extent, code); const k = Math.cos((((lat[1] + lat[3]) / 2) * Math.PI) / 180); return dx * dy * k * k; }
  return dx * dy;
}

// Color verdadero o falso color con tres bandas. stretch: 'p2' (percentiles 2–98), 'minmax' o 'none' (los valores ya son 0–255)
export async function renderRgb(info, { r = 0, g = 1, b = 2, stretch = 'p2' } = {}) {
  const useAlpha = info.alphaBand >= 0 && ![r, g, b].includes(info.alphaBand);
  const data = await readBands(info, useAlpha ? [r, g, b, info.alphaBand] : [r, g, b]);
  const isNo = noDataTest(info);
  const st = data.slice(0, 3).map((d) => percentiles(d, (v) => isNo(v)));
  const lim = st.map((s) => (stretch === 'none' ? [0, 255] : stretch === 'minmax' ? [s.min, s.max] : [s.p2, s.p98])).map(([a, c]) => (c > a ? [a, c] : [a, a + 1]));
  const n = info.outW * info.outH;
  const c = canvasOf(info.outW, info.outH);
  const x = c.getContext('2d');
  const img = x.createImageData(info.outW, info.outH);
  const px = img.data;
  for (let i = 0; i < n; i++) {
    const R = data[0][i], G = data[1][i], B = data[2][i];
    const o = i * 4;
    const empty = !Number.isFinite(R) || (isNo(R) && isNo(G) && isNo(B)) || (useAlpha && data[3][i] === 0) || (info.nodata == null && !useAlpha && R === 0 && G === 0 && B === 0);
    if (empty) { px[o + 3] = 0; continue; }
    px[o] = ((R - lim[0][0]) / (lim[0][1] - lim[0][0])) * 255;
    px[o + 1] = ((G - lim[1][0]) / (lim[1][1] - lim[1][0])) * 255;
    px[o + 2] = ((B - lim[2][0]) / (lim[2][1] - lim[2][0])) * 255;
    px[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { blob: await toBlob(c), w: info.outW, h: info.outH, labels: false, classes: null, detail: `bandas ${r + 1}-${g + 1}-${b + 1}${stretch === 'p2' ? ', realce por percentiles 2–98' : stretch === 'minmax' ? ', realce de mínimo a máximo' : ''}` };
}

// Una banda de valores continuos como degradado (sin leyenda de clases)
export async function renderRamp(info, { band = 0, ramp = 'viridis', min = null, max = null } = {}) {
  const [d] = await readBands(info, [band]);
  const isNo = noDataTest(info);
  const st = percentiles(d, isNo);
  const lo = min != null ? min : st.p2, hi = max != null && max > lo ? max : (st.p98 > lo ? st.p98 : lo + 1);
  const lut = Array.from({ length: 256 }, (_, i) => rampColor(ramp, i / 255));
  const c = canvasOf(info.outW, info.outH);
  const x = c.getContext('2d');
  const img = x.createImageData(info.outW, info.outH);
  const px = img.data;
  for (let i = 0; i < d.length; i++) {
    const v = d[i], o = i * 4;
    if (!Number.isFinite(v) || isNo(v)) { px[o + 3] = 0; continue; }
    const col = lut[Math.max(0, Math.min(255, Math.round(((v - lo) / (hi - lo)) * 255)))];
    px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { blob: await toBlob(c), w: info.outW, h: info.outH, labels: false, classes: null, range: [lo, hi], detail: `banda ${band + 1}, degradado de ${fmtV(lo)} a ${fmtV(hi)}` };
}
const fmtV = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('es-AR') : Math.abs(v) >= 10 ? v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : v.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

// Una banda de valores continuos partida en intervalos: cada intervalo es una clase con su entrada en la leyenda
export async function renderIntervals(info, { band = 0, ramp = 'viridis', n = 6, how = 'equal', code } = {}) {
  const [d] = await readBands(info, [band]);
  const isNo = noDataTest(info);
  const st = percentiles(d, isNo);
  let breaks = [];
  if (how === 'quantile') {
    const step = Math.max(1, Math.floor(d.length / 200000));
    const s = [];
    for (let i = 0; i < d.length; i += step) { const v = d[i]; if (Number.isFinite(v) && !isNo(v)) s.push(v); }
    s.sort((a, b) => a - b);
    for (let k = 1; k < n; k++) breaks.push(s[Math.floor((k / n) * (s.length - 1))]);
    breaks = [...new Set(breaks)];
  } else {
    const lo = st.p2, hi = st.p98 > st.p2 ? st.p98 : st.p2 + 1;
    for (let k = 1; k < n; k++) breaks.push(lo + ((hi - lo) * k) / n);
  }
  const m = breaks.length + 1;
  const labels = new Uint8Array(d.length);
  const counts = new Array(m).fill(0);
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (!Number.isFinite(v) || isNo(v)) continue;
    let k = 0;
    while (k < breaks.length && v >= breaks[k]) k++;
    labels[i] = k + 1; counts[k]++;
  }
  const pa = pixelArea(info, code);
  const classes = counts.map((cnt, k) => ({
    id: k + 1, name: k === 0 ? `menos de ${fmtV(breaks[0])}` : k === m - 1 ? `${fmtV(breaks[k - 1])} o más` : `${fmtV(breaks[k - 1])} a ${fmtV(breaks[k])}`,
    color: rgbHex(...rampColor(ramp, m === 1 ? 0.5 : k / (m - 1))), show: true, area: cnt * pa,
  }));
  return { blob: await labelsBlob(labels, info.outW, info.outH), w: info.outW, h: info.outH, labels: true, classes, detail: `banda ${band + 1} en ${m} intervalos ${how === 'quantile' ? 'de igual cantidad de píxeles' : 'iguales'}` };
}

// Clasificación: cada valor entero es una clase
export async function renderClasses(info, { band = 0, scheme = 'auto', code } = {}) {
  const [d] = await readBands(info, [band]);
  const isNo = noDataTest(info);
  const idOf = new Map();
  const counts = [];
  const labels = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (!Number.isFinite(v) || isNo(v)) continue;
    let id = idOf.get(v);
    if (!id) {
      if (idOf.size >= 254) throw new Error('la banda tiene más de 254 valores distintos: no es una clasificación. Importala como valores continuos');
      id = idOf.size + 1; idOf.set(v, id); counts.push(0);
    }
    labels[i] = id; counts[id - 1]++;
  }
  if (!idOf.size) throw new Error('la banda no tiene datos válidos');
  // se reordena por valor para que la leyenda salga en el orden de la clasificación
  const order = [...idOf.entries()].sort((a, b) => a[0] - b[0]);
  const remap = new Uint8Array(order.length + 1);
  order.forEach(([, oldId], i) => { remap[oldId] = i + 1; });
  for (let i = 0; i < labels.length; i++) if (labels[i]) labels[i] = remap[labels[i]];
  const pa = pixelArea(info, code);
  const map = (CLASS_SCHEMES[scheme] || {}).map;
  const cm = info.colorMap;
  const classes = order.map(([v, oldId], i) => {
    const known = map && map[v];
    let color = known ? known[1] : AUTO[i % AUTO.length];
    if (!known && cm && v >= 0 && v < cm.length / 3) color = rgbHex(cm[v] / 257, cm[v + cm.length / 3] / 257, cm[v + (2 * cm.length) / 3] / 257);
    return { id: i + 1, value: v, name: known ? known[0] : `Clase ${v}`, color, show: !(known && /no observado/i.test(known[0])), area: counts[oldId - 1] * pa };
  });
  return { blob: await labelsBlob(labels, info.outW, info.outH), w: info.outW, h: info.outH, labels: true, classes, detail: `${classes.length} clases` };
}
function labelsBlob(labels, w, h) {
  const c = canvasOf(w, h);
  const x = c.getContext('2d');
  const img = x.createImageData(w, h);
  for (let i = 0; i < labels.length; i++) { const v = labels[i], o = i * 4; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255; }
  x.putImageData(img, 0, 0);
  return toBlob(c);
}

// ---------- archivo de georreferencia (.tfw, .pgw, .jgw, .wld) ----------
export function parseWorldFile(text) {
  const v = String(text).trim().split(/\s+/).map((x) => Number(x.replace(',', '.')));
  if (v.length < 6 || v.slice(0, 6).some((x) => !Number.isFinite(x))) throw new Error('el archivo de georreferencia no tiene seis números');
  return { a: v[0], d: v[1], b: v[2], e: v[3], c: v[4], f: v[5] };
}
export function worldFileExtent(wf, w, h) {
  if (Math.abs(wf.b) > 1e-9 || Math.abs(wf.d) > 1e-9) throw new Error('la imagen está rotada en su archivo de georreferencia: exportala desde QGIS con el norte arriba');
  const x0 = wf.c - wf.a / 2, y1 = wf.f - wf.e / 2;
  const x1 = x0 + wf.a * w, y0 = y1 + wf.e * h;
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

// ---------- archivos .zip y .kmz sin bibliotecas ----------
export async function unzip(buffer) {
  const dv = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('el archivo comprimido está dañado');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true);
    const start = off + 30 + lnl + lel;
    const raw = u8.subarray(start, start + csize);
    if (!name.endsWith('/')) {
      let data;
      if (method === 0) data = raw.slice();
      else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else throw new Error('el archivo comprimido usa un método que no se puede leer en el navegador');
      out.push({ name, data });
    }
    p += 46 + nl + el + cl;
  }
  return out;
}
