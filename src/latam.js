// Fuentes para toda América Latina (de México a Tierra del Fuego):
// países, límites administrativos (geoBoundaries), datos de OpenStreetMap por tema (Overpass), unidad administrativa
// en un punto (Nominatim) y un directorio inicial de geoservicios oficiales por país.
import { EMBEDDED } from './embedded.js';
import { baseStyle } from './catalog.js';
import { uid } from './util.js';

// iso, nombre, capital aproximada (para centrar) — países y territorios de América Latina y el Caribe
export const COUNTRIES = [
  ['ARG', 'Argentina'], ['BOL', 'Bolivia'], ['BRA', 'Brasil'], ['CHL', 'Chile'], ['COL', 'Colombia'], ['CRI', 'Costa Rica'], ['CUB', 'Cuba'],
  ['DOM', 'República Dominicana'], ['ECU', 'Ecuador'], ['SLV', 'El Salvador'], ['GTM', 'Guatemala'], ['HTI', 'Haití'], ['HND', 'Honduras'],
  ['MEX', 'México'], ['NIC', 'Nicaragua'], ['PAN', 'Panamá'], ['PRY', 'Paraguay'], ['PER', 'Perú'], ['PRI', 'Puerto Rico'], ['URY', 'Uruguay'],
  ['VEN', 'Venezuela'], ['BLZ', 'Belice'], ['GUY', 'Guyana'], ['SUR', 'Surinam'], ['JAM', 'Jamaica'], ['TTO', 'Trinidad y Tobago'],
].map(([iso, name]) => ({ iso, name }));
export const countryName = (iso) => (COUNTRIES.find((c) => c.iso === iso) || {}).name || iso;

function ringContains(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a / 2); }

// País (propiedades de la base de América) que contiene un punto
export function countryAtLL(lon, lat) {
  const fc = EMBEDDED['data/paises_america.geojson'];
  for (const f of fc.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) if (ringContains(p[0], lon, lat)) return f.properties;
  }
  return null;
}

// Caja [O, S, E, N] de la parte principal de un país (su polígono más grande: deja afuera islas lejanas)
export function countryBBox(iso) {
  const f = (EMBEDDED['data/paises_america.geojson'].features || []).find((x) => x.properties.iso === iso);
  if (!f || !f.geometry) return null;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = null, bestA = -1;
  for (const p of polys) { const a = ringArea(p[0]); if (a > bestA) { bestA = a; best = p[0]; } }
  if (!best) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of best) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}

async function getText(url, { ms = 45000, init } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, ...(init || {}) });
    if (!r.ok) throw new Error(r.status === 404 ? 'no está publicado (404)' : r.status === 429 ? 'el servidor pide esperar un momento (demasiados pedidos)' : r.status === 504 ? 'el servidor tardó demasiado: probá con una vista más chica' : `HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('el servidor no respondió a tiempo');
    if (e instanceof TypeError) throw new Error('no hay conexión con el servidor');
    throw e;
  } finally { clearTimeout(t); }
}

// ---------- capa propia (los datos viajan dentro del mapa) ----------
const today = () => new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
export function userLayer(name, geojson, { style, legend, source, sem, labelField } = {}) {
  const st = baseStyle(style || { point: { fill: '#7a3fb0' }, line: { color: '#7a3fb0', width: 0.8 }, polygon: { fill: '#7a3fb0', fillOpacity: 0.25, stroke: '#7a3fb0', strokeWidth: 0.6 } });
  if (labelField != null) st.label = { ...st.label, field: labelField };
  const ls = {
    uid: uid('L'), def: 'user', name, visible: true, opacity: 1, blend: 'normal',
    adjust: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0 }, clip: 'none',
    style: st, params: sem ? { sem } : {}, legend: { show: true, label: legend || name }, insets: {}, rev: 0, _styleVersion: 0, data: geojson,
  };
  if (source) ls.source = source;
  return ls;
}

// ---------- límites administrativos: geoBoundaries (gbOpen, CC BY 4.0) ----------
export const ADM_LEVELS = [
  ['ADM1', 'Primer orden (estados, provincias, departamentos, regiones)'],
  ['ADM2', 'Segundo orden (municipios, partidos, cantones, comunas)'],
  ['ADM0', 'Contorno del país'],
];
const GB = (iso, adm) => `wmgeolab/geoBoundaries/main/releaseData/gbOpen/${iso}/${adm}/geoBoundaries-${iso}-${adm}_simplified.geojson`;
function bboxOfGeom(g) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
  walk(g.coordinates);
  return [w, s, e, n];
}
const roundC = (c, k = 1e5) => (typeof c[0] === 'number' ? [Math.round(c[0] * k) / k, Math.round(c[1] * k) / k] : c.map((x) => roundC(x, k)));

// bboxLL (opcional): se queda con las unidades que tocan esa caja, para no guardar un país entero dentro del mapa
export async function fetchBoundaries(iso, adm, bboxLL) {
  let text = null, lastErr = null;
  for (const u of [`https://media.githubusercontent.com/media/${GB(iso, adm)}`, `https://raw.githubusercontent.com/${GB(iso, adm)}`]) {
    try {
      const t = await getText(u, { ms: 90000 });
      if (/^version https:\/\/git-lfs/.test(t)) continue;
      text = t; break;
    } catch (e) { lastErr = e; }
  }
  if (!text) throw new Error(lastErr && /404/.test(lastErr.message) ? `geoBoundaries no tiene el nivel ${adm} de ${countryName(iso)}` : (lastErr ? lastErr.message : 'no se pudo leer el archivo'));
  const fc = JSON.parse(text);
  let feats = (fc.features || []).filter((f) => f.geometry);
  const total = feats.length;
  if (bboxLL) feats = feats.filter((f) => { const b = bboxOfGeom(f.geometry); return b[0] <= bboxLL[2] && b[2] >= bboxLL[0] && b[1] <= bboxLL[3] && b[3] >= bboxLL[1]; });
  const out = {
    type: 'FeatureCollection',
    features: feats.map((f, i) => ({ type: 'Feature', id: f.properties.shapeID || `${iso}-${adm}-${i}`, properties: { nombre: f.properties.shapeName || '', codigo: f.properties.shapeISO || '', nivel: adm, pais: iso }, geometry: { type: f.geometry.type, coordinates: roundC(f.geometry.coordinates) } })),
  };
  return { geojson: out, total, kept: out.features.length };
}
export function boundariesLayer(iso, adm, geojson) {
  const lv = adm === 'ADM0' ? 'contorno' : adm === 'ADM1' ? 'primer orden' : 'segundo orden';
  const name = `${countryName(iso)}: límites administrativos (${lv})`;
  const w = adm === 'ADM2' ? 0.25 : adm === 'ADM1' ? 0.45 : 0.7;
  const ls = userLayer(name, geojson, {
    style: { polygon: { fill: '#8a8270', fillOpacity: 0, stroke: adm === 'ADM2' ? '#8a8270' : '#55504a', strokeWidth: w, dash: adm === 'ADM2' ? 'dotted' : 'solid' }, label: { show: false, size: 6, color: '#55504a' } },
    labelField: 'nombre', sem: 'admin',
    source: { attribution: 'geoBoundaries', cite: `Runfola, D. et al. (2020). geoBoundaries: A global database of political administrative boundaries. PLoS ONE 15(4): e0231866. Límites de ${countryName(iso)} (${adm}, gbOpen, CC BY 4.0). https://www.geoboundaries.org. Consultado el ${today()}` },
  });
  return ls;
}

// ---------- OpenStreetMap por tema (Overpass API) ----------
// maxDeg2: superficie máxima de la vista (en grados cuadrados) que se puede pedir sin que el servidor corte el pedido
export const OSM_THEMES = [
  { id: 'rios', name: 'Ríos y canales', geom: 'line', maxDeg2: 30, q: 'way["waterway"~"^(river|canal)$"]', style: { line: { color: '#3b78a8', width: 0.6 } }, keep: ['name', 'waterway'] },
  { id: 'arroyos', name: 'Arroyos y cursos menores', geom: 'line', maxDeg2: 1.5, q: 'way["waterway"~"^(stream|drain|ditch)$"]', style: { line: { color: '#5b93bd', width: 0.3 } }, keep: ['name', 'waterway', 'intermittent'] },
  { id: 'agua', name: 'Lagos, lagunas y embalses', geom: 'polygon', maxDeg2: 6, q: 'way["natural"="water"];relation["natural"="water"]', style: { polygon: { fill: '#cfe0ea', fillOpacity: 1, stroke: '#3b78a8', strokeWidth: 0.25 } }, keep: ['name', 'water'] },
  { id: 'humedales', name: 'Humedales y bañados', geom: 'polygon', maxDeg2: 4, q: 'way["natural"="wetland"];relation["natural"="wetland"]', style: { polygon: { fill: '#b9d6c8', fillOpacity: 0.6, stroke: '#5d9a84', strokeWidth: 0.2 } }, keep: ['name', 'wetland'] },
  { id: 'vias', name: 'Rutas principales', geom: 'line', maxDeg2: 30, q: 'way["highway"~"^(motorway|trunk|primary)$"]', style: { line: { color: '#b5523b', width: 0.7 } }, keep: ['name', 'ref', 'highway', 'surface'] },
  { id: 'vias2', name: 'Rutas secundarias y terciarias', geom: 'line', maxDeg2: 4, q: 'way["highway"~"^(secondary|tertiary)$"]', style: { line: { color: '#8c5a2f', width: 0.4 } }, keep: ['name', 'ref', 'highway', 'surface'] },
  { id: 'caminos', name: 'Caminos rurales y huellas', geom: 'line', maxDeg2: 0.6, q: 'way["highway"~"^(unclassified|track)$"]', style: { line: { color: '#8a7a66', width: 0.25, dash: 'dashed' } }, keep: ['name', 'highway', 'surface', 'tracktype'] },
  { id: 'ferrocarril', name: 'Ferrocarriles', geom: 'line', maxDeg2: 30, q: 'way["railway"~"^(rail|narrow_gauge|disused|abandoned)$"]', style: { line: { color: '#3c3c3c', width: 0.5, dash: 'dashdot' } }, keep: ['name', 'railway', 'operator', 'gauge'] },
  { id: 'localidades', name: 'Ciudades, pueblos y parajes', geom: 'point', maxDeg2: 60, q: 'node["place"~"^(city|town|village|hamlet)$"]', style: { point: { shape: 'circle', size: 3.5, fill: '#2b2b2b', stroke: '#ffffff', strokeWidth: 0.4 }, label: { show: true, size: 6.5 } }, keep: ['name', 'place', 'population'] },
  { id: 'protegidas', name: 'Áreas protegidas', geom: 'polygon', maxDeg2: 60, q: 'way["boundary"="protected_area"];relation["boundary"="protected_area"];way["leisure"="nature_reserve"];relation["leisure"="nature_reserve"];relation["boundary"="national_park"]', style: { polygon: { fill: '#5a7d3a', fillOpacity: 0.22, stroke: '#5a7d3a', strokeWidth: 0.4 } }, keep: ['name', 'protect_class', 'protection_title', 'operator'] },
  { id: 'urbano', name: 'Áreas urbanas (uso residencial, comercial e industrial)', geom: 'polygon', maxDeg2: 1.5, q: 'way["landuse"~"^(residential|commercial|industrial|retail)$"];relation["landuse"~"^(residential|commercial|industrial|retail)$"]', style: { polygon: { fill: '#b9b0a2', fillOpacity: 0.55, stroke: '#8a8270', strokeWidth: 0.15 } }, keep: ['name', 'landuse'] },
  { id: 'bosques', name: 'Bosques y forestaciones', geom: 'polygon', maxDeg2: 1.5, q: 'way["natural"="wood"];relation["natural"="wood"];way["landuse"="forest"];relation["landuse"="forest"]', style: { polygon: { fill: '#8fb58a', fillOpacity: 0.5, stroke: '#5a7d3a', strokeWidth: 0.15 } }, keep: ['name', 'natural', 'landuse', 'leaf_type'] },
  { id: 'patrimonio', name: 'Sitios históricos y arqueológicos', geom: 'point', maxDeg2: 30, q: 'node["historic"];way["historic"]', style: { point: { shape: 'triangle', size: 4, fill: '#6a4c93', stroke: '#ffffff', strokeWidth: 0.4 } }, keep: ['name', 'historic', 'heritage', 'start_date'] },
];
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const sameP = (a, b) => a[0] === b[0] && a[1] === b[1];
// une tramos (vías de una relación) en anillos cerrados
function stitch(segs) {
  const rings = [];
  const pool = segs.map((s) => s.slice());
  while (pool.length) {
    let cur = pool.pop();
    let guard = 0;
    while (!sameP(cur[0], cur[cur.length - 1]) && guard++ < 5000) {
      const end = cur[cur.length - 1];
      const i = pool.findIndex((s) => sameP(s[0], end) || sameP(s[s.length - 1], end));
      if (i < 0) break;
      let nx = pool.splice(i, 1)[0];
      if (!sameP(nx[0], end)) nx = nx.reverse();
      cur = cur.concat(nx.slice(1));
    }
    if (cur.length >= 4 && sameP(cur[0], cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}
const coords = (geom) => (geom || []).filter(Boolean).map((p) => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);

export function osmToGeoJSON(json, theme) {
  const feats = [];
  const props = (el) => {
    const t = el.tags || {};
    const p = { nombre: t['name:es'] || t.name || '' };
    for (const k of theme.keep || []) if (k !== 'name' && t[k] != null) p[k] = t[k];
    return p;
  };
  for (const el of json.elements || []) {
    const id = `${el.type[0]}${el.id}`;
    if (el.type === 'node') {
      if (theme.geom === 'point' && el.lat != null) feats.push({ type: 'Feature', id, properties: props(el), geometry: { type: 'Point', coordinates: [el.lon, el.lat] } });
    } else if (el.type === 'way') {
      const c = coords(el.geometry);
      if (c.length < 2) continue;
      const closed = c.length >= 4 && sameP(c[0], c[c.length - 1]);
      if (theme.geom === 'polygon') { if (closed) feats.push({ type: 'Feature', id, properties: props(el), geometry: { type: 'Polygon', coordinates: [c] } }); }
      else if (theme.geom === 'line') feats.push({ type: 'Feature', id, properties: props(el), geometry: { type: 'LineString', coordinates: c } });
      else if (theme.geom === 'point') { // centro aproximado de un edificio o sitio dibujado como área
        const sx = c.reduce((a, p) => a + p[0], 0) / c.length, sy = c.reduce((a, p) => a + p[1], 0) / c.length;
        feats.push({ type: 'Feature', id, properties: props(el), geometry: { type: 'Point', coordinates: [Math.round(sx * 1e6) / 1e6, Math.round(sy * 1e6) / 1e6] } });
      }
    } else if (el.type === 'relation' && theme.geom === 'polygon') {
      const outer = stitch((el.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => coords(m.geometry)).filter((c) => c.length >= 2));
      const inner = stitch((el.members || []).filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => coords(m.geometry)).filter((c) => c.length >= 2));
      if (!outer.length) continue;
      const polys = outer.map((o) => [o]);
      for (const h of inner) { const host = polys.find((p) => ringContains(p[0], h[0][0], h[0][1])); if (host) host.push(h); }
      feats.push({ type: 'Feature', id, properties: props(el), geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } });
    }
  }
  return { type: 'FeatureCollection', features: feats };
}

export async function fetchOsm(themeId, bboxLL) {
  const theme = OSM_THEMES.find((t) => t.id === themeId);
  if (!theme) throw new Error('tema desconocido');
  const [w, s, e, n] = bboxLL;
  const deg2 = Math.max(0, e - w) * Math.max(0, n - s);
  if (deg2 > theme.maxDeg2) throw new Error(`la vista es demasiado grande para pedir «${theme.name}» (acercá el mapa: hasta unos ${Math.round(Math.sqrt(theme.maxDeg2) * 111)} km de lado)`);
  const body = `[out:json][timeout:90][bbox:${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}];(${theme.q.split(';').filter(Boolean).join(';')};);out geom qt;`;
  let lastErr = null;
  for (const url of OVERPASS) {
    try {
      const t = await getText(url, { ms: 110000, init: { method: 'POST', body: `data=${encodeURIComponent(body)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } });
      if (t.trim().startsWith('<')) throw new Error('el servidor de OpenStreetMap está ocupado: probá en un minuto');
      const j = JSON.parse(t);
      if (j.remark && /timed out|out of memory/i.test(j.remark)) throw new Error('el pedido es demasiado grande: acercá la vista');
      return { theme, geojson: osmToGeoJSON(j, theme) };
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error('no se pudo consultar OpenStreetMap');
}
export function osmLayer(theme, geojson, placeName) {
  return userLayer(`${theme.name}${placeName ? ` (${placeName})` : ''}`, geojson, {
    style: theme.style, labelField: 'nombre', legend: theme.name,
    sem: theme.geom === 'line' && /rios|arroyos/.test(theme.id) ? 'water-line' : theme.id === 'agua' ? 'water' : undefined,
    source: { attribution: '© colaboradores de OpenStreetMap', cite: `OpenStreetMap contributors. ${theme.name}, extraídos con Overpass API (ODbL). https://www.openstreetmap.org/copyright. Consultado el ${today()}` },
  });
}

// ---------- unidad administrativa que contiene un punto (Nominatim, OpenStreetMap) ----------
export async function adminAt(lon, lat) {
  for (const zoom of [10, 8, 5]) {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=${zoom}&polygon_geojson=1&polygon_threshold=0.0008&accept-language=es`;
    let j;
    try { j = JSON.parse(await getText(u, { ms: 25000 })); } catch (e) { if (zoom === 5) throw e; continue; }
    const g = j && j.geojson;
    if (g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
      const a = j.address || {};
      const name = j.name || a.municipality || a.county || a.city || a.town || a.state_district || a.state || (j.display_name || '').split(',')[0];
      return { name, geometry: { type: g.type, coordinates: roundC(g.coordinates) }, kind: j.addresstype || j.type || '', country: a.country || '' };
    }
  }
  return null;
}

// ---------- directorio de geoservicios oficiales por país ----------
// Comprobados el 23/11/2026 desde un navegador, con la web publicada como origen: `ok` responde y se puede leer (capas
// vectoriales editables y exportables); `ver` responde pero no permite leerse desde otra web (solo imagen WMS para ver);
// sin marca, no respondió ese día y queda para probar (la lista lo muestra al abrirlo).
const V = (id, jur, short, name, topics, urls, state) => ({ id, jur, short, name, topics, level: 'Nacional', source: 'latam', ...urls, ...(state === 'ok' ? { checked: '23/11/2026' } : state === 'ver' ? { checked: '23/11/2026', noCors: true, note: 'El servidor responde, pero no permite leerse desde otra web: sus capas se pueden sumar solo como imagen para ver, escribiendo el nombre de la capa. No salen en la exportación.' } : { unverified: true }) });
const ows = (u) => ({ wfs: u, wms: u });
export const LATAM = [
  V('mx-inegi', 'México', 'INEGI', 'Instituto Nacional de Estadística y Geografía (Mapa Digital de México)', 'marco geoestadístico, relieve, hidrografía, vías, localidades, ortofotos', { wms: 'https://gaia.inegi.org.mx/NLB/tunnel/wms/wms61' }, 'ver'),
  V('gt-segeplan', 'Guatemala', 'SEGEPLAN', 'IDE de Guatemala (SEGEPLAN)', 'límites, ordenamiento territorial, riesgo', { wms: 'https://ideg.segeplan.gob.gt/geoserver/ows' }, 'ver'),
  V('cr-snit', 'Costa Rica', 'SNIT', 'Sistema Nacional de Información Territorial (IGN de Costa Rica)', 'cartografía 1:5.000, límites, hidrografía, vías, catastro', { wfs: 'https://geos.snitcr.go.cr/be/IGN_5/wfs', wms: 'https://geos.snitcr.go.cr/be/IGN_5/wms' }),
  V('do-iderd', 'República Dominicana', 'IDE-RD', 'Infraestructura de Datos Espaciales de la República Dominicana', 'límites y cartografía base', ows('https://geoportal.iderd.gob.do/geoserver/ows'), 'ok'),
  V('co-igac', 'Colombia', 'IGAC', 'Instituto Geográfico Agustín Codazzi', 'catastro (carpeta «catastro»), cartografía básica, agrología, límites, ordenamiento territorial, relieve', { arcgis: 'https://mapas.igac.gov.co/server/rest/services' }, 'ok'),
  V('co-sgc', 'Colombia', 'SGC', 'Servicio Geológico Colombiano', 'geología, amenazas sísmica y volcánica, geoquímica', { arcgis: 'https://srvags.sgc.gov.co/arcgis/rest/services' }, 'ok'),
  V('co-dane', 'Colombia', 'DANE', 'Departamento Administrativo Nacional de Estadística', 'marco geoestadístico nacional, censo, indicadores por municipio', { arcgis: 'https://geoportal.dane.gov.co/mparcgis/rest/services' }),
  V('ec-igm', 'Ecuador', 'IGM', 'Instituto Geográfico Militar', 'cartografía base, límites', ows('https://www.geoportaligm.gob.ec/geoserver/ows'), 'ok'),
  V('pe-idep', 'Perú', 'IDEP / IGN', 'Infraestructura de Datos Espaciales del Perú (IGN)', 'cartografía nacional, límites, cartografía binacional', { arcgis: 'https://www.idep.gob.pe/geoportal/rest/services' }, 'ok'),
  V('pe-sernanp', 'Perú', 'SERNANP', 'Servicio Nacional de Áreas Naturales Protegidas', 'áreas naturales protegidas, zonas de amortiguamiento', { arcgis: 'https://geoservicios.sernanp.gob.pe/arcgis/rest/services' }, 'ok'),
  V('bo-geobolivia', 'Bolivia', 'GeoBolivia', 'IDE del Estado Plurinacional de Bolivia', 'límites, hidrografía, vías, áreas protegidas, uso del suelo', ows('https://geo.gob.bo/geoserver/ows')),
  V('br-car', 'Brasil', 'SICAR', 'Cadastro Ambiental Rural (Serviço Florestal Brasileiro)', 'catastro rural: imóveis rurais por estado, reserva legal, áreas de preservação', { wfs: 'https://geoserver.car.gov.br/geoserver/sicar/wfs', wms: 'https://geoserver.car.gov.br/geoserver/sicar/wms' }, 'ok'),
  V('br-inde', 'Brasil', 'INDE', 'Infraestrutura Nacional de Dados Espaciais', 'catálogo nacional (unas 5.000 capas): ministérios, agências e estados; tarda en abrir', { wfs: 'https://geoservicos.inde.gov.br/geoserver/ows' }, 'ok'),
  V('br-inpe', 'Brasil', 'INPE', 'INPE: TerraBrasilis (PRODES, DETER)', 'desmatamento anual, alertas, biomas', { wfs: 'https://terrabrasilis.dpi.inpe.br/geoserver/ows' }, 'ok'),
  V('br-funai', 'Brasil', 'FUNAI', 'Fundação Nacional dos Povos Indígenas', 'terras indígenas, aldeias', ows('https://geoserver.funai.gov.br/geoserver/ows'), 'ok'),
  V('br-ana', 'Brasil', 'ANA', 'Agência Nacional de Águas e Saneamento Básico (SNIRH)', 'bacias, rede hidrográfica, usos da água', { arcgis: 'https://www.snirh.gov.br/arcgis/rest/services' }, 'ok'),
  V('br-sgb', 'Brasil', 'SGB', 'Serviço Geológico do Brasil (CPRM)', 'geologia, recursos minerais, risco geológico', { arcgis: 'https://geoportal.sgb.gov.br/server/rest/services' }, 'ok'),
  V('br-ibge', 'Brasil', 'IBGE', 'Instituto Brasileiro de Geografia e Estatística', 'malha municipal, setores censitários, biomas, relevo, vegetação', ows('https://geoservicos.ibge.gov.br/geoserver/ows')),
  V('uy-ide', 'Uruguay', 'IDEuy', 'Infraestructura de Datos Espaciales del Uruguay', 'cartografía nacional: catastro, hidrografía, vialidad, edificaciones, límites, relieve', ows('https://mapas.ide.uy/geoserver-vectorial/ows'), 'ok'),
  V('uy-ide-img', 'Uruguay', 'IDEuy imágenes', 'IDEuy: ortoimágenes y modelos de elevación', 'ortoimágenes nacionales y urbanas, modelo digital de terreno', { wms: 'https://mapas.ide.uy/geoserver-raster/ows' }, 'ok'),
  V('uy-mtop', 'Uruguay', 'MTOP', 'Ministerio de Transporte y Obras Públicas', 'rutas, caminería rural, puertos, hidrografía, límites, parcelarios', ows('https://geoservicios.mtop.gub.uy/geoserver/ows'), 'ok'),
  V('uy-mgap', 'Uruguay', 'MGAP', 'Ministerio de Ganadería, Agricultura y Pesca (RENARE)', 'suelos CONEAT, uso y cobertura', { arcgis: 'https://dgrn.mgap.gub.uy/arcgis/rest/services' }, 'ok'),
  V('cl-ciren', 'Chile', 'CIREN', 'Centro de Información de Recursos Naturales', 'catastro: propiedades rurales, catastro frutícola; suelos, recursos hídricos, emergencias', { arcgis: 'https://esri.ciren.cl/server/rest/services' }, 'ok'),
  V('cl-mop', 'Chile', 'MOP', 'Ministerio de Obras Públicas', 'red vial, obras hidráulicas, aeropuertos, puertos', { arcgis: 'https://rest-sit.mop.gob.cl/arcgis/rest/services' }, 'ok'),
  V('cl-mma', 'Chile', 'MMA', 'Ministerio del Medio Ambiente', 'áreas protegidas, humedales, calidad del aire, biodiversidad', { arcgis: 'https://arcgis.mma.gob.cl/server/rest/services' }, 'ok'),
];
