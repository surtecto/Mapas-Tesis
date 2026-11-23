// Hojas de partida: mapas en blanco ya encuadrados (América Latina, Sudamérica, México y Centroamérica, Argentina).
// Los ejemplos de una tesis en particular no viajan con la aplicación: cada proyecto arma los suyos.
import { emptyState, newLayerState, mergeDeep } from './state.js';
import { registerProjections, ensureCustomLaea } from './projections.js';
import { createProject, defaultMeta } from './library.js';

const L = (id, over) => newLayerState(id, over);

// Tema de ejemplo (genérico) para probar la lectura del tema de la tesis
export const THESIS_EXAMPLE = {
  title: 'Transformaciones del paisaje rural y periurbano en una cuenca de llanura: usos del suelo, caminos y poblamiento entre 1985 y el presente',
  keywords: 'paisaje; usos del suelo; periurbano; caminos rurales; hidrografía; ordenamiento territorial; cobertura del suelo',
  discipline: 'geografia', period: '1985–presente', place: '',
};

function blank(title, projection, center, mpm, note) {
  registerProjections();
  const s = emptyState();
  s.title = title;
  s.projection = projection;
  s.view = { center, mpm, rotation: 0 };
  s.page = mergeDeep(s.page, { preset: 'tesis-a4', widthMM: 160, heightMM: 230, margins: { top: 6, right: 6, bottom: 8, left: 10 } });
  s.layers = [L('ne-america', { legend: { show: false } }), L('graticule')];
  s.legend.x = 14; s.legend.y = 12;
  s.north = mergeDeep(s.north, { x: 140, y: 18 });
  s.scalebar = mergeDeep(s.scalebar, { x: 16, y: 214 });
  s.caption = { figure: 'Figura 1', lead: note };
  return s;
}

export function templateLatam() {
  return blank('Mapa nuevo (América Latina)', 'MT:LAEA_LATAM', [-72, -12], 62000, 'América Latina: mapa de localización.');
}
export function templateSudamerica() {
  registerProjections();
  return blank('Mapa nuevo (Sudamérica)', ensureCustomLaea(-20, -60), [-60, -21], 41000, 'Sudamérica: mapa de localización.');
}
export function templateMesoamerica() {
  registerProjections();
  return blank('Mapa nuevo (México, Centroamérica y Caribe)', ensureCustomLaea(18, -88), [-90, 18.5], 30000, 'México, Centroamérica y el Caribe: mapa de localización.');
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
  { id: 'latam', name: 'Hoja en blanco: América Latina', group: 'Hojas', build: templateLatam, desc: 'De México a Tierra del Fuego en proyección equivalente, con los países de base.' },
  { id: 'sudamerica', name: 'Hoja en blanco: Sudamérica', group: 'Hojas', build: templateSudamerica, desc: 'Lambert acimutal equivalente centrada en el continente.' },
  { id: 'mesoamerica', name: 'Hoja en blanco: México, Centroamérica y Caribe', group: 'Hojas', build: templateMesoamerica, desc: 'Lambert acimutal equivalente centrada en 18°N 88°O.' },
  { id: 'argentina', name: 'Hoja en blanco: Argentina', group: 'Hojas', build: templateArgentina, desc: 'POSGAR 2007 faja 5, página de tesis A4.' },
];

// Una hoja de partida copiada como proyecto propio
export async function createExampleProject(t, state) {
  const st = state || t.build();
  const th = st.thesis || {};
  return createProject(defaultMeta({
    name: t.name.replace(/^Hoja en blanco: /, 'Proyecto: '), kind: 'tesis-doctoral', title: th.title || '', keywords: th.keywords || '', period: th.period || '',
    mediaId: st.media.profileId, themeId: th.themeId || '',
  }), { name: st.title || t.name, state: st });
}
