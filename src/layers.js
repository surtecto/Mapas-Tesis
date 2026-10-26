// Fábrica de capas OpenLayers a partir del estado
import TileLayer from 'ol/layer/Tile.js';
import ImageLayer from 'ol/layer/Image.js';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import TileWMS from 'ol/source/TileWMS.js';
import TileArcGISRest from 'ol/source/TileArcGISRest.js';
import VectorSource from 'ol/source/Vector.js';
import RasterSource from 'ol/source/Raster.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import { createXYZ, extentFromProjection } from 'ol/tilegrid.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import EsriJSON from 'ol/format/EsriJSON.js';
import { bbox as bboxStrategy, all as allStrategy } from 'ol/loadingstrategy.js';
import { transformExtent, addProjection, addCoordinateTransforms, get as getProjectionOl } from 'ol/proj.js';
import Projection from 'ol/proj/Projection.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import Feature from 'ol/Feature.js';
import { Style, Stroke, Fill, Text } from 'ol/style.js';
import { getRenderPixel } from 'ol/render.js';
import { getDef, defOf, RAMPS } from './catalog.js';
import { swapCoords, serverError } from './services.js';
import { landcoverRenderingRule, yearTime, paintLabels } from './imagery.js';
import { cacheGet, cachePut, gridTiles, FRESH_MS } from './layercache.js';
import { EMBEDDED } from './embedded.js';
import { ensureIds, featureKey } from './features.js';

// agrega objetos sin repetir: los que traen id los descarta OpenLayers; los que no, por su huella de atributos
function addUnique(src, feats) {
  if (!src._keys) src._keys = new Set(src.getFeatures().filter((f) => f.getId() == null).map(featureKey));
  const out = [];
  for (const f of feats) {
    if (f.getId() != null) { out.push(f); continue; }
    const k = featureKey(f);
    if (src._keys.has(k)) continue;
    src._keys.add(k); out.push(f);
  }
  src.addFeatures(out);
  return out;
}
import { makeVectorStyleFn, drawSymbol, drawDecoratedLine, getPattern, dashArray, dashCap, fontString } from './styles.js';
import { hexToRgb, rgba, PT_MM } from './util.js';
import { lonLatTo, toLonLatFrom, metersPerUnit } from './projections.js';
import { fitModel, modelHash } from './georef.js';
import { peekImage, processedReady, processedUrl, getImage } from './imagestore.js';
import { CERTAINTY } from './state.js';

const geojson = new GeoJSON();
const esrijson = new EsriJSON();

// ---------- caché de datos ----------
const dataCache = new Map(); // url -> Promise<GeoJSON object>
export function fetchGeoJSON(url) {
  if (EMBEDDED[url]) return Promise.resolve(EMBEDDED[url]);
  if (!dataCache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => dataCache.delete(url));
    dataCache.set(url, p);
  }
  return dataCache.get(url);
}

export function wfsUrl(def) {
  const p = new URLSearchParams({
    service: 'WFS', version: '1.1.0', request: 'GetFeature', typeName: def.typeName,
    outputFormat: 'application/json', srsName: 'EPSG:4326', bbox: `${def.bbox},EPSG:4326`,
  });
  return `${def.url}?${p.toString()}`;
}

// ---------- geometrías de referencia ----------
export function obliquityDeg(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  return 23.439279444 - 0.013010213 * T - 5.086e-8 * T * T + 5.565e-7 * T * T * T;
}

export function generatedGeoJSON(gen, projCode) {
  const minLat = projCode === 'EPSG:3857' ? -85 : -90;
  const feats = [];
  if (gen === 'sector') {
    const ring = [];
    for (let lon = -74; lon <= -25; lon += 0.5) ring.push([lon, -60]);
    for (let lat = -60.5; lat >= minLat; lat -= 0.5) ring.push([-25, lat]);
    for (let lon = -25.5; lon >= -74; lon -= 0.5) ring.push([lon, minLat]);
    for (let lat = minLat + 0.5; lat <= -60; lat += 0.5) ring.push([-74, lat]);
    ring.push(ring[0]);
    feats.push({ type: 'Feature', properties: { nombre: 'Sector Antártico Argentino' }, geometry: { type: 'Polygon', coordinates: [ring] } });
  } else if (gen === 'parallel60' || gen === 'polarCircle') {
    const lat = gen === 'parallel60' ? -60 : -(90 - obliquityDeg());
    const line = [];
    if (projCode === 'EPSG:3857' || projCode === 'EPSG:4326') {
      for (let lon = -180; lon <= 180; lon += 1) line.push([lon, lat]);
    } else {
      for (let lon = -180; lon <= 180; lon += 0.5) line.push([lon, lat]);
    }
    feats.push({ type: 'Feature', properties: { nombre: gen === 'parallel60' ? 'Paralelo 60°S' : 'Círculo Polar Antártico', lat }, geometry: { type: 'LineString', coordinates: line } });
  }
  return { type: 'FeatureCollection', features: feats };
}

export function sectorRingLonLat(projCode) {
  return generatedGeoJSON('sector', projCode).features[0].geometry.coordinates[0];
}

function readFeatures(obj, projCode) {
  const feats = geojson.readFeatures(obj, { dataProjection: 'EPSG:4326', featureProjection: projCode });
  if (projCode === 'EPSG:3857') {
    // descarta geometrías que se van a infinito cerca del polo
    return feats.filter((f) => {
      const g = f.getGeometry();
      if (!g) return false;
      const e = g.getExtent();
      return e.every((v) => Number.isFinite(v));
    });
  }
  return feats;
}

// ---------- fuentes ráster compartidas ----------
const rasterSources = new Map();
function cacheKey(ls, extra = '') { return `${ls.uid}:${ls.rev}:${extra}`; }

// Las fajas POSGAR y Campo Inchauspe no van en la lista: en WMS 1.3.0 GeoServer espera el eje Norte primero
// para esos códigos; se piden en Mercator y OpenLayers las reproyecta.
const IGN_WMS_PROJ = ['EPSG:3857', 'EPSG:3031', 'EPSG:4326', 'EPSG:6932', 'EPSG:32720', 'EPSG:32721'];

function wmsRequestProjection(def, mapProj) {
  const list = def.wmsProjections || IGN_WMS_PROJ;
  if (list.includes(mapProj)) return mapProj;
  if (list.includes('EPSG:3031') && /^CONI:/.test(mapProj)) return 'EPSG:4326';
  // fuera de las polares, pedir en Mercator y reproyectar suele dar teselas más nítidas que en geográficas
  if (list.includes('EPSG:3857') && !/^(EPSG:3031|EPSG:6932|CONI:)/.test(mapProj)) return 'EPSG:3857';
  return list.includes('EPSG:4326') ? 'EPSG:4326' : list[0];
}

function makeTileGrid(g) {
  return new TileGrid({ origin: g.origin, resolutions: g.resolutions, tileSize: g.tileSize, extent: g.extent });
}

function getRasterSource(ls, def, mctx) {
  const mapProj = mctx.projection;
  if (def.type === 'xyz') {
    const key = cacheKey(ls, 'xyz');
    if (!rasterSources.has(key)) {
      rasterSources.set(key, new XYZ({
        url: def.url, projection: def.projection || 'EPSG:3857', crossOrigin: 'anonymous', maxZoom: def.maxZoom || 19,
        tileGrid: def.tileGrid ? makeTileGrid(def.tileGrid) : undefined, attributions: def.attribution, transition: 0,
      }));
    }
    return rasterSources.get(key);
  }
  if (def.type === 'gibs-date') {
    const date = (ls.params && ls.params.date) || '2026-01-15';
    const polar = mapProj !== 'EPSG:3857' && mapProj !== 'EPSG:4326' && !/^EPSG:327/.test(mapProj);
    const key = cacheKey(ls, `gibs|${date}|${polar}`);
    if (!rasterSources.has(key)) {
      const src = polar
        ? new XYZ({ url: `https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/${def.layer}/default/${date}/250m/{z}/{y}/{x}.jpg`, projection: 'EPSG:3031', tileGrid: makeTileGrid(def.tileGrid), crossOrigin: 'anonymous', attributions: def.attribution, transition: 0 })
        : new XYZ({ url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${def.layer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, projection: 'EPSG:3857', maxZoom: 9, crossOrigin: 'anonymous', attributions: def.attribution, transition: 0 });
      rasterSources.set(key, src);
    }
    return rasterSources.get(key);
  }
  if (def.type === 'wms') {
    const reqProj = wmsRequestProjection(def, mapProj);
    const key = cacheKey(ls, `wms|${reqProj}`);
    if (!rasterSources.has(key)) {
      rasterSources.set(key, new TileWMS({
        url: def.url, params: { LAYERS: def.layers, FORMAT: 'image/png', TRANSPARENT: true, VERSION: '1.3.0', STYLES: def.styles || '' },
        // los servidores sin CORS se pueden ver, pero no leer: esas capas quedan fuera de la exportación
        projection: reqProj, crossOrigin: def.noCors ? undefined : 'anonymous', attributions: def.attribution, tileGrid: undefined, transition: 0, gutter: 0,
      }));
    }
    return rasterSources.get(key);
  }
  if (def.type === 'svc-image' || def.type === 'svc-landcover') {
    // imágenes por fecha (bloqueo de escenas) y coberturas con paleta propia (función Colormap del servidor)
    const reqProj = /^(EPSG:3031|EPSG:6932)$/.test(mapProj) ? mapProj : 'EPSG:3857';
    const params = def.type === 'svc-image'
      ? { renderingRule: JSON.stringify({ rasterFunction: def.render }), ...(def.mosaic ? { mosaicRule: JSON.stringify(def.mosaic) } : {}), format: 'jpgpng', interpolation: 'RSP_BilinearInterpolation' }
      : { renderingRule: JSON.stringify(landcoverRenderingRule(def.classes)), time: yearTime(def.year), format: 'png32', interpolation: 'RSP_NearestNeighbor' };
    const key = cacheKey(ls, `${def.type}|${reqProj}|${JSON.stringify(params)}`);
    if (!rasterSources.has(key)) {
      rasterSources.set(key, new TileArcGISRest({
        url: def.url, params, projection: reqProj, crossOrigin: 'anonymous', attributions: def.attribution, transition: 0,
        tileGrid: createXYZ({ extent: extentFromProjection(reqProj), tileSize: 512, maxZoom: 22 }),
      }));
    }
    return rasterSources.get(key);
  }
  if (def.type === 'arcgis-image') {
    const reqProj = /^EPSG:(3031|3857|6932|32720|32721)$/.test(mapProj) ? mapProj : 'EPSG:3031';
    const fn = (ls.params && ls.params.fn) || def.functions[0][0];
    const key = cacheKey(ls, `img|${reqProj}|${fn}`);
    if (!rasterSources.has(key)) {
      rasterSources.set(key, new TileArcGISRest({
        url: def.url, params: { renderingRule: JSON.stringify({ rasterFunction: fn }), format: 'png32', interpolation: 'RSP_BilinearInterpolation' }, projection: reqProj,
        crossOrigin: 'anonymous', attributions: def.attribution, transition: 0,
        tileGrid: createXYZ({ extent: extentFromProjection(reqProj), tileSize: 512, maxZoom: 22 }),
      }));
    }
    return rasterSources.get(key);
  }
  if (def.type === 'arcgis') {
    const reqProj = /^EPSG:(3031|3857|6932|32720|32721)$/.test(mapProj) ? mapProj : 'EPSG:3031';
    const key = cacheKey(ls, `arcgis|${reqProj}`);
    if (!rasterSources.has(key)) {
      rasterSources.set(key, new TileArcGISRest({
        url: def.url, params: { ...def.params }, projection: reqProj,
        crossOrigin: 'anonymous', attributions: def.attribution, transition: 0,
      }));
    }
    return rasterSources.get(key);
  }
  return null;
}

// ---------- DEM analítico ----------
function rampTable(rampId) {
  const r = RAMPS[rampId] || RAMPS.hipsometrica;
  const conv = (stops) => stops.map(([t, c]) => [t, ...hexToRgb(c)]);
  return r.all ? { all: conv(r.all) } : { sea: conv(r.sea), land: conv(r.land) };
}

function demOperation(inputs, data) {
  const img = inputs[0];
  const w = img.width, h = img.height, src = img.data;
  const out = new Uint8ClampedArray(src.length);
  const n = w * h;
  const el = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    el[i] = src[o + 3] === 0 ? NaN : src[o] * 256 + src[o + 1] + src[o + 2] / 256 - 32768;
  }
  function lerpStops(stops, t) {
    if (t <= stops[0][0]) return stops[0];
    for (let k = 1; k < stops.length; k++) {
      if (t <= stops[k][0]) {
        const a = stops[k - 1], b = stops[k];
        const f = (t - a[0]) / (b[0] - a[0] || 1);
        return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
      }
    }
    return stops[stops.length - 1];
  }
  const dp = data.mPerPx * 2;
  const az = (data.azimuth * Math.PI) / 180, alt = (data.altitude * Math.PI) / 180;
  const zf = data.zFactor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      const z = el[i];
      if (Number.isNaN(z)) { out[o + 3] = 0; continue; }
      let c;
      if (data.ramp.all) {
        const t = (z - data.min) / (data.max - data.min);
        c = lerpStops(data.ramp.all, Math.max(0, Math.min(1, t)));
      } else if (z < 0) {
        const t = data.min < 0 ? (z - data.min) / (0 - data.min) : 1;
        c = lerpStops(data.ramp.sea, Math.max(0, Math.min(1, t)));
      } else {
        const t = data.max > 0 ? z / data.max : 0;
        c = lerpStops(data.ramp.land, Math.max(0, Math.min(1, t)));
      }
      let r = c[1], g = c[2], b = c[3];
      if (data.shade && dp > 0) {
        const xl = x > 0 ? el[i - 1] : z, xr = x < w - 1 ? el[i + 1] : z;
        const yu = y > 0 ? el[i - w] : z, yd = y < h - 1 ? el[i + w] : z;
        const dzdx = ((Number.isNaN(xr) ? z : xr) - (Number.isNaN(xl) ? z : xl)) / dp;
        const dzdy = ((Number.isNaN(yu) ? z : yu) - (Number.isNaN(yd) ? z : yd)) / dp;
        const slope = Math.atan(zf * Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        const aspect = Math.atan2(dzdy, -dzdx);
        let cosInc = Math.sin(alt) * Math.cos(slope) + Math.cos(alt) * Math.sin(slope) * Math.cos(az - Math.PI / 2 - aspect);
        cosInc = Math.max(0, cosInc);
        const k = 1 - data.shadeStrength + data.shadeStrength * cosInc * 1.25;
        r *= k; g *= k; b *= k;
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b;
      out[o + 3] = data.transparentSea && z < 0 ? 0 : 255;
    }
  }
  return { data: out, width: w, height: h };
}

function buildDemLayer(ls, def, mctx, className) {
  const key = cacheKey(ls, 'terrarium');
  let elev = rasterSources.get(key);
  if (!elev) {
    elev = new XYZ({ url: def.url, projection: 'EPSG:3857', maxZoom: def.maxZoom || 13, crossOrigin: 'anonymous', interpolate: false, transition: 0, attributions: def.attribution });
    rasterSources.set(key, elev);
  }
  const raster = new RasterSource({ sources: [elev], operationType: 'image', operation: demOperation, threads: 0 });
  raster.on('beforeoperations', (e) => {
    const cur = mctx.getLayerState(ls.uid) || ls;
    const p = cur.params || {};
    const view = mctx.map && mctx.map.getView();
    let mPer = 1;
    try { mPer = metersPerUnit(mctx.projection, view.getCenter()); } catch (err) { mPer = 1; }
    e.data.mPerPx = e.resolution * mPer;
    e.data.ramp = rampTable(p.ramp);
    e.data.min = Number(p.min); e.data.max = Number(p.max);
    e.data.shade = !!p.shade; e.data.azimuth = Number(p.azimuth); e.data.altitude = Number(p.altitude);
    e.data.zFactor = Number(p.zFactor); e.data.shadeStrength = Number(p.shadeStrength);
    e.data.transparentSea = !!p.transparentSea;
  });
  return new ImageLayer({ source: raster, className });
}

// ---------- capas vectoriales ----------
function vectorSourceFromPromise(promiseFactory, projCode, onError) {
  const src = new VectorSource({ wrapX: false });
  src._loading = true;
  promiseFactory().then((obj) => {
    src.addFeatures(readFeatures(obj, projCode));
    src._loading = false;
    src.dispatchEvent('cm-loaded');
  }).catch((err) => {
    src._loading = false;
    src._error = err;
    if (onError) onError(err);
    src.dispatchEvent('cm-error');
  });
  return src;
}

const vectorSources = new Map();
function getStaticVectorSource(ls, def, mctx) {
  const proj = mctx.projection;
  let key, factory;
  if (def.type === 'geojson') { key = `${def.url}|${proj}`; factory = () => fetchGeoJSON(def.url); }
  else if (def.type === 'wfs') { const u = wfsUrl(def); key = `${u}|${proj}`; factory = () => fetchGeoJSON(u); }
  else if (def.type === 'geojson-multi') {
    key = `${def.id}|${proj}`;
    factory = () => Promise.all(def.urls.map((u) => fetchGeoJSON(u))).then((arr) => ({ type: 'FeatureCollection', features: arr.flatMap((g) => g.features || []) }));
  }
  else if (def.type === 'generated') { key = `gen:${def.gen}|${proj}`; factory = () => Promise.resolve(generatedGeoJSON(def.gen, proj)); }
  else return null;
  if (!vectorSources.has(key)) vectorSources.set(key, vectorSourceFromPromise(factory, proj, (e) => mctx.onLayerError && mctx.onLayerError(ls, e)));
  return vectorSources.get(key);
}

// Costa ADD: carga por extensión con generalización según la escala
function buildEsriFeatureSource(ls, def, mctx) {
  const src = new VectorSource({
    wrapX: false,
    strategy: bboxStrategy,
    loader(extent, resolution, projection, success, failure) {
      const pr = mctx.pixelRatio || 1;
      const center = mctx.map ? mctx.map.getView().getCenter() : [0, 0];
      let mPerPx = resolution;
      try { mPerPx = resolution * metersPerUnit(mctx.projection, center); } catch (e) { /* noop */ }
      mPerPx /= pr;
      const useHigh = mPerPx < 120;
      const url = useHigh ? def.urls.high : def.urls.medium;
      let ext3031;
      try { ext3031 = transformExtent(extent, projection, 'EPSG:3031', 16); } catch (e) { ext3031 = [-4.5e6, -4.5e6, 4.5e6, 4.5e6]; }
      const lim = 4.6e6;
      ext3031 = [Math.max(-lim, ext3031[0]), Math.max(-lim, ext3031[1]), Math.min(lim, ext3031[2]), Math.min(lim, ext3031[3])];
      if (!(ext3031[2] > ext3031[0] && ext3031[3] > ext3031[1]) || ext3031.some((v) => !Number.isFinite(v))) { success([]); return; }
      const offset = Math.max(1, mPerPx * 0.6);
      const outSR = /^EPSG:(3031|3857|32720|32721|6932)$/.test(mctx.projection) ? mctx.projection.split(':')[1] : '4326';
      const fetchPage = async (offsetIdx) => {
        const p = new URLSearchParams({
          where: '1=1', geometry: ext3031.join(','), geometryType: 'esriGeometryEnvelope', inSR: '3031', spatialRel: 'esriSpatialRelIntersects',
          outFields: 'surface', outSR, maxAllowableOffset: String(outSR === '4326' ? offset / 111000 : offset), f: 'json',
          resultOffset: String(offsetIdx), resultRecordCount: '2000',
        });
        const r = await fetch(`${url}/query?${p.toString()}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      };
      src._pend = (src._pend || 0) + 1;
      src._loading = true;
      (async () => {
        try {
          let all = [];
          let off = 0;
          for (let guard = 0; guard < 12; guard++) {
            const j = await fetchPage(off);
            if (j.error) throw new Error(j.error.message);
            const feats = esrijson.readFeatures(j, { dataProjection: outSR === '4326' ? 'EPSG:4326' : `EPSG:${outSR}`, featureProjection: mctx.projection });
            all = all.concat(feats);
            if (!j.exceededTransferLimit) break;
            off += (j.features || []).length || 2000;
          }
          src.addFeatures(all);
          success(all);
        } catch (err) {
          if (mctx.onLayerError) mctx.onLayerError(ls, err);
          failure();
        } finally {
          src._pend -= 1;
          src._loading = src._pend > 0;
        }
      })();
    },
  });
  // Recarga al cambiar mucho la escala (otra generalización / otra resolución de costa)
  let lastRes = null;
  src._onResolution = (res) => {
    if (lastRes && Math.abs(Math.log2(res / lastRes)) < 1.2) return;
    const first = lastRes === null;
    lastRes = res;
    if (!first) src.refresh();
  };
  return src;
}


// ---------- WFS del IGN pedido por la extensión de la vista ----------
// Solo carga a escalas de detalle (def.maxMpm: metros de terreno por mm de papel); a escala menor la capa queda en espera.
// ---------- pedidos robustos a servidores lentos ----------
// Reintenta ante 429/502/503/504 (servidor ocupado o vencido por tiempo) con espera creciente
export async function fetchRetry(url, { tries = 3, timeout = 0 } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    let r = null;
    const ctl = timeout ? new AbortController() : null;
    const tm = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    try { r = await fetch(url, ctl ? { signal: ctl.signal } : undefined); } catch (e) { last = e.name === 'AbortError' ? Object.assign(new Error(`el servidor no respondió en ${Math.round(timeout / 1000)} s`), { status: 504 }) : e; }
    if (tm) clearTimeout(tm);
    if (r && r.ok) return r;
    if (r) {
      last = new Error(r.status === 504 || r.status === 502 ? `el servidor tardó demasiado en responder (HTTP ${r.status})` : r.status === 503 || r.status === 429 ? `el servidor está ocupado (HTTP ${r.status})` : `HTTP ${r.status}`);
      last.status = r.status;
      if (![429, 502, 503, 504].includes(r.status)) throw last;
    }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 1500 * (i + 1) ** 2));
  }
  throw last;
}
// Parte una caja grande en pedidos más chicos (hasta 3 × 3): cada uno tarda menos en el servidor
function splitLL(ll, maxDeg = 0.4) {
  const nx = Math.min(3, Math.max(1, Math.ceil((ll[2] - ll[0]) / maxDeg)));
  const ny = Math.min(3, Math.max(1, Math.ceil((ll[3] - ll[1]) / maxDeg)));
  const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    out.push([ll[0] + ((ll[2] - ll[0]) * i) / nx, ll[1] + ((ll[3] - ll[1]) * j) / ny, ll[0] + ((ll[2] - ll[0]) * (i + 1)) / nx, ll[1] + ((ll[3] - ll[1]) * (j + 1)) / ny]);
  }
  return out;
}
// Lee una tesela del caché local; si no está, la pide. Si está vieja, la muestra igual y la renueva en segundo plano.
async function cachedJSON(key, url) {
  const cached = await cacheGet(key);
  const net = async () => {
    const r = await fetchRetry(url, { tries: 2, timeout: 30000 });
    const t = await r.text();
    if (t.trim().startsWith('<')) throw new Error(serverError(t));
    const obj = JSON.parse(t);
    if (!obj || !Array.isArray(obj.features)) throw new Error(obj && obj.error ? obj.error.message || 'error del servidor' : 'el servidor no devolvió objetos');
    cachePut(key, obj);
    return obj;
  };
  if (cached) {
    if (Date.now() - cached.t > FRESH_MS) net().catch(() => { /* el servidor sigue sin responder: queda lo guardado */ });
    return { obj: cached.obj, t: cached.t, cached: true };
  }
  return { obj: await net(), cached: false };
}

async function runPool(jobs, n = 3) {
  const results = new Array(jobs.length);
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (k < jobs.length) { const i = k++; try { results[i] = { ok: true, v: await jobs[i]() }; } catch (e) { results[i] = { ok: false, e }; } }
  }));
  return results;
}

// ---------- WFS del IGN pedido por la extensión de la vista ----------
// Solo carga a escalas de detalle (def.maxMpm: metros de terreno por mm de papel); a escala menor la capa queda en espera.
function buildWfsViewSource(ls, def, mctx) {
  const tilesDone = new Set();
  const src = new VectorSource({
    wrapX: false,
    strategy: bboxStrategy,
    loader(extent, resolution, projection, success, failure) {
      const center = mctx.map ? mctx.map.getView().getCenter() : [0, 0];
      let mpm = resolution;
      try { mpm = resolution * metersPerUnit(mctx.projection, center) * mctx.pxPerMm; } catch (e) { /* noop */ }
      const cur = mctx.getLayerState(ls.uid) || ls;
      const limit = (def.maxMpm || 1500) * (cur.params && cur.params.force ? 8 : 1);
      if (mpm > limit) { src._tooFar = true; src.dispatchEvent('cm-far'); failure(); return; }
      src._tooFar = false;
      let ll;
      try { ll = transformExtent(extent, projection, 'EPSG:4326', 16); } catch (e) { failure(); return; }
      ll = [Math.max(-180, ll[0]), Math.max(-90, ll[1]), Math.min(180, ll[2]), Math.min(90, ll[3])];
      if (!(ll[2] > ll[0] && ll[3] > ll[1])) { success([]); return; }
      // teselas fijas de la grilla: se pueden guardar y reutilizar aunque la vista cambie
      const tiles = gridTiles(ll, ll[2] - ll[0]).filter((t) => !tilesDone.has(t.id)).slice(0, 48);
      if (!tiles.length) { success([]); return; }
      tiles.forEach((t) => tilesDone.add(t.id));
      src._pend = (src._pend || 0) + 1;
      src._loading = true;
      const jobs = tiles.map((t) => () => {
        const p = new URLSearchParams({
          service: 'WFS', version: '1.1.0', request: 'GetFeature', typeName: def.typeName, outputFormat: 'application/json',
          srsName: 'EPSG:4326', bbox: `${t.b.join(',')},EPSG:4326`, maxFeatures: '5000',
        });
        return cachedJSON(`${def.url}|${def.typeName}|${t.id}`, `${def.url}?${p.toString()}`);
      });
      runPool(jobs, 3).then((results) => {
        const all = [];
        let failed = null;
        results.forEach((res, i) => {
          if (!res.ok) { failed = failed || res.e; tilesDone.delete(tiles[i].id); return; }
          const obj = res.v.obj;
          if ((obj.features || []).length >= 5000) src._truncated = true;
          if (res.v.cached) src._cachedAt = Math.min(src._cachedAt || Infinity, res.v.t);
          all.push(...readFeatures(obj, mctx.projection));
        });
        addUnique(src, all); // los objetos que cruzan dos teselas no se duplican
        if (failed) {
          if (mctx.onLayerError) mctx.onLayerError(ls, failed);
          failure(); // lo que faltó se vuelve a pedir al mover o acercar el mapa
        } else {
          if (mctx.onLayerOk) mctx.onLayerOk(ls);
          success(all);
        }
      }).finally(() => { src._pend -= 1; src._loading = src._pend > 0; });
    },
  });
  return src;
}

// ---------- capas de servicios oficiales (WFS genérico y ArcGIS REST) ----------
const svcWholeCache = new Map(); // descarga completa compartida entre el mapa, los recuadros y la exportación

async function getJSONStrict(url) {
  const r = await fetchRetry(url);
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch (e) { throw new Error(t.trim().startsWith('<') ? serverError(t) : 'respuesta ilegible'); }
  if (j && j.error) throw new Error(j.error.message || 'error del servidor');
  return j;
}

function wfsGetFeatureUrl(def, ll, limit) {
  const p = new URLSearchParams({
    service: 'WFS', version: '1.1.0', request: 'GetFeature', typeName: def.typeName, outputFormat: def.outputFormat || 'application/json',
    srsName: 'EPSG:4326', maxFeatures: String(limit),
  });
  const b = ll && (def.swap ? [ll[1], ll[0], ll[3], ll[2]] : ll);
  if (def.cql) {
    // GeoServer no admite bbox y filtro juntos: la caja va dentro del filtro
    p.set('CQL_FILTER', b && def.geomName ? `(${def.cql}) AND BBOX(${def.geomName},${b.map((v) => v.toFixed(5)).join(',')})` : def.cql);
  } else if (b) p.set('bbox', `${b.map((v) => v.toFixed(5)).join(',')},EPSG:4326`);
  return `${def.url}?${p}`;
}

async function fetchWfsFeatures(def, ll, projCode) {
  const one = async (box, limit) => {
    const { obj } = await cachedJSON(`${def.url}|${def.typeName}|${def.cql || ''}|${box ? box.join(',') : 'todo'}`, wfsGetFeatureUrl(def, box, limit));
    if (obj && obj.error) throw new Error(obj.error.message || 'error del servidor');
    const o = def.swap ? { ...obj, features: (obj.features || []).map((f) => (f.geometry && f.geometry.coordinates ? { ...f, geometry: { ...f.geometry, coordinates: swapCoords(f.geometry.coordinates) } } : f)) } : obj;
    const feats = readFeatures(o, projCode);
    feats._truncated = (obj.features || []).length >= limit;
    return feats;
  };
  if (!ll) return one(null, 25000);
  const tiles = gridTiles(ll, ll[2] - ll[0]).slice(0, 48);
  const results = await runPool(tiles.map((t) => () => one(t.b, 5000)), 3);
  const bad = results.find((r) => !r.ok);
  if (bad && results.every((r) => !r.ok)) throw bad.e;
  const all = [];
  let trunc = false;
  results.forEach((r) => { if (r.ok) { all.push(...r.v); trunc = trunc || r.v._truncated; } });
  all._truncated = trunc;
  all._partial = !!bad;
  return all;
}

async function fetchArcgisFeatures(def, ll, projCode, mPerPx) {
  const base = { where: def.where || '1=1', outFields: '*', outSR: '4326', returnGeometry: 'true', f: def.geojson ? 'geojson' : 'json' };
  if (ll) Object.assign(base, { geometry: ll.map((v) => v.toFixed(6)).join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
  if (mPerPx && def.geom !== 'point') base.maxAllowableOffset = String(Math.max(1e-6, (mPerPx * 0.5) / 111000));
  const read = (j) => (def.geojson ? readFeatures(j, projCode) : esrijson.readFeatures(j, { dataProjection: 'EPSG:4326', featureProjection: projCode }));
  let all = [];
  let truncated = false;
  if (!def.paginate) {
    // sin paginación no se puede mandar resultOffset: se pide una vez y se avisa si quedó corto
    const j = await getJSONStrict(`${def.url}/query?${new URLSearchParams(base)}`);
    all = read(j);
    truncated = !!(j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit));
  } else {
    const n = def.maxRec || 1000;
    for (let page = 0; page < 25; page++) {
      const j = await getJSONStrict(`${def.url}/query?${new URLSearchParams({ ...base, resultOffset: String(page * n), resultRecordCount: String(n) })}`);
      const f = read(j);
      all = all.concat(f);
      const more = j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit);
      if (!more || !f.length) break;
      if (page === 24) truncated = true;
    }
  }
  all._truncated = truncated;
  return all;
}

function buildServiceVectorSource(ls, def, mctx) {
  const whole = !!def.whole;
  const src = new VectorSource({
    wrapX: false,
    strategy: whole ? allStrategy : bboxStrategy,
    loader(extent, resolution, projection, success, failure) {
      const center = mctx.map ? mctx.map.getView().getCenter() : [0, 0];
      let mpm = resolution;
      let mPerPx = resolution;
      try { const mu = metersPerUnit(mctx.projection, center); mpm = resolution * mu * mctx.pxPerMm; mPerPx = (resolution * mu) / (mctx.pixelRatio || 1); } catch (e) { /* noop */ }
      let ll = null;
      if (!whole) {
        const cur = mctx.getLayerState(ls.uid) || ls;
        const limit = (def.maxMpm || 2500) * (cur.params && cur.params.force ? 8 : 1);
        if (mpm > limit) { src._tooFar = true; src.dispatchEvent('cm-far'); failure(); return; }
        src._tooFar = false;
        try { ll = transformExtent(extent, projection, 'EPSG:4326', 16); } catch (e) { failure(); return; }
        ll = [Math.max(-180, ll[0]), Math.max(-90, ll[1]), Math.min(180, ll[2]), Math.min(90, ll[3])];
        if (!(ll[2] > ll[0] && ll[3] > ll[1])) { success([]); return; }
      }
      src._pend = (src._pend || 0) + 1;
      src._loading = true;
      let job;
      if (whole) {
        const key = `${def.type}|${def.url}|${def.typeName || ''}|${def.cql || def.where || ''}|${mctx.projection}`;
        if (!svcWholeCache.has(key)) {
          const pr = def.type === 'svc-wfs' ? fetchWfsFeatures(def, null, mctx.projection) : fetchArcgisFeatures(def, null, mctx.projection, null);
          pr.catch(() => svcWholeCache.delete(key));
          svcWholeCache.set(key, pr);
        }
        job = svcWholeCache.get(key).then((feats) => { const c = feats.map((f) => { const k = f.clone(); k.setId(f.getId()); return k; }); c._truncated = feats._truncated; return c; });
      } else {
        job = def.type === 'svc-wfs' ? fetchWfsFeatures(def, ll, mctx.projection) : fetchArcgisFeatures(def, ll, mctx.projection, mPerPx);
      }
      job.then((feats) => {
        addUnique(src, feats);
        src._truncated = !!feats._truncated;
        if (mctx.onLayerOk) mctx.onLayerOk(ls);
        success(feats);
      }).catch((err) => {
        if (mctx.onLayerError) mctx.onLayerError(ls, err);
        failure();
      }).finally(() => { src._pend -= 1; src._loading = src._pend > 0; });
    },
  });
  return src;
}

// ---------- imágenes calculadas en el navegador (clasificación propia, mapa de cambios) ----------
const paintedCache = new Map();
function buildStaticImageLayer(ls, def, mctx, className) {
  const layer = new ImageLayer({ className });
  const classes = def.labels && def.classes ? JSON.stringify(def.classes.map((c) => [c.id != null ? c.id : c.v, c.color, c.show !== false])) : '';
  const key = `${def.key}|${classes}`;
  const apply = (url) => layer.setSource(new ImageStatic({ url, imageExtent: def.extent, projection: 'EPSG:3857', interpolate: false }));
  if (!paintedCache.has(key)) {
    const pr = getImage(def.key).then((v) => {
      if (!v) throw new Error('falta la imagen calculada en este navegador: abrí el proyecto exportado que la incluye o volvé a calcularla');
      return def.labels ? paintLabels(v.blob, def.classes) : v.url;
    });
    pr.catch(() => paintedCache.delete(key));
    paintedCache.set(key, pr);
  }
  paintedCache.get(key).then(apply).catch((e) => { if (mctx.onLayerError) mctx.onLayerError(ls, e); });
  return layer;
}

// ---------- planos georreferenciados ----------
const georefRegistered = new Set();
export function georefModel(state, sourceId) {
  const src = state.interp.sources.find((x) => x.id === sourceId);
  if (!src) return { src: null, gr: null, model: null };
  const ver = state.interp.versions.find((v) => v.id === state.interp.active);
  const gr = ver && ver.georefs ? ver.georefs[sourceId] : null;
  if (!gr) return { src, gr: null, model: null };
  const key = `${modelHash(gr)}|${src.w}x${src.h}`;
  if (!gr._model || gr._modelKey !== key) {
    gr._model = fitModel(gr.gcps, gr.method, { imageSize: [src.w, src.h] });
    gr._modelKey = key;
  }
  return { src, gr, model: gr._model };
}

function ensureImageProjection(src, gr, model, mapProj) {
  const code = `IMG:${src.id}:${modelHash(gr)}`;
  let proj = getProjectionOl(code);
  if (!proj) {
    proj = new Projection({ code, units: 'pixels', extent: [0, 0, src.w, src.h], metersPerUnit: Math.max(1e-6, model.mpp || 1), getPointResolution: (r) => r });
    addProjection(proj);
  }
  const k = `${code}>${mapProj}`;
  if (!georefRegistered.has(k)) {
    const H = src.h;
    const out = model.outline || [];
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    out.forEach(([lo, la]) => { w = Math.min(w, lo); e = Math.max(e, lo); s = Math.min(s, la); n = Math.max(n, la); });
    const mx = (e - w) * 0.25 + 0.01, my = (n - s) * 0.25 + 0.01;
    const box = [w - mx, s - my, e + mx, n + my];
    const FAR = [-1e9, -1e9];
    addCoordinateTransforms(proj, getProjectionOl(mapProj),
      (c) => { const ll = model.forward(c[0], H - c[1]); return Number.isFinite(ll[0]) ? lonLatTo(mapProj, ll) : [NaN, NaN]; },
      (c) => {
        const ll = toLonLatFrom(mapProj, c);
        if (!ll || !(ll[0] >= box[0] && ll[0] <= box[2] && ll[1] >= box[1] && ll[1] <= box[3])) return FAR.slice();
        const p = model.inverse(ll[0], ll[1]);
        return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], H - p[1]] : FAR.slice();
      });
    georefRegistered.add(k);
  }
  return proj;
}

function refreshLater(ls, mctx) {
  const cur = mctx.getLayerState(ls.uid);
  if (!cur) return;
  cur.rev += 1;
  if (mctx.app.commit) mctx.app.commit('layers', { history: false });
}

function buildGeorefLayer(ls, mctx, className) {
  const st = mctx.app.state;
  const { src, gr, model } = georefModel(st, ls.params && ls.params.sourceId);
  const empty = () => { const l = new ImageLayer({ className }); l._cmGeorefPending = true; return l; };
  if (!src || !model || !model.ok) return empty();
  const img = peekImage(src.key);
  if (!img) {
    getImage(src.key).then((v) => { if (v) refreshLater(ls, mctx); });
    return empty();
  }
  const url = processedReady(src.key, src.proc);
  if (!url) {
    processedUrl(src.key, src.proc).then(() => refreshLater(ls, mctx)).catch(() => null);
    return empty();
  }
  return georefImageLayer(src, gr, model, mctx.projection, url, className);
}

// Capa de imagen de un plano deformada según el modelo (también la usa el georreferenciador)
export function georefImageLayer(src, gr, model, mapProj, url, className) {
  const proj = ensureImageProjection(src, gr, model, mapProj);
  const source = new ImageStatic({ url, projection: proj, imageExtent: [0, 0, src.w, src.h], interpolate: true });
  const layer = new ImageLayer({ source, className });
  // limita el dibujo al área que cubre el plano
  try {
    const ext = [Infinity, Infinity, -Infinity, -Infinity];
    (model.outline || []).forEach((ll) => {
      const c = lonLatTo(mapProj, ll);
      ext[0] = Math.min(ext[0], c[0]); ext[1] = Math.min(ext[1], c[1]); ext[2] = Math.max(ext[2], c[0]); ext[3] = Math.max(ext[3], c[1]);
    });
    if (ext.every(Number.isFinite)) layer.setExtent(ext);
  } catch (e) { /* noop */ }
  return layer;
}

// ---------- capas de interpretación (versiones) ----------
export function interpVersionOf(state, ls) {
  const it = state.interp;
  const id = ls.params && ls.params.version && ls.params.version !== 'active' ? ls.params.version : it.active;
  return it.versions.find((v) => v.id === id) || null;
}

export function interpStyle(cat, cert, { ghost = false, pxPerPt, pr = 1, label = '', labelCfg } = {}) {
  const c = CERTAINTY.find((x) => x.id === cert) || CERTAINTY[0];
  const color = ghost ? '#8a8a8a' : cat.color;
  const styles = [];
  if (cat.geom === 'line') {
    const l = { color, width: cat.width || 0.8, dash: ghost ? 'short' : c.dash, deco: ghost ? 'none' : cat.deco || 'none', decoColor: cat.decoColor, opacity: ghost ? 0.7 : 1 };
    // la certeza se lee en el trazo (lleno, guiones, puntos); la decoración (peine, flechas…) se conserva
    if (c.id !== 'cierta' && ['casing', 'double', 'rail'].includes(l.deco)) l.deco = 'none';
    styles.push(new Style({ renderer(coords, state) {
      const k = pxPerPt * state.pixelRatio;
      const lines = Array.isArray(coords[0][0]) ? coords : [coords];
      for (const ln of lines) drawDecoratedLine(state.context, ln, l, k);
    } }));
  } else if (cat.geom === 'polygon') {
    const fo = ghost ? 0 : 0.35 * c.fill;
    if (fo > 0) styles.push(new Style({ fill: new Fill({ color: rgba(color, fo) }) }));
    if (!ghost && cat.pattern && cat.pattern !== 'none') {
      const pat = getPattern(cat.pattern, rgba(color, 0.9), 2 * pxPerPt * 2.835 * pr, 0.3 * pxPerPt * pr);
      if (pat) styles.push(new Style({ fill: new Fill({ color: pat }) }));
    }
    const w = (cat.width || 0.6) * pxPerPt;
    styles.push(new Style({ stroke: new Stroke({ color: rgba(color, ghost ? 0.8 : 1), width: w, lineDash: dashArray(ghost ? 'short' : c.dash, w, pxPerPt * 0.6), lineCap: dashCap(c.dash), lineJoin: 'round' }) }));
  } else {
    const cfg = { shape: cat.shape || 'circle', size: cat.size || 5, fill: color, fillOpacity: ghost ? 0 : c.id === 'cierta' ? 1 : c.id === 'probable' ? 0.45 : 0, stroke: c.id === 'cierta' && !ghost ? '#ffffff' : color, strokeWidth: c.id === 'cierta' && !ghost ? 0.5 : 0.9 };
    styles.push(new Style({ renderer(coords, state) {
      const draw = (p) => drawSymbol(state.context, p[0], p[1], cfg, pxPerPt * state.pixelRatio);
      if (Array.isArray(coords[0])) coords.forEach(draw); else draw(coords);
    } }));
  }
  if (label && !ghost) {
    const lc = labelCfg || {};
    const sizePx = (lc.size || 6) * pxPerPt;
    styles.push(new Style({ text: new Text({
      text: c.mark ? `${label} ?` : label, font: fontString({ font: lc.font || 'Source Sans 3', sizePx, italic: c.id !== 'cierta' }),
      fill: new Fill({ color: lc.color || '#1d2b38' }), stroke: new Stroke({ color: lc.halo || '#ffffff', width: 1.1 * pxPerPt * 2 }),
      offsetY: cat.geom === 'point' ? -7 * pxPerPt : 0, placement: cat.geom === 'line' ? 'line' : 'point', overflow: true,
    }) }));
  }
  return styles;
}

function buildInterpLayer(ls, mctx, className) {
  const st = mctx.app.state;
  const ver = interpVersionOf(st, ls);
  const src = new VectorSource({ wrapX: false });
  if (ver) {
    try { src.addFeatures(readFeatures(ver.features, mctx.projection)); } catch (e) { if (mctx.onLayerError) mctx.onLayerError(ls, e); }
  }
  const ghost = !!(ls.params && ls.params.ghost);
  const cache = new Map();
  let cacheV = -1, cacheS = -1;
  const layer = new VectorLayer({ source: src, className, declutter: false, style: (f) => {
    const cur = mctx.getLayerState(ls.uid) || ls;
    if (cur._styleVersion !== cacheV || mctx.pxPerMm !== cacheS) { cache.clear(); cacheV = cur._styleVersion; cacheS = mctx.pxPerMm; }
    const it = mctx.app.state.interp;
    const cat = it.categories.find((c) => c.id === f.get('cat')) || { geom: (f.getGeometry() && /Point/.test(f.getGeometry().getType())) ? 'point' : /Line/.test(f.getGeometry() ? f.getGeometry().getType() : '') ? 'line' : 'polygon', color: '#555555' };
    const showLabel = cur.params && cur.params.labels !== false;
    const key = `${f.get('cat')}|${f.get('cert')}|${showLabel ? f.get('name') || '' : ''}|${JSON.stringify(cat)}`;
    if (!cache.has(key)) cache.set(key, interpStyle(cat, f.get('cert'), { ghost, pr: mctx.pixelRatio || 1, pxPerPt: mctx.pxPerMm * PT_MM, label: showLabel ? f.get('name') || '' : '', labelCfg: cur.params && cur.params.label }));
    return cache.get(key);
  } });
  layer._interpSource = src;
  return layer;
}

// ---------- sitios ----------
export function siteSymbolCfg(site, st) {
  const ss = st.siteStyle;
  const cats = (site.cats || []).map((id) => st.categories.find((c) => c.id === id)).filter(Boolean);
  const colors = cats.length ? cats.map((c) => c.color) : [site.color || '#555555'];
  return { shape: site.shape || ss.shape, size: site.size || ss.size, fill: colors[0], colors, multi: ss.multi, fillOpacity: ss.fillOpacity, stroke: ss.stroke, strokeWidth: ss.strokeWidth, strokeOpacity: ss.strokeOpacity };
}

// ---------- capas importadas ----------
function buildUserLayer(ls, mctx) {
  const key = `user:${ls.uid}:${ls.rev}|${mctx.projection}`;
  if (!vectorSources.has(key)) {
    const src = new VectorSource({ wrapX: false });
    try { src.addFeatures(readFeatures(ensureIds(ls.data), mctx.projection)); } catch (e) { if (mctx.onLayerError) mctx.onLayerError(ls, e); }
    vectorSources.set(key, src);
  }
  return vectorSources.get(key);
}

// ---------- recorte por Sector Antártico ----------
function landClipPath(ctx, e, mctx) {
  // recorta a los polígonos de la costa SCAR ADD presentes en este mapa
  let src = null;
  for (const [uid, l] of mctx.olLayers) {
    const st = mctx.getLayerState(uid);
    if (st && st.def === 'add-costa' && l.getSource) { src = l.getSource(); break; }
  }
  if (!src) return false;
  const c2p = e.frameState.coordinateToPixelTransform;
  const inv = e.inversePixelTransform;
  const toPx = (c) => {
    const x = c2p[0] * c[0] + c2p[2] * c[1] + c2p[4], y = c2p[1] * c[0] + c2p[3] * c[1] + c2p[5];
    return [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]];
  };
  ctx.beginPath();
  const feats = src.getFeaturesInExtent(e.frameState.extent);
  for (const f of feats) {
    const g = f.getGeometry();
    if (!g) continue;
    const polys = g.getType() === 'MultiPolygon' ? g.getCoordinates() : g.getType() === 'Polygon' ? [g.getCoordinates()] : [];
    for (const poly of polys) {
      for (const ring of poly) {
        ring.forEach((c, i) => { const p = toPx(c); if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
        ctx.closePath();
      }
    }
  }
  ctx.clip('evenodd');
  return true;
}

function attachClip(layer, ls, mctx) {
  layer.on('prerender', (e) => {
    const cur = mctx.getLayerState(ls.uid) || ls;
    layer._clipped = false;
    const sw = cur.params && cur.params.swipe != null && cur.params.swipe !== '' ? Number(cur.params.swipe) : null;
    const hasSwipe = sw != null && Number.isFinite(sw) && sw < 100;
    if ((!cur.clip || cur.clip === 'none' || !mctx.map) && !hasSwipe) return;
    const ctx = e.context;
    ctx.save();
    layer._clipped = true;
    if (hasSwipe) {
      // cortina para comparar: la capa se ve solo a un lado de la línea
      const W = ctx.canvas.width, H = ctx.canvas.height, x = (W * Math.max(0, sw)) / 100;
      ctx.beginPath();
      if (cur.params.swipeSide === 'right') ctx.rect(x, 0, W - x, H); else ctx.rect(0, 0, x, H);
      ctx.clip();
    }
    if (!cur.clip || cur.clip === 'none' || !mctx.map) return;
    if (cur.clip === 'land') {
      if (!landClipPath(ctx, e, mctx) && !hasSwipe) { ctx.restore(); layer._clipped = false; }
      return;
    }
    ctx.beginPath();
    const ring = sectorRingLonLat(mctx.projection);
    ring.forEach((ll, i) => {
      const px = mctx.map.getPixelFromCoordinate(lonLatTo(mctx.projection, ll));
      if (!px) return;
      const rp = getRenderPixel(e, px);
      if (i === 0) ctx.moveTo(rp[0], rp[1]); else ctx.lineTo(rp[0], rp[1]);
    });
    ctx.closePath();
    if (cur.clip === 'outside') {
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.clip('evenodd');
    } else ctx.clip();
  });
  layer.on('postrender', (e) => {
    if (layer._clipped) { e.context.restore(); layer._clipped = false; }
  });
}

// ---------- fábrica principal ----------
export function buildOlLayer(ls, mctx) {
  const def = ls.def === 'user' ? { kind: 'vector', type: 'user' } : defOf(ls);
  if (!def) return null;
  let layer = null;
  const getLs = () => mctx.getLayerState(ls.uid);
  const className = `cm-layer cm-${ls.uid}`;
  const decl = !!(ls.style && ls.style.label && ls.style.label.show && ls.style.label.declutter);
  if (def.type === 'graticule') {
    return null; // la grilla se dibuja como vector en la capa de composición
  } else if (def.type === 'georef') {
    layer = buildGeorefLayer(ls, mctx, className);
  } else if (def.type === 'interp') {
    layer = buildInterpLayer(ls, mctx, className);
  } else if (def.type === 'svc-wfs' || def.type === 'svc-arcgis') {
    const src = buildServiceVectorSource(ls, def, mctx);
    layer = new VectorLayer({ source: src, style: makeVectorStyleFn(getLs, def, mctx), declutter: decl, className });
    layer._viewSource = src;
  } else if (def.type === 'wfs-view') {
    const src = buildWfsViewSource(ls, def, mctx);
    layer = new VectorLayer({ source: src, style: makeVectorStyleFn(getLs, def, mctx), declutter: decl, className });
    layer._viewSource = src;
  } else if (def.type === 'svc-img') {
    layer = buildStaticImageLayer(ls, def, mctx, className);
  } else if (def.kind === 'raster') {
    if (def.type === 'terrarium') layer = buildDemLayer(ls, def, mctx, className);
    else {
      const src = getRasterSource(ls, def, mctx);
      if (!src) return null;
      layer = new TileLayer({ source: src, preload: 0, className });
    }
  } else if (def.type === 'esri-feature') {
    const src = buildEsriFeatureSource(ls, def, mctx);
    layer = new VectorLayer({ source: src, style: makeVectorStyleFn(getLs, def, mctx), declutter: false, className });
    layer._esriSource = src;
  } else if (def.type === 'user') {
    const src = buildUserLayer(ls, mctx);
    layer = new VectorLayer({ source: src, style: makeVectorStyleFn(getLs, def, mctx), declutter: decl, className });
  } else if (def.kind === 'vector') {
    const src = getStaticVectorSource(ls, def, mctx);
    if (!src) return null;
    layer = new VectorLayer({ source: src, style: makeVectorStyleFn(getLs, def, mctx), declutter: decl, className });
  }
  if (!layer) return null;
  layer.set('cmUid', ls.uid);
  attachClip(layer, ls, mctx);
  return layer;
}

