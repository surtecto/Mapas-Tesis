// Servicios oficiales: catálogo IDERA en vivo, organismos destacados, lectura de capacidades (WFS, WMS, ArcGIS REST)
// y definición de capas «svc» que se guardan dentro del mapa (no dependen del catálogo fijo).
import { baseStyle } from './catalog.js';

export const IDERA_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTC_6dXWs9MCP2cxCJquyvJzW_tXO4g2hcbEfyOyQ5BlbKSX7iKxdKBjuUwlEqJJELIJgLERDp5ZUir/pub?gid=0&single=true&output=csv';

// Organismos destacados (verificados desde la web publicada el 25/10/2026; ver docs/servicios-verificados.md)
export const FEATURED = [
  { id: 'ign', short: 'IGN', name: 'Instituto Geográfico Nacional', level: 'Nacional', topics: 'límites, hidrografía, vialidad, relieve, localidades, cartas topográficas',
    wfs: 'https://wms.ign.gob.ar/geoserver/ows', wms: 'https://wms.ign.gob.ar/geoserver/ows' },
  { id: 'ign-riesgo', short: 'IGN riesgo', name: 'IGN: gestión integral del riesgo de desastres', level: 'Nacional', topics: 'amenazas, infraestructura crítica, refugios',
    wfs: 'https://wms.ign.gob.ar/geoserver/ign_riesgo/ows', wms: 'https://wms.ign.gob.ar/geoserver/ign_riesgo/ows' },
  { id: 'ina', short: 'INA', name: 'Instituto Nacional del Agua', level: 'Nacional', topics: 'cuencas, estaciones hidrométricas, superficie inundada (Landsat)',
    wfs: 'https://alerta.ina.gob.ar/geoserver/ows', wms: 'https://alerta.ina.gob.ar/geoserver/ows' },
  { id: 'indec', short: 'INDEC', name: 'Instituto Nacional de Estadística y Censos', level: 'Nacional', topics: 'radios y fracciones censales, localidades censales, aglomerados',
    wfs: 'https://geonode.indec.gob.ar/geoserver/geonode/wfs', wms: 'https://geonode.indec.gob.ar/geoserver/wms' },
  { id: 'inta', short: 'INTA', name: 'Instituto Nacional de Tecnología Agropecuaria', level: 'Nacional', topics: 'suelos, cobertura, regiones agroecológicas',
    wfs: 'https://geo-backend.inta.gob.ar/geoserver/ows', wms: 'https://geo-backend.inta.gob.ar/geoserver/ows' },
  { id: 'inta-ba', short: 'INTA Bs. As.', name: 'INTA: Región Buenos Aires', level: 'Nacional', topics: 'suelos y capacidad de uso de la provincia',
    wfs: 'https://geo-nodo07.inta.gob.ar/geoserver/wfs', wms: 'https://geo-nodo07.inta.gob.ar/geoserver/wms' },
  { id: 'inta-rn', short: 'INTA RR. NN.', name: 'INTA: Centro de Investigación de Recursos Naturales', level: 'Nacional', topics: 'suelos, clima, vegetación',
    wfs: 'https://geo-nodo05.inta.gob.ar/geoserver/wfs', wms: 'https://geo-nodo05.inta.gob.ar/geoserver/wms' },
  { id: 'ambiente', short: 'Ambiente', name: 'Subsecretaría de Ambiente (IDE ambiental)', level: 'Nacional', topics: 'áreas protegidas, humedales, bosques nativos, ecorregiones',
    wfs: 'https://geo.ambiente.gob.ar/geoserver/ows', wms: 'https://geo.ambiente.gob.ar/geoserver/ows' },
  { id: 'segemar', short: 'SEGEMAR', name: 'Servicio Geológico Minero Argentino', level: 'Nacional', topics: 'geología, estructuras, peligrosidad, hidrogeología',
    wms: 'https://sigam.segemar.gov.ar/geoserver217/ows', noCors: true,
    note: 'El servidor no habilita CORS: sus capas se ven pero no se pueden restilizar ni exportar desde esta web. Para la figura final, pedí la capa vectorial al SEGEMAR o usá la imagen como referencia.',
    staticWms: [
      ['sigam:e2.5M.UnidadesGeologicas', 'Unidades geológicas 1:2.500.000'], ['sigam:e2.5M.Estructuras', 'Estructuras 1:2.500.000'],
      ['sigam:e2.5M.Geotectonico', 'Geotectónico 1:2.500.000'], ['sigam:e2.5M.DeformCuater', 'Deformaciones cuaternarias 1:2.500.000'],
      ['sigam:e5M.UnidadesGeologicas', 'Unidades geológicas 1:5.000.000'], ['sigam:e250K_UnidadGeologica', 'Unidad geológica 1:250.000'],
      ['sigam:e250K_UnidadLitologica', 'Unidad litológica 1:250.000'], ['sigam:e250K_Unidadhidro', 'Unidad hidrogeológica 1:250.000'],
      ['sigam:e250K.Suelos', 'Suelos 1:250.000'], ['sigam:e250K.UsosSuelo', 'Usos del suelo 1:250.000'], ['sigam:e250K.Fallas', 'Fallas 1:250.000'],
      ['sigam:e250K.Contactos', 'Contactos 1:250.000'], ['sigam:e250K.PozosAgua', 'Pozos de agua 1:250.000'],
      ['sigam:e250K_SuscepInund', 'Susceptibilidad a inundación 1:250.000'], ['sigam:e250K_SuscepErosion', 'Susceptibilidad a erosión 1:250.000'],
      ['sigam:PeligroInundaciones', 'Peligrosidad: inundaciones'], ['sigam:PeligroErosionHidrica', 'Peligrosidad: erosión hídrica'],
      ['sigam:PeligroErosionEolica', 'Peligrosidad: erosión eólica'], ['sigam:PeligroErosionCostera', 'Peligrosidad: erosión costera'],
      ['sigam:PeligroSismos', 'Peligrosidad: sismos'], ['sigam:e750K.ProvSantaFeGeol', 'Santa Fe: unidades geológicas 1:750.000'],
    ] },
  { id: 'transporte', short: 'Transporte', name: 'Secretaría de Transporte', level: 'Nacional', topics: 'ferrocarriles, estaciones, puertos, aeropuertos',
    wfs: 'https://ide.transporte.gob.ar/geoserver/idera/wfs', wms: 'https://ide.transporte.gob.ar/geoserver/idera/wms' },
  { id: 'senasa', short: 'SENASA', name: 'Servicio Nacional de Sanidad y Calidad Agroalimentaria', level: 'Nacional', topics: 'establecimientos, regiones sanitarias',
    wfs: 'https://geonode.senasa.gob.ar/geoserver/wfs', wms: 'https://geonode.senasa.gob.ar/geoserver/ows' },
  { id: 'conae', short: 'CONAE', name: 'Comisión Nacional de Actividades Espaciales', level: 'Nacional', topics: 'suelos, focos de calor, riesgo ambiental',
    wfs: 'https://geoservicios.conae.gov.ar/geoserver/GeoServiciosCONAE/wfs', wms: 'https://geoservicios.conae.gov.ar/geoserver/GeoServiciosCONAE/wms' },
  { id: 'shn', short: 'SHN', name: 'Servicio de Hidrografía Naval', level: 'Nacional', topics: 'costas, cartas náuticas, límites marítimos',
    wfs: 'https://wms.shn.gob.ar/geoserver/wfs', wms: 'https://wms.shn.gob.ar/geoserver/wms' },
  { id: 'energia', short: 'Energía', name: 'Secretaría de Energía', level: 'Nacional', topics: 'redes eléctricas, gasoductos, centrales',
    wfs: 'https://sig.energia.gob.ar/wfsenergia', wms: 'https://sig.energia.gob.ar/wmsenergia' },
  { id: 'educacion', short: 'Mapa Educativo', name: 'Mapa Educativo Nacional', level: 'Nacional', topics: 'establecimientos educativos',
    wfs: 'https://mapa.educacion.gob.ar/geoserver/ows', wms: 'https://mapa.educacion.gob.ar/geoserver/ows' },
  { id: 'forestal', short: 'Forestal', name: 'SAGyP: Desarrollo Foresto Industrial', level: 'Nacional', topics: 'plantaciones forestales',
    wms: 'https://geoforestal.magyp.gob.ar/geoserver/ows' },
  { id: 'arba', short: 'ARBA', name: 'ARBA: catastro de la Provincia de Buenos Aires', level: 'Provincial', jur: 'Buenos Aires', topics: 'parcelas, manzanas, quintas, chacras, circunscripciones',
    wfs: 'https://geo.arba.gov.ar/geoserver/idera/wfs', wms: 'https://geo.arba.gov.ar/geoserver/idera/wms' },
  { id: 'pba-estadistica', short: 'Estadística PBA', name: 'Dirección Provincial de Estadística (Buenos Aires)', level: 'Provincial', jur: 'Buenos Aires', topics: 'censo 2022 por partido: radios, fracciones, manzanas, ejes',
    arcgis: 'https://mapas.estadistica.ec.gba.gov.ar/server/rest/services' },
  { id: 'mapa-escolar', short: 'Mapa escolar', name: 'Mapa escolar (Dirección General de Cultura y Educación)', level: 'Provincial', jur: 'Buenos Aires', topics: 'escuelas y servicios educativos',
    wfs: 'https://mapaescolar.abc.gob.ar/me/wfs', wms: 'https://mapaescolar.abc.gob.ar/me/wms' },
  { id: 'geoinfra', short: 'GeoInfra', name: 'Ministerio de Infraestructura (Buenos Aires)', level: 'Provincial', jur: 'Buenos Aires', topics: 'obras, hidráulica, vialidad provincial',
    wms: 'https://www.geoinfra.minfra.gba.gov.ar/geoserver/Geoinfra/wms' },
  { id: 'opisu', short: 'OPISU', name: 'Organismo Provincial de Integración Social y Urbana', level: 'Provincial', jur: 'Buenos Aires', topics: 'barrios populares',
    wfs: 'https://geoserver.opisu.gba.gob.ar/geoserver/IDEOPISU/wfs', wms: 'https://geoserver.opisu.gba.gob.ar/geoserver/IDEOPISU/wms' },
  { id: 'caba-estadistica', short: 'Estadística CABA', name: 'Dirección General de Estadística y Censos (CABA)', level: 'Provincial', jur: 'Ciudad de Buenos Aires', topics: 'censos y estadísticas por radio',
    wfs: 'https://ideec.estadisticaciudad.gob.ar/geoserver/ows', wms: 'https://ideec.estadisticaciudad.gob.ar/geoserver/ows' },
  { id: 'idecor', short: 'IDECOR', name: 'IDE de Córdoba', level: 'Provincial', jur: 'Córdoba', topics: 'catastro, suelos, relieve, coberturas',
    wfs: 'https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/wfs', wms: 'https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/wms' },
];

// ---------- utilidades ----------
const https = (u) => String(u || '').trim().replace(/^http:\/\//i, 'https://');
export const baseUrl = (u) => https(u).split('?')[0].replace(/\/+$/, '');
const isGeoServer = (u) => /geoserver/i.test(u);

async function fetchText(url, ms = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('el servidor no respondió a tiempo');
    if (e instanceof TypeError) throw new Error('el servidor no permite leerlo desde otra web (CORS) o no responde');
    throw e;
  } finally { clearTimeout(t); }
}
// Traduce las excepciones típicas de GeoServer/ArcGIS a algo que se entienda
export function serverError(text) {
  const m = String(text).match(/<(?:ows:)?ExceptionText>([\s\S]*?)<\/(?:ows:)?ExceptionText>/) || String(text).match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/);
  const raw = (m ? m[1] : String(text)).replace(/\s+/g, ' ').trim();
  if (/connection|pool|timeout waiting/i.test(raw)) return 'el servidor está sobrecargado (no pudo conectarse a su base de datos); probá en unos minutos';
  if (/Unknown|could not find|not find feature type|no such/i.test(raw)) return 'el servidor no reconoce esa capa';
  if (/out of memory|too many|limit/i.test(raw)) return 'el pedido es demasiado grande: acercá la vista o filtrá';
  return raw.slice(0, 160) || 'el servidor respondió con un error';
}
function parseJSONorError(t) {
  const s = t.trim();
  if (s.startsWith('<')) throw new Error(serverError(s));
  return JSON.parse(s);
}

async function fetchJSON(url, ms) {
  const t = await fetchText(url, ms);
  const j = JSON.parse(t);
  if (j && j.error) throw new Error(j.error.message || 'error del servidor');
  return j;
}
const xml = (t) => {
  const d = new DOMParser().parseFromString(t, 'application/xml');
  if (d.getElementsByTagName('parsererror').length) throw new Error('respuesta ilegible');
  const ex = d.getElementsByTagNameNS('*', 'ExceptionText')[0] || d.getElementsByTagName('ServiceException')[0];
  if (ex) throw new Error(ex.textContent.trim().slice(0, 200));
  return d;
};
const kids = (node, name) => [...node.children].filter((c) => c.localName === name);
const kid = (node, name) => kids(node, name)[0] || null;
const txt = (node, name) => { const k = kid(node, name); return k ? k.textContent.trim() : ''; };

function parseCSV(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// ---------- caché de capacidades (por sesión del navegador, 24 h) ----------
const memCache = new Map();
const CK = 'mapas-tesis:caps:';
function cacheGet(key) {
  if (memCache.has(key)) return memCache.get(key);
  try {
    const raw = sessionStorage.getItem(CK + key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (Date.now() - o.t > 864e5) return null;
    memCache.set(key, o.v);
    return o.v;
  } catch (e) { return null; }
}
function cacheSet(key, v) {
  memCache.set(key, v);
  try { sessionStorage.setItem(CK + key, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* sin espacio */ }
}

// ---------- catálogo IDERA ----------
let ideraPromise = null;
export function loadIdera() {
  if (!ideraPromise) {
    ideraPromise = fetchText(IDERA_CSV).then((t) => {
      const rows = parseCSV(t);
      rows.shift();
      const byOrg = new Map();
      for (const r of rows) {
        if (r.length < 6) continue;
        const tipo = (r[4] || '').trim().toUpperCase();
        if (!/^(WMS|WFS)$/.test(tipo) || !r[5]) continue;
        const org = r[3].trim();
        const key = `${r[0]}|${r[1]}|${org}`;
        if (!byOrg.has(key)) byOrg.set(key, { id: `idera-${byOrg.size}`, short: org.replace(/^.*\(([^)]+)\).*$/, '$1').slice(0, 40), name: org, level: r[0].trim(), jur: r[1].trim(), source: 'idera' });
        const o = byOrg.get(key);
        o[tipo.toLowerCase()] = o[tipo.toLowerCase()] || baseUrl(r[5]);
      }
      return [...byOrg.values()];
    }).catch((e) => { ideraPromise = null; throw e; });
  }
  return ideraPromise;
}

// ---------- capacidades ----------
const GEOM = (t) => (/point/i.test(t) ? 'point' : /line|curve/i.test(t) ? 'line' : /polygon|surface/i.test(t) ? 'polygon' : null);

export async function wfsCapabilities(url) {
  const u = baseUrl(url);
  const ck = `wfs|${u}`;
  const c = cacheGet(ck);
  if (c) return c;
  const d = xml(await fetchText(`${u}?service=WFS&version=1.1.0&request=GetCapabilities`));
  const formats = [...d.getElementsByTagNameNS('*', 'Operation')].filter((o) => o.getAttribute('name') === 'GetFeature')
    .flatMap((o) => [...o.getElementsByTagNameNS('*', 'Parameter')].filter((p) => /outputformat/i.test(p.getAttribute('name'))).flatMap((p) => [...p.getElementsByTagNameNS('*', 'Value')].map((v) => v.textContent.trim())));
  const json = formats.find((f) => /^application\/json$/i.test(f)) || formats.find((f) => /geojson|json/i.test(f)) || (isGeoServer(u) ? 'application/json' : null);
  const layers = [...d.getElementsByTagNameNS('*', 'FeatureType')].map((f) => {
    const bb = f.getElementsByTagNameNS('*', 'WGS84BoundingBox')[0];
    let bbox = null;
    if (bb) {
      const lo = (bb.getElementsByTagNameNS('*', 'LowerCorner')[0] || {}).textContent;
      const up = (bb.getElementsByTagNameNS('*', 'UpperCorner')[0] || {}).textContent;
      if (lo && up) bbox = [...lo.trim().split(/\s+/), ...up.trim().split(/\s+/)].map(Number);
    }
    return { name: txt(f, 'Name'), title: txt(f, 'Title') || txt(f, 'Name'), abstract: txt(f, 'Abstract').slice(0, 400), bbox, srs: txt(f, 'DefaultSRS') || txt(f, 'DefaultCRS') };
  }).filter((l) => l.name);
  const out = { url: u, kind: 'wfs', json, layers };
  cacheSet(ck, out);
  return out;
}

export async function wmsCapabilities(url) {
  const u = baseUrl(url);
  const ck = `wms|${u}`;
  const c = cacheGet(ck);
  if (c) return c;
  const d = xml(await fetchText(`${u}?service=WMS&version=1.3.0&request=GetCapabilities`));
  const cap = d.getElementsByTagNameNS('*', 'Capability')[0];
  const root = cap ? kid(cap, 'Layer') : null;
  const layers = [];
  const walk = (node, crsUp) => {
    const crs = [...new Set([...crsUp, ...kids(node, 'CRS').map((x) => x.textContent.trim()), ...kids(node, 'SRS').map((x) => x.textContent.trim())])];
    const name = txt(node, 'Name');
    if (name) {
      const eb = kid(node, 'EX_GeographicBoundingBox');
      const bbox = eb ? ['westBoundLongitude', 'southBoundLatitude', 'eastBoundLongitude', 'northBoundLatitude'].map((k) => Number(txt(eb, k))) : null;
      const styles = kids(node, 'Style').map((s) => {
        const lg = s.getElementsByTagNameNS('*', 'OnlineResource')[0];
        return { name: txt(s, 'Name'), title: txt(s, 'Title') || txt(s, 'Name'), legend: lg ? lg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || lg.getAttribute('xlink:href') : '' };
      });
      layers.push({ name, title: txt(node, 'Title') || name, abstract: txt(node, 'Abstract').slice(0, 400), bbox, styles, crs: crs.filter((x) => /^EPSG:(3857|4326|3031|900913)$/.test(x)), queryable: node.getAttribute('queryable') === '1' });
    }
    kids(node, 'Layer').forEach((k) => walk(k, crs));
  };
  if (root) walk(root, []);
  const out = { url: u, kind: 'wms', layers };
  cacheSet(ck, out);
  return out;
}

// ArcGIS REST: raíz o carpeta (lista servicios) o servicio MapServer/FeatureServer (lista capas)
export async function arcgisCapabilities(url) {
  const u = baseUrl(url);
  const ck = `arcgis|${u}`;
  const c = cacheGet(ck);
  if (c) return c;
  const j = await fetchJSON(`${u}?f=json`);
  let out;
  if (j.layers || j.tables) {
    const groups = new Map((j.layers || []).map((l) => [l.id, l]));
    const path = (l) => { const p = []; let x = l; let guard = 0; while (x && x.parentLayerId != null && x.parentLayerId >= 0 && guard++ < 8) { x = groups.get(x.parentLayerId); if (x) p.unshift(x.name); } return p.join(' › '); };
    out = { url: u, kind: 'arcgis-service', layers: (j.layers || []).filter((l) => !/group/i.test(l.type || '') && !(l.subLayerIds && l.subLayerIds.length)).map((l) => ({ name: String(l.id), id: l.id, title: l.name, group: path(l), geomHint: GEOM(l.geometryType || '') })), formats: j.supportedQueryFormats || '' };
  } else {
    // los nombres de servicio ya incluyen la carpeta: raíz/services/carpeta/nombre/Tipo
    const rootUrl = u.replace(/\/services(\/.*)?$/, '/services');
    out = {
      url: u, kind: 'arcgis-folder',
      folders: (j.folders || []).map((f) => ({ name: f, url: `${rootUrl}/${f}` })),
      services: (j.services || []).filter((s) => /MapServer|FeatureServer/.test(s.type)).map((s) => ({ name: s.name.split('/').pop(), type: s.type, url: `${rootUrl}/${s.name}/${s.type}` })),
    };
  }
  cacheSet(ck, out);
  return out;
}

// ---------- definición de capas ----------
const PAL = ['#2f5d8c', '#b5523b', '#5a7d3a', '#8c5a2f', '#6a4c93', '#2a8c82', '#a3447d', '#7a6a1f'];
let palIdx = 0;
export function defaultStyleFor(geom) {
  const c = PAL[palIdx++ % PAL.length];
  if (geom === 'point') return baseStyle({ point: { shape: 'circle', size: 4.5, fill: c, stroke: '#ffffff', strokeWidth: 0.5 } });
  if (geom === 'line') return baseStyle({ line: { color: c, width: 0.7, dash: 'solid' } });
  return baseStyle({ polygon: { fill: c, fillOpacity: 0.18, stroke: c, strokeWidth: 0.5, dash: 'solid' } });
}

const today = () => new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
function citeFor(prov, title, kind, id, url) {
  return `${prov.name}${prov.short && prov.short !== prov.name ? ` (${prov.short})` : ''}. ${kind} «${title}»${id ? ` (${id})` : ''}. ${url}. Consultado el ${today()}`;
}

export function wfsLayerDef(prov, caps, ft) {
  return {
    id: 'svc', kind: 'vector', type: 'svc-wfs', name: ft.title, url: caps.url, typeName: ft.name, outputFormat: caps.json || 'application/json',
    geom: null, fields: [], bbox: ft.bbox, maxMpm: 2500, whole: false, cql: '', provider: { id: prov.id, short: prov.short, name: prov.name },
    attribution: `${prov.short || prov.name} – ${ft.title}`, cite: citeFor(prov, ft.title, 'Geoservicio WFS', ft.name, caps.url), note: ft.abstract || '',
  };
}
export function wmsLayerDef(prov, caps, ly, { style = '', noCors = false } = {}) {
  const proj = ly.crs && ly.crs.length ? ly.crs.map((x) => (x === 'EPSG:900913' ? 'EPSG:3857' : x)) : ['EPSG:3857', 'EPSG:4326'];
  const st = (ly.styles || []).find((s) => s.name === style) || (ly.styles || [])[0];
  return {
    id: 'svc', kind: 'raster', type: 'wms', name: ly.title, url: caps.url, layers: ly.name, styles: style, wmsProjections: [...new Set(proj)], noCors,
    legendUrl: st && st.legend ? st.legend : '', bbox: ly.bbox, provider: { id: prov.id, short: prov.short, name: prov.name },
    attribution: `${prov.short || prov.name} – ${ly.title}`, cite: citeFor(prov, ly.title, 'Geoservicio WMS', ly.name, caps.url), note: ly.abstract || '',
  };
}
export async function arcgisLayerDef(prov, serviceUrl, layer) {
  const info = await fetchJSON(`${serviceUrl}/${layer.id}?f=json`);
  const formats = String(info.supportedQueryFormats || '');
  const ext = info.extent;
  return {
    id: 'svc', kind: 'vector', type: 'svc-arcgis', name: info.name || layer.title, url: `${serviceUrl}/${layer.id}`, geom: GEOM(info.geometryType || ''),
    fields: (info.fields || []).filter((f) => !/Geometry|OID|GlobalID|Blob|Raster/.test(f.type)).map((f) => f.name),
    geojson: /geojson/i.test(formats), paginate: !!(info.advancedQueryCapabilities && info.advancedQueryCapabilities.supportsPagination), maxRec: info.maxRecordCount || 1000,
    maxMpm: 2500, whole: false, where: '', srcWkid: ext && ext.spatialReference ? ext.spatialReference.latestWkid || ext.spatialReference.wkid : null,
    provider: { id: prov.id, short: prov.short, name: prov.name },
    attribution: `${prov.short || prov.name} – ${info.name || layer.title}`, cite: citeFor(prov, info.name || layer.title, 'Servicio ArcGIS', `capa ${layer.id}`, serviceUrl), note: (info.description || '').replace(/<[^>]+>/g, ' ').slice(0, 400),
  };
}

// Prueba una capa WFS: tipo de geometría, campos, cantidad de objetos y orden de los ejes
export async function probeWfs(def, bboxLL) {
  const p = new URLSearchParams({ service: 'WFS', version: '1.1.0', request: 'GetFeature', typeName: def.typeName, outputFormat: def.outputFormat, srsName: 'EPSG:4326', maxFeatures: '5' });
  if (bboxLL) p.set('bbox', `${bboxLL.map((v) => v.toFixed(5)).join(',')},EPSG:4326`);
  let j = null;
  let firstErr = null;
  try { j = parseJSONorError(await fetchText(`${def.url}?${p}`)); } catch (e) { j = null; firstErr = e; }
  if ((!j || !j.features || !j.features.length) && bboxLL) {
    p.delete('bbox');
    try { j = parseJSONorError(await fetchText(`${def.url}?${p}`)); } catch (e) { throw new Error((firstErr || e).message); }
  }
  if (!j || !j.features) throw new Error('el servidor no devolvió GeoJSON para esta capa');
  const f = j.features.find((x) => x.geometry);
  const out = { geom: f ? GEOM(f.geometry.type) : null, fields: f ? Object.keys(f.properties || {}).filter((k) => !/^(geom|the_geom|shape|bbox)$/i.test(k)) : [], swap: false, hits: null, geomName: f && f.geometry_name ? f.geometry_name : '' };
  if (f) {
    const c = firstCoord(f.geometry.coordinates);
    if (c && Math.abs(c[0]) <= 90 && Math.abs(c[1]) > 90) out.swap = true;
    else if (c && bboxLL && c[0] >= bboxLL[1] - 1 && c[0] <= bboxLL[3] + 1 && c[1] >= bboxLL[0] - 1 && c[1] <= bboxLL[2] + 1 && !(c[0] >= bboxLL[0] - 1 && c[0] <= bboxLL[2] + 1)) out.swap = true;
  }
  try {
    const h = new URLSearchParams({ service: 'WFS', version: '1.1.0', request: 'GetFeature', typeName: def.typeName, resultType: 'hits' });
    const t = await fetchText(`${def.url}?${h}`, 12000);
    const m = t.match(/numberOf(?:Features|Matched)="(\d+)"/);
    if (m) out.hits = Number(m[1]);
  } catch (e) { /* no informa */ }
  return out;
}
function firstCoord(c) { let x = c; let g = 0; while (Array.isArray(x) && Array.isArray(x[0]) && g++ < 6) x = x[0]; return Array.isArray(x) && typeof x[0] === 'number' ? x : null; }
export function swapCoords(c) { return typeof c[0] === 'number' ? [c[1], c[0], ...c.slice(2)] : c.map(swapCoords); }

// Comprueba si un WMS deja leer sus imágenes (para exportar) o solo verlas
export async function wmsCorsOk(url) {
  try { await fetchText(`${baseUrl(url)}?service=WMS&version=1.3.0&request=GetCapabilities`, 12000); return true; } catch (e) { return false; }
}

export function bboxIntersects(a, b) { return !!(a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]); }
