// Primer mapa de un proyecto nuevo: se arma a partir de los datos del proyecto, el área de trabajo y las opciones del asistente.
import { emptyState, newLayerState, newInset, newText, mergeDeep } from './state.js';
import { registerProjections, posgarCode, gkFaja } from './projections.js';
import { getMedia, applyMediaPage } from './media.js';
import { getTheme, applyTheme } from './themes.js';
import { baseStyle } from './catalog.js';
import { uid } from './util.js';

const L = (id, over) => newLayerState(id, over);

// metros de terreno por mm de papel para que la caja (lon/lat) entre en el marco
function fitMpm(bbox, frame) {
  const [w, s, e, n] = bbox;
  const lat = (s + n) / 2;
  const wm = Math.max(200, (e - w) * 111320 * Math.cos((lat * Math.PI) / 180));
  const hm = Math.max(200, (n - s) * 110540);
  return Math.max(wm / frame.w, hm / frame.h) * 1.18;
}

export function areaLayer(area, color = '#b5523b') {
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nombre: area.name || 'Área de estudio' }, geometry: area.geom }] };
  const isPoint = area.geom && area.geom.type === 'Point';
  return {
    uid: uid('L'), def: 'user', name: `Área de estudio${area.name ? `: ${area.name}` : ''}`, visible: true, opacity: 1, blend: 'normal',
    adjust: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0 }, clip: 'none',
    style: baseStyle({ point: { shape: 'star', size: 9, fill: color, stroke: '#ffffff', strokeWidth: 0.6 }, polygon: { fill: color, fillOpacity: 0, stroke: color, strokeWidth: 1.4, dash: 'solid' }, line: { color, width: 1.2 }, label: { show: isPoint, field: 'nombre', size: 7, bold: true } }),
    params: { sem: 'study-area' }, legend: { show: true, label: area.name || 'Área de estudio' }, insets: {}, rev: 0, _styleVersion: 0, data: fc,
  };
}

// opts: { start: 'satellite'|'blank', mediaId, themeId, projection, layers: [catalog ids], context: bool, mapName }
export function buildFirstMap(meta, area, opts = {}) {
  registerProjections();
  const s = emptyState();
  s.title = opts.mapName || meta.name || 'Mapa 1';
  s.thesis = mergeDeep(s.thesis, { title: meta.title || '', keywords: meta.keywords || '', discipline: meta.discipline || 'geografia', period: meta.period || '', place: area && area.name ? area.name : '' });
  const m = getMedia(opts.mediaId || meta.mediaId || 'tesis-a4');
  s.media.profileId = m.id;
  applyMediaPage(s, m);
  const portrait = s.page.heightMM >= s.page.widthMM;
  s.page.margins = portrait ? { top: 7, right: 6, bottom: 8, left: 10 } : { top: 8, right: 8, bottom: 10, left: 12 };
  const f = { x: s.page.margins.left, y: s.page.margins.top, w: s.page.widthMM - s.page.margins.left - s.page.margins.right, h: s.page.heightMM - s.page.margins.top - s.page.margins.bottom };
  // vista
  const bbox = area && area.bbox ? area.bbox : [-73.6, -55.1, -53.6, -21.8];
  const center = area && area.center ? area.center : [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  let mpm = fitMpm(bbox, f);
  if (area && area.geom && area.geom.type === 'Point') mpm = Math.max(mpm, 60);
  s.projection = opts.projection || (center[1] < -60 ? 'EPSG:3031' : mpm > 9000 ? 'CONI:BICONT' : posgarCode(center[0]));
  s.view = { center, mpm, rotation: 0 };
  // capas
  const layers = [];
  if (opts.start === 'satellite') layers.push(L('esri-mundo', { opacity: 1 }));
  for (const id of opts.layers || []) {
    try { layers.push(L(id)); } catch (e) { /* capa desconocida */ }
  }
  const isPoint = !!(area && area.geom && area.geom.type === 'Point');
  if (area && area.geom && !isPoint) layers.push(areaLayer(area));
  layers.push(L('graticule', { style: { label: { show: true, mode: 'frame', size: 6, edges: 'classic', vertical: true } } }));
  // orden: ráster abajo, vectores, grilla arriba
  const raster = layers.filter((l) => l.def !== 'user' && l.def !== 'graticule' && ['esri-mundo', 'dem-analitico', 'ign-argenmap', 'ign-gris', 'eox-s2'].includes(l.def));
  const rest = layers.filter((l) => !raster.includes(l) && l.def !== 'graticule');
  s.layers = [...raster, ...rest, layers.find((l) => l.def === 'graticule')];
  // mapa de ubicación
  if (opts.context !== false && mpm < 9000) {
    const w = Math.min(f.w, f.h) * 0.27, h = w * 1.3;
    const ne = L('ne-paises', { visible: false, legend: { show: false }, style: { polygon: { fill: '#e6dfcc', stroke: '#8a8270', strokeWidth: 0.25 }, categorize: { field: 'iso', values: { ARG: '#d9cfb5' } } } });
    s.layers.unshift(ne);
    const z = newInset({ name: 'Ubicación en la Argentina', mode: 'context', shape: 'rect', x: f.x + 3, y: f.y + 3, w, h, center: [-61, -40], mpm: 70000 * (40 / w), projection: 'CONI:BICONT', bg: '#f1ecdf', border: { color: '#2b2b2b', width: 0.5, dash: 'solid' }, connector: { type: 'none', color: '#2b2b2b', width: 0.5, dash: 'solid' } });
    z.layers = Object.fromEntries(s.layers.map((l) => [l.uid, l === ne]));
    s.insets = [z];
  }
  // sitio: en un área puntual es el símbolo principal; en un área poligonal solo se marca en el mapa de ubicación
  if (area && area.center) {
    s.sites = [{ id: uid('S'), name: area.name || 'Área de estudio', lon: area.center[0], lat: area.center[1], cats: [], color: '#b5523b', label: { show: isPoint }, note: '' }];
    s.siteStyle = mergeDeep(s.siteStyle, { shape: 'square', size: 6, label: { show: true, size: 7.5, bold: true } });
    if (!isPoint) {
      s.sitesVisible = false;
      if (s.insets[0]) s.insets[0].layers.__sites__ = true;
    }
  }
  // composición
  s.legend = mergeDeep(s.legend, { x: f.x + f.w - 46, y: f.y + f.h - 48, title: 'Referencias', size: 6.5, titleSize: 7.5 });
  s.north = mergeDeep(s.north, { x: f.x + f.w - 14, y: f.y + 5, size: 10 });
  s.scalebar = mergeDeep(s.scalebar, { x: f.x + 5, y: f.y + f.h - 8, lengthMM: Math.min(40, f.w * 0.25), style: 'line', segments: 4, units: 'km' });
  s.texts = [];
  s.caption = { figure: 'Figura 1', lead: area && area.name ? `Localización de ${area.name}.` : 'Mapa de localización del área de estudio.', withAuthor: true };
  const theme = getTheme(opts.themeId || meta.themeId);
  if (theme) applyTheme(s, theme, { recolorCategories: false, keepBackground: opts.start === 'satellite' });
  return s;
}

export { gkFaja };
