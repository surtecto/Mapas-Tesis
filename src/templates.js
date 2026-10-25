// Plantillas de proyecto (modelos de ejemplo): Pago Gilense (localización, histórico, interpretación, proyector)
// y los modelos antárticos heredados de Coni-Mapas.
import { emptyState, newLayerState, newInset, newText, mergeDeep, newVersion } from './state.js';
import { getTheme, applyTheme } from './themes.js';
import { EXAMPLE_LESCANO, newSource } from './interp.js';
import { getMedia, applyMediaPage, fitToMedia } from './media.js';
import { rotationForMeridian, registerProjections } from './projections.js';
import { uid } from './util.js';

const L = (id, over) => newLayerState(id, over);

function penguinCategories() {
  return [
    { id: 'adelia', name: 'Adelia', color: '#3176b1' },
    { id: 'emperador', name: 'Emperador', color: '#e29f2c' },
    { id: 'papua', name: 'Papúa', color: '#36a177' },
  ];
}

export function templateConi() {
  registerProjections();
  const s = emptyState();
  s.title = 'Sitios de muestreo de pingüinos 2025–2026';
  s.page = mergeDeep(s.page, { preset: 'custom', widthMM: 180, heightMM: 200, margins: { top: 6, right: 6, bottom: 9, left: 10 }, background: '#ffffff', frame: { show: true, color: '#1d1d1d', width: 0.6 } });
  s.projection = 'EPSG:3031';
  s.view = { center: [-58.6, -64.6], mpm: 11500, rotation: rotationForMeridian('EPSG:3031', -58) };
  s.page.background = '#d9e6ec';
  s.layers = [
    L('add-costa', { style: { polygon: { fill: '#f7f9fa', stroke: '#43525c', strokeWidth: 0.35 }, categorize: { field: 'surface', values: { land: '#f7f9fa', 'ice shelf': '#e4eef3', 'ice tongue': '#e4eef3', rumple: '#ecf2f5' } } } }),
    L('rema-relieve', { blend: 'multiply', opacity: 0.55 }),
    L('ne-paises', { style: { polygon: { fill: '#ece7db', stroke: '#6f6a5f', strokeWidth: 0.3 }, categorize: { field: 'iso', values: { ARG: '#e3dccb' } } } }),
    L('ign-zee', { visible: false }),
    L('ref-sector', { style: { polygon: { stroke: '#2b2b2b', strokeWidth: 0.7, dash: 'dashed' } }, legend: { show: true, label: 'Sector Antártico Argentino' } }),
    L('ref-60s', { visible: false }),
    L('ign-bases', { style: { point: { shape: 'square', size: 4, fill: '#ffffff', stroke: '#1d1d1d', strokeWidth: 0.6 }, label: { show: false } }, legend: { show: true, label: 'Bases antárticas argentinas' } }),
    L('graticule', { style: { line: { color: '#5a6b78', width: 0.3, opacity: 0.7, dash: 'solid' }, label: { show: true, mode: 'frame', size: 6, color: '#33424e', font: 'Source Sans 3', edges: 'classic', vertical: true }, interval: 'auto', intervalLon: 'auto' } }),
  ];
  s.categories = penguinCategories();
  s.paletteId = 'pinguinos';
  s.sites = [
    { id: uid('S'), name: 'Isla Cerro Nevado', lon: -57.27, lat: -64.48, cats: ['emperador'], label: { show: true, dx: 0, dy: -9, align: 'center' }, note: 'Colonia de pingüino emperador (octubre 2025, n = 7)' },
    { id: uid('S'), name: 'Península Potter', lon: -58.64, lat: -62.255, cats: ['adelia', 'papua'], label: { show: true, dx: -6.5, dy: 0, align: 'right' }, note: 'Isla 25 de Mayo (enero 2026; Adelia n = 9, papúa n = 16)' },
  ];
  s.siteStyle.size = 8.5;
  s.siteStyle.multi = 'pie';
  s.insets = [newInset({
    name: 'Zoom norte de la península', shape: 'circle', x: 92, y: 12, w: 78, h: 78,
    center: [-57.95, -63.37], mpm: 4300, bg: '#d9e6ec',
    border: { color: '#1d1d1d', width: 0.7, dash: 'dashed' },
    connector: { type: 'tangent', color: '#1d1d1d', width: 0.6, dash: 'dashed' },
    footprint: { show: true, color: '#1d1d1d', width: 0.6, dash: 'dashed', fill: '#ffffff', fillOpacity: 0 },
  })];
  s.legend = mergeDeep(s.legend, { x: 104, y: 158, title: 'Especies muestreadas', size: 7.5, titleSize: 8, symbolSize: 8, bgOpacity: 0.92 });
  s.north = mergeDeep(s.north, { x: 160, y: 136, size: 11, style: 'circle' });
  s.scalebar = mergeDeep(s.scalebar, { x: 16, y: 183, lengthMM: 34, style: 'alternating', segments: 4, units: 'km', showRF: false });
  s.texts = [
    newText({ text: 'Mar de Weddell', anchor: 'geo', lon: -50.5, lat: -69.5, font: 'Source Sans 3', size: 9, italic: true, uppercase: true, letterSpacing: 0.35, color: '#2f6f9f', halo: '#ffffff', haloWidth: 0.8 }),
    newText({ text: 'Pasaje Drake', anchor: 'geo', lon: -66, lat: -58.8, size: 8, italic: true, uppercase: true, letterSpacing: 0.3, color: '#2f6f9f', halo: '#ffffff', haloWidth: 0.8, rotation: -18 }),
    newText({ text: 'Península Antártica', anchor: 'geo', lon: -64.6, lat: -67.6, size: 7, uppercase: true, letterSpacing: 0.22, color: '#33414d', halo: '#ffffff', haloWidth: 0.9, rotation: -62 }),
    newText({ text: 'Islas Shetland del Sur', anchor: 'geo', lon: -61.9, lat: -62.55, size: 6.5, uppercase: true, letterSpacing: 0.1, color: '#33414d', halo: '#ffffff', haloWidth: 0.8, rotation: -14 }),
  ];
  s.caption = { figure: 'Figura 1', lead: 'Ubicación de los sitios de muestreo de pingüino emperador (isla Cerro Nevado, octubre de 2025) y de pingüinos Adelia y papúa (península Potter, isla 25 de Mayo, enero de 2026).' };
  return s;
}

export function templateModelo1() {
  registerProjections();
  const s = emptyState();
  s.title = 'Modelo 1: sector antártico con imagen satelital';
  s.page = mergeDeep(s.page, { preset: 'custom', widthMM: 180, heightMM: 195, margins: { top: 0, right: 0, bottom: 0, left: 0 }, background: '#ffffff', frame: { show: true, color: '#555555', width: 0.5 } });
  s.projection = 'EPSG:3031';
  s.view = { center: [-56.5, -63.2], mpm: 12500, rotation: rotationForMeridian('EPSG:3031', -56) };
  s.layers = [
    L('esri-antartida'),
    L('ign-plataforma', { style: { polygon: { fill: '#a9d8ee', fillOpacity: 0.35, stroke: '#a9e1ff', strokeWidth: 0.5, dash: 'dashdot' } }, legend: { show: false } }),
    L('ign-zee', { style: { polygon: { fill: '#a9d8ee', fillOpacity: 0.35, stroke: '#a9e1ff', strokeWidth: 0.5, dash: 'dashdot' } }, legend: { show: false } }),
    L('ref-sector', { style: { polygon: { stroke: '#3b3b3b', strokeWidth: 0.7, dash: 'solid' } }, legend: { show: false } }),
    L('graticule', { visible: false }),
  ];
  s.categories = [
    { id: 'c1', name: 'Base Esperanza', color: '#1747e8' },
    { id: 'c2', name: 'Base Marambio', color: '#f7e017' },
    { id: 'c3', name: 'Isla Cerro Nevado', color: '#ee1c1c' },
  ];
  s.paletteId = 'modelo1';
  s.sites = [
    { id: uid('S'), name: 'Base Esperanza', lon: -56.997, lat: -63.398, cats: ['c1'], label: { show: false } },
    { id: uid('S'), name: 'Base Marambio', lon: -56.625, lat: -64.241, cats: ['c2'], label: { show: false } },
    { id: uid('S'), name: 'Isla Cerro Nevado', lon: -57.25, lat: -64.5, cats: ['c3'], label: { show: false } },
  ];
  s.siteStyle = mergeDeep(s.siteStyle, { size: 7, stroke: '#1d1d1d', strokeWidth: 0.4, label: { show: false } });
  s.insets = [newInset({
    name: 'Zoom', shape: 'circle', x: 72, y: 9, w: 103, h: 103, center: [-57.0, -63.95], mpm: 1500, bg: '#5d8fa8',
    border: { color: '#111111', width: 0.6, dash: 'dashed' }, connector: { type: 'center', color: '#111111', width: 0.6, dash: 'dashed' },
    footprint: { show: true, color: '#111111', width: 0.6, dash: 'dashed', fill: '#ffffff', fillOpacity: 0 },
  })];
  s.legend = mergeDeep(s.legend, { x: 94, y: 148, title: '', size: 12, symbolSize: 8, color: '#ffffff', bold: true, bg: '#1d3a4c', bgOpacity: 0.72, border: '#1d3a4c', borderWidth: 0, radius: 2.5, padding: 4, gap: 3 });
  s.north = mergeDeep(s.north, { x: 160, y: 172, size: 13, style: 'circle' });
  s.scalebar = mergeDeep(s.scalebar, { show: false, x: 10, y: 186 });
  s.texts = [
    newText({ text: 'Islas Malvinas\n(Arg.)', anchor: 'geo', lon: -59.3, lat: -50.6, size: 6.5, color: '#3a3a3a', uppercase: true }),
    newText({ text: 'Pasaje Drake', anchor: 'geo', lon: -63.5, lat: -59.2, size: 7.5, color: '#7cc8f0', uppercase: true, rotation: -20 }),
    newText({ text: 'Islas Shetland\ndel Sur', anchor: 'geo', lon: -61.2, lat: -61.5, size: 6.5, color: '#3a3a3a', uppercase: true }),
    newText({ text: 'Mar de Weddell', anchor: 'geo', lon: -47, lat: -68.5, size: 8, color: '#7cc8f0', uppercase: true, letterSpacing: 0.9 }),
    newText({ text: 'Península Antártica', anchor: 'geo', lon: -64.5, lat: -69.2, size: 6.5, color: '#3a3a3a', uppercase: true, rotation: -70 }),
  ];
  s.caption = { figure: 'Figura 1', lead: 'Ubicación del área de estudio en el Sector Antártico Argentino.' };
  return s;
}

export function templateModelo2() {
  registerProjections();
  const s = emptyState();
  s.title = 'Modelo 2: vectorial plano bicontinental';
  s.page = mergeDeep(s.page, { preset: 'custom', widthMM: 180, heightMM: 172, margins: { top: 0, right: 0, bottom: 0, left: 0 }, background: '#f3f3f3', frame: { show: false, color: '#222222', width: 0.5 } });
  s.projection = 'CONI:BICONT';
  s.view = { center: [-44, -48], mpm: 36000, rotation: 0 };
  s.layers = [
    L('ne-paises', { style: { polygon: { fill: '#9ebebb', fillOpacity: 1, stroke: '#c9dad8', strokeWidth: 0.25 }, categorize: { field: '', values: {} } }, legend: { show: false } }),
    L('add-costa', { style: { polygon: { fill: '#6aa39a', fillOpacity: 1, stroke: '#111111', strokeWidth: 0.35 }, categorize: { field: '', values: {} } }, legend: { show: false } }),
  ];
  s.categories = [
    { id: 'm1', name: 'Potter Peninsula', color: '#8ebdd9' },
    { id: 'm2', name: 'Esperanza/Hope Bay', color: '#f98f39' },
    { id: 'm3', name: 'Marambio Island', color: '#651368' },
  ];
  s.paletteId = 'modelo2';
  s.sites = [
    { id: uid('S'), name: 'Potter Peninsula', lon: -58.66, lat: -62.25, cats: ['m1'], label: { show: false } },
    { id: uid('S'), name: 'Esperanza/Hope Bay', lon: -57.0, lat: -63.39, cats: ['m2'], label: { show: false } },
    { id: uid('S'), name: 'Marambio Island', lon: -56.72, lat: -64.24, cats: ['m3'], label: { show: false } },
  ];
  s.siteStyle = mergeDeep(s.siteStyle, { size: 0, halo: { show: true, unit: 'km', km: 14, size: 22, fillOpacity: 0.38, strokeWidth: 2.6, dot: false }, label: { show: false } });
  s.insets = [newInset({
    name: 'Detalle', shape: 'circle', x: 58, y: 6, w: 116, h: 116, center: [-58.0, -63.25], mpm: 2400, bg: '#f3f3f3',
    border: { color: '#111111', width: 0.6, dash: 'solid' }, connector: { type: 'center', color: '#111111', width: 0.5, dash: 'solid' },
    footprint: { show: true, color: '#111111', width: 0.6, dash: 'solid', fill: '#ffffff', fillOpacity: 0 },
  })];
  s.legend = mergeDeep(s.legend, { x: 95, y: 128, title: '', size: 11, symbolSize: 11, color: '#111111', bg: '#f3f3f3', bgOpacity: 0, borderWidth: 0, padding: 2, gap: 3 });
  s.north = mergeDeep(s.north, { show: false, x: 165, y: 150 });
  s.scalebar = mergeDeep(s.scalebar, { show: false, x: 10, y: 160 });
  s.texts = [newText({ text: 'Fig. 1', anchor: 'page', x: 13, y: 160, size: 14, bold: true, color: '#111111', align: 'left' })];
  s.caption = { figure: 'Fig. 1', lead: 'Study sites in the northern Antarctic Peninsula.' };
  return s;
}

export function templateBlank() {
  registerProjections();
  const s = emptyState();
  s.title = 'Mapa nuevo';
  s.projection = 'EPSG:3031';
  s.view = { center: [-58, -66], mpm: 15000, rotation: rotationForMeridian('EPSG:3031', -58) };
  s.page = mergeDeep(s.page, { margins: { top: 5, right: 5, bottom: 8, left: 9 } });
  s.page.background = '#d9e6ec';
  s.layers = [L('add-costa'), L('rema-relieve', { blend: 'multiply', opacity: 0.6 }), L('ref-sector'), L('graticule')];
  s.legend.x = 14; s.legend.y = 12;
  s.north = mergeDeep(s.north, { x: 160, y: 20 });
  s.scalebar = mergeDeep(s.scalebar, { x: 16, y: 164 });
  return s;
}


// ---------- Pago Gilense ----------
export const THESIS_EXAMPLE = {
  title: 'Variantes e invariantes culturales en los procesos de construcción del paisaje de la llanura pampeana. Estudio de las particularidades del territorio cuya centralidad es la ciudad de San Andrés de Giles',
  keywords: 'paisaje pampeano; Pago Gilense; mensuras y suertes de estancia (siglo XIX); caminos y cañadas; vaquería, estancia y colonialidad; pueblos originarios y mundo mestizo; identidad territorial; patrimonio rural',
  discipline: 'geografia', period: '1750–1925 y presente', place: 'San Andrés de Giles, provincia de Buenos Aires',
};

function gilesBase(s, { title, theme = 'paisaje-pampeano', media = 'tesis-a4' } = {}) {
  s.title = title;
  s.thesis = mergeDeep(s.thesis, THESIS_EXAMPLE);
  const m = getMedia(media);
  s.media.profileId = m.id;
  applyMediaPage(s, m);
  s.page = mergeDeep(s.page, { margins: { top: 7, right: 6, bottom: 8, left: 10 }, frame: { show: true, color: '#2b2b2b', width: 0.6 } });
  s.projection = 'EPSG:5347';
  s.view = { center: [-59.475, -34.43], mpm: 370, rotation: 0 };
  s.thesis.themeId = theme;
  return s;
}

function gilesSite() {
  return { id: uid('S'), name: 'San Andrés de Giles', lon: -59.4453, lat: -34.4467, cats: [], color: '#b5523b', label: { show: true, dx: 0, dy: -7, align: 'center' }, note: 'Ciudad cabecera del partido' };
}

export function templateGiles() {
  registerProjections();
  const s = gilesBase(emptyState(), { title: 'Pago Gilense: localización en la Pampa ondulada' });
  s.layers = [
    L('dem-analitico', { opacity: 0.55, blend: 'multiply', params: { ramp: 'pampa', min: 15, max: 95, shade: true, azimuth: 315, altitude: 35, zFactor: 9, shadeStrength: 0.6, transparentSea: false } }),
    L('ign-espejos', { legend: { show: false } }), L('ign-banados', { legend: { show: true, label: 'Bañados' } }), L('ign-planta-urbana', { legend: { show: false } }),
    L('ign-departamentos', { style: { polygon: { fill: '#ffffff', fillOpacity: 0, stroke: '#5a5a5a', strokeWidth: 0.45, dash: 'dashdot' }, label: { show: true, field: 'nam', size: 6, uppercase: true, letterSpacing: 0.15 } }, legend: { show: true, label: 'Límite de partido' } }),
    L('atlas-partido', { legend: { show: true, label: 'Partido de San Andrés de Giles' } }),
    L('ign-caminos', { legend: { show: true, label: 'Caminos rurales' } }),
    L('ign-ruta-prov', { legend: { show: true, label: 'Rutas provinciales' } }),
    L('ign-ruta-nac', { legend: { show: true, label: 'Rutas nacionales' } }),
    L('ign-ferrocarril', { legend: { show: true, label: 'Ferrocarril' } }),
    L('ign-rios-int', { legend: { show: true, label: 'Cañadas y cursos intermitentes' } }),
    L('ign-rios', { style: { label: { show: true, field: 'fna', size: 5.5, italic: true } }, legend: { show: true, label: 'Ríos y arroyos' } }),
    L('ign-localidades', { legend: { show: true, label: 'Localidades' } }),
    L('graticule', { style: { interval: String(1 / 6), intervalLon: String(1 / 6), label: { show: true, mode: 'frame', size: 6, edges: 'classic', vertical: true } } }),
  ];
  s.sites = [gilesSite()];
  s.siteStyle = mergeDeep(s.siteStyle, { shape: 'square', size: 6, stroke: '#ffffff', strokeWidth: 0.6, label: { show: true, size: 7.5, bold: true } });
  const f = { x: 10, y: 7, w: 144, h: 215 };
  s.insets = [newInset({
    name: 'Ubicación en la Argentina', mode: 'context', shape: 'rect', x: f.x + 3, y: f.y + 3, w: 40, h: 52, center: [-61, -40], mpm: 70000,
    projection: 'CONI:BICONT', bg: '#f1ecdf', border: { color: '#2b2b2b', width: 0.5, dash: 'solid' }, connector: { type: 'none', color: '#2b2b2b', width: 0.5, dash: 'solid' },
  })];
  s.layers.push(L('ne-paises', { visible: false, style: { polygon: { fill: '#e6dfcc', stroke: '#8a8270', strokeWidth: 0.25 }, categorize: { field: 'iso', values: { ARG: '#d9cfb5' } } }, legend: { show: false } }));
  const ne = s.layers[s.layers.length - 1];
  s.insets[0].layers = Object.fromEntries(s.layers.map((l) => [l.uid, l === ne]));
  s.legend = mergeDeep(s.legend, { x: 111, y: 170, title: 'Referencias', size: 6.3, titleSize: 7.3, symbolSize: 7 });
  s.north = mergeDeep(s.north, { x: 140, y: 12, size: 10 });
  s.scalebar = mergeDeep(s.scalebar, { x: 14, y: 214, lengthMM: 36, style: 'line', segments: 4, units: 'km' });
  s.texts = [newText({ text: 'Pago Gilense', anchor: 'geo', lon: -59.56, lat: -34.36, size: 10, uppercase: true, letterSpacing: 0.3, bold: true, color: '#5b3a1e', halo: '#ffffff', haloWidth: 0.8, font: 'Source Serif 4' })];
  s.caption = { figure: 'Figura 1', lead: 'Localización del Pago Gilense (partido de San Andrés de Giles) en la Pampa ondulada, provincia de Buenos Aires: red hídrica, caminos y localidades sobre el relieve.' };
  applyTheme(s, getTheme('paisaje-pampeano'), { recolorCategories: false });
  return s;
}

export function templateGilesHistorico() {
  registerProjections();
  const s = gilesBase(emptyState(), { title: 'Pago Gilense: mensuras y caminos (1825–1925)', theme: 'tinta-historica' });
  s.view = { center: [-59.47, -34.44], mpm: 300, rotation: 0 };
  s.layers = [
    L('atlas-r1874', { legend: { show: true, label: 'Registro gráfico c. 1874' } }),
    L('atlas-mensuras', { opacity: 0.85, legend: { show: true, label: 'Mensuras por período' } }),
    L('ign-rios', { opacity: 0.8, legend: { show: true, label: 'Ríos y arroyos actuales' } }),
    L('ign-rios-int', { opacity: 0.8, legend: { show: false } }),
    L('atlas-caminos', { legend: { show: true, label: 'Caminos, ferrocarril y telégrafo' } }),
    L('atlas-estancias1884', { style: { label: { show: false } }, legend: { show: true, label: 'Estancias, puestos y pulperías (1884)' } }),
    L('atlas-partido', { legend: { show: true, label: 'Partido actual' } }),
    L('graticule', { style: { interval: String(1 / 6), intervalLon: String(1 / 6) } }),
  ];
  s.sites = [];
  s.legend = mergeDeep(s.legend, { x: 104, y: 136, title: 'Pago Gilense, 1825–1925', size: 6, titleSize: 7.2, symbolSize: 6.5 });
  s.north = mergeDeep(s.north, { x: 138, y: 14, size: 12 });
  s.scalebar = mergeDeep(s.scalebar, { x: 14, y: 214, lengthMM: 36, style: 'alternating', segments: 4, units: 'km' });
  s.texts = [];
  s.caption = { figure: 'Figura 2', lead: 'Mensuras del Archivo Histórico de Geodesia agrupadas por período, registro gráfico de c. 1874 y caminos dibujados en los planos.' };
  applyTheme(s, getTheme('tinta-historica'), { recolorCategories: false });
  return s;
}

export function templateLescano() {
  registerProjections();
  const s = gilesBase(emptyState(), { title: 'Interpretación: mensura de Lescano (1866) sobre el parcelario actual', theme: 'conjetural' });
  s.view = { center: [-59.402, -34.503], mpm: 62, rotation: 0 };
  const src = newSource({ ...EXAMPLE_LESCANO.source, key: EXAMPLE_LESCANO.key, w: 1800, h: 1200 });
  src.proc.paper = false;
  const v = newVersion('Lectura 1: deslinde de 1866', { author: 'J. P. Addesso', note: 'Las cuatro esquinas del rectángulo interior; transformación proyectiva porque el plano es una fotografía tomada en ángulo.' });
  v.georefs[src.id] = { method: EXAMPLE_LESCANO.georef.method, gcps: EXAMPLE_LESCANO.georef.gcps.map((g) => ({ id: uid('P'), on: true, ...g })) };
  const ef = EXAMPLE_LESCANO.feature;
  v.features.features.push({ type: 'Feature', id: uid('E'), properties: { name: ef.name, cat: ef.cat, cert: ef.cert, period: ef.period, note: ef.note, src: src.id, example: 'lescano' }, geometry: { type: 'Polygon', coordinates: [ef.coords] } });
  s.interp.sources = [src];
  s.interp.versions = [v];
  s.interp.active = v.id;
  s.interp.drawCat = 'deslinde';
  s.layers = [
    L('arba-parcela', { opacity: 0.8 }),
    newLayerState('georef', { name: 'Duplicado de mensura 45 (1866)', params: { sourceId: src.id }, opacity: 0.7, blend: 'multiply', legend: { show: false } }),
    L('ign-caminos', { legend: { show: true, label: 'Caminos rurales actuales' } }),
    newLayerState('interp', { name: 'Mapa de interpretación', params: { version: 'active', labels: true, label: { size: 6, font: 'IM Fell English', color: '#3a2e22', halo: '#f7f2e8' } }, legend: { show: true } }),
    L('graticule', { style: { interval: String(1 / 60), intervalLon: String(1 / 60), label: { show: true, size: 5.5 } } }),
  ];
  s.legend = mergeDeep(s.legend, { x: 104, y: 178, title: 'Lectura 1 (1866)', size: 6.3, titleSize: 7.3 });
  s.north = mergeDeep(s.north, { x: 138, y: 14, size: 11 });
  s.scalebar = mergeDeep(s.scalebar, { x: 14, y: 214, lengthMM: 30, style: 'line', segments: 3, units: 'km' });
  s.caption = { figure: 'Figura 3', lead: 'Plano de la mensura de los herederos de Francisco Lescano (Saubidet, 1866) georreferenciado sobre el parcelario actual de ARBA.' };
  applyTheme(s, getTheme('conjetural'), { recolorCategories: false });
  return s;
}
templateLescano.after = async (app) => {
  const { getImage, ingestUrl, putImage } = await import('./imagestore.js');
  if (!(await getImage(EXAMPLE_LESCANO.key))) {
    const { blob, w, h } = await ingestUrl(EXAMPLE_LESCANO.url);
    await putImage(EXAMPLE_LESCANO.key, blob, w, h);
  }
};

export function templateGilesProyector() {
  const s = templateGiles();
  s.title = 'Pago Gilense para la defensa oral (proyector 16:9)';
  const m = getMedia('proyector-169');
  s.media.profileId = m.id;
  applyMediaPage(s, m);
  s.page.margins = { top: 8, right: 8, bottom: 10, left: 12 };
  s.view = { center: [-59.40, -34.44], mpm: 360, rotation: 0 };
  s.insets[0] = mergeDeep(s.insets[0], { x: 16, y: 12, w: 46, h: 60 });
  s.legend = mergeDeep(s.legend, { x: 262, y: 66, title: 'Pago Gilense' });
  s.north = mergeDeep(s.north, { x: 312, y: 16, size: 14 });
  s.scalebar = mergeDeep(s.scalebar, { x: 18, y: 172 });
  s.layers = s.layers.filter((l) => !['ign-caminos', 'ign-planta-urbana'].includes(l.def));
  fitToMedia(s, m.id);
  s.caption.lead = 'Versión para proyectar: menos capas, rótulos y líneas engrosados según los mínimos de lectura a distancia.';
  return s;
}

export function templateArgentina() {
  registerProjections();
  const s = emptyState();
  s.title = 'Mapa nuevo (Argentina)';
  s.projection = 'EPSG:5347';
  s.view = { center: [-60, -36], mpm: 9000, rotation: 0 };
  s.page = mergeDeep(s.page, { preset: 'tesis-a4', widthMM: 160, heightMM: 230, margins: { top: 6, right: 6, bottom: 8, left: 10 } });
  s.layers = [L('ne-paises', { legend: { show: false } }), L('ign-departamentos', { visible: false }), L('ign-localidades', { visible: false }), L('graticule')];
  s.legend.x = 14; s.legend.y = 12;
  s.north = mergeDeep(s.north, { x: 140, y: 18 });
  s.scalebar = mergeDeep(s.scalebar, { x: 16, y: 214 });
  s.caption = { figure: 'Figura 1', lead: 'Mapa de localización del área de estudio.' };
  return s;
}

export const TEMPLATES = [
  { id: 'giles', name: 'Pago Gilense: localización en la Pampa ondulada', group: 'Tesis', build: templateGiles,
    desc: 'Relieve local exagerado, aguas, caminos rurales y localidades; mapa de ubicación bicontinental. POSGAR 2007 faja 5, A4.' },
  { id: 'giles-historico', name: 'Pago Gilense: mensuras y caminos 1825–1925', group: 'Tesis', build: templateGilesHistorico,
    desc: 'Capas del Atlas de Mensuras de Giles coloreadas por período, en estilo de tinta y papel.' },
  { id: 'lescano', name: 'Interpretación: mensura de Lescano (1866)', group: 'Tesis', build: templateLescano,
    desc: 'Un plano fotografiado en el archivo, georreferenciado con 4 esquinas sobre el parcelario actual, con su versión de lectura.' },
  { id: 'giles-proyector', name: 'Pago Gilense para proyectar (16:9)', group: 'Tesis', build: templateGilesProyector,
    desc: 'La misma figura ajustada a los mínimos de lectura de un proyector: menos capas, todo más grueso.' },
  { id: 'argentina', name: 'Proyecto en blanco (Argentina)', group: 'Tesis', build: templateArgentina, desc: 'POSGAR 2007 faja 5, página de tesis A4.' },
  { id: 'coni', name: 'Coni: pingüinos emperador, Adelia y papúa', group: 'Antártida', build: templateConi },
  { id: 'modelo1', name: 'Modelo 1: satelital con lupa punteada', group: 'Antártida', build: templateModelo1 },
  { id: 'modelo2', name: 'Modelo 2: vectorial plano bicontinental', group: 'Antártida', build: templateModelo2 },
  { id: 'blanco', name: 'Proyecto en blanco (Antártida)', group: 'Antártida', build: templateBlank },
];
