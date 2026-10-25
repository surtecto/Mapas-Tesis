// Catálogo de capas: fuentes cartográficas para mapas de tesis (Argentina continental, Provincia de Buenos Aires, Pago Gilense y Antártida)
// Todas las fuentes de este catálogo fueron verificadas con CORS habilitado (exportables a imagen).

export const FONTS = [
  'Source Sans 3', 'Archivo', 'Noto Sans', 'Roboto Condensed', 'Open Sans', 'Lato',
  'Source Serif 4', 'Noto Serif', 'Merriweather', 'EB Garamond', 'IM Fell English', 'Arial', 'Helvetica', 'Times New Roman',
];

export const GROUPS = [
  { id: 'ign-base', title: 'Bases IGN (Argenmap)' },
  { id: 'ign-arg', title: 'IGN: Argentina continental (vectorial, se carga según la vista)' },
  { id: 'arba', title: 'Provincia de Buenos Aires: catastro ARBA' },
  { id: 'atlas', title: 'Pago Gilense: Atlas de Mensuras de Giles (1825–1925)' },
  { id: 'ign-vec', title: 'IGN: Antártida y espacios marítimos' },
  { id: 'ign-wms', title: 'IGN: servicios WMS (imagen oficial)' },
  { id: 'costas', title: 'Costas, hielos y países' },
  { id: 'relieve', title: 'Relieve, DEM y batimetría' },
  { id: 'sat', title: 'Imágenes satelitales' },
  { id: 'ref', title: 'Referencias geográficas' },
  { id: 'hidden', title: '', hidden: true },
];

const IGN_TMS = (name) => `https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/${name}@EPSG%3A3857@png/{z}/{x}/{-y}.png`;
export const IGN_OWS = 'https://wms.ign.gob.ar/geoserver/ows';
const IGN_CITE = 'Instituto Geográfico Nacional de la República Argentina (IGN). Geoservicios WMS/WFS. https://www.ign.gob.ar';
const ANT_BBOX = '-82,-90,-18,-50';

const POLAR_GRID_ESRI = {
  origin: [-33699550.99203, 33699551.01703],
  resolutions: Array.from({ length: 20 }, (_, i) => 238810.813354 / Math.pow(2, i)),
  tileSize: 256,
  extent: [-4524537.706, -4524537.706, 4524537.706, 4524537.706],
};
const POLAR_GRID_GIBS = (levels) => ({
  origin: [-4194304, 4194304],
  resolutions: Array.from({ length: levels }, (_, i) => 8192 / Math.pow(2, i)),
  tileSize: 512,
  extent: [-4194304, -4194304, 4194304, 4194304],
});

// ---- estilos base ----
export function baseStyle(over = {}) {
  const s = {
    point: { shape: 'circle', size: 5, fill: '#d6452b', fillOpacity: 1, stroke: '#ffffff', strokeWidth: 0.6, strokeOpacity: 1 },
    line: { color: '#2b3a4a', width: 0.6, opacity: 1, dash: 'solid' },
    polygon: { fill: '#c8d8de', fillOpacity: 0.6, pattern: 'none', patternColor: '#34495e', patternSpacing: 1.6, patternWidth: 0.25, stroke: '#34495e', strokeWidth: 0.4, strokeOpacity: 1, dash: 'solid' },
    label: { show: false, field: 'fna', font: 'Source Sans 3', size: 6.5, color: '#1d2b38', halo: '#ffffff', haloWidth: 1.2, bold: false, italic: false, uppercase: false, letterSpacing: 0, offsetX: 0, offsetY: -6, declutter: true },
    categorize: { field: '', values: {} },
  };
  for (const k of Object.keys(over)) s[k] = typeof over[k] === 'object' && !Array.isArray(over[k]) ? { ...s[k], ...over[k] } : over[k];
  return s;
}

const wfs = (typeName, bbox = ANT_BBOX) => ({ type: 'wfs', url: IGN_OWS, typeName, bbox });


// ---- IGN continental: WFS pedido por la extensión de la vista (solo a escalas de detalle) ----
const ATLAS_ATTR = 'Atlas de Mensuras de Giles (J. P. Addesso)';
const ATLAS_CITE = 'Addesso, J. P. (2026). Atlas de Mensuras de Giles: carpetas de mensuras del partido de San Andrés de Giles (Archivo Histórico de Geodesia, Provincia de Buenos Aires), datos georreferenciados. https://github.com/surtecto/atlas-mensuras-giles';
const vw = (id, typeName, name, geom, sem, maxMpm, style, extra = {}) => ({
  id, group: 'ign-arg', name, kind: 'vector', type: 'wfs-view', url: IGN_OWS, typeName: `ign:${typeName}`, geom, sem, maxMpm,
  attribution: `IGN – ${name}`, cite: IGN_CITE + ` Capa ign:${typeName}.`,
  defaults: { style: baseStyle(style) }, ...extra,
});
const IGN_VIEW_LAYERS = [
  vw('ign-departamentos', 'departamento', 'Departamentos / partidos', 'polygon', 'admin', 4000,
    { polygon: { fill: '#ffffff', fillOpacity: 0, stroke: '#5a5a5a', strokeWidth: 0.5, dash: 'dashdot' }, label: { field: 'nam', size: 6, uppercase: true, letterSpacing: 0.15, color: '#4a4a4a' } },
    { fields: ['nam', 'fna', 'in1'], note: 'Límites de partidos y departamentos (fuente ARBA/provincias, publicada por el IGN).' }),
  vw('ign-limite-prov', 'linea_de_limite_070111', 'Límites interprovinciales', 'line', 'admin-line', 20000,
    { line: { color: '#3d3d3d', width: 0.8, dash: 'dashdotdot' } }, { fields: ['fna'] }),
  vw('ign-localidades', 'localidad_bahra', 'Localidades (BAHRA)', 'point', 'settlement', 1500,
    { point: { shape: 'circle', size: 3.5, fill: '#1d1d1d', stroke: '#ffffff', strokeWidth: 0.5 }, label: { show: true, field: 'fna', size: 6, offsetY: -6 } },
    { fields: ['fna', 'nom_depto', 'tipo_asent'], note: 'Base de Asentamientos Humanos de la República Argentina (INDEC/IGN).' }),
  vw('ign-planta-urbana', 'areas_de_asentamientos_y_edificios_020105', 'Plantas urbanas', 'polygon', 'urban', 600,
    { polygon: { fill: '#d9cfc1', fillOpacity: 0.85, stroke: '#9c8f7f', strokeWidth: 0.2 } }, { fields: ['fna', 'nam'] }),
  vw('ign-rios', 'lineas_de_aguas_continentales_perenne', 'Ríos y arroyos permanentes', 'line', 'water-line', 1500,
    { line: { color: '#3b78a8', width: 0.6, dash: 'solid' }, label: { field: 'fna', size: 5.5, italic: true, color: '#2c5f87' } }, { fields: ['fna', 'nam', 'gna'] }),
  vw('ign-rios-int', 'lineas_de_aguas_continentales_intermitentes', 'Cursos de agua intermitentes (cañadas)', 'line', 'water-line-int', 900,
    { line: { color: '#5f97c2', width: 0.45, dash: 'dashed' }, label: { field: 'fna', size: 5, italic: true, color: '#2c5f87' } }, { fields: ['fna', 'nam', 'gna'] }),
  vw('ign-canales', 'lineas_de_aguas_continentales_BH020', 'Canales', 'line', 'water-line', 900,
    { line: { color: '#3b78a8', width: 0.5, dash: 'solid' } }, { fields: ['fna'] }),
  vw('ign-espejos', 'areas_de_aguas_continentales_perenne', 'Lagunas y espejos de agua permanentes', 'polygon', 'water-area', 1500,
    { polygon: { fill: '#bcd6e8', fillOpacity: 1, stroke: '#3b78a8', strokeWidth: 0.3 }, label: { field: 'fna', size: 5.5, italic: true, color: '#2c5f87' } }, { fields: ['fna', 'nam'] }),
  vw('ign-espejos-int', 'areas_de_aguas_continentales_intermitente', 'Espejos de agua intermitentes (bajos anegables)', 'polygon', 'water-area-int', 900,
    { polygon: { fill: '#dbe8f0', fillOpacity: 0.9, pattern: 'dash-h', patternColor: '#5f97c2', patternSpacing: 1.4, patternWidth: 0.25, stroke: '#5f97c2', strokeWidth: 0.25, dash: 'dashed' } }, { fields: ['fna'] }),
  vw('ign-banados', 'vegetacion_hidrofila_ED020', 'Bañados: pajonal, juncal, totoral', 'polygon', 'wetland', 900,
    { polygon: { fill: '#e3ecdc', fillOpacity: 0.7, pattern: 'marsh', patternColor: '#4f7a5a', patternSpacing: 2.2, patternWidth: 0.25, stroke: '#4f7a5a', strokeWidth: 0, dash: 'solid' } }, { fields: ['objeto'] }),
  vw('ign-curvas', 'lineas_de_geomorfologia_CA010', 'Curvas de nivel (IGN)', 'line', 'contour', 3000,
    { line: { color: '#a07850', width: 0.3, dash: 'solid' }, label: { field: 'crv', size: 4.5, color: '#8a6440' } }, { fields: ['crv'], note: 'Equidistancia según la fuente (en la llanura pampeana provienen del atlas 1:500.000: cada 50 m).' }),
  vw('ign-cotas', 'puntos_de_geomorfologia_CA030', 'Puntos acotados', 'point', 'spot-height', 600,
    { point: { shape: 'cross', size: 2.5, fill: '#5b3a1e', stroke: '#ffffff', strokeWidth: 0 }, label: { show: true, field: 'alt', size: 4.5, offsetY: -4, color: '#5b3a1e' } }, { fields: ['alt'] }),
  vw('ign-ruta-nac', 'vial_nacional', 'Rutas nacionales', 'line', 'road-major', 3000,
    { line: { color: '#b5523b', width: 1.2, dash: 'solid', deco: 'casing', decoColor: '#5a2a1e' }, label: { field: 'rtn', size: 5 } }, { fields: ['rtn', 'typ'] }),
  vw('ign-ruta-prov', 'vial_provincial', 'Rutas provinciales', 'line', 'road', 1500,
    { line: { color: '#d08a3c', width: 0.9, dash: 'solid' }, label: { field: 'rtn', size: 5 } }, { fields: ['rtn', 'typ'] }),
  vw('ign-caminos', 'vial_terciaria', 'Caminos rurales (red terciaria)', 'line', 'road-minor', 450,
    { line: { color: '#8a7a66', width: 0.35, dash: 'solid' } }, { fields: ['fna1', 'nam1'], note: 'La trama de caminos vecinales: suele heredar los deslindes de las mensuras del siglo XIX.' }),
  vw('ign-huellas', 'vial_AP010', 'Huellas', 'line', 'track', 450,
    { line: { color: '#8a7a66', width: 0.3, dash: 'short' } }, { fields: ['fdc'] }),
  vw('ign-ferrocarril', 'lineas_de_transporte_ferroviario_AN010', 'Ferrocarril', 'line', 'rail', 3000,
    { line: { color: '#1d1d1d', width: 0.9, dash: 'solid', deco: 'rail', decoColor: '#ffffff' }, label: { field: 'fna', size: 5 } }, { fields: ['fna', 'nam'] }),
  vw('ign-estaciones', 'puntos_de_transporte_ferroviario_AN070', 'Estaciones de ferrocarril', 'point', 'poi', 1500,
    { point: { shape: 'square', size: 3, fill: '#ffffff', stroke: '#1d1d1d', strokeWidth: 0.6 }, label: { field: 'fna', size: 5 } }, { fields: ['fna', 'nam'] }),
  vw('ign-escuelas', 'puntos_de_ciencia_y_educacion_020601', 'Establecimientos educativos', 'point', 'poi', 600,
    { point: { shape: 'triangle', size: 3.2, fill: '#2f5d8c', stroke: '#ffffff', strokeWidth: 0.4 }, label: { field: 'nam', size: 4.5 } }, { fields: ['nam', 'fna'] }),
  vw('ign-cementerios', 'puntos_de_equipamiento_AL030', 'Cementerios', 'point', 'poi', 900,
    { point: { shape: 'cross', size: 3.5, fill: '#4a4a4a', stroke: '#ffffff', strokeWidth: 0.3 }, label: { field: 'fna', size: 4.5 } }, { fields: ['fna'] }),
  vw('ign-religiosos', 'cultura_y_religion_AL330', 'Edificios religiosos (capillas, iglesias)', 'point', 'poi', 600,
    { point: { shape: 'cross', size: 3.2, fill: '#6b4a2b', stroke: '#ffffff', strokeWidth: 0.3 }, label: { field: 'fna', size: 4.5 } }, { fields: ['fna', 'nam'] }),
  vw('ign-taperas', 'puntos_de_asentamientos_y_edificios_020108', 'Taperas', 'point', 'historic-poi', 900,
    { point: { shape: 'x', size: 3, fill: '#7a7a7a', stroke: '#ffffff', strokeWidth: 0 } }, { fields: ['fna'] }),
  vw('ign-ruinas', 'puntos_de_asentamientos_y_edificios_ruina', 'Ruinas', 'point', 'historic-poi', 900,
    { point: { shape: 'x', size: 3, fill: '#5b3a1e', stroke: '#ffffff', strokeWidth: 0 }, label: { field: 'fna', size: 4.5 } }, { fields: ['fna'] }),
  vw('ign-agro', 'areas_de_actividad_agropecuaria_AL270', 'Establecimientos agropecuarios', 'polygon', 'rural', 600,
    { polygon: { fill: '#e9dfb8', fillOpacity: 0.5, pattern: 'rows', patternColor: '#9a8a52', patternSpacing: 1.6, patternWidth: 0.25, stroke: '#9a8a52', strokeWidth: 0.25 }, label: { field: 'fna', size: 4.5 } }, { fields: ['fna', 'nam'] }),
  vw('ign-cartas50', 'cartas_50000', 'Índice de cartas topográficas 1:50.000', 'polygon', 'grid-index', 3000,
    { polygon: { fill: '#ffffff', fillOpacity: 0, stroke: '#8c2f1b', strokeWidth: 0.4, dash: 'dashed' }, label: { show: true, field: 'carac', size: 5.5, color: '#8c2f1b', offsetY: 0 } },
    { fields: ['carac', 'nombre', 'fecha_lev_', 'fecha_edic', 'marco_de_r'], note: 'Hojas del IGN con número, nombre, año de levantamiento y de edición, y marco (Campo Inchauspe): guía para buscar la carta histórica de un lugar y georreferenciarla.' }),
  vw('ign-cartas100', 'cartas_100000', 'Índice de cartas topográficas 1:100.000', 'polygon', 'grid-index', 8000,
    { polygon: { fill: '#ffffff', fillOpacity: 0, stroke: '#8c2f1b', strokeWidth: 0.5, dash: 'dashdot' }, label: { show: true, field: 'carac', size: 6, color: '#8c2f1b', offsetY: 0 } }, { fields: ['carac', 'nombre'] }),
];

export const CATALOG = [
  // ---------------- Bases IGN ----------------
  { id: 'ign-argenmap', group: 'ign-base', name: 'Argenmap', kind: 'raster', type: 'xyz', url: IGN_TMS('capabaseargenmap'), projection: 'EPSG:3857', maxZoom: 18,
    attribution: 'IGN – Argenmap', cite: IGN_CITE, note: 'Mapa base oficial del IGN con toponimia argentina. Teselas Mercator: sin cobertura al sur de 85°S.' },
  { id: 'ign-gris', group: 'ign-base', name: 'Argenmap gris', kind: 'raster', type: 'xyz', url: IGN_TMS('mapabase_gris'), projection: 'EPSG:3857', maxZoom: 18,
    attribution: 'IGN – Argenmap', cite: IGN_CITE },
  { id: 'ign-oscuro', group: 'ign-base', name: 'Argenmap oscuro', kind: 'raster', type: 'xyz', url: IGN_TMS('argenmap_oscuro'), projection: 'EPSG:3857', maxZoom: 18,
    attribution: 'IGN – Argenmap', cite: IGN_CITE },
  { id: 'ign-topo', group: 'ign-base', name: 'Argenmap topográfico', kind: 'raster', type: 'xyz', url: IGN_TMS('mapabase_topo'), projection: 'EPSG:3857', maxZoom: 18,
    attribution: 'IGN – Argenmap', cite: IGN_CITE },
  { id: 'ign-hibrido', group: 'ign-base', name: 'Argenmap híbrido (rótulos)', kind: 'raster', type: 'xyz', url: IGN_TMS('mapabase_hibrido'), projection: 'EPSG:3857', maxZoom: 18,
    attribution: 'IGN – Argenmap', cite: IGN_CITE, note: 'Rótulos y límites transparentes para superponer a imágenes satelitales.' },

  // ---------------- IGN vectorial ----------------
  { id: 'ign-bases', sem: 'poi', group: 'ign-vec', name: 'Bases antárticas argentinas', kind: 'vector', type: 'geojson', url: 'data/bases_antarticas_ign.geojson', geom: 'point',
    fields: ['nombre', 'regimen', 'departamento'],
    attribution: 'IGN – Bases antárticas', cite: IGN_CITE + ' Capa ign:bahra_base_antartica.',
    defaults: { style: baseStyle({ point: { shape: 'square', size: 5, fill: '#c8102e', stroke: '#ffffff', strokeWidth: 0.6 },
      label: { show: true, field: 'nombre', size: 6.5, offsetY: -7 } }) },
    note: '13 bases: 7 permanentes y 6 temporarias (régimen según COMNAP). Copia local de la capa del IGN.' },
  { id: 'comnap', sem: 'poi', group: 'ign-vec', name: 'Bases de todos los países (COMNAP)', kind: 'vector', type: 'geojson-multi', geom: 'point',
    urls: [0, 1].map((i) => 'https://overlord.pgc.umn.edu/arcgis/rest/services/reference/ant_comnap_antarctic_facilities/FeatureServer/{i}/query?where=1%3D1&outFields=official_name,english_name,operator__primary_,seasonality,type,year_established&outSR=4326&f=geojson'.replace('{i}', i)),
    fields: ['official_name', 'english_name', 'operator__primary_', 'seasonality', 'type'],
    attribution: 'COMNAP – Antarctic Facilities', cite: 'COMNAP (2024). Antarctic Facilities Information; servicio del Polar Geospatial Center.',
    defaults: { style: baseStyle({ point: { shape: 'circle', size: 4, fill: '#555555', stroke: '#ffffff', strokeWidth: 0.5 }, label: { field: 'official_name', size: 5.5 },
      categorize: { field: 'seasonality', values: { 'Year-Round': '#b5121b', Seasonal: '#e8a33d' } } }) },
    note: 'Estaciones permanentes y estacionales de todos los programas antárticos, con operador y año de fundación.' },
  { id: 'ign-islas', sem: 'land', group: 'ign-vec', name: 'Islas', kind: 'vector', ...wfs('ign:areas_de_zona_costera_BA030'), geom: 'polygon', fields: ['fna', 'gna', 'tis'],
    attribution: 'IGN – Islas', cite: IGN_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#eef2f2', fillOpacity: 1, stroke: '#4d5d66', strokeWidth: 0.35 }, label: { field: 'fna', italic: false } }) } },
  { id: 'ign-barreras', sem: 'ice', group: 'ign-vec', name: 'Barreras de hielo', kind: 'vector', ...wfs('ign:areas_de_glaciologia_050705'), geom: 'polygon', fields: ['fna', 'gna'],
    attribution: 'IGN – Barreras de hielo', cite: IGN_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#d9edf6', fillOpacity: 1, pattern: 'none', stroke: '#7fa9bf', strokeWidth: 0.3 }, label: { field: 'fna', italic: true, color: '#3c6e8a' } }) } },
  { id: 'ign-glaciares', group: 'ign-vec', name: 'Glaciares (toponimia)', kind: 'vector', ...wfs('ign:puntos_de_glaciologia_BJ030'), geom: 'point', fields: ['fna', 'gna'],
    attribution: 'IGN – Glaciares', cite: IGN_CITE,
    defaults: { style: baseStyle({ point: { shape: 'triangle', size: 3.5, fill: '#5aa0c8', stroke: '#ffffff', strokeWidth: 0.4 }, label: { show: true, field: 'fna', size: 5.5, italic: true, color: '#2f6a8c' } }) } },
  { id: 'ign-cerros', group: 'ign-vec', name: 'Cerros y picos', kind: 'vector', ...wfs('ign:puntos_de_geomorfologia_NA100'), geom: 'point', fields: ['fna', 'alt', 'gna'],
    attribution: 'IGN – Cerros', cite: IGN_CITE,
    defaults: { style: baseStyle({ point: { shape: 'triangle', size: 3.5, fill: '#5b3a1e', stroke: '#ffffff', strokeWidth: 0.4 }, label: { show: true, field: 'fna', size: 5.5, color: '#4a3220' } }) } },
  { id: 'ign-accidentes', sem: 'water-line', group: 'ign-vec', name: 'Accidentes costeros (bahías, estrechos)', kind: 'vector', ...wfs('ign:lineas_de_zona_costera_BA040'), geom: 'line', fields: ['fna', 'gna'],
    attribution: 'IGN – Accidentes costeros', cite: IGN_CITE,
    defaults: { style: baseStyle({ line: { color: '#3a7ca5', width: 0.4, dash: 'dotted' }, label: { show: true, field: 'fna', size: 5.5, italic: true, color: '#2c6d96' } }) } },
  { id: 'ign-zaep', sem: 'protected', group: 'ign-vec', name: 'Áreas protegidas y ZAEP', kind: 'vector', ...wfs('ign:area_protegida'), geom: 'polygon', fields: ['fna', 'tap', 'jap'],
    attribution: 'IGN – Áreas protegidas', cite: IGN_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#2e8b57', fillOpacity: 0.18, pattern: 'diag', patternColor: '#2e8b57', patternSpacing: 1.4, patternWidth: 0.2, stroke: '#2e8b57', strokeWidth: 0.5 }, label: { field: 'fna', color: '#1f6b40' } }) },
    note: 'Incluye las Zonas Antárticas Especialmente Protegidas (ZAEP) y áreas marinas protegidas.' },
  { id: 'ign-limmar', group: 'ign-vec', name: 'Límites de espacios marítimos', kind: 'vector', ...wfs('ign:linea_limite_maritimos', '-82,-90,-18,-20'), geom: 'line', fields: ['fna', 'gna'],
    attribution: 'IGN – Espacios marítimos', cite: IGN_CITE,
    defaults: { style: baseStyle({ line: { color: '#4a90c2', width: 0.5, dash: 'dashdot' } }) } },
  { id: 'ign-zee', group: 'ign-vec', name: 'Zona económica exclusiva', kind: 'vector', ...wfs('ign:zona_economica_exclusiva_argentina', '-82,-90,-18,-20'), geom: 'polygon', fields: ['fna'],
    attribution: 'IGN – Zona económica exclusiva', cite: IGN_CITE,
    defaults: { opacity: 1, style: baseStyle({ polygon: { fill: '#9fd0e8', fillOpacity: 0.35, stroke: '#6fb3d9', strokeWidth: 0.4, dash: 'dashed' } }) } },
  { id: 'ign-plataforma', group: 'ign-vec', name: 'Plataforma continental (límite exterior)', kind: 'vector', ...wfs('ign:plataforma_continental', '-82,-90,-18,-20'), geom: 'polygon', fields: ['fna'],
    attribution: 'IGN – Plataforma continental', cite: IGN_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#bfe3f2', fillOpacity: 0.3, stroke: '#7cc0e0', strokeWidth: 0.4, dash: 'dashdot' } }) } },
  { id: 'ign-contigua', group: 'ign-vec', name: 'Zona contigua', kind: 'vector', ...wfs('ign:zona_contigua_argentina', '-82,-90,-18,-20'), geom: 'polygon', fields: ['fna'],
    attribution: 'IGN – Zona contigua', cite: IGN_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#9fd0e8', fillOpacity: 0.25, stroke: '#5ea9d2', strokeWidth: 0.3 } }) } },
  { id: 'ign-sector', group: 'ign-vec', name: 'Límites del Sector Antártico Argentino (IGN)', kind: 'vector', ...wfs('ign:linea_de_limite_FA004'), geom: 'line', fields: ['fna'],
    attribution: 'IGN – Límite internacional', cite: IGN_CITE,
    defaults: { style: baseStyle({ line: { color: '#3b3b3b', width: 0.8, dash: 'solid' } }) },
    note: 'Meridianos 25°O y 74°O según la capa de límites internacionales del IGN.' },


  // ---------------- IGN: Argentina continental (WFS por extensión de la vista) ----------------
  ...IGN_VIEW_LAYERS,

  // ---------------- ARBA: catastro de la Provincia de Buenos Aires ----------------
  ...['Parcela', 'Manzana', 'Quinta', 'Chacra', 'Seccion_Catastral', 'Circunscripcion', 'Departamento'].map((n) => ({
    id: `arba-${n.toLowerCase()}`, group: 'arba', name: {
      Parcela: 'Parcelas (catastro vigente)', Manzana: 'Manzanas', Quinta: 'Quintas', Chacra: 'Chacras',
      Seccion_Catastral: 'Secciones catastrales', Circunscripcion: 'Circunscripciones', Departamento: 'Partidos (ARBA)',
    }[n],
    kind: 'raster', type: 'wms', url: 'https://geo.arba.gov.ar/geoserver/ows', layers: `idera:${n}`, wmsProjections: ['EPSG:3857', 'EPSG:4326'], sem: 'parcel',
    attribution: 'ARBA – Catastro territorial', cite: 'Agencia de Recaudación de la Provincia de Buenos Aires (ARBA). Servicio WMS de catastro territorial (IDERA). https://geo.arba.gov.ar',
    note: n === 'Parcela' ? 'Parcelario vigente: sirve de referencia para comparar con mensuras y planos históricos. Se lee a escalas mayores que 1:100.000.' : undefined,
  })),

  // ---------------- Atlas de Mensuras de Giles (copia local de los datos publicados) ----------------
  { id: 'atlas-partido', group: 'atlas', name: 'Partido de San Andrés de Giles (contorno)', kind: 'vector', type: 'geojson', url: 'data/atlas_partido_contorno.geojson', geom: 'polygon', sem: 'study-area',
    fields: [], attribution: ATLAS_ATTR, cite: ATLAS_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#ffffff', fillOpacity: 0, stroke: '#1d1d1d', strokeWidth: 1.1, dash: 'solid' } }) } },
  { id: 'atlas-mensuras', group: 'atlas', name: 'Mensuras del Archivo Histórico de Geodesia (1825–1925)', kind: 'vector', type: 'geojson', url: 'data/atlas_mensuras_ahg.geojson', geom: 'polygon', sem: 'historic-parcel',
    fields: ['n', 'tit', 'y', 'ag', 'ha', 'ed'], attribution: ATLAS_ATTR, cite: ATLAS_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#c9a66b', fillOpacity: 0.45, stroke: '#5b4630', strokeWidth: 0.35 }, label: { field: 'n', size: 5.5, color: '#3b2f22' },
      categorize: { field: 'y', mode: 'ranges', values: {}, ranges: [
        { min: 1825, max: 1849, color: '#8c510a', label: '1825–1849' }, { min: 1850, max: 1869, color: '#bf812d', label: '1850–1869' },
        { min: 1870, max: 1884, color: '#dfc27d', label: '1870–1884' }, { min: 1885, max: 1899, color: '#80cdc1', label: '1885–1899' },
        { min: 1900, max: 1925, color: '#35978f', label: '1900–1925' }] } }) },
    note: '190 polígonos georreferenciados de duplicados de mensura (número de carpeta, titular, año, agrimensor, superficie). Coloreados por período; se puede cambiar el campo y los rangos.' },
  { id: 'atlas-r1874', group: 'atlas', name: 'Registro gráfico c. 1874 (parcelas)', kind: 'vector', type: 'geojson', url: 'data/atlas_registro_grafico_1874.geojson', geom: 'polygon', sem: 'historic-parcel',
    fields: ['t', 'ha', 'c', 'p'], attribution: ATLAS_ATTR, cite: ATLAS_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#e8dcc2', fillOpacity: 0.3, stroke: '#6b5a44', strokeWidth: 0.3, dash: 'solid' }, label: { field: 't', size: 4.5, color: '#4a3d2c' } }) } },
  { id: 'atlas-urbanas', group: 'atlas', name: 'Planta urbana 1884 (parcelas y ocupación)', kind: 'vector', type: 'geojson', url: 'data/atlas_parcelas_urbanas_1884.geojson', geom: 'polygon', sem: 'historic-parcel',
    fields: ['oc', 'pr', 'm2'], attribution: ATLAS_ATTR, cite: ATLAS_CITE,
    defaults: { style: baseStyle({ polygon: { fill: '#e8dcc2', fillOpacity: 0.6, stroke: '#5b4630', strokeWidth: 0.25 }, label: { field: 'pr', size: 4 },
      categorize: { field: 'oc', values: { MURO: '#b5523b', ALAMBRADO: '#c9a66b', CERCO: '#8fae6b', BALDIO: '#f1ead8', PLAZA: '#6f9f5a', IGLESIA: '#4a3d2c', CEMENTERIO: '#7d7d7d' } } }) } },
  { id: 'atlas-caminos', group: 'atlas', name: 'Caminos, ferrocarril, tranvía y telégrafo (planos históricos)', kind: 'vector', type: 'geojson', url: 'data/atlas_caminos.geojson', geom: 'line', sem: 'historic-road',
    fields: ['nm', 't', 'y', 'ob', 'km'], attribution: ATLAS_ATTR, cite: ATLAS_CITE,
    defaults: { style: baseStyle({ line: { color: '#6b4a2b', width: 0.9, dash: 'solid' }, label: { field: 'nm', size: 5, italic: true, color: '#4a3220' },
      categorize: { field: 't', values: { CAMINO: '#6b4a2b', FERROCARRIL: '#1d1d1d', 'TELÉGRAFO': '#7a7a7a', TRANWAY: '#8c2f1b' } } }) },
    note: 'Trazas dibujadas en los planos de mensura (con año y carpeta de origen).' },
  { id: 'atlas-estancias1884', group: 'atlas', name: 'Estancias, puestos y pulperías (1884)', kind: 'vector', type: 'geojson', url: 'data/atlas_estancias_puestos_1884.geojson', geom: 'point', sem: 'historic-poi',
    fields: ['d', 't'], attribution: ATLAS_ATTR, cite: ATLAS_CITE,
    defaults: { style: baseStyle({ point: { shape: 'square', size: 4, fill: '#8c2f1b', stroke: '#ffffff', strokeWidth: 0.4 }, label: { field: 'd', size: 5, italic: true, color: '#4a3220' },
      categorize: { field: 't', values: { Estancia: '#8c2f1b', Puesto: '#c47a2c', Pulperia: '#2f5d8c', Posta: '#5a3d7a' } } }) } },
  { id: 'atlas-poblamiento', group: 'atlas', name: 'Poblamiento dibujado en las mensuras (casas, puestos, taperas)', kind: 'vector', type: 'geojson', url: 'data/atlas_poblamiento_mensuras.geojson', geom: 'point', sem: 'historic-poi',
    fields: ['d', 't', 'n'], attribution: ATLAS_ATTR, cite: ATLAS_CITE,
    defaults: { style: baseStyle({ point: { shape: 'circle', size: 2.6, fill: '#5b4630', stroke: '#ffffff', strokeWidth: 0.3 }, label: { field: 'd', size: 4.5 },
      categorize: { field: 't', values: { CASA: '#5b4630', PUESTO: '#c47a2c', PULPERIA: '#2f5d8c', TAPERA: '#9a9a9a', ARRENDATARIO: '#7a9a4a', RANCHO: '#a0522d', POSTA: '#5a3d7a' } } }) } },

  // ---------------- IGN WMS ----------------
  { id: 'ign-wms-pais', group: 'ign-wms', name: 'Territorio nacional (bicontinental)', kind: 'raster', type: 'wms', url: IGN_OWS, layers: 'ign:pais',
    attribution: 'IGN – País', cite: IGN_CITE, note: 'Polígono oficial (continental, insular y antártico). Es pesado: el servidor puede tardar unos segundos por tesela.' },
  { id: 'ign-wms-provincia', group: 'ign-wms', name: 'Provincias', kind: 'raster', type: 'wms', url: IGN_OWS, layers: 'ign:provincia',
    attribution: 'IGN – Provincias', cite: IGN_CITE },
  { id: 'ign-wms-200mn', group: 'ign-wms', name: '200 millas desde la costa del sector antártico', kind: 'raster', type: 'wms', url: IGN_OWS, layers: 'ign:doscientas_millas_sector_antartico',
    attribution: 'IGN – 200 millas sector antártico', cite: IGN_CITE },
  { id: 'ign-wms-marterr', group: 'ign-wms', name: 'Mar territorial', kind: 'raster', type: 'wms', url: IGN_OWS, layers: 'ign:mar_territorial_argentino',
    attribution: 'IGN – Mar territorial', cite: IGN_CITE },
  { id: 'ign-wms-zee', group: 'ign-wms', name: 'Zona económica exclusiva (imagen)', kind: 'raster', type: 'wms', url: IGN_OWS, layers: 'ign:zona_economica_exclusiva_argentina',
    attribution: 'IGN – ZEE', cite: IGN_CITE },
  { id: 'ign-wms-barrera', group: 'ign-wms', name: 'Barreras de hielo (imagen)', kind: 'raster', type: 'wms', url: IGN_OWS, layers: 'ign:areas_de_glaciologia_050705',
    attribution: 'IGN – Barreras de hielo', cite: IGN_CITE },
  { id: 'ign-wms-mde', group: 'ign-wms', name: 'Modelo digital de elevaciones (continente)', kind: 'raster', type: 'wms', url: IGN_OWS, layers: 'ign:mde',
    attribution: 'IGN – MDE-Ar', cite: IGN_CITE, note: 'Cubre el territorio continental; para la Antártida usar REMA/IBCSO o GEBCO.' },
  { id: 'ign-wms-curvas', group: 'ign-wms', name: 'Curvas hipsométricas', kind: 'raster', type: 'wms', url: IGN_OWS, layers: 'ign:lineas_de_geomorfologia_CA010',
    attribution: 'IGN – Curvas de nivel', cite: IGN_CITE },

  // ---------------- Costas y hielos ----------------
  { id: 'add-costa', sem: 'land', group: 'costas', name: 'Costa antártica SCAR ADD (vectorial)', kind: 'vector', type: 'esri-feature', geom: 'polygon',
    urls: {
      medium: 'https://services7.arcgis.com/tPxy1hrFDhJfZ0Mf/ArcGIS/rest/services/Medium_resolution_vector_polygons_of_the_Antarctic_coastline/FeatureServer/1',
      high: 'https://services7.arcgis.com/tPxy1hrFDhJfZ0Mf/ArcGIS/rest/services/High_resolution_vector_polygons_of_the_Antarctic_coastline/FeatureServer/1',
    },
    fields: ['surface'],
    attribution: 'SCAR Antarctic Digital Database v7.12', cite: 'Gerrish, L., Fretwell, P. y Cooper, P. (2025). Costa antártica de resolución media y alta (polígonos), v7.12. SCAR Antarctic Digital Database. British Antarctic Survey.',
    defaults: { style: baseStyle({ polygon: { fill: '#f4f7f8', fillOpacity: 1, stroke: '#41535e', strokeWidth: 0.35 },
      categorize: { field: 'surface', values: { land: '#f4f7f8', 'ice shelf': '#dbe9f0', 'ice tongue': '#dbe9f0', rumple: '#e7eff3' } } }) },
    note: 'Resolución media o alta según la escala (cambia sola). Superficies: tierra, barrera de hielo, lengua de hielo.' },
  { id: 'ne-paises', sem: 'land', group: 'costas', name: 'Países (Natural Earth, vista argentina)', kind: 'vector', type: 'geojson', url: 'data/paises_ne_vista_arg.geojson', geom: 'polygon',
    fields: ['nombre', 'iso'],
    attribution: 'Natural Earth 1:10M', cite: 'Natural Earth (2024). Admin 0 – Countries, 1:10M, versión con punto de vista argentino. https://www.naturalearthdata.com',
    defaults: { style: baseStyle({ polygon: { fill: '#e6e2d8', fillOpacity: 1, stroke: '#7d7a72', strokeWidth: 0.35 },
      categorize: { field: 'iso', values: { ARG: '#d8d2c2' } }, label: { field: 'nombre' } }) },
    note: 'Sudamérica y alrededores, con Islas Malvinas, Georgias y Sandwich del Sur como territorio argentino (vista ARG de Natural Earth). La Antártida se dibuja con la costa SCAR ADD.' },

  // ---------------- Relieve ----------------
  { id: 'rema-relieve', sem: 'relief', group: 'relieve', name: 'REMA: modelo de elevación de la Antártida', kind: 'raster', type: 'arcgis-image',
    url: 'https://overlord.pgc.umn.edu/arcgis/rest/services/elevation/pgc_rema_mosaics_latest/ImageServer', projection: 'EPSG:3031',
    functions: [['Hillshade Multidirectional', 'Sombreado multidireccional'], ['Hillshade Gray', 'Sombreado clásico (NO 315°)'], ['Hillshade Elevation Tinted', 'Hipsometría con sombreado'], ['Slope Map', 'Pendientes'], ['Aspect Map', 'Orientación de laderas']],
    attribution: 'REMA – Polar Geospatial Center', cite: 'Howat, I. M., Porter, C., Smith, B. E., Noh, M.-J. y Morin, P. (2019). The Reference Elevation Model of Antarctica. The Cryosphere 13, 665–674. Mosaico REMA servido por el Polar Geospatial Center (Universidad de Minnesota).',
    defaults: { params: { fn: 'Hillshade Multidirectional' }, clip: 'land' },
    note: 'Modelo de elevación de referencia de la Antártida (mosaico de 2 m). Por defecto se recorta a la costa SCAR ADD (agregá esa capa) para no teñir el mar. La primera carga puede tardar unos segundos.' },
  { id: 'rema-curvas', group: 'relieve', name: 'REMA: curvas de nivel cada 25 m', kind: 'raster', type: 'arcgis-image',
    url: 'https://overlord.pgc.umn.edu/arcgis/rest/services/elevation/pgc_rema_mosaics_latest/ImageServer', projection: 'EPSG:3031',
    functions: [['Contour Smoothed 25', 'Curvas suavizadas, 25 m'], ['Contour 25', 'Curvas sin suavizar, 25 m']],
    attribution: 'REMA – Polar Geospatial Center', cite: 'Howat et al. (2019). The Reference Elevation Model of Antarctica. Polar Geospatial Center.',
    defaults: { params: { fn: 'Contour Smoothed 25' }, clip: 'land' },
    note: 'Pensado para mapas de detalle (escalas mayores que 1:500.000); a escala chica las curvas se empastan.' },
  { id: 'npi-base', group: 'relieve', name: 'Mapa base polar NPI (relieve, batimetría y costa)', kind: 'raster', type: 'arcgis',
    url: 'https://geodata.npolar.no/arcgis/rest/services/Basisdata_Intern/NP_Antarktis_WMTS_3031/MapServer', params: {}, projection: 'EPSG:3031',
    attribution: 'Norwegian Polar Institute: REMA, IBCSO, SCAR ADD', cite: 'Norwegian Polar Institute (2024). Mapa base de la Antártida (REMA, IBCSO v2, SCAR ADD, ETOPO1).',
    note: 'Mapa compuesto: trae su propia grilla blanca y toponimia noruega en Tierra de la Reina Maud.' },
  { id: 'gebco-relieve', group: 'relieve', name: 'GEBCO relieve sombreado', kind: 'raster', type: 'wms', url: 'https://wms.gebco.net/mapserv', layers: 'GEBCO_LATEST', wmsProjections: ['EPSG:3857', 'EPSG:4326'],
    attribution: 'GEBCO Compilation Group', cite: 'GEBCO Compilation Group (2025). GEBCO 2025 Grid. doi:10.5285/37c52e96-24ea-67ce-e063-7086abc05f29' },
  { id: 'gebco-color', group: 'relieve', name: 'GEBCO topografía y batimetría (color)', kind: 'raster', type: 'wms', url: 'https://wms.gebco.net/mapserv', layers: 'GEBCO_LATEST_2', wmsProjections: ['EPSG:3857', 'EPSG:4326'],
    attribution: 'GEBCO Compilation Group', cite: 'GEBCO Compilation Group (2025). GEBCO 2025 Grid.' },
  { id: 'gebco-subhielo', group: 'relieve', name: 'GEBCO topografía bajo el hielo', kind: 'raster', type: 'wms', url: 'https://wms.gebco.net/mapserv', layers: 'GEBCO_LATEST_2_sub_ice_topo', wmsProjections: ['EPSG:3857', 'EPSG:4326'],
    attribution: 'GEBCO Compilation Group', cite: 'GEBCO Compilation Group (2025). GEBCO 2025 Grid (sub-ice topography).' },
  { id: 'dem-analitico', sem: 'relief', group: 'relieve', name: 'DEM analítico (rampa y sombreado a medida)', kind: 'raster', type: 'terrarium',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', projection: 'EPSG:3857', maxZoom: 13,
    attribution: 'Terrain Tiles (Mapzen/AWS): SRTM, GMTED, ETOPO1', cite: 'Mapzen / AWS Open Data. Terrain Tiles (formato Terrarium): SRTM, GMTED2010, ETOPO1.',
    defaults: { params: { ramp: 'hipsometrica', min: -4000, max: 2500, shade: true, azimuth: 315, altitude: 40, zFactor: 2, shadeStrength: 0.55, transparentSea: false } },
    note: 'Calcula colores y sombreado en el navegador a partir de elevaciones reales. En la Antártida la resolución es baja (ETOPO1).' },
  { id: 'esri-hillshade', group: 'relieve', name: 'Sombreado mundial Esri', kind: 'raster', type: 'xyz', projection: 'EPSG:3857', maxZoom: 13,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, USGS, NGA, NASA, CGIAR', cite: 'Esri (2024). World Hillshade.' },
  { id: 'gibs-relieve', group: 'relieve', name: 'Blue Marble relieve y batimetría (NASA)', kind: 'raster', type: 'xyz', projection: 'EPSG:3031',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/500m/{z}/{y}/{x}.jpeg', tileGrid: POLAR_GRID_GIBS(5),
    attribution: 'NASA GIBS – Blue Marble', cite: 'NASA Earth Observatory / GIBS. Blue Marble Shaded Relief and Bathymetry.' },
  { id: 'esri-oceano', group: 'relieve', name: 'Océanos Esri (batimetría base)', kind: 'raster', type: 'xyz', projection: 'EPSG:3857', maxZoom: 13,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, GEBCO, NOAA, NGS', cite: 'Esri (2024). World Ocean Base.' },

  // ---------------- Satelital ----------------
  { id: 'esri-antartida', group: 'sat', name: 'Imagen satelital Antártida (polar)', kind: 'raster', type: 'xyz', projection: 'EPSG:3031',
    url: 'https://elevation3d.arcgis.com/arcgis/rest/services/Polar/Antarctic_Imagery/MapServer/tile/{z}/{y}/{x}', tileGrid: POLAR_GRID_ESRI,
    attribution: 'Esri, Earthstar Geographics', cite: 'Esri / Earthstar Geographics (2024). Antarctic Imagery (EPSG:3031).',
    note: 'Mosaico polar nativo en EPSG:3031: cubre todo el continente, incluido el polo.' },
  { id: 'esri-mundo', group: 'sat', name: 'Imagen satelital mundial (Esri)', kind: 'raster', type: 'xyz', projection: 'EPSG:3857', maxZoom: 18,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics', cite: 'Esri (2024). World Imagery.' },
  { id: 'eox-s2', group: 'sat', name: 'Sentinel-2 sin nubes 2020 (EOX)', kind: 'raster', type: 'xyz', projection: 'EPSG:3857', maxZoom: 15,
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
    attribution: 'Sentinel-2 cloudless – s2maps.eu, EOX (Copernicus 2020)', cite: 'EOX IT Services GmbH (2021). Sentinel-2 cloudless 2020 (contiene datos Copernicus Sentinel modificados 2020). CC BY-NC-SA 4.0.' },
  { id: 'gibs-modis', group: 'sat', name: 'MODIS color verdadero por fecha (NASA)', kind: 'raster', type: 'gibs-date', projection: 'EPSG:3031',
    layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', tileGrid: POLAR_GRID_GIBS(6),
    attribution: 'NASA GIBS – MODIS Terra', cite: 'NASA Worldview / GIBS. MODIS Terra Corrected Reflectance (True Color).',
    defaults: { params: { date: '2026-01-15' } },
    note: 'Imagen diaria: elegí una fecha de verano austral con poca nubosidad.' },
  { id: 'gibs-bmng', group: 'sat', name: 'Blue Marble Next Generation (NASA)', kind: 'raster', type: 'xyz', projection: 'EPSG:3031',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/BlueMarble_NextGeneration/default/2004-08-01/500m/{z}/{y}/{x}.jpeg', tileGrid: POLAR_GRID_GIBS(5),
    attribution: 'NASA GIBS – Blue Marble NG', cite: 'NASA Earth Observatory. Blue Marble Next Generation.' },

  // ---------------- Referencias ----------------
  { id: 'ref-sector', sem: 'admin', group: 'ref', name: 'Sector Antártico Argentino (25°O–74°O)', kind: 'vector', type: 'generated', gen: 'sector', geom: 'polygon',
    attribution: 'Sector Antártico Argentino', cite: 'Sector Antártico Argentino: entre los meridianos 25°O y 74°O, al sur del paralelo 60°S (Decreto-Ley 2129/57).',
    defaults: { style: baseStyle({ polygon: { fill: '#ffffff', fillOpacity: 0, stroke: '#2b2b2b', strokeWidth: 0.8, dash: 'solid' } }) } },
  { id: 'ref-60s', group: 'ref', name: 'Paralelo 60°S (límite del Tratado Antártico)', kind: 'vector', type: 'generated', gen: 'parallel60', geom: 'line',
    attribution: 'Paralelo 60°S', cite: 'Área del Tratado Antártico: al sur de los 60°S (art. VI).',
    defaults: { style: baseStyle({ line: { color: '#1f4e79', width: 0.6, dash: 'dashed' } }) } },
  { id: 'ref-circulo', group: 'ref', name: 'Círculo Polar Antártico', kind: 'vector', type: 'generated', gen: 'polarCircle', geom: 'line',
    attribution: 'Círculo Polar Antártico', cite: 'Círculo Polar Antártico calculado con la oblicuidad de la eclíptica del año en curso.',
    defaults: { style: baseStyle({ line: { color: '#5b7c99', width: 0.5, dash: 'dotted' } }) } },
  { id: 'ref-hitos', group: 'ref', name: 'Hitos y toponimia antártica', kind: 'vector', type: 'geojson', url: 'data/hitos_antarticos.geojson', geom: 'point',
    fields: ['nombre', 'clase'], labelsOnly: true,
    attribution: 'Toponimia: IGN / SCAR CGA', cite: 'Toponimia argentina según IGN; puntos de rotulación de islas derivados de la capa ign:areas_de_zona_costera_BA030.',
    defaults: { style: baseStyle({ point: { shape: 'none', size: 0 }, label: { show: true, field: 'nombre', size: 6.5, color: '#2a4a63', halo: '#ffffff', haloWidth: 1, offsetY: 0, byClass: true } }) },
    note: 'Rótulos por clase: mares y pasajes en cursiva espaciada, islas en redonda, regiones en mayúsculas.' },
  { id: 'graticule', group: 'ref', name: 'Grilla de coordenadas', kind: 'special', type: 'graticule',
    attribution: '', cite: '',
    defaults: { style: { line: { color: '#5a6b78', width: 0.35, opacity: 0.8, dash: 'solid' }, label: { show: true, mode: 'frame', size: 6, color: '#33424e', font: 'Source Sans 3', edges: 'classic', vertical: true }, interval: 'auto', intervalLon: 'auto' } } },

  // ---------------- capas internas (no se listan en el catálogo) ----------------
  { id: 'georef', group: 'hidden', name: 'Plano georreferenciado', kind: 'raster', type: 'georef', attribution: '', cite: '', sem: 'historic-image' },
  { id: 'interp', group: 'hidden', name: 'Mapa de interpretación', kind: 'vector', type: 'interp', geom: 'mixed', attribution: '', cite: '', sem: 'interpretation' },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((d) => [d.id, d]));

export function getDef(id) {
  if (CATALOG_BY_ID.has(id)) return CATALOG_BY_ID.get(id);
  return null;
}

// Definición de una capa del mapa: las del catálogo fijo y las de servicios oficiales (que llevan su definición adentro)
export function defOf(ls) {
  if (!ls) return null;
  if (ls.def === 'svc') return ls.svc || null;
  return getDef(ls.def);
}

// Rampas de color para el DEM analítico.
// 'sea' se aplica de la cota mínima a 0 m y 'land' de 0 m a la máxima; 'all' recorre todo el rango.
export const RAMPS = {
  hipsometrica: { name: 'Hipsométrica clásica', sea: [[0, '#1d3b5c'], [0.6, '#5f9bc4'], [1, '#cfe7f0']], land: [[0, '#7fa36b'], [0.25, '#c9c08a'], [0.55, '#b88a5a'], [0.8, '#8f6a50'], [1, '#ffffff']] },
  hielo: { name: 'Hielo y mar', sea: [[0, '#0b2545'], [0.7, '#5c8db8'], [1, '#bcd7e6']], land: [[0, '#e3ecf1'], [1, '#ffffff']] },
  batimetria: { name: 'Batimetría azul, tierra gris', sea: [[0, '#08306b'], [0.6, '#4292c6'], [1, '#c6dbef']], land: [[0, '#d9d9d9'], [1, '#f7f7f7']] },
  grises: { name: 'Grises (todo el rango)', all: [[0, '#202020'], [1, '#f2f2f2']] },
  viridis: { name: 'Viridis (todo el rango)', all: [[0, '#440154'], [0.25, '#3b528b'], [0.5, '#21918c'], [0.75, '#5ec962'], [1, '#fde725']] },
  cividis: { name: 'Cividis, apta daltonismo (todo el rango)', all: [[0, '#00204c'], [0.25, '#414d6b'], [0.5, '#7c7b78'], [0.75, '#bcae6e'], [1, '#ffe945']] },
  pampa: { name: 'Llanura: verdes y ocres sutiles (todo el rango)', all: [[0, '#4f7f63'], [0.3, '#93b07c'], [0.6, '#d6cf9b'], [0.85, '#c9a66b'], [1, '#a9774b']] },
  sepia: { name: 'Sepia de grabado (todo el rango)', all: [[0, '#5b4630'], [0.5, '#c9b18a'], [1, '#f6efe0']] },
  hidro: { name: 'Bajos húmedos en azul, lomas en ocre (todo el rango)', all: [[0, '#4f86b0'], [0.25, '#9cc3d6'], [0.5, '#e8e4c9'], [1, '#c29a6a']] },
};
