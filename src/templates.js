// Plantillas de proyecto (modelos de ejemplo): Pago Gilense (localización, histórico, interpretación, proyector)
// y un proyecto en blanco para la Argentina.
import { emptyState, newLayerState, newInset, newText, mergeDeep, newVersion } from './state.js';
import { getTheme, applyTheme } from './themes.js';
import { EXAMPLE_LESCANO, newSource } from './interp.js';
import { getMedia, applyMediaPage, fitToMedia } from './media.js';
import { rotationForMeridian, registerProjections } from './projections.js';
import { uid } from './util.js';
import { createProject, defaultMeta } from './library.js';

const L = (id, over) => newLayerState(id, over);

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

// autoría de los ejemplos de Giles: son figuras de una tesis en curso y la llevan en el epígrafe
export const EXAMPLE_CREDIT = { author: 'Juan Patricio Addesso', institution: 'Doctorado en Geografía, USAL' };

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
];

// Un ejemplo copiado como proyecto propio (con la autoría de la tesis de la que sale)
export async function createExampleProject(t, state) {
  const st = state || t.build();
  const th = st.thesis || {};
  const giles = t.group === 'Tesis' && t.id !== 'argentina';
  if (giles) st.credits = { ...(st.credits || {}), author: EXAMPLE_CREDIT.author, institution: EXAMPLE_CREDIT.institution };
  return createProject(defaultMeta({
    name: t.name, kind: 'tesis-doctoral', title: th.title || '', keywords: th.keywords || '', period: th.period || '',
    mediaId: st.media.profileId, themeId: th.themeId || '', ...(giles ? EXAMPLE_CREDIT : {}),
  }), { name: st.title || t.name, state: st });
}
