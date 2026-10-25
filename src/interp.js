// Operaciones sobre los mapas de interpretación: fuentes (planos), georreferenciaciones por versión, elementos y versiones.
import { uid, deepClone, downloadBlob, formatDMS } from './util.js';
import { newVersion, newLayerState, CERTAINTY } from './state.js';
import { putImage, ingestFile, ingestUrl, getImage, deleteImage } from './imagestore.js';
import { georefModel } from './layers.js';
import { modelSummary, methodInfo, fmtM } from './georef.js';
import { sourceCitation } from './caption.js';
import { getDef } from './catalog.js';

export function activeVersion(state) {
  const it = state.interp;
  return it.versions.find((v) => v.id === it.active) || it.versions[0];
}
export function isLocked(state) { const v = activeVersion(state); return !!(v && v.locked); }

export function georefOf(state, sourceId, create = false) {
  const v = activeVersion(state);
  if (!v.georefs) v.georefs = {};
  if (!v.georefs[sourceId] && create) v.georefs[sourceId] = { gcps: [], method: 'affine' };
  return v.georefs[sourceId] || null;
}

// ---------- capas en la pila ----------
export function interpLayer(state, ghost = false) {
  return state.layers.find((l) => l.def === 'interp' && !!(l.params && l.params.ghost) === ghost);
}
export function ensureInterpLayer(app) {
  const st = app.state;
  let ls = interpLayer(st, false);
  if (!ls) {
    ls = newLayerState('interp', { name: 'Mapa de interpretación', params: { version: 'active', labels: true, label: { size: 6, font: 'Source Sans 3', color: '#1d2b38', halo: '#ffffff' } } });
    ls.legend.show = true;
    const g = st.layers.findIndex((l) => l.def === 'graticule');
    st.layers.splice(g >= 0 ? g : st.layers.length, 0, ls);
  }
  ls.visible = true;
  return ls;
}
export function bumpInterp(app) {
  for (const l of app.state.layers) if (l.def === 'interp') l.rev += 1;
  app.commit('layers');
}

export function georefLayer(state, sourceId) { return state.layers.find((l) => l.def === 'georef' && l.params && l.params.sourceId === sourceId); }
export function ensureGeorefLayer(app, src) {
  const st = app.state;
  let ls = georefLayer(st, src.id);
  if (!ls) {
    ls = newLayerState('georef', { name: src.title || 'Plano georreferenciado', params: { sourceId: src.id }, opacity: 0.75 });
    ls.legend.show = false;
    // encima de las bases ráster y debajo de los vectores
    let idx = 0;
    st.layers.forEach((l, i) => { const d = getDef(l.def); if (l.def === 'georef' || (d && d.kind === 'raster')) idx = i + 1; });
    st.layers.splice(idx, 0, ls);
  }
  ls.visible = true;
  ls.rev += 1;
  return ls;
}

// ---------- fuentes ----------
export function newSource(over = {}) {
  return Object.assign({
    id: uid('F'), key: null, w: 0, h: 0, title: '', author: '', year: '', archive: '', ref: '', url: '', notes: '', kind: 'plano',
    proc: { paper: false, threshold: 0.72, softness: 0.12, tint: '', gray: false, crop: { x: 0, y: 0, w: 1, h: 1 } },
  }, over);
}

export async function addSourceFromFile(app, file) {
  const { blob, w, h } = await ingestFile(file);
  const src = newSource({ title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), w, h });
  src.key = `img-${src.id}`;
  await putImage(src.key, blob, w, h);
  app.state.interp.sources.push(src);
  return src;
}

export async function removeSource(app, src) {
  const st = app.state;
  st.interp.sources = st.interp.sources.filter((x) => x !== src);
  st.layers = st.layers.filter((l) => !(l.def === 'georef' && l.params && l.params.sourceId === src.id));
  for (const v of st.interp.versions) if (v.georefs) delete v.georefs[src.id];
  if (!st.interp.sources.some((x) => x.key === src.key)) await deleteImage(src.key);
}

// Ejemplo real: duplicado de mensura 45 (Lescano, 1866), con las cuatro esquinas del rectángulo de la carpeta 45 del Atlas
export const EXAMPLE_LESCANO = {
  key: 'ejemplo-mensura-045',
  url: 'data/ejemplos/mensura-045-lescano-1866.jpg',
  source: {
    title: 'Duplicado de mensura N.º 45: campo de los herederos de Francisco Lescano',
    author: 'Saubidet, Pedro (agrimensor)', year: '1866',
    archive: 'Archivo Histórico de Geodesia, Provincia de Buenos Aires', ref: 'Duplicado 45 (antes «Sección Areco N.º 206»)',
    url: 'https://github.com/surtecto/atlas-mensuras-giles',
    notes: 'Fotografía del plano tomada en el archivo (con perspectiva). El plano está dibujado con el sudoeste hacia arriba: arriba linda con Noriega, a la izquierda con Achával, abajo con los herederos de José Díaz y a la derecha con las sobras de Vivar y Pividal. Las cuatro esquinas del rectángulo interior se apoyan en el polígono de la carpeta 45 del Atlas de Mensuras de Giles; la faja de «sobras» que excede el título queda afuera.',
  },
  georef: {
    method: 'projective',
    gcps: [
      { name: 'Esquina sur (Noriega y Achával)', px: 530, py: 177, lon: -59.40242, lat: -34.539559 },
      { name: 'Esquina oeste (Noriega y Pividal)', px: 1440, py: 211, lon: -59.441947, lat: -34.487218 },
      { name: 'Esquina norte (Pividal y Díaz)', px: 1449, py: 777, lon: -59.401448, lat: -34.467533 },
      { name: 'Esquina este (Díaz y Achával)', px: 530, py: 771, lon: -59.362402, lat: -34.519659 },
    ],
  },
  feature: {
    name: 'Campo de los herederos de F. Lescano (1866)', cat: 'suerte', cert: 'cierta', period: '1866',
    note: 'Rectángulo de 2933,7 ha (5000 × 7900 varas de título) dividido en seis fajas longitudinales para Gerónima, Hilaria, Francisco, Pascual, Alejandro y Solano.',
    coords: [[-59.401448, -34.467533], [-59.362402, -34.519659], [-59.40242, -34.539559], [-59.441947, -34.487218], [-59.401448, -34.467533]],
  },
};

export async function addExampleSource(app, { withFeature = true } = {}) {
  const st = app.state;
  const ex = EXAMPLE_LESCANO;
  let src = st.interp.sources.find((x) => x.key === ex.key);
  if (!src) {
    let img = await getImage(ex.key);
    if (!img) {
      const { blob, w, h } = await ingestUrl(ex.url);
      img = await putImage(ex.key, blob, w, h);
    }
    src = newSource({ ...ex.source, key: ex.key, w: img.w, h: img.h });
    st.interp.sources.push(src);
  }
  const gr = georefOf(st, src.id, true);
  if (!gr.gcps.length) {
    gr.method = ex.georef.method;
    gr.gcps = ex.georef.gcps.map((g) => ({ id: uid('P'), on: true, ...g }));
  }
  if (withFeature) {
    const v = activeVersion(st);
    if (!v.features.features.some((f) => f.properties && f.properties.example === 'lescano')) {
      v.features.features.push({ type: 'Feature', id: uid('E'), properties: { name: ex.feature.name, cat: ex.feature.cat, cert: ex.feature.cert, period: ex.feature.period, note: ex.feature.note, src: src.id, example: 'lescano' }, geometry: { type: 'Polygon', coordinates: [ex.feature.coords] } });
    }
  }
  ensureGeorefLayer(app, src);
  ensureInterpLayer(app);
  return src;
}

// ---------- versiones ----------
export function duplicateVersion(app, { withFeatures = true, name } = {}) {
  const it = app.state.interp;
  const cur = activeVersion(app.state);
  const n = it.versions.length + 1;
  const v = newVersion(name || `Versión ${n}`, {
    author: cur.author, note: '', basedOn: cur.id,
    georefs: stripModels(deepClone(stripModels(cur.georefs || {}))),
    features: withFeatures ? deepClone(cur.features) : { type: 'FeatureCollection', features: [] },
  });
  if (withFeatures) v.features.features.forEach((f) => { f.id = uid('E'); });
  it.versions.push(v);
  it.active = v.id;
  return v;
}
function stripModels(georefs) {
  const out = {};
  for (const [k, g] of Object.entries(georefs || {})) out[k] = { gcps: (g.gcps || []).map((p) => ({ ...p })), method: g.method };
  return out;
}

export function setGhost(app, versionId) {
  const st = app.state;
  st.interp.ghost = versionId || null;
  let gl = interpLayer(st, true);
  if (!versionId) { if (gl) st.layers = st.layers.filter((l) => l !== gl); return; }
  if (!gl) {
    gl = newLayerState('interp', { name: 'Versión para comparar', params: { version: versionId, ghost: true, labels: false } });
    gl.legend.show = true;
    const main = interpLayer(st, false);
    const idx = main ? st.layers.indexOf(main) : st.layers.length;
    st.layers.splice(idx, 0, gl);
  }
  gl.params.version = versionId;
  gl.visible = true;
  gl.rev += 1;
}

export function deleteVersion(app, id) {
  const it = app.state.interp;
  if (it.versions.length <= 1) return false;
  it.versions = it.versions.filter((v) => v.id !== id);
  if (it.active === id) it.active = it.versions[it.versions.length - 1].id;
  if (it.ghost === id) setGhost(app, null);
  return true;
}

// ---------- elementos ----------
export function addFeature(state, geometry, props) {
  const v = activeVersion(state);
  const f = { type: 'Feature', id: uid('E'), properties: { name: '', cat: state.interp.drawCat, cert: state.interp.drawCert, period: '', src: '', note: '', ...props }, geometry };
  v.features.features.push(f);
  return f;
}
export function findFeature(state, id) {
  const v = activeVersion(state);
  return v.features.features.find((f) => f.id === id) || null;
}
export function removeFeature(state, id) {
  const v = activeVersion(state);
  v.features.features = v.features.features.filter((f) => f.id !== id);
}

// ---------- exportación ----------
export function exportVersionGeoJSON(state, v) {
  const it = state.interp;
  const cats = Object.fromEntries(it.categories.map((c) => [c.id, c.name]));
  const certs = Object.fromEntries(CERTAINTY.map((c) => [c.id, c.name]));
  const srcs = Object.fromEntries(it.sources.map((s) => [s.id, sourceCitation(s)]));
  const fc = {
    type: 'FeatureCollection',
    name: v.name,
    metadata: { version: v.name, creada: v.created, autor: v.author, nota: v.note, fijada: !!v.locked },
    features: v.features.features.map((f) => ({
      type: 'Feature', id: f.id, geometry: f.geometry,
      properties: { nombre: f.properties.name || '', categoria: cats[f.properties.cat] || f.properties.cat, certeza: certs[f.properties.cert] || f.properties.cert, periodo: f.properties.period || '', fuente: srcs[f.properties.src] || '', nota: f.properties.note || '' },
    })),
  };
  const slug = String(v.name || 'version').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase();
  downloadBlob(new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' }), `interpretacion-${slug}.geojson`);
}

// Ficha metodológica: fuentes, georreferenciación, criterios de certeza y versiones (para el capítulo de métodos)
export function methodSheet(state) {
  const it = state.interp;
  const lines = [];
  lines.push('FICHA METODOLÓGICA DEL MAPA DE INTERPRETACIÓN');
  lines.push('');
  lines.push('Fuentes cartográficas');
  it.sources.forEach((s, i) => {
    lines.push(`${i + 1}. ${sourceCitation(s)}.`);
    if (s.notes) lines.push(`   Nota: ${s.notes}`);
  });
  if (!it.sources.length) lines.push('(sin planos cargados)');
  lines.push('');
  lines.push('Versiones');
  for (const v of it.versions) {
    const d = new Date(v.created);
    const n = (v.features.features || []).length;
    lines.push(`- ${v.name}${v.locked ? ' [fijada]' : ''} (${Number.isFinite(d.getTime()) ? d.toLocaleDateString('es-AR') : 's. f.'})${v.author ? `, ${v.author}` : ''}: ${n} elemento${n === 1 ? '' : 's'}.${v.note ? ` ${v.note}` : ''}`);
    for (const [sid, g] of Object.entries(v.georefs || {})) {
      const s = it.sources.find((x) => x.id === sid);
      if (!s) continue;
      const tmp = { ...state, interp: { ...it, active: v.id } };
      const { model } = georefModel(tmp, sid);
      lines.push(`    Georreferenciación de «${s.title}»: ${modelSummary(model)}.`);
      (g.gcps || []).filter((p) => p.on !== false).forEach((p, k) => {
        const r = model && model.residuals ? model.residuals.find((x) => x.id === p.id) : null;
        lines.push(`      P${k + 1} ${p.name ? `${p.name}: ` : ''}píxel (${Math.round(p.px)}, ${Math.round(p.py)}) → ${formatDMS(p.lat, true, { decimals: 1 })} ${formatDMS(p.lon, false, { decimals: 1 })}${r ? `; residuo ${fmtM(r.d)}` : ''}`);
      });
    }
  }
  lines.push('');
  lines.push('Grados de certeza');
  CERTAINTY.forEach((c) => lines.push(`- ${c.name} (${c.dash === 'solid' ? 'trazo lleno' : c.dash === 'dashed' ? 'guiones' : 'puntos'}): ${c.hint}`));
  lines.push('');
  lines.push('Métodos de georreferenciación disponibles: ' + ['helmert', 'affine', 'projective', 'poly2', 'poly3', 'tps'].map((m) => methodInfo(m).name).join('; ') + '.');
  return lines.join('\n');
}
