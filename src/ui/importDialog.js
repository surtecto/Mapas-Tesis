// Importación de datos propios: vectores (GeoJSON, KML/KMZ, GPX, CSV, Shapefile suelto o en .zip) y ráster
// (GeoTIFF de imágenes procesadas, clasificaciones, índices o elevaciones; PNG/JPG con archivo de georreferencia).
import { el, uid, readFileAs } from '../util.js';
import { field, inlineFields, select, text, num } from './forms.js';
import { formDialog } from './dialogs.js';
import { fileToGeoJSON } from './importers.js';
import { baseStyle } from '../catalog.js';
import { newServiceLayerState } from '../state.js';
import { insertIndexFor } from './layersPanel.js';
import { geomOf } from './styleEditor.js';
import { putImage, ingestFile } from '../imagestore.js';
import { frameRect } from '../overlay.js';
import { combine, parseShp, parseDbf } from 'shpjs';
import {
  inspectTiff, sampleBand, renderRgb, renderRamp, renderIntervals, renderClasses, RAMPS, CLASS_SCHEMES,
  usableCrs, crsFromWkt, bboxToLonLat, parseWorldFile, worldFileExtent, unzip,
} from '../rasterImport.js';

const WORLD = ['tfw', 'tifw', 'pgw', 'pngw', 'jgw', 'jpgw', 'jpw', 'wld'];
const SIDE = new Set([...WORLD, 'prj', 'dbf', 'shx', 'cpg', 'qpj', 'sbn', 'sbx', 'xml', 'ovr', 'qmd', 'qix']);
const parts = (name) => {
  const n = name.toLowerCase().replace(/\.aux\.xml$/, '.xml');
  const i = n.lastIndexOf('.');
  return i < 0 ? { base: n, ext: '' } : { base: n.slice(0, i), ext: n.slice(i + 1) };
};
const pretty = (name) => name.replace(/\.[^.]+$/, '');
const fmtInt = (v) => Math.round(v).toLocaleString('es-AR');

export const ACCEPT = '.geojson,.json,.kml,.kmz,.gpx,.csv,.tsv,.txt,.zip,.shp,.dbf,.prj,.shx,.cpg,.tif,.tiff,.tfw,.png,.jpg,.jpeg,.pgw,.jgw,.wld';

// ---------- vectores ----------
export function addVectorLayer(app, name, geojson) {
  const n = (geojson.features || []).length;
  if (!n) { app.toast(`«${name}» no tiene elementos con geometría.`, 'warn'); return null; }
  const clean = pretty(name);
  const ls = {
    uid: uid('L'), def: 'user', name: clean, visible: true, opacity: 1, blend: 'normal',
    adjust: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0 }, clip: 'none',
    style: baseStyle({ point: { fill: '#7a3fb0' }, line: { color: '#7a3fb0', width: 0.8 }, polygon: { fill: '#7a3fb0', fillOpacity: 0.25, stroke: '#7a3fb0', strokeWidth: 0.6 }, label: { field: '' } }),
    params: {}, legend: { show: true, label: clean }, insets: {}, rev: 0, _styleVersion: 0, data: geojson,
  };
  const props = (geojson.features.find((f) => f.properties) || {}).properties || {};
  ls.style.label.field = Object.keys(props).find((k) => /nombre|name|sitio|site/i.test(k)) || Object.keys(props)[0] || '';
  const g = app.state.layers.findIndex((l) => l.def === 'graticule');
  app.state.layers.splice(g >= 0 ? g : app.state.layers.length, 0, ls);
  app.ui.expanded.add(ls.uid);
  const gm = geomOf(ls);
  app.toast(`Importado: ${ls.name} (${fmtInt(n)} elementos, ${gm === 'point' ? 'puntos' : gm === 'line' ? 'líneas' : 'polígonos'})`);
  return ls;
}

// ---------- ráster ----------
function addRasterLayer(app, def, over = {}) {
  const st = app.state;
  const ls = newServiceLayerState(def, over);
  if (def.classes) ls.legend = { show: true, label: def.name };
  // va con las demás imágenes, pero por encima de los fondos de países (que son rellenos opacos y la taparían)
  let idx = insertIndexFor(st, def);
  st.layers.forEach((l, i) => { if (/^ne-(america|paises)$/.test(l.def) && i >= idx) idx = i + 1; });
  st.layers.splice(idx, 0, ls);
  app.ui.expanded.add(ls.uid);
  // si la imagen queda fuera de la vista, el mapa va hacia ella
  const v = app.viewBBoxLL(), b = def.bbox;
  const inside = b[0] <= v[2] && b[2] >= v[0] && b[1] <= v[3] && b[3] >= v[1];
  const tiny = (b[2] - b[0]) * (b[3] - b[1]) < (v[2] - v[0]) * (v[3] - v[1]) * 0.004;
  if (!inside || tiny) {
    const f = frameRect(st);
    const lat = (b[1] + b[3]) / 2;
    const wm = (b[2] - b[0]) * 111320 * Math.cos((lat * Math.PI) / 180), hm = (b[3] - b[1]) * 110540;
    app.flyTo([(b[0] + b[2]) / 2, lat], Math.max(wm / f.w, hm / f.h) * 1.15);
  }
  return ls;
}
const rasterDef = (name, key, extent, code, out, source, detail) => ({
  id: 'svc', kind: 'raster', type: 'svc-img', name, key, extent, projection: code, bbox: bboxToLonLat(extent, code), labels: !!out.labels, imported: true,
  ...(out.classes ? { classes: out.classes } : {}), ...(out.range ? { range: out.range } : {}),
  provider: { id: 'propio', short: 'Datos propios', name: 'Datos propios' },
  attribution: source || name, cite: `${name}: ${source || 'elaboración propia'} (${detail}; ráster importado y reducido a ${out.w} × ${out.h} px)`,
});

function guessScheme(values) {
  if (!values.length) return 'auto';
  for (const id of ['worldcover', 'esri', 'dynamicworld', 'mapbiomas']) {
    const m = CLASS_SCHEMES[id].map;
    const hit = values.filter((v) => m[v]).length;
    if (id === 'worldcover' && hit === values.length && values.some((v) => v >= 20)) return id;
    if (id === 'esri' && hit === values.length && values.some((v) => v === 11 || v === 7) && !values.includes(3) && !values.includes(6)) return id;
    if (id === 'dynamicworld' && hit === values.length && values.includes(0) && Math.max(...values) <= 8) return id;
    if (id === 'mapbiomas' && hit >= values.length * 0.8 && Math.max(...values) > 11) return id;
  }
  return 'auto';
}

async function importTiff(app, file, side = {}) {
  let info;
  const tfw = WORLD.map((e) => side[e]).find(Boolean);
  try {
    info = await inspectTiff(file, { tfw: tfw ? parseWorldFile(await readFileAs(tfw, 'text')) : null, prj: side.prj ? await readFileAs(side.prj, 'text') : null });
  } catch (e) { app.toast(`No se pudo leer «${file.name}»: ${e.message}.`, 'error'); return false; }
  let probe = { categorical: false, values: [], unique: 0, stats: { min: 0, max: 1 } };
  if (info.bands <= 2 || info.colorMap) { try { probe = await sampleBand(info, 0); } catch (e) { /* se decide a mano */ } }
  const bandOpts = Array.from({ length: info.bands }, (_, i) => [i, `Banda ${i + 1}`]);
  const o = {
    name: pretty(file.name), source: '', epsg: '',
    mode: info.bands >= 3 && !info.colorMap ? 'rgb' : (probe.categorical || info.colorMap ? 'classes' : 'intervals'),
    r: 0, g: Math.min(1, info.bands - 1), b: Math.min(2, info.bands - 1), stretch: info.bits === 8 && !info.float && info.bands <= 4 ? 'none' : 'p2',
    band: 0, scheme: guessScheme(probe.values), ramp: 'viridis', n: 6, how: 'equal',
  };
  const sub = el('div', { class: 'imp-sub' });
  const paint = () => {
    sub.replaceChildren(...(o.mode === 'rgb' ? [
      inlineFields(field('Rojo', select(o, 'r', bandOpts, { numeric: true })), field('Verde', select(o, 'g', bandOpts, { numeric: true })), field('Azul', select(o, 'b', bandOpts, { numeric: true }))),
      field('Realce', select(o, 'stretch', [['p2', 'Automático (percentiles 2–98 de cada banda)'], ['minmax', 'De mínimo a máximo'], ['none', 'Ninguno: los valores ya son colores (0–255)']]),
        info.bands > 3 ? 'Para un falso color elegí qué banda va en cada canal (por ejemplo, infrarrojo cercano en rojo).' : null),
    ] : o.mode === 'classes' ? [
      info.bands > 1 ? field('Banda', select(o, 'band', bandOpts, { numeric: true })) : null,
      field('Leyenda de partida', select(o, 'scheme', Object.entries(CLASS_SCHEMES).map(([k, v]) => [k, v.name])), probe.unique ? `La banda tiene ${probe.unique} valores distintos. Los nombres y colores se pueden cambiar después, clase por clase.` : null),
    ] : [
      info.bands > 1 ? field('Banda', select(o, 'band', bandOpts, { numeric: true })) : null,
      field('Colores', select(o, 'ramp', Object.entries(RAMPS).map(([k, v]) => [k, v.name]))),
      o.mode === 'intervals' ? inlineFields(field('Intervalos', num(o, 'n', { min: 2, max: 12, step: 1 })), field('Cortes', select(o, 'how', [['equal', 'Iguales'], ['quantile', 'Igual cantidad de píxeles']]))) : null,
    ]).filter(Boolean));
  };
  paint();
  const modes = [
    ...(info.bands >= 3 ? [['rgb', 'Imagen en color (tres bandas)']] : []),
    ['classes', 'Clasificación: cada valor es una clase'], ['intervals', 'Valores continuos en intervalos, con leyenda'], ['ramp', 'Valores continuos en degradado'],
  ];
  const type = info.float ? 'decimales' : `enteros de ${info.bits} bits`;
  const body = el('div', { class: 'imp-form' },
    el('p', { class: 'note' }, `${fmtInt(info.W)} × ${fmtInt(info.H)} píxeles, ${info.bands === 1 ? 'una banda' : `${info.bands} bandas`}, valores ${type}${info.crs.code ? `, ${info.crs.code}` : ''}.${Math.max(info.W, info.H) > info.outW ? ` Se guarda reducida a ${info.outW} × ${info.outH} px para trabajar en el navegador.` : ''}`),
    field('Nombre de la capa', text(o, 'name')),
    info.crs.code ? null : field('Sistema de coordenadas (código EPSG)', text(o, 'epsg', { placeholder: 'Ej.: 32720 (UTM 20 Sur), 5347 (POSGAR faja 5), 4326' }), `El archivo ${info.crs.epsg ? `declara EPSG:${info.crs.epsg}, que esta aplicación no dibuja` : 'no declara su sistema de coordenadas'}. Se aceptan geográficas, Mercator web, UTM (WGS 84 o SIRGAS 2000) y POSGAR 2007.`),
    field('Qué contiene', select(o, 'mode', modes, { onChange: paint })),
    sub,
    field('Fuente, para el epígrafe', text(o, 'source', { placeholder: 'Ej.: elaboración propia sobre Sentinel-2 del 14/03/2024' })));
  const ok = await formDialog({
    title: 'Importar ráster', body, ok: 'Importar', wide: true,
    validate: () => (info.crs.code || usableCrs(String(o.epsg).replace(/\D/g, '')) ? true : 'Indicá un código EPSG que la aplicación pueda dibujar, o reproyectá el archivo en QGIS a UTM (WGS 84) o geográficas.'),
  });
  if (!ok) return false;
  const code = info.crs.code || usableCrs(String(o.epsg).replace(/\D/g, ''));
  app.toast(`Leyendo «${file.name}»…`);
  try {
    const out = o.mode === 'rgb' ? await renderRgb(info, o)
      : o.mode === 'classes' ? await renderClasses(info, { band: o.band, scheme: o.scheme, code })
        : o.mode === 'intervals' ? await renderIntervals(info, { band: o.band, ramp: o.ramp, n: o.n, how: o.how, code })
          : await renderRamp(info, { band: o.band, ramp: o.ramp });
    const key = `calc-${uid('R')}`;
    await putImage(key, out.blob, out.w, out.h);
    const name = o.name.trim() || pretty(file.name);
    addRasterLayer(app, rasterDef(name, key, info.extent, code, out, o.source.trim(), out.detail), { opacity: 1 });
    app.toast(`Ráster importado: ${name} (${out.detail}).${/^(MT:LAEA|CONI:LAEA|CONI:BICONT)/.test(app.state.projection) ? ' En esta proyección continental se ve inclinado: para trabajar en detalle, elegí «UTM de la zona del mapa».' : ''}`);
    return true;
  } catch (e) { app.toast(`No se pudo importar «${file.name}»: ${e.message}.`, 'error'); return false; }
}

async function importWorldImage(app, file, side) {
  const wfFile = WORLD.map((e) => side[e]).find(Boolean);
  try {
    const wf = parseWorldFile(await readFileAs(wfFile, 'text'));
    const bmp = await createImageBitmap(file);
    const W = bmp.width, H = bmp.height;
    bmp.close && bmp.close();
    const extent = worldFileExtent(wf, W, H);
    let code = side.prj ? crsFromWkt(await readFileAs(side.prj, 'text')) : null;
    const o = { name: pretty(file.name), epsg: '', source: '' };
    const guess = !code && Math.abs(extent[0]) <= 180 && Math.abs(extent[2]) <= 180 && Math.abs(extent[1]) <= 90 && Math.abs(extent[3]) <= 90 ? 'EPSG:4326' : null;
    const body = el('div', { class: 'imp-form' },
      el('p', { class: 'note' }, `${fmtInt(W)} × ${fmtInt(H)} píxeles, con archivo de georreferencia${code ? ` y sistema ${code}` : ''}.`),
      field('Nombre de la capa', text(o, 'name')),
      code ? null : field('Sistema de coordenadas (código EPSG)', text(o, 'epsg', { placeholder: guess ? '4326 (por las coordenadas, parecen geográficas)' : 'Ej.: 32720, 5347, 4326' }), 'El archivo de georreferencia no dice en qué sistema están las coordenadas. Si lo dejás vacío y parecen grados, se toman como geográficas.'),
      field('Fuente, para el epígrafe', text(o, 'source', { placeholder: 'Ej.: carta topográfica escaneada, IGM 1954' })));
    const ok = await formDialog({ title: 'Importar imagen georreferenciada', body, ok: 'Importar', wide: true, validate: () => (code || usableCrs(String(o.epsg).replace(/\D/g, '')) || guess ? true : 'Indicá el código EPSG de las coordenadas.') });
    if (!ok) return false;
    code = code || usableCrs(String(o.epsg).replace(/\D/g, '')) || guess;
    const ing = await ingestFile(file);
    const key = `calc-${uid('R')}`;
    await putImage(key, ing.blob, ing.w, ing.h);
    const name = o.name.trim() || pretty(file.name);
    addRasterLayer(app, rasterDef(name, key, extent, code, { labels: false, w: ing.w, h: ing.h }, o.source.trim(), 'imagen con archivo de georreferencia'), { opacity: 1 });
    app.toast(`Imagen importada: ${name}.`);
    return true;
  } catch (e) { app.toast(`No se pudo importar «${file.name}»: ${e.message}.`, 'error'); return false; }
}

async function importLooseShp(app, file, side) {
  const shpBuf = await readFileAs(file, 'buffer');
  const prj = side.prj ? await readFileAs(side.prj, 'text') : null;
  const geoms = parseShp(shpBuf, prj);
  const rows = side.dbf ? parseDbf(await readFileAs(side.dbf, 'buffer'), side.cpg ? await readFileAs(side.cpg, 'text') : undefined) : null;
  const gj = combine([geoms, rows]);
  if (!side.dbf) app.toast(`«${file.name}» vino sin su archivo .dbf: se importan las geometrías, sin atributos.`, 'warn');
  if (!side.prj) app.toast(`«${file.name}» vino sin su archivo .prj: se toma como WGS 84 (latitud y longitud).`, 'warn');
  return !!addVectorLayer(app, file.name, gj);
}

// Punto de entrada: una selección de archivos (o lo que se soltó sobre el mapa)
export async function importFiles(app, fileList) {
  let files = [...fileList];
  // los .zip y .kmz se abren acá para encontrar ráster o KML adentro; los Shapefile comprimidos siguen por su lector
  const extra = [];
  for (const f of files.slice()) {
    const { ext } = parts(f.name);
    if (ext !== 'zip' && ext !== 'kmz') continue;
    try {
      const entries = await unzip(await readFileAs(f, 'buffer'));
      const names = entries.map((e) => e.name.toLowerCase());
      if (ext === 'zip' && names.some((n) => n.endsWith('.shp')) && !names.some((n) => /\.tiff?$/.test(n))) continue;
      files = files.filter((x) => x !== f);
      for (const e of entries) {
        const nm = e.name.split('/').pop();
        if (!nm || nm.startsWith('.') || e.name.startsWith('__MACOSX')) continue;
        extra.push(new File([e.data], ext === 'kmz' && /\.kml$/i.test(nm) ? `${pretty(f.name)}.kml` : nm));
      }
    } catch (e) { app.toast(`No se pudo abrir «${f.name}»: ${e.message}.`, 'error'); files = files.filter((x) => x !== f); }
  }
  files = files.concat(extra);
  const side = new Map();
  for (const f of files) { const { base, ext } = parts(f.name); if (SIDE.has(ext)) { if (!side.has(base)) side.set(base, {}); side.get(base)[ext] = f; } }
  const mains = files.filter((f) => !SIDE.has(parts(f.name).ext));
  if (!mains.length && files.length) app.toast('Elegí también el archivo principal (.shp, .tif, .png o .jpg) junto con sus acompañantes.', 'warn');
  let done = 0;
  for (const f of mains) {
    const { base, ext } = parts(f.name);
    const sd = side.get(base) || {};
    try {
      if (ext === 'tif' || ext === 'tiff') { if (await importTiff(app, f, sd)) done++; }
      else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        if (WORLD.some((e) => sd[e])) { if (await importWorldImage(app, f, sd)) done++; }
        else if (/^(image|img|picture)/i.test(f.type || 'image')) app.toast(`«${f.name}» es una imagen sin georreferencia. Si es un plano o mapa a calcar, sumala desde Interpretación; si ya está georreferenciada, elegí también su archivo .pgw, .jgw o .wld.`, 'warn');
      } else if (ext === 'shp') { if (await importLooseShp(app, f, sd)) done++; }
      else if (['geojson', 'json', 'kml', 'gpx', 'csv', 'tsv', 'txt', 'zip'].includes(ext)) {
        for (const r of await fileToGeoJSON(f)) if (addVectorLayer(app, r.name, r.geojson)) done++;
      } else app.toast(`«${f.name}»: formato no reconocido. Se leen GeoJSON, KML/KMZ, GPX, CSV, Shapefile, GeoTIFF e imágenes con archivo de georreferencia.`, 'warn');
    } catch (err) { app.toast(`No se pudo importar «${f.name}»: ${err.message}`, 'error'); }
  }
  if (done) { app.commit('layers'); app.renderLeft(); app.keepInside(); }
  return done;
}
