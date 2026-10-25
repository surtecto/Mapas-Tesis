// Explorador de servicios oficiales: organismos destacados y catálogo IDERA; capas WFS y ArcGIS como vectores editables,
// WMS como imagen (con estilos del servidor). Las capas agregadas guardan su definición dentro del mapa.
import { el, clear, fmtInt } from '../util.js';
import {
  FEATURED, loadIdera, wfsCapabilities, wmsCapabilities, arcgisCapabilities, wfsLayerDef, wmsLayerDef, arcgisLayerDef,
  probeWfs, defaultStyleFor, bboxIntersects,
} from '../services.js';
import { newServiceLayerState } from '../state.js';
import { insertIndexFor } from './layersPanel.js';

const LABEL_FIELDS = ['nombre', 'NOMBRE', 'nam', 'fna', 'name', 'Name', 'NAME', 'nom', 'PARTIDO', 'partido', 'localidad', 'departamen', 'titulo', 'denominaci'];
const status = new Map(); // provider id -> 'ok' | 'nocors' | 'error'

function dialogEl() {
  let d = document.getElementById('services-dialog');
  if (!d) { d = el('dialog', { id: 'services-dialog', class: 'svc-dialog', 'aria-label': 'Servicios oficiales' }); document.body.append(d); }
  return d;
}

export function openServicesDialog(app, { providerId = null } = {}) {
  const d = dialogEl();
  clear(d);
  const ui = app.ui.svc || (app.ui.svc = { scope: 'featured', provider: providerId || 'ign', kind: 'wfs', q: '', pq: '', onlyView: false, level: '', jur: '', arcPath: [] });
  if (providerId) ui.provider = providerId;
  const view = app.viewBBoxLL();
  const provList = el('ul', { class: 'svc-prov-list', role: 'listbox', 'aria-label': 'Organismos' });
  const right = el('section', { class: 'svc-main', 'aria-live': 'polite' });
  let idera = null;

  const providers = () => (ui.scope === 'featured' ? FEATURED : (idera || []));
  const findProv = (id) => FEATURED.find((p) => p.id === id) || (idera || []).find((p) => p.id === id);

  // ----- lista de organismos -----
  const provSearch = el('input', { type: 'search', placeholder: 'Buscar organismo o tema', value: ui.pq, 'aria-label': 'Buscar organismo' });
  provSearch.addEventListener('input', () => { ui.pq = provSearch.value; paintProviders(); });
  const levelSel = el('select', { 'aria-label': 'Nivel', hidden: ui.scope !== 'idera' });
  const jurSel = el('select', { 'aria-label': 'Jurisdicción', hidden: ui.scope !== 'idera' });
  levelSel.addEventListener('change', () => { ui.level = levelSel.value; paintProviders(); });
  jurSel.addEventListener('change', () => { ui.jur = jurSel.value; paintProviders(); });
  const scopeBtns = el('div', { class: 'seg', role: 'tablist' },
    ...[['featured', 'Destacados'], ['idera', 'Catálogo IDERA']].map(([v, t]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(ui.scope === v), class: ui.scope === v ? 'on' : '', onclick: async () => {
      ui.scope = v;
      scopeBtns.querySelectorAll('button').forEach((b) => { const on = b.textContent === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      levelSel.hidden = jurSel.hidden = v !== 'idera';
      if (v === 'idera' && !idera) await loadIderaList();
      paintProviders();
    } }, t)));

  async function loadIderaList() {
    clear(provList);
    provList.append(el('li', { class: 'svc-wait' }, 'Leyendo el catálogo de IDERA…'));
    try {
      idera = await loadIdera();
      const levels = [...new Set(idera.map((p) => p.level))].filter(Boolean);
      const jurs = [...new Set(idera.map((p) => p.jur))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
      clear(levelSel); levelSel.append(el('option', { value: '' }, 'Todos los niveles'), ...levels.map((l) => el('option', { value: l, selected: ui.level === l }, l)));
      clear(jurSel); jurSel.append(el('option', { value: '' }, 'Todas las jurisdicciones'), ...jurs.map((l) => el('option', { value: l, selected: ui.jur === l }, l)));
    } catch (e) {
      clear(provList);
      provList.append(el('li', { class: 'svc-wait' }, `No se pudo leer el catálogo de IDERA (${e.message}). Los destacados siguen disponibles.`));
    }
  }

  function paintProviders() {
    clear(provList);
    const q = norm(ui.pq);
    const list = providers().filter((p) => (!q || norm(`${p.name} ${p.short} ${p.topics || ''} ${p.jur || ''}`).includes(q))
      && (ui.scope !== 'idera' || ((!ui.level || p.level === ui.level) && (!ui.jur || p.jur === ui.jur))));
    if (!list.length) { provList.append(el('li', { class: 'svc-wait' }, 'Ningún organismo coincide.')); return; }
    let lastLevel = '';
    for (const p of list) {
      if (ui.scope === 'featured' && p.level !== lastLevel) { lastLevel = p.level; provList.append(el('li', { class: 'svc-prov-group' }, p.level === 'Nacional' ? 'Nacionales' : p.jur ? `Provinciales` : p.level)); }
      const s = status.get(p.id) || (p.noCors ? 'nocors' : '');
      const kinds = [p.wfs ? 'WFS' : '', p.wms ? 'WMS' : '', p.arcgis ? 'ArcGIS' : ''].filter(Boolean).join(' ');
      provList.append(el('li', {}, el('button', { type: 'button', role: 'option', 'aria-selected': String(ui.provider === p.id), class: `svc-prov${ui.provider === p.id ? ' on' : ''}`, onclick: () => { ui.provider = p.id; ui.kind = p.wfs ? 'wfs' : p.arcgis ? 'arcgis' : 'wms'; ui.arcPath = []; paintProviders(); paintMain(); } },
        el('span', { class: `svc-dot ${s}`, title: s === 'ok' ? 'Se puede leer y exportar' : s === 'nocors' ? 'Solo para ver: el servidor no habilita CORS' : s === 'error' ? 'No respondió' : 'Sin consultar todavía' }),
        el('span', { class: 'svc-prov-text' }, el('strong', {}, p.short || p.name), el('small', {}, p.short && p.short !== p.name ? p.name : (p.jur || p.level || ''))),
        el('span', { class: 'svc-kinds' }, kinds))));
    }
  }

  // ----- panel derecho: capas del organismo -----
  const layerSearch = el('input', { type: 'search', placeholder: 'Buscar capa por nombre o descripción', value: ui.q, 'aria-label': 'Buscar capa' });
  const onlyView = el('input', { type: 'checkbox', checked: ui.onlyView });
  const allScope = el('input', { type: 'checkbox', checked: !!ui.all });
  let lastCaps = null;
  layerSearch.addEventListener('input', () => { ui.q = layerSearch.value; if (ui.all) searchAll(); else paintRows(); });
  onlyView.addEventListener('change', () => { ui.onlyView = onlyView.checked; if (ui.all) searchAll(); else paintRows(); });
  allScope.addEventListener('change', () => { ui.all = allScope.checked; if (ui.all) searchAll(); else paintMain(); });
  const rows = el('ul', { class: 'svc-rows' });
  const head = el('div', { class: 'svc-head' });
  const tabs = el('div', { class: 'seg svc-tabs', role: 'tablist' });
  right.append(head, tabs,
    el('div', { class: 'svc-tools' }, layerSearch,
      el('label', { class: 'check' }, onlyView, el('span', {}, 'Solo las que cubren la vista')),
      el('label', { class: 'check' }, allScope, el('span', {}, 'Buscar en todos los destacados'))),
    rows);

  function paintMain() {
    const p = findProv(ui.provider);
    clear(head); clear(tabs); clear(rows);
    if (!p) return;
    head.append(...[el('h3', {}, p.name), p.topics ? el('p', { class: 'svc-topics' }, p.topics) : null, p.note ? el('p', { class: 'warn-note' }, p.note) : null].filter(Boolean));
    const kinds = [['wfs', 'Vectorial (WFS)', 'Se restiliza, se filtra y se exporta como vector'], ['arcgis', 'ArcGIS', 'Capas vectoriales de un servidor ArcGIS'], ['wms', 'Imagen (WMS)', 'Se ve con el estilo del servidor']].filter(([k]) => p[k]);
    if (!kinds.some(([k]) => k === ui.kind)) ui.kind = kinds[0] ? kinds[0][0] : 'wms';
    for (const [k, t, hint] of kinds) {
      tabs.append(el('button', { type: 'button', role: 'tab', title: hint, 'aria-selected': String(ui.kind === k), class: ui.kind === k ? 'on' : '', onclick: () => { ui.kind = k; ui.arcPath = []; paintMain(); } }, t));
    }
    loadCaps(p);
  }

  async function loadCaps(p) {
    clear(rows);
    lastCaps = null;
    rows.append(el('li', { class: 'svc-wait' }, 'Leyendo las capas del servicio…'));
    try {
      if (ui.kind === 'wms' && p.staticWms) {
        lastCaps = { url: p.wms, kind: 'wms', layers: p.staticWms.map(([name, title]) => ({ name, title, abstract: '', bbox: null, styles: [], crs: ['EPSG:3857', 'EPSG:4326'] })), noCors: true };
      } else if (ui.kind === 'wfs') lastCaps = await wfsCapabilities(p.wfs);
      else if (ui.kind === 'wms') lastCaps = await wmsCapabilities(p.wms);
      else lastCaps = await arcgisCapabilities(ui.arcPath.length ? ui.arcPath[ui.arcPath.length - 1].url : p.arcgis);
      if (!p.noCors) status.set(p.id, 'ok');
    } catch (e) {
      status.set(p.id, /CORS/.test(e.message) ? 'nocors' : 'error');
      clear(rows);
      rows.append(el('li', { class: 'svc-wait' }, `No se pudieron leer las capas: ${e.message}.`,
        /CORS/.test(e.message) && p.wms ? el('p', { class: 'note' }, 'Si conocés el nombre de una capa WMS de este servidor, podés agregarla solo para ver:') : null,
        /CORS/.test(e.message) && p.wms ? manualWms(p) : null));
      paintProviders();
      return;
    }
    paintProviders();
    paintRows();
  }

  function manualWms(p) {
    const inp = el('input', { type: 'text', placeholder: 'espacio:capa' });
    return el('div', { class: 'btn-row' }, inp, el('button', { type: 'button', class: 'btn small', onclick: () => {
      if (!inp.value.trim()) return;
      addWms(p, { url: p.wms, kind: 'wms', layers: [] }, { name: inp.value.trim(), title: inp.value.trim(), styles: [], crs: ['EPSG:3857', 'EPSG:4326'] }, '', true);
    } }, 'Agregar para ver'));
  }

  function paintRows() {
    clear(rows);
    const p = findProv(ui.provider);
    const caps = lastCaps;
    if (!caps || !p) return;
    if (caps.kind === 'arcgis-folder') {
      if (ui.arcPath.length) rows.append(el('li', { class: 'svc-crumb' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => { ui.arcPath.pop(); loadCaps(p); } }, 'Subir un nivel'), el('span', {}, ui.arcPath.map((x) => x.name).join(' › '))));
      const q = norm(ui.q);
      for (const f of caps.folders.filter((x) => !q || norm(x.name).includes(q))) rows.append(el('li', { class: 'svc-row folder' }, el('div', { class: 'svc-row-text' }, el('strong', {}, f.name), el('small', {}, 'Carpeta')), el('button', { type: 'button', class: 'btn small', onclick: () => { ui.arcPath.push(f); loadCaps(p); } }, 'Abrir')));
      for (const s of caps.services.filter((x) => !q || norm(x.name).includes(q))) rows.append(el('li', { class: 'svc-row folder' }, el('div', { class: 'svc-row-text' }, el('strong', {}, s.name), el('small', {}, s.type)), el('button', { type: 'button', class: 'btn small', onclick: () => { ui.arcPath.push({ name: s.name, url: s.url }); loadCaps(p); } }, 'Ver capas')));
      if (!caps.folders.length && !caps.services.length) rows.append(el('li', { class: 'svc-wait' }, 'Sin servicios en esta carpeta.'));
      return;
    }
    if (caps.kind === 'arcgis-service' && ui.arcPath.length) rows.append(el('li', { class: 'svc-crumb' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => { ui.arcPath.pop(); loadCaps(p); } }, 'Subir un nivel'), el('span', {}, ui.arcPath.map((x) => x.name).join(' › '))));
    const list = filterLayers(caps.layers);
    rows.append(el('li', { class: 'svc-count' }, `${fmtInt(list.length)} de ${fmtInt(caps.layers.length)} capas`));
    for (const ly of list.slice(0, 300)) rows.append(layerRow(p, caps, ly));
    if (list.length > 300) rows.append(el('li', { class: 'svc-wait' }, 'Hay más capas: afiná la búsqueda.'));
  }

  function filterLayers(layers) {
    const q = norm(ui.q);
    return layers.filter((l) => (!q || norm(`${l.title} ${l.name} ${l.abstract || ''} ${l.group || ''}`).includes(q)) && (!ui.onlyView || !l.bbox || bboxIntersects(l.bbox, view)));
  }

  function layerRow(p, caps, ly, extraLabel) {
    const covers = ly.bbox ? bboxIntersects(ly.bbox, view) : null;
    const btn = el('button', { type: 'button', class: 'btn small primary' }, caps.kind === 'wms' ? 'Agregar imagen' : 'Agregar');
    let styleSel = null;
    if (caps.kind === 'wms' && ly.styles && ly.styles.length > 1) {
      styleSel = el('select', { 'aria-label': 'Estilo del servidor' }, ...ly.styles.map((s) => el('option', { value: s.name }, s.title)));
    }
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Agregando…';
      try {
        if (caps.kind === 'wfs') await addWfs(p, caps, ly);
        else if (caps.kind === 'wms') await addWms(p, caps, ly, styleSel ? styleSel.value : '', !!(caps.noCors || p.noCors));
        else await addArcgis(p, caps, ly);
        btn.textContent = 'Agregada'; btn.classList.remove('primary');
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Reintentar';
        app.toast(`No se pudo agregar «${ly.title}»: ${e.message}`, 'error');
      }
    });
    return el('li', { class: 'svc-row' },
      el('div', { class: 'svc-row-text' },
        el('strong', {}, ly.title),
        el('small', {}, [extraLabel, ly.group, ly.name !== ly.title ? ly.name : ''].filter(Boolean).join(' › ')),
        ly.abstract ? el('span', { class: 'svc-abs' }, ly.abstract) : null),
      covers === true ? el('span', { class: 'svc-cover' }, 'cubre la vista') : covers === false ? el('span', { class: 'svc-cover off' }, 'fuera de la vista') : el('span'),
      el('div', { class: 'svc-row-act' }, styleSel, btn));
  }

  // ----- búsqueda en todos los destacados -----
  let searchToken = 0;
  async function searchAll() {
    const token = ++searchToken;
    clear(head); clear(tabs); clear(rows);
    head.append(el('h3', {}, 'Buscar en todos los destacados'), el('p', { class: 'svc-topics' }, 'Lee las capas vectoriales (WFS) de cada organismo destacado y muestra las que coinciden.'));
    const q = norm(ui.q);
    if (q.length < 3) { rows.append(el('li', { class: 'svc-wait' }, 'Escribí al menos tres letras: por ejemplo «suelo», «radio», «cuenca» o «ferrocarril».')); return; }
    const prog = el('li', { class: 'svc-wait' }, 'Buscando…');
    rows.append(prog);
    const targets = FEATURED.filter((p) => p.wfs);
    let done = 0, found = 0;
    await Promise.all(targets.map(async (p) => {
      let caps;
      try { caps = await wfsCapabilities(p.wfs); status.set(p.id, 'ok'); } catch (e) { status.set(p.id, /CORS/.test(e.message) ? 'nocors' : 'error'); done++; return; }
      if (token !== searchToken) return;
      const list = filterLayers(caps.layers);
      done++;
      prog.textContent = `Leídos ${done} de ${targets.length} organismos: ${found + list.length} capas.`;
      if (!list.length) return;
      found += list.length;
      rows.append(el('li', { class: 'svc-prov-group' }, p.name));
      for (const ly of list.slice(0, 40)) rows.append(layerRow(p, caps, ly));
    }));
    if (token === searchToken) { prog.textContent = found ? `${found} capas en ${targets.length} organismos.` : 'Ninguna capa coincide.'; paintProviders(); }
  }

  // ----- agregar capas -----
  async function addWfs(p, caps, ft) {
    const def = wfsLayerDef(p, caps, ft);
    const pr = await probeWfs(def, view);
    def.geom = pr.geom || 'polygon';
    def.fields = pr.fields;
    def.swap = pr.swap;
    def.geomName = pr.geomName;
    def.hits = pr.hits;
    if (pr.hits != null && pr.hits <= 4000) def.whole = true;
    else if (pr.hits != null && pr.hits <= 30000) def.maxMpm = 6000;
    def.style = defaultStyleFor(def.geom);
    const lf = LABEL_FIELDS.find((f) => pr.fields.includes(f));
    if (lf) def.style.label = { ...def.style.label, field: lf, show: def.geom === 'point' && (pr.hits || 0) < 400 };
    pushLayer(def, pr.hits != null ? `${fmtInt(pr.hits)} objetos${def.whole ? ', cargados completos' : ', se cargan según la vista'}` : '');
  }
  async function addWms(p, caps, ly, style, noCors) {
    const def = wmsLayerDef(p, caps, ly, { style, noCors });
    pushLayer(def, noCors ? 'solo para ver (sin CORS)' : 'imagen del servidor');
  }
  async function addArcgis(p, caps, ly) {
    const def = await arcgisLayerDef(p, caps.url, ly);
    def.style = defaultStyleFor(def.geom || 'polygon');
    const lf = LABEL_FIELDS.find((f) => def.fields.includes(f));
    if (lf) def.style.label = { ...def.style.label, field: lf, show: false };
    pushLayer(def, def.paginate ? 'se carga según la vista' : `hasta ${fmtInt(def.maxRec)} objetos por vista`);
  }
  function pushLayer(def, detail) {
    const st = app.state;
    const ls = newServiceLayerState(def);
    st.layers.splice(insertIndexFor(st, def), 0, ls);
    app.commit('layers');
    app.ui.expanded.add(ls.uid);
    app.renderLeft();
    app.keepInside();
    app.toast(`Capa agregada: ${def.name}${detail ? ` (${detail})` : ''}.`);
  }

  d.append(
    el('header', { class: 'svc-top' },
      el('div', {}, el('h2', {}, 'Servicios oficiales'), el('p', {}, 'Capas de los organismos del Estado. Las vectoriales se pueden restilizar, filtrar y exportar; las imágenes WMS se ven con el estilo de su servidor.')),
      el('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cerrar')),
    el('div', { class: 'svc-body' },
      el('aside', { class: 'svc-side' }, scopeBtns, provSearch, el('div', { class: 'svc-sel' }, levelSel, jurSel), provList),
      right));
  d.showModal();
  if (ui.scope === 'idera') loadIderaList().then(paintProviders); else paintProviders();
  if (ui.all) searchAll(); else paintMain();
}

function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
