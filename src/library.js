// Biblioteca de proyectos: cada proyecto reúne sus datos fundamentales (título, autoría, área, proyección, destino)
// y uno o varios mapas. Se guarda en IndexedDB del navegador de cada computadora.
import { dbGet, dbPut, dbDelete, dbAll, dbByIndex } from './db.js';
import { uid } from './util.js';
import { exportImages, importImages, deleteImage, allImageKeys } from './imagestore.js';

export const WORK_KINDS = [
  ['tesis-doctoral', 'Tesis doctoral'], ['tesis-maestria', 'Tesis de maestría'], ['tesina', 'Tesina o trabajo final'],
  ['articulo', 'Artículo científico'], ['ponencia', 'Ponencia o póster'], ['informe', 'Informe técnico'],
  ['plan', 'Plan, ordenanza o proyecto normativo'], ['docencia', 'Material docente'], ['divulgacion', 'Divulgación'], ['otro', 'Otro'],
];
export const LICENSES = [
  ['CC BY 4.0', 'CC BY 4.0 (atribución)'], ['CC BY-SA 4.0', 'CC BY-SA 4.0 (atribución, compartir igual)'], ['CC BY-NC 4.0', 'CC BY-NC 4.0 (sin uso comercial)'],
  ['Todos los derechos reservados', 'Todos los derechos reservados'], ['', 'Sin indicar'],
];

export function defaultMeta(over = {}) {
  return Object.assign({
    name: '', kind: 'tesis-doctoral', title: '', subtitle: '', author: '', institution: '', director: '', year: String(new Date().getFullYear()),
    keywords: '', summary: '', discipline: 'geografia', period: '', license: 'CC BY 4.0', language: 'es',
    area: null, crs: '', mediaId: 'tesis-a4', themeId: '', notes: '',
  }, over);
}

const now = () => new Date().toISOString();
const clean = (state) => JSON.parse(JSON.stringify(state, (k, v) => (k.startsWith('_') ? undefined : v)));

// ---------- proyectos ----------
export async function listProjects() {
  const projects = await dbAll('proyectos');
  const maps = await dbAll('mapas');
  const byP = new Map();
  for (const m of maps) {
    if (!byP.has(m.projectId)) byP.set(m.projectId, []);
    byP.get(m.projectId).push({ id: m.id, name: m.name, updated: m.updated, thumb: m.thumb || null });
  }
  return projects.map((p) => {
    const ms = byP.get(p.id) || [];
    const order = p.mapIds || [];
    ms.sort((a, b) => (order.indexOf(a.id) + 1 || 1e6) - (order.indexOf(b.id) + 1 || 1e6));
    return { ...p, maps: ms };
  }).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export async function getProject(id) { return dbGet('proyectos', id); }

export async function createProject(meta, firstMap) {
  const p = { id: uid('P'), meta: defaultMeta(meta), created: now(), updated: now(), mapIds: [], activeMapId: null };
  await dbPut('proyectos', p);
  if (firstMap) {
    const m = await createMap(p.id, firstMap.name || 'Mapa 1', firstMap.state);
    p.mapIds = [m.id]; p.activeMapId = m.id;
    await dbPut('proyectos', p);
  }
  return p;
}

export async function saveProjectMeta(id, meta) {
  const p = await dbGet('proyectos', id);
  if (!p) return null;
  p.meta = defaultMeta({ ...p.meta, ...meta });
  p.updated = now();
  await dbPut('proyectos', p);
  return p;
}

export async function touchProject(id, patch = {}) {
  const p = await dbGet('proyectos', id);
  if (!p) return null;
  Object.assign(p, patch, { updated: now() });
  await dbPut('proyectos', p);
  return p;
}

export async function deleteProject(id) {
  const maps = await dbByIndex('mapas', 'projectId', id);
  for (const m of maps) await dbDelete('mapas', m.id);
  await dbDelete('proyectos', id);
  await collectImages();
}

export async function duplicateProject(id) {
  const p = await dbGet('proyectos', id);
  if (!p) return null;
  const maps = await dbByIndex('mapas', 'projectId', id);
  const np = { ...p, id: uid('P'), meta: { ...p.meta, name: `${p.meta.name || 'Proyecto'} (copia)` }, created: now(), updated: now(), mapIds: [] };
  await dbPut('proyectos', np);
  const order = p.mapIds || [];
  maps.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const m of maps) {
    const nm = { ...m, id: uid('M'), projectId: np.id, updated: now() };
    await dbPut('mapas', nm);
    np.mapIds.push(nm.id);
    if (m.id === p.activeMapId) np.activeMapId = nm.id;
  }
  if (!np.activeMapId) np.activeMapId = np.mapIds[0] || null;
  await dbPut('proyectos', np);
  return np;
}

// ---------- mapas ----------
export async function createMap(projectId, name, state) {
  const m = { id: uid('M'), projectId, name: name || 'Mapa', state: clean(state), updated: now(), thumb: null };
  await dbPut('mapas', m);
  const p = await dbGet('proyectos', projectId);
  if (p) {
    p.mapIds = [...(p.mapIds || []).filter((x) => x !== m.id), m.id];
    p.activeMapId = m.id; p.updated = now();
    await dbPut('proyectos', p);
  }
  return m;
}
export async function getMap(id) { return dbGet('mapas', id); }
export async function listMaps(projectId) {
  const p = await dbGet('proyectos', projectId);
  const maps = await dbByIndex('mapas', 'projectId', projectId);
  const order = (p && p.mapIds) || [];
  return maps.sort((a, b) => (order.indexOf(a.id) + 1 || 1e6) - (order.indexOf(b.id) + 1 || 1e6));
}
export async function saveMap(id, state, { thumb, name } = {}) {
  const m = await dbGet('mapas', id);
  if (!m) return null;
  m.state = clean(state);
  m.updated = now();
  if (thumb) m.thumb = thumb;
  if (name) m.name = name;
  await dbPut('mapas', m);
  const p = await dbGet('proyectos', m.projectId);
  if (p) { p.updated = m.updated; p.activeMapId = id; await dbPut('proyectos', p); }
  return m;
}
export async function renameMap(id, name) {
  const m = await dbGet('mapas', id);
  if (!m) return;
  m.name = name; m.updated = now();
  await dbPut('mapas', m);
}
export async function duplicateMap(id, name) {
  const m = await dbGet('mapas', id);
  if (!m) return null;
  return createMap(m.projectId, name || `${m.name} (copia)`, m.state);
}
export async function deleteMap(id) {
  const m = await dbGet('mapas', id);
  if (!m) return;
  await dbDelete('mapas', id);
  const p = await dbGet('proyectos', m.projectId);
  if (p) {
    p.mapIds = (p.mapIds || []).filter((x) => x !== id);
    if (p.activeMapId === id) p.activeMapId = p.mapIds[0] || null;
    p.updated = now();
    await dbPut('proyectos', p);
  }
  await collectImages();
}

// ---------- imágenes huérfanas ----------
function imageKeysOf(state) {
  const keys = new Set();
  ((state && state.interp && state.interp.sources) || []).forEach((s) => s.key && keys.add(s.key));
  if (state && state.modelRef && state.modelRef.key) keys.add(state.modelRef.key);
  ((state && state.layers) || []).forEach((l) => { if (l.def === 'svc' && l.svc && l.svc.key) keys.add(l.svc.key); });
  return keys;
}
export async function collectImages() {
  try {
    const maps = await dbAll('mapas');
    const used = new Set();
    maps.forEach((m) => imageKeysOf(m.state).forEach((k) => used.add(k)));
    const all = await allImageKeys();
    for (const k of all) if (!used.has(k) && !String(k).startsWith('ejemplo-') && k !== 'modelo-referencia') await deleteImage(k);
  } catch (e) { /* noop */ }
}

// ---------- exportar e importar ----------
export async function exportProject(id) {
  const p = await dbGet('proyectos', id);
  const maps = await listMaps(id);
  const keys = new Set();
  maps.forEach((m) => imageKeysOf(m.state).forEach((k) => keys.add(k)));
  return {
    formato: 'mapas-tesis-proyecto', version: 3, exportado: now(),
    proyecto: { meta: p.meta, created: p.created, activeMapIndex: Math.max(0, maps.findIndex((m) => m.id === p.activeMapId)) },
    mapas: maps.map((m) => ({ name: m.name, state: m.state, thumb: m.thumb || null })),
    images: keys.size ? await exportImages([...keys]) : {},
  };
}

// Admite el formato de proyecto completo y también un mapa suelto (.tesis.json / .coni.json de versiones anteriores)
export async function importProject(obj, fallbackName = 'Proyecto importado') {
  if (obj.images) await importImages(obj.images);
  if (obj.formato === 'mapas-tesis-proyecto') {
    const p = await createProject({ ...obj.proyecto.meta, name: obj.proyecto.meta.name || fallbackName });
    let active = null;
    for (const [i, m] of (obj.mapas || []).entries()) {
      const nm = await createMap(p.id, m.name, m.state);
      if (m.thumb) { nm.thumb = m.thumb; await dbPut('mapas', nm); }
      if (i === (obj.proyecto.activeMapIndex || 0)) active = nm.id;
    }
    await touchProject(p.id, { activeMapId: active });
    return getProject(p.id);
  }
  const state = { ...obj };
  delete state.images;
  const th = state.thesis || {};
  const p = await createProject(defaultMeta({ name: state.title || fallbackName, title: th.title || '', keywords: th.keywords || '', period: th.period || '' }), { name: state.title || 'Mapa 1', state });
  return p;
}

// El proyecto único de la versión anterior (localStorage) pasa a la biblioteca una sola vez
export async function migrateLegacy(legacyState) {
  if (!legacyState) return null;
  try {
    if (localStorage.getItem('mapas-tesis:migrado')) return null;
    const existing = await dbAll('proyectos');
    const th = legacyState.thesis || {};
    const p = await createProject(defaultMeta({ name: legacyState.title || 'Proyecto recuperado', title: th.title || '', keywords: th.keywords || '' }), { name: legacyState.title || 'Mapa 1', state: legacyState });
    localStorage.setItem('mapas-tesis:migrado', p.id);
    return { project: p, hadOthers: existing.length > 0 };
  } catch (e) { return null; }
}
