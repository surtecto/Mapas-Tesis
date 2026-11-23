// Página de inicio: la planoteca de esta computadora (proyectos con sus mapas) y el asistente para empezar uno nuevo.
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import Draw, { createBox } from 'ol/interaction/Draw.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import { el, clear, readFileAs, downloadBlob, fmtNum } from '../util.js';
import {
  listProjects, createProject, deleteProject, duplicateProject, exportProject, importProject, defaultMeta, WORK_KINDS, LICENSES,
} from '../library.js';
import { storageInfo, requestPersistence } from '../db.js';
import { MEDIA, getMedia } from '../media.js';
import { THEMES } from '../themes.js';
import { readTheme, synthesize, readPlace } from '../interpret.js';
import { TEMPLATES, createExampleProject } from '../templates.js';
import { buildFirstMap } from '../starter.js';
import { searchPlaces } from './search.js';
import { gkFaja, utmZone } from '../projections.js';
import { countryAtLL, adminAt, fetchBoundaries, boundariesLayer, fetchOsm, osmLayer, OSM_THEMES } from '../latam.js';
import { getDef } from '../catalog.js';
import { confirmDialog, promptDialog } from './dialogs.js';
import { cacheInfo, cacheClear } from '../layercache.js';
import {
  folderStatus, chooseFolder, reconnectFolder, unlinkFolder, syncAll, setDeviceName, deviceName, markAllLocalOnly, setLocalOnly, restoreToFolder, importForeign,
} from '../folder.js';

const IGN = (n) => `https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/${n}@EPSG%3A3857@png/{z}/{x}/{-y}.png`;
const ESRI_IMG = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

function relTime(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) { const n = Math.round(s / 86400); return `hace ${n} ${n === 1 ? 'día' : 'días'}`; }
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}
const kindName = (k) => (WORK_KINDS.find((x) => x[0] === k) || [k, ''])[1];
const mb = (b) => (b == null ? '—' : `${fmtNum(b / 1048576, 1)} MB`);
const slug = (t) => String(t || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase().slice(0, 50);

export function brandMark(size = 30) {
  return el('img', { class: 'brand-mark brand-icon', src: 'assets/icon.svg', width: size, height: size, alt: '' });
}

function topBar(tag, tools = []) {
  return el('header', { class: 'home-top' },
    el('a', { class: 'brand', href: '#/' }, brandMark(), el('span', { class: 'wordmark' }, 'Mapas-Tesis')),
    tag ? el('span', { class: 'home-tag' }, tag) : null,
    el('div', { class: 'home-top-tools' }, ...tools));
}

function prepareRoot() {
  const root = document.getElementById('home');
  clear(root);
  root.hidden = false;
  document.body.classList.add('on-home');
  document.getElementById('app').hidden = true;
  return root;
}

// ---------- inicio ----------
export async function renderHome(app, { sync = true } = {}) {
  const root = prepareRoot();
  const [projects, st, lc] = await Promise.all([listProjects().catch((e) => { app.toast(e.message, 'error'); return []; }), storageInfo(), cacheInfo()]);
  // con carpeta conectada, al entrar se trae lo que cambió en otras computadoras
  const fs0 = folderStatus();
  if (sync && fs0.ready && !fs0.busy && (!app._lastHomeSync || Date.now() - app._lastHomeSync > 10000)) {
    app._lastHomeSync = Date.now();
    syncAll().then((res) => {
      if (res.imported.length || res.updated.length || res.conflicts.length || res.removed.length || res.written.length || (res.foreign && res.foreign.length)) {
        if (app.reportSync) app.reportSync(res);
      }
      if (document.body.classList.contains('on-home') && !location.hash.startsWith('#/nuevo')) renderHome(app, { sync: false });
    });
  }
  const importInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  importInput.addEventListener('change', async () => {
    const f = importInput.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await readFileAs(f, 'text'));
      const p = await importProject(obj, f.name.replace(/(\.(tesis|coni|mapa))?\.json$/i, ''));
      app.toast(`Proyecto importado: ${p.meta.name}`);
      renderHome(app);
    } catch (err) { app.toast(`No se pudo importar el archivo: ${err.message}`, 'error'); }
    importInput.value = '';
  });

  // La hoja en blanco con marcas de corte es la puerta de entrada
  const blank = el('button', { type: 'button', class: 'blank-sheet', onclick: () => app.newProject() },
    el('span', { class: 'crop tl' }), el('span', { class: 'crop tr' }), el('span', { class: 'crop bl' }), el('span', { class: 'crop br' }),
    el('span', { class: 'bs-title' }, 'Nuevo proyecto'),
    el('span', { class: 'bs-text' }, 'Cargá los datos del trabajo, ubicá el lugar sobre la imagen satelital o en una hoja en blanco, y elegí dónde se va a ver el primer mapa.'));

  const exampleBtn = (t) => el('button', {
    type: 'button', class: 'example', onclick: async () => {
      if (t.build.after) { try { await t.build.after(app); } catch (e) { /* el modelo sigue sin su imagen */ } }
      const state = t.build();
      const th = state.thesis || {};
      const p = await createExampleProject(t, state);
      location.hash = `#/p/${p.id}`;
    },
  }, el('strong', {}, t.name), t.desc ? el('span', {}, t.desc) : null);

  const start = el('section', { class: 'home-start', 'aria-labelledby': 'h-start' },
    el('h1', { id: 'h-start', class: 'visually-hidden' }, 'Empezar'),
    blank,
    el('h2', {}, 'O partir de una hoja ya encuadrada'),
    el('p', { class: 'home-note' }, 'Mapas en blanco de América Latina, listos para sumar capas. Para un país, una provincia o un municipio, usá «Nuevo proyecto» y elegí el lugar.'),
    el('div', { class: 'examples' }, ...TEMPLATES.map(exampleBtn)));

  const list = el('div', { class: 'project-grid' });
  if (!projects.length) {
    list.append(el('div', { class: 'empty-projects' },
      el('strong', {}, 'Esta computadora todavía no tiene proyectos.'),
      el('span', {}, 'Empezá uno con «Nuevo proyecto», partí de una hoja ya encuadrada o importá el archivo .json que exportaste en otra computadora.')));
  }
  for (const p of projects) list.append(projectSheet(app, p));
  const fstrip = folderStrip(app, projects);
  const usage = st.usage != null ? `${mb(st.usage)} en uso${st.quota ? ` de ${mb(st.quota)} disponibles` : ''}` : '';
  const libr = el('section', { class: 'home-library', 'aria-labelledby': 'h-lib' },
    el('div', { class: 'lib-head' },
      el('h1', { id: 'h-lib' }, fs0.ready ? 'Proyectos' : 'Proyectos en esta computadora'),
      projects.length ? el('span', { class: 'lib-count' }, String(projects.length)) : null),
    fstrip,
    list,
    el('footer', { class: 'home-foot' },
      el('p', {}, fs0.linked ? 'Los proyectos se guardan en este navegador mientras trabajás y, además, como archivos en la carpeta elegida.' : 'Los proyectos se guardan en este navegador mientras trabajás. Para verlos en otra computadora, elegí una carpeta sincronizada arriba o exportá el proyecto e importalo allá.', usage ? ` ${usage}.` : ''),
      lc.n ? el('p', {}, `Además, ${lc.n.toLocaleString('es-AR')} teselas de capas oficiales (${mb(lc.bytes)}) quedaron guardadas para que los mapas se vean aunque el servidor no responda. `,
        el('button', { type: 'button', class: 'btn small ghost', onclick: async () => {
          const ok = await confirmDialog({ title: 'Vaciar las capas guardadas', text: 'Se borran las copias locales de las capas oficiales. Los proyectos no se tocan; las capas se vuelven a pedir a sus servidores.', ok: 'Vaciar' });
          if (!ok) return;
          await cacheClear(); app.toast('Capas guardadas borradas.'); renderHome(app);
        } }, 'Vaciar')) : null,
      st.persisted ? el('p', { class: 'ok-note' }, 'El navegador tiene orden de conservar estos proyectos.')
        : el('button', { type: 'button', class: 'btn small ghost', onclick: async () => {
          const ok = await requestPersistence();
          app.toast(ok ? 'Listo: el navegador conservará los proyectos aunque necesite liberar espacio.' : 'El navegador no aceptó conservarlos siempre. Exportá los proyectos importantes.', ok ? 'info' : 'warn');
          renderHome(app);
        } }, 'Pedir al navegador que no los borre')),
  );
  root.append(
    topBar('Cartografía para investigar, interpretar y mostrar', [el('button', { type: 'button', class: 'btn ghost', onclick: () => importInput.click() }, 'Importar proyecto'), importInput]),
    whatsNew(app),
    el('main', { class: `home-main${projects.length ? ' has-projects' : ''}` }, start, libr));
}

// ---------- novedades de la versión y elección de versión ----------
const NEWS_KEY = 'mapas-tesis:novedades-3.5';
function whatsNew(app) {
  let seen = false;
  try { seen = !!localStorage.getItem(NEWS_KEY); } catch (e) { seen = false; }
  const versions = el('p', { class: 'wn-versions' },
    el('span', {}, 'Versión 3.5 · '),
    el('a', { href: 'anterior/' }, 'usar la versión anterior (3.4)'),
    el('span', {}, '. Las dos trabajan con los mismos proyectos guardados en esta computadora y con la misma carpeta. Un mapa que use funciones nuevas solo se abre en la 3.5: la anterior avisa y no lo toca.'));
  const body = el('div', { class: 'wn-body' },
    el('ul', {},
      el('li', {}, el('strong', {}, 'Toda América Latina. '), 'De México a Tierra del Fuego: el asistente reconoce el país, usa la proyección UTM de la zona y arma el mapa de ubicación.'),
      el('li', {}, el('strong', {}, 'Límites y OpenStreetMap. '), 'Estados, provincias y municipios de cualquier país; ríos, rutas, localidades y áreas protegidas de la vista, como capas propias.'),
      el('li', {}, el('strong', {}, 'Geoservicios por país y catastros. '), 'Directorio comprobado de organismos de la región, catastros provinciales argentinos y de otros países, y un campo para pegar la dirección de cualquier servicio.'),
      el('li', {}, el('strong', {}, 'Tus imágenes y clasificaciones. '), 'GeoTIFF de imágenes satelitales procesadas, clasificaciones con su leyenda, índices y modelos de elevación; también KMZ y Shapefile suelto. Se pueden soltar sobre el mapa.'),
      el('li', {}, el('strong', {}, 'Figura georreferenciada. '), 'La exportación puede sumar el archivo para abrirla en QGIS en su lugar.')),
    el('p', { class: 'wn-safe' }, 'Tus proyectos anteriores están donde los dejaste y se abren igual que antes.'),
    versions);
  const d = el('details', { class: 'whatsnew', open: !seen }, el('summary', {}, 'Novedades de la versión 3.5'), body);
  d.addEventListener('toggle', () => { if (!d.open) { try { localStorage.setItem(NEWS_KEY, '1'); } catch (e) { /* sin almacenamiento local */ } } });
  return d;
}

// ---------- carpeta de proyectos ----------
function folderStrip(app, projects) {
  const f = folderStatus();
  const wrap = el('div', { class: `folder-strip${f.ready ? ' ready' : ''}` });
  if (!f.supported) {
    wrap.append(el('p', {}, el('strong', {}, 'Carpeta de proyectos: '), 'este navegador no deja elegir una carpeta. En Chrome o Edge, los proyectos se pueden guardar en una carpeta (por ejemplo de OneDrive) y verse en otras computadoras; acá, exportalos e importalos.'));
    return wrap;
  }
  const pick = async () => {
    try { await chooseFolder(); } catch (e) { if (e && e.name !== 'AbortError') app.toast(`No se pudo usar esa carpeta: ${e.message}`, 'error'); return; }
    const nm = await promptDialog({ title: 'Nombre de esta computadora', label: 'Con este nombre se reconoce quién guardó cada versión', value: deviceName(), ok: 'Listo' });
    if (nm) setDeviceName(nm);
    const mine = projects.filter((p) => !(p.sync && p.sync.localOnly));
    if (mine.length) {
      const all = await confirmDialog({
        title: 'Los proyectos de esta computadora',
        text: `¿Guardar también en la carpeta ${mine.length === 1 ? 'el proyecto que ya está' : `los ${mine.length} proyectos que ya están`} en esta computadora?`,
        note: 'Con «Solo los nuevos», los de ahora quedan acá y se pueden pasar uno por uno desde su menú ⋯. Los proyectos que ya estén en la carpeta aparecen igual.',
        ok: 'Guardar todos', cancel: 'Solo los nuevos',
      });
      if (!all) await markAllLocalOnly();
    }
    app._lastHomeSync = Date.now();
    const res = await syncAll();
    app.toast(`Carpeta «${folderStatus().name}» lista: ${res.written.length} proyecto(s) guardado(s)${res.imported.length ? `, ${res.imported.length} traído(s) de la carpeta` : ''}.`);
    renderHome(app, { sync: false });
  };
  if (!f.linked) {
    wrap.append(
      el('div', { class: 'fs-text' },
        el('strong', {}, 'Guardar los proyectos en una carpeta'),
        el('span', {}, 'Elegí una carpeta de esta computadora. Si está dentro de OneDrive, Google Drive o Dropbox para escritorio, se sincroniza sola: en otra computadora elegís la misma carpeta y aparecen los mismos proyectos.')),
      el('button', { type: 'button', class: 'btn primary', onclick: pick }, 'Elegir carpeta…'));
    return wrap;
  }
  if (!f.ready) {
    wrap.append(
      el('div', { class: 'fs-text' },
        el('strong', {}, `Carpeta «${f.name}»`),
        el('span', {}, 'El navegador pide permiso otra vez para usarla. Elegí «Permitir en cada visita» para que no vuelva a preguntar.')),
      el('button', { type: 'button', class: 'btn primary', onclick: async () => {
        const ok = await reconnectFolder();
        if (!ok) { app.toast('Sin permiso: los proyectos quedan solo en esta computadora.', 'warn'); return; }
        app._lastHomeSync = Date.now();
        const res = await syncAll();
        if (app.reportSync) app.reportSync(res);
        renderHome(app, { sync: false });
      } }, 'Conectar'));
    return wrap;
  }
  const when = f.lastSync ? new Date(f.lastSync).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'todavía no';
  wrap.append(
    el('div', { class: 'fs-text' },
      el('strong', {}, `Carpeta «${f.name}»`),
      el('span', {}, `Esta computadora: ${f.device} · `, el('button', { type: 'button', class: 'linkish', onclick: async () => {
        const nm = await promptDialog({ title: 'Nombre de esta computadora', label: 'Con este nombre se reconoce quién guardó cada versión', value: deviceName() });
        if (nm) { setDeviceName(nm); renderHome(app, { sync: false }); }
      } }, 'cambiar nombre'), ` · Sincronizada: ${f.busy ? 'ahora…' : when}`),
      f.error ? el('span', { class: 'fs-error' }, f.error) : null),
    el('div', { class: 'fs-actions' },
      el('button', { type: 'button', class: 'btn small', onclick: async () => { app._lastHomeSync = Date.now(); const res = await syncAll(); if (app.reportSync) app.reportSync(res); renderHome(app, { sync: false }); } }, 'Sincronizar ahora'),
      el('button', { type: 'button', class: 'btn small ghost', onclick: pick }, 'Cambiar carpeta'),
      el('button', { type: 'button', class: 'btn small ghost', onclick: async () => {
        const ok = await confirmDialog({ title: 'Dejar de usar la carpeta', text: `Los proyectos siguen en esta computadora y los archivos siguen en «${f.name}»; solo se deja de sincronizar.`, ok: 'Dejar de usarla' });
        if (!ok) return;
        await unlinkFolder(); renderHome(app, { sync: false });
      } }, 'Desvincular')));
  if (f.foreign.length) {
    wrap.append(el('div', { class: 'fs-foreign' },
      el('span', {}, 'En la carpeta hay archivos sueltos (proyectos exportados o copias que OneDrive hizo por un conflicto):'),
      el('ul', {}, f.foreign.slice(0, 8).map((name) => el('li', {}, el('code', {}, name), ' ',
        el('button', { type: 'button', class: 'btn small ghost', onclick: async () => {
          try { const p = await importForeign(name); app.toast(`Importado como «${p.meta.name}». El archivo suelto pasó a la papelera de la carpeta.`); renderHome(app, { sync: false }); } catch (e) { app.toast(`No se pudo importar ${name}: ${e.message}`, 'error'); }
        } }, 'Importar como proyecto'))))));
  }
  return wrap;
}

function syncState(p) {
  const f = folderStatus();
  if (!f.linked) return null;
  const s = p.sync || {};
  if (s.localOnly) return 'local';
  if (s.removed) return 'removed';
  if (s.folderId && s.folderId === f.folderId) return 'folder';
  return 'pending';
}
const SYNC_LABEL = { local: 'Solo en esta computadora', removed: 'Quitado de la carpeta en otra computadora', folder: 'En la carpeta', pending: 'Por guardar en la carpeta' };

function projectSheet(app, p) {
  const m = p.meta || {};
  const active = p.maps.find((x) => x.id === p.activeMapId) || p.maps[0] || {};
  const ss = syncState(p);
  const f = folderStatus();
  const folderItems = !ss ? [] : ss === 'local'
    ? [el('button', { type: 'button', role: 'menuitem', onclick: async (e) => { e.stopPropagation(); if (!f.ready) { app.toast('Primero conectá la carpeta.', 'warn'); return; } await setLocalOnly(p.id, false); app.toast('Guardado en la carpeta.'); renderHome(app, { sync: false }); } }, 'Guardar en la carpeta')]
    : ss === 'removed'
      ? [el('button', { type: 'button', role: 'menuitem', onclick: async (e) => { e.stopPropagation(); if (!f.ready) { app.toast('Primero conectá la carpeta.', 'warn'); return; } await restoreToFolder(p.id); app.toast('El proyecto volvió a la carpeta.'); renderHome(app, { sync: false }); } }, 'Volver a ponerlo en la carpeta')]
      : [el('button', { type: 'button', role: 'menuitem', onclick: async (e) => { e.stopPropagation(); await setLocalOnly(p.id, true); app.toast('Queda solo en esta computadora; el archivo de la carpeta no se toca.'); renderHome(app, { sync: false }); } }, 'Dejar solo en esta computadora')];
  const menu = el('div', { class: 'menu pc-menu', role: 'menu', hidden: true }, ...folderItems,
    el('button', { type: 'button', role: 'menuitem', onclick: async (e) => { e.stopPropagation(); const np = await duplicateProject(p.id); app.toast(`Copia creada: ${np.meta.name}`); renderHome(app); } }, 'Duplicar'),
    el('button', { type: 'button', role: 'menuitem', onclick: async (e) => {
      e.stopPropagation(); menu.hidden = true;
      app.toast('Preparando el archivo con todos los mapas y planos…');
      const obj = await exportProject(p.id);
      downloadBlob(new Blob([JSON.stringify(obj)], { type: 'application/json' }), `${slug(m.name)}.tesis.json`);
    } }, 'Exportar (.json)'),
    el('button', { type: 'button', role: 'menuitem', class: 'danger', onclick: (e) => { e.stopPropagation(); menu.hidden = true; confirmDelete(app, p); } }, 'Eliminar…'));
  const more = el('button', { type: 'button', class: 'pc-more', 'aria-label': `Más acciones para ${m.name}`, 'aria-haspopup': 'true', onclick: (e) => {
    e.stopPropagation();
    document.querySelectorAll('.pc-menu').forEach((x) => { if (x !== menu) x.hidden = true; });
    menu.hidden = !menu.hidden;
  } }, el('span', { 'aria-hidden': 'true' }, '⋯'));
  const open = () => { location.hash = `#/p/${p.id}`; };
  // la miniatura es la lámina; abajo, el rótulo como en un plano
  const sheet = el('article', { class: `project-sheet${p.maps.length > 1 ? ' multi' : ''}` },
    el('button', { type: 'button', class: 'ps-open', onclick: open, 'aria-label': `Abrir ${m.name || 'proyecto'}` },
      el('span', { class: 'ps-paper' }, active.thumb ? el('img', { src: active.thumb, alt: '' }) : el('span', { class: 'ps-nothumb' }, el('span', {}, 'Sin vista previa: se genera al abrir el mapa'))),
      el('span', { class: 'ps-name' }, m.name || 'Proyecto sin nombre'),
      m.title && m.title !== m.name ? el('span', { class: 'ps-title' }, m.title) : null),
    el('dl', { class: 'rotulo' },
      el('div', {}, el('dt', {}, 'Tipo'), el('dd', {}, kindName(m.kind) || '—')),
      el('div', {}, el('dt', {}, 'Mapas'), el('dd', {}, String(p.maps.length))),
      el('div', {}, el('dt', {}, 'Autoría'), el('dd', {}, m.author || '—')),
      el('div', {}, el('dt', {}, 'Cambios'), el('dd', {}, relTime(p.changed || p.updated)))),
    ss ? el('p', { class: `ps-sync ps-sync-${ss}`, title: ss === 'removed' ? 'Otra computadora lo eliminó: el archivo está en la papelera de la carpeta. Desde el menú ⋯ podés volver a ponerlo en la carpeta o eliminarlo también acá.' : '' }, SYNC_LABEL[ss]) : null,
    more, menu);
  return sheet;
}

async function confirmDelete(app, p) {
  const ok = await confirmDialog({
    title: 'Eliminar proyecto',
    text: `¿Eliminar «${p.meta.name || 'proyecto'}» y ${p.maps.length === 1 ? 'su mapa' : `sus ${p.maps.length} mapas`} de esta computadora?`,
    note: syncState(p) === 'folder' ? 'También sale de la carpeta: el archivo pasa a su subcarpeta «papelera» (de ahí se puede recuperar) y las otras computadoras lo ven como quitado.' : 'No se puede deshacer. Si lo vas a necesitar, exportalo antes.', ok: 'Eliminar', danger: true,
  });
  if (!ok) return;
  await deleteProject(p.id);
  app.toast('Proyecto eliminado.');
  renderHome(app);
}

// ---------- formularios ----------
const input = (obj, key, attrs = {}) => {
  const e = attrs.multiline ? el('textarea', { rows: attrs.rows || 3, placeholder: attrs.placeholder || '' }) : el('input', { type: 'text', placeholder: attrs.placeholder || '' });
  e.value = obj[key] || '';
  e.addEventListener('input', () => { obj[key] = e.value; e.classList.remove('invalid'); });
  return e;
};
const sel = (obj, key, options) => {
  const s = el('select', {});
  options.forEach(([v, l]) => s.append(el('option', { value: v, selected: String(obj[key]) === String(v) }, l)));
  s.addEventListener('change', () => { obj[key] = s.value; });
  return s;
};
const fld = (label, control, hint) => el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, label), control, hint ? el('span', { class: 'wf-h' }, hint) : null);

// Campos fundamentales del proyecto: se usan en el asistente y al editar el proyecto desde el mapa
export function metaFields(meta) {
  const name = input(meta, 'name', { placeholder: 'Ej.: Tesis doctoral, capítulo 2' });
  const grid = el('div', { class: 'wf-grid' },
    fld('Nombre del proyecto', name, 'Cómo lo vas a reconocer en la planoteca.'),
    fld('Tipo de trabajo', sel(meta, 'kind', WORK_KINDS)),
    el('div', { class: 'span2' }, fld('Título del trabajo', input(meta, 'title', { multiline: true, rows: 2, placeholder: 'Título de la tesis, del artículo o del informe' }))),
    fld('Autoría', input(meta, 'author', { placeholder: 'Ej.: Arq. Nombre Apellido' }), 'Firma las figuras en el epígrafe.'),
    fld('Institución o programa', input(meta, 'institution', { placeholder: 'Ej.: doctoranda en Geografía, USAL' }), 'Va detrás del nombre: con la tesis en curso, «doctorando/a en…»; «Doctorado en…» se lee como título obtenido.'),
    fld('Dirección', input(meta, 'director', { placeholder: 'Director/a, codirector/a' })),
    fld('Año', input(meta, 'year')),
    el('div', { class: 'span2' }, fld('Palabras clave', input(meta, 'keywords', { placeholder: 'separadas por punto y coma' }), 'Con el título, sirven para proponer estilo y capas.')),
    el('div', { class: 'span2' }, fld('Resumen u objetivo', input(meta, 'summary', { multiline: true, rows: 3, placeholder: 'Qué tienen que mostrar los mapas de este proyecto' }))),
    fld('Período estudiado', input(meta, 'period', { placeholder: 'Ej.: 1850–1930' })),
    fld('Licencia de las figuras', sel(meta, 'license', LICENSES)));
  return { grid, name };
}

// ---------- asistente ----------
const SUGGESTED = {
  base: ['ign-departamentos', 'ign-localidades', 'ign-rios', 'ign-rios-int', 'ign-ruta-nac', 'ign-ruta-prov'],
  extra: ['ign-espejos', 'ign-banados', 'ign-caminos', 'ign-ferrocarril', 'ign-planta-urbana', 'ign-curvas', 'dem-analitico', 'arba-parcela'],
};

export function renderWizard(app, preset = {}) {
  const root = prepareRoot();
  const meta = defaultMeta(preset.meta || {});
  const w = { step: 1, start: 'satellite', area: null, mapName: 'Figura 1. Localización', mediaId: meta.mediaId, themeId: '', projection: '', layers: new Set(SUGGESTED.base), context: true };
  const body = el('div', { class: 'wiz-body' });
  const steps = el('ol', { class: 'wiz-steps', 'aria-label': 'Pasos' });
  let olMap = null;
  const cleanup = () => { if (olMap) { olMap.setTarget(null); olMap = null; } };
  root.append(
    topBar('Nuevo proyecto', [el('button', { type: 'button', class: 'btn ghost', onclick: () => { cleanup(); location.hash = '#/'; } }, 'Cancelar')]),
    el('div', { class: 'wizard' }, steps, body));
  const paint = () => {
    clear(steps);
    ['El proyecto', 'El lugar', 'El primer mapa'].forEach((t, i) => steps.append(el('li', { class: w.step === i + 1 ? 'on' : w.step > i + 1 ? 'done' : '', 'aria-current': w.step === i + 1 ? 'step' : null }, el('span', { class: 'n' }, String(i + 1)), el('span', {}, t))));
    cleanup();
    clear(body);
    if (w.step === 1) body.append(stepProject());
    else if (w.step === 2) body.append(stepPlace());
    else body.append(stepMap());
    window.scrollTo(0, 0);
  };

  function stepProject() {
    const { grid, name } = metaFields(meta);
    const box = el('div', { class: 'wiz-step' },
      el('h1', {}, 'Los datos del proyecto'),
      el('p', { class: 'wiz-lead' }, 'Lo que cargues acá firma las figuras, alimenta los epígrafes y orienta la lectura del tema. Todo se puede cambiar después.'),
      grid,
      el('div', { class: 'wiz-nav' }, el('span'), el('button', { type: 'button', class: 'btn primary', onclick: () => {
        if (!meta.name.trim()) { name.focus(); name.classList.add('invalid'); app.toast('El proyecto necesita un nombre.', 'warn'); return; }
        w.step = 2; paint();
      } }, 'Seguir con el lugar')));
    setTimeout(() => name.focus(), 50);
    return box;
  }

  function stepPlace() {
    const mapDiv = el('div', { class: 'wiz-map' });
    const info = el('div', { class: 'wiz-area-info' });
    const search = el('input', { type: 'search', placeholder: 'Ciudad, municipio, provincia, país o coordenadas', 'aria-label': 'Buscar un lugar' });
    const results = el('ul', { class: 'place-results wiz-results', hidden: true });
    const hint = el('p', { class: 'wiz-map-hint', hidden: true });
    const tool = { mode: 'none' };
    const choice = el('div', { class: 'start-choice', role: 'radiogroup', 'aria-label': 'Desde dónde empezar' },
      ...[['satellite', 'Sobre imagen satelital', 'Ubicás el área sobre la imagen y la podés dejar como base del mapa.'],
        ['blank', 'Hoja en blanco', 'Sin imagen: el mapa arranca con las capas vectoriales oficiales sobre papel.']].map(([v, t, d]) => {
        const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(w.start === v), class: `choice choice-${v}${w.start === v ? ' on' : ''}`, onclick: () => {
          w.start = v;
          choice.querySelectorAll('.choice').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
          setBase();
        } }, el('strong', {}, t), el('span', {}, d));
        return b;
      }));
    const toolBtns = el('div', { class: 'wiz-tools', role: 'toolbar', 'aria-label': 'Definir el área' });
    const src = new VectorSource();
    const fmt = new GeoJSON();
    const areaLayerOl = new VectorLayer({ source: src, style: new Style({ stroke: new Stroke({ color: '#e8501c', width: 2.5 }), fill: new Fill({ color: 'rgba(232,80,28,0.10)' }), image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#e8501c' }), stroke: new Stroke({ color: '#fff', width: 2 }) }) }) });
    const base = new TileLayer();
    const labels = new TileLayer({ source: new XYZ({ url: IGN('mapabase_hibrido'), crossOrigin: 'anonymous' }) });
    olMap = new OlMap({ target: mapDiv, controls: [], layers: [base, labels, areaLayerOl], interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
      view: new View({ center: fromLonLat(w.area ? w.area.center : [-68, -14]), zoom: w.area ? 10 : 3.3, maxZoom: 19 }) });
    function setBase() {
      base.setSource(new XYZ({ url: w.start === 'satellite' ? ESRI_IMG : IGN('mapabase_gris'), crossOrigin: 'anonymous', maxZoom: 19 }));
      labels.setVisible(w.start === 'satellite');
      mapDiv.classList.toggle('on-paper', w.start !== 'satellite');
    }
    setBase();
    if (w.area && w.area.geom) {
      src.addFeature(fmt.readFeature({ type: 'Feature', geometry: w.area.geom, properties: {} }, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }));
      setTimeout(() => olMap && olMap.getView().fit(transformExtent(w.area.bbox, 'EPSG:4326', 'EPSG:3857'), { padding: [40, 40, 40, 40], maxZoom: 15 }), 0);
    }
    let draw = null;
    const setArea = (geom, name) => {
      const g = fmt.readGeometry(geom, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
      let ext = transformExtent(g.getExtent(), 'EPSG:3857', 'EPSG:4326');
      if (geom.type === 'Point') ext = [ext[0] - 0.05, ext[1] - 0.04, ext[2] + 0.05, ext[3] + 0.04];
      const center = geom.type === 'Point' ? geom.coordinates : [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
      w.area = { name: name || (w.area && w.area.name) || '', geom, bbox: ext, center };
      src.clear();
      src.addFeature(fmt.readFeature({ type: 'Feature', geometry: geom, properties: {} }, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }));
      olMap.getView().fit(transformExtent(ext, 'EPSG:4326', 'EPSG:3857'), { padding: [40, 40, 40, 40], maxZoom: 15, duration: 300 });
      paintInfo();
    };
    const HINTS = {
      partido: 'Tocá el mapa dentro del municipio, partido, departamento o cantón.',
      point: 'Tocá el mapa donde está el sitio.',
      box: 'Tocá una esquina, y después la opuesta.',
      polygon: 'Tocá para agregar vértices; doble toque para cerrar.',
    };
    const setTool = (mode) => {
      tool.mode = mode;
      if (draw) { olMap.removeInteraction(draw); draw = null; }
      toolBtns.querySelectorAll('button').forEach((b) => { b.classList.toggle('active', b.dataset.mode === mode); b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
      hint.hidden = !HINTS[mode];
      hint.textContent = HINTS[mode] || '';
      mapDiv.classList.toggle('picking', mode !== 'none');
      if (mode === 'point' || mode === 'box' || mode === 'polygon') {
        draw = new Draw({ source: new VectorSource(), type: mode === 'point' ? 'Point' : mode === 'box' ? 'Circle' : 'Polygon', geometryFunction: mode === 'box' ? createBox() : undefined });
        draw.on('drawend', (e) => { setArea(fmt.writeGeometryObject(e.feature.getGeometry(), { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857', decimals: 6 })); setTool('none'); });
        olMap.addInteraction(draw);
      }
    };
    [['partido', 'Elegir un municipio o partido'], ['point', 'Marcar un punto'], ['box', 'Dibujar un rectángulo'], ['polygon', 'Dibujar un polígono']].forEach(([m, t]) => {
      toolBtns.append(el('button', { type: 'button', class: 'btn small', dataset: { mode: m }, 'aria-pressed': 'false', onclick: () => setTool(tool.mode === m ? 'none' : m) }, t));
    });
    olMap.on('singleclick', async (e) => {
      if (tool.mode !== 'partido') return;
      const ll = toLonLat(e.coordinate);
      const c = countryAtLL(ll[0], ll[1]);
      const arg = c ? c.iso === 'ARG' : false;
      hint.textContent = arg ? 'Consultando al IGN…' : 'Consultando a OpenStreetMap…';
      try {
        if (arg) {
          const f = await partidoAt(ll[0], ll[1]);
          if (f) { setArea(f.geometry, f.properties.nam || f.properties.fna); setTool('none'); return; }
        }
        const a = await adminAt(ll[0], ll[1]);
        if (!a) { hint.textContent = 'No encontré una unidad administrativa en ese punto. Probá otro lugar o dibujá el área.'; return; }
        setArea(a.geometry, a.name);
        setTool('none');
      } catch (err) { hint.textContent = `El servidor no respondió (${err.message}). Dibujá el área o probá en un rato.`; }
    });
    const runSearch = async () => {
      const q = search.value.trim();
      if (q.length < 2) return;
      clear(results); results.hidden = false; results.append(el('li', { class: 'pr-wait' }, 'Buscando…'));
      const res = await searchPlaces(q);
      clear(results);
      if (!res.length) { results.append(el('li', { class: 'pr-wait' }, 'Sin resultados. Probá con el nombre del partido o con coordenadas.')); return; }
      for (const r of res) results.append(el('li', {}, el('button', { type: 'button', class: 'pr-go', onclick: () => {
        results.hidden = true;
        const d = ((r.km || 10) / 111) / 2;
        olMap.getView().fit(transformExtent(r.bbox || [r.lon - d, r.lat - d * 0.8, r.lon + d, r.lat + d * 0.8], 'EPSG:4326', 'EPSG:3857'), { duration: 350, maxZoom: 15 });
        if (!w.area) setArea({ type: 'Point', coordinates: [r.lon, r.lat] }, r.name);
        else { w.area.name = w.area.name || r.name; paintInfo(); }
      } }, el('strong', {}, r.name), el('span', {}, r.detail))));
    };
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } if (e.key === 'Escape') results.hidden = true; });
    function paintInfo() {
      clear(info);
      if (!w.area) {
        info.append(el('p', { class: 'note' }, 'Todavía no hay área. Buscá un lugar de cualquier país de América Latina, elegí un municipio o dibujala sobre el mapa.'), el('p', { class: 'note' }, 'También podés seguir sin área y ubicarla después en el mapa.'));
        return;
      }
      const pl = readPlace(w.area.center[0], w.area.center[1]);
      const nm = el('input', { type: 'text', value: w.area.name || '', placeholder: 'Ej.: Valle de Lerma, cuenca del río Luján, Oaxaca' });
      nm.addEventListener('input', () => { if (w.area) w.area.name = nm.value; });
      const [W, S, E, N] = w.area.bbox;
      const km = (E - W) * 111.32 * Math.cos((((S + N) / 2) * Math.PI) / 180);
      const facts = el('dl', { class: 'area-facts' },
        el('div', {}, el('dt', {}, 'Región'), el('dd', {}, pl.region ? pl.region.name : (pl.country && !/argentina/i.test(pl.country) ? pl.country : pl.macro || pl.country || '—'))),
        el('div', {}, el('dt', {}, 'Forma'), el('dd', {}, w.area.geom.type === 'Point' ? 'Punto' : `${fmtNum(km, km < 10 ? 1 : 0)} km de ancho`)),
        el('div', {}, el('dt', {}, 'Marco'), el('dd', {}, pl.faja && /argentina/i.test(pl.country || 'argentina') ? `POSGAR 2007, faja ${pl.faja}` : `WGS 84, UTM zona ${utmZone(w.area.center[0])}${w.area.center[1] >= 0 ? 'N' : 'S'}`)));
      info.append(...[
        fld('Nombre del área', nm, 'Aparece en el epígrafe y en el mapa de ubicación.'),
        facts,
        pl.region && pl.region.style ? el('p', { class: 'note' }, pl.region.style) : null,
        el('button', { type: 'button', class: 'btn small ghost', onclick: () => { w.area = null; src.clear(); paintInfo(); } }, 'Quitar el área')].filter(Boolean));
    }
    paintInfo();
    return el('div', { class: 'wiz-step wide' },
      el('h1', {}, 'El lugar de trabajo'),
      el('p', { class: 'wiz-lead' }, 'Elegí sobre qué empezar y delimitá el sitio o la región: el primer mapa se encuadra ahí.'),
      choice,
      el('div', { class: 'wiz-place' },
        el('div', { class: 'wiz-map-wrap' },
          el('div', { class: 'wiz-map-tools' },
            el('div', { class: 'wiz-search', role: 'search' }, search, el('button', { type: 'button', class: 'btn small', onclick: runSearch }, 'Buscar'), results),
            toolBtns),
          mapDiv, hint),
        el('aside', { class: 'wiz-area', 'aria-label': 'Área de trabajo' }, el('h2', {}, 'Área de trabajo'), info)),
      el('div', { class: 'wiz-nav' },
        el('button', { type: 'button', class: 'btn ghost', onclick: () => { w.step = 1; paint(); } }, 'Volver a los datos'),
        el('button', { type: 'button', class: 'btn primary', onclick: () => { w.step = 3; paint(); } }, 'Seguir con el primer mapa')));
  }

  function stepMap() {
    const traits = readTheme(`${meta.title} ${meta.keywords} ${meta.summary} ${meta.period}`);
    const place = w.area ? readPlace(w.area.center[0], w.area.center[1]) : null;
    const syn = synthesize({ traits, place, relief: null, scaleRF: null });
    if (!w.themeId) w.themeId = syn.themeId || 'paisaje-pampeano';
    const ctry = w.area ? countryAtLL(w.area.center[0], w.area.center[1]) : null;
    const inArg = w.area ? (ctry ? ctry.iso === 'ARG' : !!(place && place.faja)) : true;
    if (w._mode !== inArg) {
      // al cambiar de país se vuelven a proponer las capas: en la Argentina, las del IGN; en el resto, límites y OpenStreetMap del área
      w._mode = inArg;
      if (inArg) { w.layers = new Set(SUGGESTED.base); w.fetch = new Set(); w._layersInit = false; }
      else {
        w.layers = new Set(w.start === 'satellite' ? [] : ['dem-analitico']);
        const [W, S, E, N] = w.area.bbox;
        w.fetch = new Set(['gb:ADM1', ...((E - W) * (N - S) < 9 ? ['gb:ADM2', 'osm:rios', 'osm:vias', 'osm:localidades'] : [])]);
        w._layersInit = true;
      }
    }
    if (!w._layersInit) {
      (syn.layers || []).filter((id) => getDef(id) && !/^atlas-/.test(id)).forEach((id) => w.layers.add(id));
      if (w.start === 'satellite') w.layers.delete('dem-analitico');
      w._layersInit = true;
    }
    const autoProj = !w.area ? 'América Latina, equivalente' : (w.area.center[1] < -60 ? 'estereográfica polar' : inArg ? `POSGAR 2007 faja ${gkFaja(w.area.center[0])}` : `UTM zona ${utmZone(w.area.center[0])}${w.area.center[1] >= 0 ? 'N' : 'S'}`);
    const projOpts = [['', `Automática (${autoProj})`], ['auto-utm', 'UTM de la zona (WGS 84)'], ['MT:LAEA_LATAM', 'América Latina (equivalente)'], ['CONI:BICONT', 'Argentina bicontinental IGN'], ['EPSG:3857', 'Mercator web'], ['EPSG:4326', 'Geográficas']];
    const layerBox = el('div', { class: 'wiz-layers' });
    if (inArg) {
      for (const id of [...SUGGESTED.base, ...SUGGESTED.extra, ...[...w.layers].filter((x) => !SUGGESTED.base.includes(x) && !SUGGESTED.extra.includes(x))]) {
        const d = getDef(id);
        if (!d) continue;
        const cb = el('input', { type: 'checkbox', checked: w.layers.has(id) });
        cb.addEventListener('change', () => { if (cb.checked) w.layers.add(id); else w.layers.delete(id); });
        layerBox.append(el('label', { class: 'check' }, cb, el('span', {}, d.name)));
      }
    } else {
      const iso = ctry ? ctry.iso : '';
      const opts = [
        ...(iso ? [['gb:ADM1', `${ctry.nombre}: límites de primer orden (estados, provincias, departamentos)`], ['gb:ADM2', `${ctry.nombre}: límites de segundo orden (municipios, cantones, comunas)`]] : []),
        ...['rios', 'agua', 'vias', 'vias2', 'ferrocarril', 'localidades', 'protegidas'].map((id) => [`osm:${id}`, `${OSM_THEMES.find((t) => t.id === id).name} (OpenStreetMap, dentro del área)`]),
      ];
      for (const [id, label] of opts) {
        const cb = el('input', { type: 'checkbox', checked: w.fetch.has(id) });
        cb.addEventListener('change', () => { if (cb.checked) w.fetch.add(id); else w.fetch.delete(id); });
        layerBox.append(el('label', { class: 'check' }, cb, el('span', {}, label)));
      }
      const dem = el('input', { type: 'checkbox', checked: w.layers.has('dem-analitico') });
      dem.addEventListener('change', () => { if (dem.checked) w.layers.add('dem-analitico'); else w.layers.delete('dem-analitico'); });
      layerBox.append(el('label', { class: 'check' }, dem, el('span', {}, getDef('dem-analitico').name)));
    }
    const mediaSel = el('select', {});
    for (const g of [...new Set(MEDIA.map((x) => x.group))]) {
      const og = el('optgroup', { label: g });
      MEDIA.filter((x) => x.group === g).forEach((x) => og.append(el('option', { value: x.id, selected: x.id === w.mediaId }, x.name)));
      mediaSel.append(og);
    }
    const mediaNote = el('span', { class: 'wf-h' });
    const paintMedia = () => { const m = getMedia(w.mediaId); mediaNote.textContent = `${fmtNum(m.page.w, 0)} × ${fmtNum(m.page.h, 0)} mm${m.px ? `, ${m.px[0]} × ${m.px[1]} px` : `, ${m.dpi} ppp`}`; };
    mediaSel.addEventListener('change', () => { w.mediaId = mediaSel.value; paintMedia(); });
    paintMedia();
    const themeSel = el('select', {});
    THEMES.filter((t) => !t.hidden).forEach((t) => themeSel.append(el('option', { value: t.id, selected: t.id === w.themeId }, `${t.name}${t.id === syn.themeId ? ' (sugerido por el tema)' : ''}`)));
    themeSel.addEventListener('change', () => { w.themeId = themeSel.value; });
    const ctx = el('input', { type: 'checkbox', checked: w.context });
    ctx.addEventListener('change', () => { w.context = ctx.checked; });
    const create = el('button', { type: 'button', class: 'btn primary big' }, 'Crear el proyecto');
    create.addEventListener('click', async () => {
      create.disabled = true;
      create.textContent = 'Creando…';
      try {
        meta.area = w.area ? { name: w.area.name, geom: w.area.geom, bbox: w.area.bbox, center: w.area.center } : null;
        meta.mediaId = w.mediaId; meta.themeId = w.themeId;
        const state = buildFirstMap(meta, w.area, { start: w.start, mediaId: w.mediaId, themeId: w.themeId, projection: w.projection, layers: [...w.layers], context: w.context, mapName: w.mapName });
        // capas que se traen de la red para el área (límites y OpenStreetMap): si una falla, el proyecto se crea igual
        const failed = [];
        if (!inArg && w.fetch && w.fetch.size && w.area) {
          const bb = w.area.bbox, px = (bb[2] - bb[0]) * 0.25, py = (bb[3] - bb[1]) * 0.25;
          const box = [bb[0] - px, bb[1] - py, bb[2] + px, bb[3] + py];
          const gi = () => { const g = state.layers.findIndex((l) => l.def === 'graticule'); return g >= 0 ? g : state.layers.length; };
          const ai = () => { const a = state.layers.findIndex((l) => l.params && l.params.sem === 'study-area'); return a >= 0 ? a : gi(); };
          for (const id of w.fetch) {
            create.textContent = `Trayendo capas… (${[...w.fetch].indexOf(id) + 1} de ${w.fetch.size})`;
            try {
              if (id.startsWith('gb:') && ctry) {
                const r = await fetchBoundaries(ctry.iso, id.slice(3), id === 'gb:ADM2' ? box : null);
                if (r.kept) state.layers.splice(ai(), 0, boundariesLayer(ctry.iso, id.slice(3), r.geojson));
              } else if (id.startsWith('osm:')) {
                const r = await fetchOsm(id.slice(4), box);
                if (r.geojson.features.length) state.layers.splice(ai(), 0, osmLayer(r.theme, r.geojson, ''));
              }
            } catch (e) { failed.push(`${id.startsWith('gb:') ? 'límites' : OSM_THEMES.find((t) => t.id === id.slice(4)).name.toLowerCase()} (${e.message})`); }
          }
        }
        meta.crs = state.projection;
        const p = await createProject(meta, { name: w.mapName, state });
        cleanup();
        location.hash = `#/p/${p.id}`;
        app.toast(failed.length ? `Proyecto «${meta.name}» creado. No se pudieron traer: ${failed.join('; ')}. Se pueden sumar después desde Capas.` : `Proyecto «${meta.name}» creado y guardado en esta computadora.`, failed.length ? 'warn' : 'info');
      } catch (err) { console.error(err); app.toast(`No se pudo crear el proyecto: ${err.message}`, 'error'); create.disabled = false; create.textContent = 'Crear el proyecto'; }
    });
    const reading = traits.length
      ? `En el tema leo ${traits.slice(0, 3).map((t) => t.label.toLowerCase()).join(', ')}. De ahí salen el estilo y las capas que te propongo; cambialos si no corresponden.`
      : 'Elegí dónde se va a ver, el estilo y las capas de partida.';
    return el('div', { class: 'wiz-step' },
      el('h1', {}, 'El primer mapa'),
      el('p', { class: 'wiz-lead' }, reading),
      el('div', { class: 'wf-grid' },
        el('div', { class: 'span2' }, fld('Nombre del mapa', input(w, 'mapName'))),
        fld('Dónde se va a ver', mediaSel, null),
        fld('Estilo', themeSel),
        fld('Proyección', sel(w, 'projection', projOpts)),
        el('div', { class: 'wf-check' }, el('label', { class: 'check' }, ctx, el('span', {}, 'Incluir un mapa de ubicación en el país')))),
      mediaNote,
      el('h2', {}, 'Capas de partida'),
      el('p', { class: 'note' }, inArg ? (w.start === 'satellite' ? 'La imagen satelital queda abajo como base y se puede ocultar. Las capas del IGN son vectoriales: se cargan a escalas de detalle y se pueden restilizar.' : 'Sobre papel, con las capas vectoriales oficiales: se cargan a escalas de detalle y se pueden restilizar.') : 'Las capas marcadas se descargan ahora para el área y quedan guardadas dentro del mapa, como vectores que se pueden restilizar y exportar. Los geoservicios oficiales del país se suman después desde Capas › Servicios oficiales.'),
      layerBox,
      el('div', { class: 'wiz-nav' },
        el('button', { type: 'button', class: 'btn ghost', onclick: () => { w.step = 2; paint(); } }, 'Volver al lugar'),
        create));
  }
  paint();
}

// Partido o departamento del IGN que contiene un punto (WFS con filtro espacial)
async function partidoAt(lon, lat) {
  const ask = async (cql) => {
    const p = new URLSearchParams({ service: 'WFS', version: '1.1.0', request: 'GetFeature', typeName: 'ign:departamento', outputFormat: 'application/json', srsName: 'EPSG:4326', maxFeatures: '3', CQL_FILTER: cql });
    const r = await fetch(`https://wms.ign.gob.ar/geoserver/ows?${p}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const t = await r.text();
    if (!t.trim().startsWith('{')) return null;
    return JSON.parse(t);
  };
  // GeoServer interpreta el punto en el orden de ejes de la capa: se prueban ambos
  let j = await ask(`INTERSECTS(geom,POINT(${lat} ${lon}))`);
  if (!j || !j.features || !j.features.length) j = await ask(`INTERSECTS(geom,POINT(${lon} ${lat}))`);
  const f = j && j.features && j.features[0];
  if (!f) return null;
  // si la geometría vino en lat/lon, se da vuelta
  const first = JSON.stringify(f.geometry.coordinates).match(/-?\d+\.?\d*/g);
  if (first && Math.abs(Number(first[0])) < 60 && Math.abs(Number(first[1])) > 50) {
    const flip = (c) => (typeof c[0] === 'number' ? [c[1], c[0]] : c.map(flip));
    f.geometry.coordinates = flip(f.geometry.coordinates);
  }
  return f;
}
