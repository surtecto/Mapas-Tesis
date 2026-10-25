// Estilos de tesis: lenguajes gráficos completos (papel, tinta, tipografía, aguas, límites, grilla, leyenda)
// que se aplican de una vez a toda la figura según la «semántica» de cada capa del catálogo.
import { getDef } from './catalog.js';
import { getPalette, paletteColors } from './palette.js';
import { mergeDeep } from './state.js';
import { hexToRgb, rgbToHex } from './util.js';

const T = (o) => o;

export const THEMES = [
  T({ id: 'tinta-historica', name: 'Tinta y papel (cartografía histórica)',
    desc: 'Papel cálido, tinta parda, rótulos en serif de grabado. Para lecturas de archivo, mensuras y planos antiguos: el mapa nuevo dialoga con la estética de sus fuentes sin imitarlas.',
    paper: '#f5efe2', paper2: '#efe6d2', ink: '#2b241b', inkSoft: '#6e5f4b', accent: '#8c2f1b', land: '#efe6d2', urban: '#d8c9ad',
    water: '#46677f', waterFill: '#d7e0dd', waterLabel: '#3d5a70', relief: { ramp: 'sepia', opacity: 0.35, blend: 'multiply' },
    fontLabel: 'EB Garamond', fontTitle: 'IM Fell English', fontSans: 'EB Garamond', palette: 'sepia', lineScale: 0.9,
    grat: { color: '#6e5f4b', width: 0.25, dash: 'dotted', opacity: 0.8 }, north: 'rose', scale: 'alternating',
    legend: { bg: '#f5efe2', bgOpacity: 0.95, border: '#2b241b', borderWidth: 0.35, radius: 0 } }),
  T({ id: 'paisaje-pampeano', name: 'Paisaje pampeano (llanura, pastos y aguas)',
    desc: 'Tierras ocres y verdes apagados, aguas protagonistas, relieve sutil exagerado para que la llanura ondulada se lea. Rótulos serif para lo natural, sans para lo construido.',
    paper: '#fbf8f1', paper2: '#f1ecdf', ink: '#2f3a2c', inkSoft: '#6b6a58', accent: '#b5523b', land: '#efe9da', urban: '#d9cfc1',
    water: '#3b78a8', waterFill: '#cfe0ea', waterLabel: '#2c5f87', relief: { ramp: 'pampa', opacity: 0.55, blend: 'multiply' },
    fontLabel: 'Source Serif 4', fontTitle: 'Source Serif 4', fontSans: 'Source Sans 3', palette: 'pampa', lineScale: 1,
    grat: { color: '#7d8a76', width: 0.3, dash: 'solid', opacity: 0.6 }, north: 'arrow', scale: 'line',
    legend: { bg: '#fbf8f1', bgOpacity: 0.92, border: '#6b6a58', borderWidth: 0.3, radius: 1 } }),
  T({ id: 'hidrico', name: 'Hídrico (cuencas, cañadas y bajos)',
    desc: 'Todo lo que no es agua pasa a grises; el sistema hídrico (cursos permanentes, intermitentes, bañados) se jerarquiza en azules. Para tesis sobre cuencas, inundación o humedales.',
    paper: '#ffffff', paper2: '#f2f4f5', ink: '#30363b', inkSoft: '#8a9196', accent: '#08519c', land: '#f2f2f0', urban: '#dcdcdc',
    water: '#08519c', waterFill: '#c6dbef', waterLabel: '#08519c', relief: { ramp: 'hidro', opacity: 0.5, blend: 'multiply' },
    fontLabel: 'Source Sans 3', fontTitle: 'Source Sans 3', fontSans: 'Source Sans 3', palette: 'agua', lineScale: 1,
    grat: { color: '#9aa4aa', width: 0.25, dash: 'solid', opacity: 0.6 }, north: 'arrow', scale: 'line',
    legend: { bg: '#ffffff', bgOpacity: 0.9, border: '#8a9196', borderWidth: 0.3, radius: 1 } }),
  T({ id: 'relieve', name: 'Físico (relieve, suelos y pendientes)',
    desc: 'Sombreado e hipsometría ajustados al rango local de alturas, curvas en sepia, aguas en azul. Para geomorfología, suelos o lectura del soporte físico.',
    paper: '#ffffff', paper2: '#f4f1ea', ink: '#2b2b2b', inkSoft: '#6d6d6d', accent: '#a0522d', land: '#f1ede4', urban: '#d4d0c8',
    water: '#2f6f9f', waterFill: '#cfe3ee', waterLabel: '#2f6f9f', relief: { ramp: 'hipsometrica', opacity: 0.85, blend: 'normal' },
    fontLabel: 'Source Sans 3', fontTitle: 'Archivo', fontSans: 'Source Sans 3', palette: 'okabe', lineScale: 1,
    grat: { color: '#5a6b78', width: 0.3, dash: 'solid', opacity: 0.7 }, north: 'arrow', scale: 'alternating',
    legend: { bg: '#ffffff', bgOpacity: 0.88, border: '#3a4652', borderWidth: 0.35, radius: 1 } }),
  T({ id: 'normativo', name: 'Urbano y normativo (planeamiento, catastro)',
    desc: 'Base gris, trazos nítidos, colores categóricos claros para zonas. Lenguaje técnico de ordenanzas y planes: preciso, sin ornamento.',
    paper: '#ffffff', paper2: '#f3f3f3', ink: '#222222', inkSoft: '#7a7a7a', accent: '#d95f02', land: '#f6f6f6', urban: '#e3e3e3',
    water: '#5b8fb9', waterFill: '#d6e6f2', waterLabel: '#3f6f96', relief: null,
    fontLabel: 'Roboto Condensed', fontTitle: 'Roboto Condensed', fontSans: 'Roboto Condensed', palette: 'set2', lineScale: 1,
    grat: { color: '#9a9a9a', width: 0.25, dash: 'solid', opacity: 0.6 }, north: 'arrow', scale: 'line',
    legend: { bg: '#ffffff', bgOpacity: 0.95, border: '#222222', borderWidth: 0.3, radius: 0 } }),
  T({ id: 'rural', name: 'Rural y productivo (campos, estancias, caminos)',
    desc: 'Ocres de rastrojo, verdes de pastura, caminos vecinales visibles: la trama productiva como protagonista.',
    paper: '#fcfaf3', paper2: '#f1ead8', ink: '#33301f', inkSoft: '#777057', accent: '#8c510a', land: '#f2ecd9', urban: '#ddd3bd',
    water: '#4a7fa8', waterFill: '#d3e2ea', waterLabel: '#36658a', relief: { ramp: 'pampa', opacity: 0.35, blend: 'multiply' },
    fontLabel: 'Source Serif 4', fontTitle: 'Archivo', fontSans: 'Source Sans 3', palette: 'pampa', lineScale: 1,
    grat: { color: '#8a8460', width: 0.3, dash: 'solid', opacity: 0.6 }, north: 'arrow', scale: 'line',
    legend: { bg: '#fcfaf3', bgOpacity: 0.92, border: '#777057', borderWidth: 0.3, radius: 1 } }),
  T({ id: 'tematico', name: 'Temático (población, censos, indicadores)',
    desc: 'Base neutra y silenciosa para que la variable mapeada sea lo único coloreado. Paleta secuencial apta para daltonismo.',
    paper: '#ffffff', paper2: '#f4f4f4', ink: '#262626', inkSoft: '#8c8c8c', accent: '#21918c', land: '#f4f4f4', urban: '#e0e0e0',
    water: '#a9c4d6', waterFill: '#e6eef3', waterLabel: '#6f8ea3', relief: null,
    fontLabel: 'Source Sans 3', fontTitle: 'Archivo', fontSans: 'Source Sans 3', palette: 'viridis', lineScale: 1,
    grat: { color: '#b0b0b0', width: 0.25, dash: 'solid', opacity: 0.5 }, north: 'arrow', scale: 'line',
    legend: { bg: '#ffffff', bgOpacity: 0.95, border: '#8c8c8c', borderWidth: 0.25, radius: 1 } }),
  T({ id: 'conjetural', name: 'Etnohistórico y conjetural (lo que la fuente no dice)',
    desc: 'Gramática de certeza a la vista: lo documentado en trazo lleno, lo inferido en guiones, lo conjetural en puntos. Tierras y tintas cálidas; para territorialidades indígenas, rastrilladas o paisajes borrados.',
    paper: '#f7f2e8', paper2: '#ece3d0', ink: '#3a2e22', inkSoft: '#7d6b55', accent: '#5a3d7a', land: '#eee5d2', urban: '#d9ccb4',
    water: '#4d7392', waterFill: '#d9e3e4', waterLabel: '#3f6280', relief: { ramp: 'sepia', opacity: 0.3, blend: 'multiply' },
    fontLabel: 'IM Fell English', fontTitle: 'IM Fell English', fontSans: 'Source Sans 3', palette: 'sepia', lineScale: 1,
    grat: { color: '#7d6b55', width: 0.25, dash: 'dotted', opacity: 0.7 }, north: 'rose', scale: 'line',
    legend: { bg: '#f7f2e8', bgOpacity: 0.95, border: '#3a2e22', borderWidth: 0.3, radius: 0 } }),
  T({ id: 'ecologico', name: 'Ecológico (sitios de muestreo, especies)',
    desc: 'Base clara y paleta Okabe–Ito: los sitios y sus categorías mandan; el resto acompaña. El lenguaje de los papers de ciencias naturales.',
    paper: '#ffffff', paper2: '#eef3f0', ink: '#1d2b38', inkSoft: '#6d7c86', accent: '#009E73', land: '#f4f6f2', urban: '#dedede',
    water: '#5d8fb5', waterFill: '#d9e6ec', waterLabel: '#2f6f9f', relief: { ramp: 'grises', opacity: 0.35, blend: 'multiply' },
    fontLabel: 'Source Sans 3', fontTitle: 'Source Sans 3', fontSans: 'Source Sans 3', palette: 'okabe', lineScale: 1,
    grat: { color: '#5a6b78', width: 0.3, dash: 'solid', opacity: 0.7 }, north: 'circle', scale: 'alternating',
    legend: { bg: '#ffffff', bgOpacity: 0.9, border: '#3a4652', borderWidth: 0.4, radius: 1.2 } }),
  T({ id: 'polar', name: 'Polar (Antártida, hielos y mares)',
    desc: 'El lenguaje de Coni-Mapas: hielo blanco azulado, mar gris celeste, bases y sitios destacados.',
    paper: '#d9e6ec', paper2: '#eef3f6', ink: '#1d2b38', inkSoft: '#5a6b78', accent: '#c8102e', land: '#f7f9fa', urban: '#e4eef3',
    water: '#2f6f9f', waterFill: '#d9e6ec', waterLabel: '#2f6f9f', relief: { ramp: 'hielo', opacity: 0.55, blend: 'multiply' },
    fontLabel: 'Source Sans 3', fontTitle: 'Source Sans 3', fontSans: 'Source Sans 3', palette: 'pinguinos', lineScale: 1,
    grat: { color: '#5a6b78', width: 0.3, dash: 'solid', opacity: 0.7 }, north: 'circle', scale: 'alternating',
    legend: { bg: '#ffffff', bgOpacity: 0.88, border: '#3a4652', borderWidth: 0.4, radius: 1.2 } }),
  T({ id: 'patrimonio', name: 'Patrimonio (edificios, escuelas, lugares de memoria)',
    desc: 'Puntos jerarquizados con rótulos serif, base apagada. Cada sitio patrimonial se lee como un nombre propio en el territorio.',
    paper: '#fdfbf7', paper2: '#f1ede4', ink: '#2a2420', inkSoft: '#80766b', accent: '#7a1f3d', land: '#f3efe7', urban: '#ded6c9',
    water: '#6a8da8', waterFill: '#dde7ed', waterLabel: '#4f7491', relief: null,
    fontLabel: 'Merriweather', fontTitle: 'Merriweather', fontSans: 'Source Sans 3', palette: 'npg', lineScale: 1,
    grat: { color: '#a59a8d', width: 0.25, dash: 'solid', opacity: 0.5 }, north: 'arrow', scale: 'line',
    legend: { bg: '#fdfbf7', bgOpacity: 0.95, border: '#80766b', borderWidth: 0.3, radius: 0.5 } }),
  T({ id: 'redes', name: 'Redes y circulación (caminos, ferrocarril, postas)',
    desc: 'Jerarquía de líneas: ferrocarril con durmientes, rutas con borde, caminos finos, flechas de recorrido. Lo que se mueve sobre el fondo quieto.',
    paper: '#ffffff', paper2: '#f3f1ec', ink: '#1e1e1e', inkSoft: '#7c7c7c', accent: '#c1272d', land: '#f5f3ee', urban: '#e0dbd2',
    water: '#6d9bb8', waterFill: '#dfeaf0', waterLabel: '#4f7f9d', relief: null,
    fontLabel: 'Source Sans 3', fontTitle: 'Archivo', fontSans: 'Source Sans 3', palette: 'tolbright', lineScale: 1.1,
    grat: { color: '#a0a0a0', width: 0.25, dash: 'solid', opacity: 0.5 }, north: 'arrow', scale: 'line',
    legend: { bg: '#ffffff', bgOpacity: 0.95, border: '#1e1e1e', borderWidth: 0.3, radius: 0 } }),
  T({ id: 'grises', name: 'Blanco y negro para imprimir (grises y tramas)',
    desc: 'Todo en grises con diferencias de luminosidad de al menos 15 %, y tramas para distinguir superficies sin depender del color. Para tesis que se imprimen en blanco y negro.',
    paper: '#ffffff', paper2: '#f0f0f0', ink: '#111111', inkSoft: '#6e6e6e', accent: '#111111', land: '#f2f2f2', urban: '#cfcfcf',
    water: '#555555', waterFill: '#e2e2e2', waterLabel: '#333333', relief: { ramp: 'grises', opacity: 0.35, blend: 'multiply' },
    fontLabel: 'Source Sans 3', fontTitle: 'Source Sans 3', fontSans: 'Source Sans 3', palette: 'grises', lineScale: 1, gray: true,
    grat: { color: '#777777', width: 0.25, dash: 'solid', opacity: 0.7 }, north: 'arrow', scale: 'alternating',
    legend: { bg: '#ffffff', bgOpacity: 1, border: '#111111', borderWidth: 0.35, radius: 0 } }),
  T({ id: 'proyector-oscuro', name: 'Proyección en sala oscura (fondo oscuro)',
    desc: 'Fondo azul noche, tinta clara y colores saturados: se lee en una sala a oscuras. En una sala iluminada conviene el estilo claro.',
    paper: '#14202b', paper2: '#1d2c3a', ink: '#f2f5f7', inkSoft: '#a9b8c4', accent: '#ffb000', land: '#26394a', urban: '#3b5168',
    water: '#6fc3f2', waterFill: '#1a3550', waterLabel: '#8fd3ff', relief: { ramp: 'grises', opacity: 0.25, blend: 'screen' },
    fontLabel: 'Source Sans 3', fontTitle: 'Archivo', fontSans: 'Source Sans 3', palette: 'proyector', lineScale: 1.4,
    grat: { color: '#7d93a5', width: 0.4, dash: 'solid', opacity: 0.6 }, north: 'arrow', scale: 'line',
    legend: { bg: '#14202b', bgOpacity: 0.92, border: '#a9b8c4', borderWidth: 0.4, radius: 1.5 } }),
];

export function getTheme(id) { return THEMES.find((t) => t.id === id) || null; }

function toGray(hex) {
  const [r, g, b] = hexToRgb(hex);
  const v = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return rgbToHex([v, v, v]);
}

// Parches de estilo por semántica de capa, derivados de los tokens del tema
export function semPatches(t) {
  const L = t.lineScale || 1;
  const lab = (extra = {}) => ({ label: { font: t.fontLabel, color: t.ink, halo: t.paper, ...extra } });
  return {
    'water-line': { line: { color: t.water, width: 0.6 * L, dash: 'solid' }, ...lab({ italic: true, color: t.waterLabel }) },
    'water-line-int': { line: { color: t.water, width: 0.45 * L, dash: 'dashed' }, ...lab({ italic: true, color: t.waterLabel }) },
    'water-area': { polygon: { fill: t.waterFill, fillOpacity: 1, stroke: t.water, strokeWidth: 0.3 * L }, ...lab({ italic: true, color: t.waterLabel }) },
    'water-area-int': { polygon: { fill: t.waterFill, fillOpacity: 0.8, pattern: 'dash-h', patternColor: t.water, stroke: t.water, strokeWidth: 0.25 * L, dash: 'dashed' } },
    wetland: { polygon: { fill: t.waterFill, fillOpacity: 0.55, pattern: 'marsh', patternColor: t.gray ? t.ink : '#4f7a5a', strokeWidth: 0 } },
    admin: { polygon: { fill: t.paper, fillOpacity: 0, stroke: t.ink, strokeWidth: 0.5 * L, dash: 'dashdot' }, ...lab({ color: t.inkSoft, uppercase: true, letterSpacing: 0.18 }) },
    'admin-line': { line: { color: t.ink, width: 0.8 * L, dash: 'dashdotdot' } },
    'study-area': { polygon: { fill: t.paper, fillOpacity: 0, stroke: t.accent, strokeWidth: 1.2 * L, dash: 'solid' } },
    settlement: { point: { fill: t.ink, stroke: t.paper }, ...lab({ font: t.fontSans }) },
    urban: { polygon: { fill: t.urban, fillOpacity: 0.85, stroke: t.inkSoft, strokeWidth: 0.2 * L } },
    'road-major': { line: { color: t.gray ? '#444444' : t.accent, width: 1.2 * L, deco: 'casing', decoColor: t.ink } },
    road: { line: { color: t.gray ? '#666666' : t.inkSoft, width: 0.8 * L, deco: 'none', dash: 'solid' } },
    'road-minor': { line: { color: t.inkSoft, width: 0.35 * L, dash: 'solid' } },
    track: { line: { color: t.inkSoft, width: 0.3 * L, dash: 'short' } },
    rail: { line: { color: t.ink, width: 0.9 * L, deco: t.id === 'tinta-historica' || t.id === 'conjetural' ? 'ties' : 'rail', decoColor: t.id === 'tinta-historica' || t.id === 'conjetural' ? t.ink : t.paper } },
    contour: { line: { color: t.gray ? '#8a8a8a' : '#a07850', width: 0.3 * L }, ...lab({ color: t.inkSoft }) },
    'spot-height': { point: { fill: t.inkSoft }, ...lab({ color: t.inkSoft }) },
    poi: { point: { stroke: t.paper }, ...lab({ font: t.fontSans }) },
    'historic-poi': { point: { stroke: t.paper }, ...lab({ italic: true, color: t.inkSoft }) },
    'historic-parcel': { polygon: { stroke: t.inkSoft, strokeWidth: 0.3 * L }, ...lab({ color: t.inkSoft }) },
    'historic-road': { line: { color: t.gray ? '#333333' : '#6b4a2b', width: 0.9 * L }, ...lab({ italic: true, color: t.inkSoft }) },
    rural: { polygon: { fill: t.land, fillOpacity: 0.5, patternColor: t.inkSoft, stroke: t.inkSoft, strokeWidth: 0.25 * L } },
    land: { polygon: { fill: t.land, stroke: t.inkSoft } },
    'grid-index': { polygon: { stroke: t.accent }, ...lab({ color: t.accent, font: t.fontSans }) },
    protected: { polygon: { stroke: t.gray ? '#333333' : '#2e8b57', patternColor: t.gray ? '#333333' : '#2e8b57' } },
  };
}

// Aplica un tema a todo el estado. Devuelve una lista de cambios para informar.
export function applyTheme(state, theme, { recolorCategories = true, recolorRanges = true, keepBackground = false } = {}) {
  const t = theme;
  const changes = [];
  const imagery = state.layers.some((l) => l.visible && /^(esri-antartida|esri-mundo|eox-s2|gibs|npi)/.test(l.def));
  if (!keepBackground && !imagery) { state.page.background = t.paper; changes.push('fondo de papel'); }
  state.page.frame.color = t.ink;
  // composición
  Object.assign(state.legend, { font: t.fontSans, color: t.ink, ...t.legend });
  Object.assign(state.north, { style: t.north, color: t.ink, bg: t.paper, font: t.fontSans });
  Object.assign(state.scalebar, { style: t.scale, color: t.ink, font: t.fontSans });
  state.siteStyle.label.font = t.fontLabel;
  state.siteStyle.label.color = t.ink;
  state.siteStyle.label.halo = t.paper;
  state.siteStyle.stroke = t.paper;
  for (const tx of state.texts) {
    const [r, g, b] = hexToRgb(tx.color || '#000000');
    const watery = b > r + 30 && b > g;
    tx.font = tx.bold && tx.size >= 11 ? t.fontTitle : t.fontLabel;
    tx.color = watery ? t.waterLabel : t.ink;
    if (tx.haloWidth > 0) tx.halo = t.paper;
  }
  changes.push('tipografía y colores de la composición');
  for (const z of state.insets) {
    z.border.color = t.ink; z.connector.color = t.ink; z.footprint.color = t.ink;
    if (z.mode === 'context') z.bg = t.paper2;
  }
  // categorías de sitios
  if (recolorCategories && state.categories.length) {
    const pal = getPalette(t.palette);
    const cols = paletteColors(pal, state.categories.length);
    state.categories.forEach((c, i) => { c.color = t.gray ? toGray(cols[i]) : cols[i]; });
    state.paletteId = t.palette;
    changes.push(`paleta «${pal ? pal.name : t.palette}» en las categorías`);
  }
  // capas
  const patches = semPatches(t);
  let n = 0;
  for (const ls of state.layers) {
    const def = ls.def === 'user' ? null : getDef(ls.def);
    if (!def) continue;
    if (def.type === 'graticule') {
      Object.assign(ls.style.line, { color: t.grat.color, width: t.grat.width, dash: t.grat.dash, opacity: t.grat.opacity });
      Object.assign(ls.style.label, { color: t.inkSoft, font: t.fontSans });
      ls._styleVersion = (ls._styleVersion || 0) + 1; n++;
      continue;
    }
    if (def.sem === 'relief' && t.relief) {
      ls.opacity = t.relief.opacity; ls.blend = t.relief.blend;
      if (ls.def === 'dem-analitico') ls.params.ramp = t.relief.ramp;
      ls.rev += 1; n++;
      continue;
    }
    if (def.kind !== 'vector' || !ls.style) continue;
    const patch = patches[def.sem];
    if (patch) { mergeDeep(ls.style, JSON.parse(JSON.stringify(patch))); n++; }
    else if (ls.style.label) { ls.style.label.font = t.fontLabel; ls.style.label.halo = t.paper; }
    const cz = ls.style.categorize;
    if (recolorRanges && cz && cz.field) {
      const pal = getPalette(cz.mode === 'ranges' ? (t.gray ? 'grises' : 'periodos') : t.palette);
      if (cz.mode === 'ranges' && cz.ranges && cz.ranges.length) {
        const cols = t.gray ? grayRamp(cz.ranges.length) : paletteColors(pal, cz.ranges.length);
        cz.ranges.forEach((r, i) => { r.color = cols[i]; });
      } else if (cz.values && t.gray) {
        const keys = Object.keys(cz.values);
        const cols = grayRamp(keys.length);
        keys.forEach((k, i) => { cz.values[k] = cols[i]; });
      }
    }
    if (t.gray && ls.style.point) ls.style.point.fill = toGray(ls.style.point.fill);
    ls._styleVersion = (ls._styleVersion || 0) + 1;
  }
  if (n) changes.push(`${n} capas restilizadas según lo que representan`);
  state.thesis.themeId = t.id;
  return changes;
}

function grayRamp(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = Math.round(40 + (200 * i) / Math.max(1, n - 1));
    out.push(rgbToHex([v, v, v]));
  }
  return out;
}
