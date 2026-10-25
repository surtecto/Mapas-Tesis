// Mapas-Tesis: generador de mapas para tesis e investigación (deriva de Coni-Mapas)
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transformExtent } from 'ol/proj.js';
import { MapCtx } from './mapctx.js';
import { registerProjections, PROJECTIONS, projInfo, rotationForMeridian, lonLatTo, toLonLatFrom } from './projections.js';
import { drawOverlay, frameRect, hitTest, footprintAt, insetAt, scaleInfo, insetOutline, textPosition } from './overlay.js';
import { History, normalizeState, loadLocal, serializeState } from './state.js';
import { TEMPLATES } from './templates.js';
import {
  getProject, getMap, listMaps, saveMap, createMap, renameMap, duplicateMap, deleteMap, saveProjectMeta, touchProject,
  exportProject, importProject, migrateLegacy, defaultMeta,
} from './library.js';
import { buildFirstMap } from './starter.js';
import { renderHome, renderWizard, metaFields } from './ui/home.js';
import { confirmDialog, formDialog, promptDialog } from './ui/dialogs.js';
import { renderThesisPanel } from './ui/thesisPanel.js';
import { renderInterpPanel } from './ui/interpPanel.js';
import { setupSearch } from './ui/search.js';
import { simulationFilter } from './media.js';
import { getImage, exportImages, importImages } from './imagestore.js';
import { activeVersion, isLocked, addFeature, removeFeature, interpLayer, ensureInterpLayer, bumpInterp } from './interp.js';
import { getDef } from './catalog.js';
import { renderLayersPanel } from './ui/layersPanel.js';
import { renderSitesPanel } from './ui/sitesPanel.js';
import { renderFigurePanel } from './ui/figurePanel.js';
import { renderInspector } from './ui/inspector.js';
import { openExportDialog } from './ui/exportDialog.js';
import { renderRaster, renderSvg, canvasToPng, canvasToTiff, canvasToPdf, canvasToJpeg } from './exporter.js';
import { sourcesShort } from './caption.js';
import { siteSymbolCfg } from './layers.js';
import { el, clear, debounce, rafThrottle, uid, formatDMS, fmtInt, roundScale, downloadBlob, readFileAs, PT_MM, fmtNum } from './util.js';

class App {
  constructor() {
    this.ui = { expanded: new Set(), expandedSites: new Set(), tab: 'tesis', previewZoom: 1 };
    this.selection = null;
    this.mode = null;
    this.modeDraft = null;
    this.hits = [];
    this.insetViews = new Map();
    this.loading = 0;
    this.layerErrors = new Map();
    this.history = new History();
    this.redraw = rafThrottle(() => this.drawPreviewOverlay());
    this.scheduleHistory = debounce(() => this.history.push(serializeState(this.state)), 350);
    this.scheduleSave = debounce(() => this.saveCurrent(), 800);
    this.scheduleThumb = debounce(() => this.saveCurrent({ thumb: true }), 6000);
    this.current = null; // { projectId, mapId, project, maps }
    this.editorReady = false;
    this.tabId = uid('tab');
    this.updateStatusSoon = debounce(() => this.updateStatus(), 120);
    this.renderLeftSoon = debounce(() => this.renderLeft(), 300);
  }

  // ---------- arranque: biblioteca de proyectos y rutas ----------
  async boot() {
    registerProjections();
    this.$ = { toast: document.getElementById('toast') };
    window.mapasTesis = this;
    window.coniApp = this;
    try {
      const legacy = loadLocal();
      if (legacy) {
        const r = await migrateLegacy(legacy);
        if (r) setTimeout(() => this.toast(`El mapa que tenías abierto en la versión anterior quedó guardado como proyecto: «${r.project.meta.name}».`), 600);
      }
    } catch (e) { /* noop */ }
    this.setupChannel();
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('beforeunload', () => { if (this.current && this.state) this.saveCurrent({ sync: true }); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && this.current) this.saveCurrent({ thumb: true }); });
    await this.route();
  }

  async route() {
    const h = location.hash || '#/';
    const m = h.match(/^#\/p\/([^/]+)(?:\/([^/]+))?/);
    if (m) {
      if (this.current && this.current.projectId === m[1] && (!m[2] || this.current.mapId === m[2]) && !document.body.classList.contains('on-home')) return;
      await this.openProject(m[1], m[2]);
    } else if (/^#\/nuevo/.test(h)) {
      await this.leaveEditor();
      renderWizard(this);
    } else {
      await this.leaveEditor();
      renderHome(this);
    }
  }

  setHash(h) { if (location.hash !== h) history.replaceState(null, '', h); }
  goHome() { if (location.hash === '#/' || location.hash === '') this.route(); else location.hash = '#/'; }
  newProject() { location.hash = '#/nuevo'; }

  async leaveEditor() {
    if (this.current && this.state) { this.stopDraw && this.editorReady && this.stopDraw(true); await this.saveCurrent({ thumb: true }); }
    this.current = null;
    document.title = 'Mapas-Tesis';
  }

  showEditor() {
    document.body.classList.remove('on-home');
    const home = document.getElementById('home');
    home.hidden = true;
    clear(home);
    document.getElementById('app').hidden = false;
  }

  async openProject(projectId, mapId) {
    let p;
    try { p = await getProject(projectId); } catch (e) { p = null; }
    if (!p) { this.toast('Ese proyecto no está en esta computadora.', 'warn'); this.setHash('#/'); renderHome(this); return; }
    let maps = await listMaps(projectId);
    if (!maps.length) {
      const st = buildFirstMap(p.meta, p.meta.area, { start: 'blank', mediaId: p.meta.mediaId, themeId: p.meta.themeId, mapName: 'Mapa 1' });
      await createMap(projectId, 'Mapa 1', st);
      maps = await listMaps(projectId);
      p = await getProject(projectId);
    }
    const m = maps.find((x) => x.id === mapId) || maps.find((x) => x.id === p.activeMapId) || maps[0];
    if (this.current && this.current.mapId !== m.id) await this.saveCurrent({ thumb: true });
    let state;
    try { state = normalizeState(m.state); } catch (err) { console.error(err); this.toast(`El mapa «${m.name}» está dañado: ${err.message}`, 'error'); state = normalizeState(buildFirstMap(p.meta, p.meta.area, { start: 'blank' })); }
    state.title = m.name || state.title;
    this.fillFromMeta(state, p.meta);
    this.current = { projectId, mapId: m.id, project: p, maps: maps.map((x) => ({ id: x.id, name: x.name, updated: x.updated, thumb: x.thumb })) };
    this.showEditor();
    this.state = state;
    this.history = new History();
    if (!this.editorReady) this.initEditor();
    else this.applyState();
    this.history.push(serializeState(this.state));
    this.preloadImages();
    this.renderProjectBar();
    this.setHash(`#/p/${projectId}/${m.id}`);
    document.title = `${m.name} · ${p.meta.name} · Mapas-Tesis`;
    if (p.activeMapId !== m.id) touchProject(projectId, { activeMapId: m.id }).catch(() => {});
    this.announceOpen();
    if (!m.thumb) this.scheduleThumb();
  }

  // Los datos del proyecto completan lo que el mapa no tenga propio (tema, autoría)
  fillFromMeta(state, meta) {
    const th = state.thesis;
    if (!th.title && meta.title) th.title = meta.title;
    if (!th.keywords && meta.keywords) th.keywords = meta.keywords;
    if (!th.period && meta.period) th.period = meta.period;
    if (!th.place && meta.area && meta.area.name) th.place = meta.area.name;
    state.credits = { author: meta.author || '', year: meta.year || '', institution: meta.institution || '', license: meta.license || '' };
  }

  async saveCurrent({ thumb = false, sync = false } = {}) {
    const cur = this.current;
    if (!cur || !this.state) return;
    const json = serializeState(this.state);
    let thumbUrl = null;
    if (thumb && this.editorReady && !document.getElementById('app').hidden) thumbUrl = this.captureThumb();
    if (sync) { saveMap(cur.mapId, JSON.parse(json), { thumb: thumbUrl }); return; }
    try {
      const m = await saveMap(cur.mapId, JSON.parse(json), { thumb: thumbUrl });
      if (m && this.current && this.current.mapId === m.id) {
        const it = this.current.maps.find((x) => x.id === m.id);
        if (it) { it.updated = m.updated; if (thumbUrl) it.thumb = thumbUrl; }
        this.channel && this.channel.postMessage({ type: 'saved', mapId: m.id, tab: this.tabId });
        this.markSaved();
      }
    } catch (err) {
      console.error(err);
      this.toast(`No se pudo guardar en esta computadora: ${err.message}. Exportá el proyecto para no perder cambios.`, 'error');
    }
  }

  markSaved() {
    const s = document.getElementById('save-state');
    if (!s) return;
    s.textContent = 'Guardado';
    s.title = `Guardado en esta computadora a las ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    s.classList.remove('dirty');
  }

  // Miniatura: compone en pequeño los lienzos visibles (mapa, recuadros y la capa de composición)
  captureThumb(maxW = 420) {
    try {
      const paper = this.$.paper;
      const W = paper.clientWidth, H = paper.clientHeight;
      if (!W || !H) return null;
      const k = Math.min(1, maxW / W) * Math.min(2, window.devicePixelRatio || 1);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
      const x = c.getContext('2d');
      const paint = (withMaps) => {
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.globalAlpha = 1;
        x.fillStyle = this.state.page.background || '#ffffff';
        x.fillRect(0, 0, c.width, c.height);
        if (withMaps) {
          const containers = [this.$.mapMain, ...[...this.insetViews.values()].map((v) => v.el)];
          for (const box of containers) {
            if (!box) continue;
            const ox = box.offsetLeft, oy = box.offsetTop;
            box.querySelectorAll('.ol-layer canvas, canvas.ol-layer').forEach((cv) => {
              if (!cv.width) return;
              const op = cv.parentNode.style.opacity || cv.style.opacity;
              x.globalAlpha = op === '' ? 1 : Number(op);
              const tr = cv.style.transform;
              const mm = tr && tr.match(/^matrix\(([^(]*)\)$/);
              const mx = mm ? mm[1].split(',').map(Number) : [parseFloat(cv.style.width) / cv.width || 1, 0, 0, parseFloat(cv.style.height) / cv.height || 1, 0, 0];
              x.setTransform(k, 0, 0, k, ox * k, oy * k);
              x.transform(...mx);
              x.drawImage(cv, 0, 0);
            });
          }
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.globalAlpha = 1;
        }
        x.drawImage(this.$.overlay, 0, 0, c.width, c.height);
      };
      paint(true);
      try { return c.toDataURL('image/jpeg', 0.82); } catch (e) {
        // algún servicio sin CORS deja el lienzo «manchado»: la miniatura queda solo con la composición
        paint(false);
        return c.toDataURL('image/jpeg', 0.82);
      }
    } catch (e) { return null; }
  }

  // Aviso si el mismo mapa está abierto en otra pestaña (los cambios de una pisarían los de la otra)
  setupChannel() {
    if (!('BroadcastChannel' in window)) return;
    this.channel = new BroadcastChannel('mapas-tesis');
    this.channel.onmessage = (e) => {
      const d = e.data || {};
      if (d.tab === this.tabId || !this.current) return;
      if (d.type === 'open' && d.mapId === this.current.mapId) this.channel.postMessage({ type: 'here', mapId: d.mapId, tab: this.tabId });
      if ((d.type === 'here' || d.type === 'open' || d.type === 'saved') && d.mapId === this.current.mapId && !this._warnedTwin) {
        this._warnedTwin = true;
        this.toast('Este mapa también está abierto en otra pestaña: guardá y trabajá en una sola, porque los cambios de una pisan los de la otra.', 'warn');
        setTimeout(() => { this._warnedTwin = false; }, 60000);
      }
    };
  }
  announceOpen() { this._warnedTwin = false; this.channel && this.channel.postMessage({ type: 'open', mapId: this.current.mapId, tab: this.tabId }); }

  // ---------- barra del proyecto: volver al inicio, mapas del proyecto ----------
  renderProjectBar() {
    const cur = this.current;
    const bc = document.getElementById('project-crumb');
    if (!bc || !cur) return;
    clear(bc);
    const menu = el('div', { class: 'menu map-menu', role: 'menu', hidden: true });
    const btn = el('button', { type: 'button', class: 'crumb-map', 'aria-haspopup': 'true', 'aria-expanded': 'false', title: 'Mapas de este proyecto' },
      el('span', { class: 'crumb-count' }, `${cur.maps.findIndex((x) => x.id === cur.mapId) + 1}/${cur.maps.length}`), '▾');
    const fill = () => {
      clear(menu);
      menu.append(el('span', { class: 'menu-label' }, `Mapas de «${cur.project.meta.name}»`));
      for (const m of cur.maps) {
        menu.append(el('button', { type: 'button', role: 'menuitem', class: `map-item${m.id === cur.mapId ? ' on' : ''}`, onclick: () => { menu.hidden = true; if (m.id !== cur.mapId) location.hash = `#/p/${cur.projectId}/${m.id}`; } },
          m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('span', { class: 'mi-nothumb' }),
          el('span', { class: 'mi-name' }, m.name || 'Mapa')));
      }
      menu.append(el('hr'),
        el('button', { type: 'button', role: 'menuitem', onclick: () => { menu.hidden = true; this.newMapDialog(); } }, 'Nuevo mapa en este proyecto…'),
        el('button', { type: 'button', role: 'menuitem', onclick: async () => { menu.hidden = true; await this.saveCurrent(); const nm = await duplicateMap(cur.mapId, `${this.state.title} (copia)`); await this.reloadMaps(); location.hash = `#/p/${cur.projectId}/${nm.id}`; } }, 'Duplicar este mapa'),
        el('button', { type: 'button', role: 'menuitem', onclick: () => { menu.hidden = true; this.$.title.focus(); this.$.title.select(); } }, 'Renombrar este mapa'),
        el('button', { type: 'button', role: 'menuitem', class: 'danger', disabled: cur.maps.length < 2, onclick: () => { menu.hidden = true; this.deleteCurrentMap(); } }, cur.maps.length < 2 ? 'Eliminar este mapa (es el único)' : 'Eliminar este mapa…'));
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); fill(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
    this._mapMenu = { menu, btn };
    if (!this._mapMenuClose) {
      this._mapMenuClose = (e) => { const mm = this._mapMenu; if (mm && !mm.menu.contains(e.target) && !mm.btn.contains(e.target)) { mm.menu.hidden = true; mm.btn.setAttribute('aria-expanded', 'false'); } };
      document.addEventListener('click', this._mapMenuClose);
    }
    bc.append(
      el('button', { type: 'button', class: 'crumb-home', title: 'Volver a los proyectos de esta computadora', onclick: () => this.goHome() }, '← Proyectos'),
      el('button', { type: 'button', class: 'crumb-project', title: 'Datos del proyecto', onclick: () => this.editProjectMeta() }, cur.project.meta.name || 'Proyecto'),
      el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
      el('span', { class: 'crumb-wrap' }, btn, menu));
  }

  async reloadMaps() {
    const cur = this.current;
    if (!cur) return;
    const maps = await listMaps(cur.projectId);
    cur.maps = maps.map((x) => ({ id: x.id, name: x.name, updated: x.updated, thumb: x.thumb }));
    cur.project = await getProject(cur.projectId);
    this.renderProjectBar();
  }

  async newMapDialog() {
    const cur = this.current;
    const meta = cur.project.meta;
    const opt = { from: meta.area ? 'area' : 'view', name: `Figura ${cur.maps.length + 1}`, tpl: '' };
    const nameIn = el('input', { type: 'text', value: opt.name });
    nameIn.addEventListener('input', () => { opt.name = nameIn.value; });
    const radios = el('div', { class: 'radio-list' });
    const choices = [
      ['view', 'Misma vista, página y estilo que el mapa actual, sin capas temáticas', 'Para una serie de figuras comparables.'],
      ['area', meta.area ? `Desde el área del proyecto (${meta.area.name || 'área de estudio'})` : 'Desde el área del proyecto (todavía no tiene)', 'Arma un mapa de localización nuevo.'],
      ['copy', 'Copia completa del mapa actual', 'Para probar otra versión sin tocar la original.'],
      ['tpl', 'Desde un modelo de ejemplo', ''],
    ];
    const tplSel = el('select', { disabled: true }, ...TEMPLATES.map((t) => el('option', { value: t.id }, t.name)));
    tplSel.addEventListener('change', () => { opt.tpl = tplSel.value; });
    opt.tpl = TEMPLATES[0].id;
    for (const [v, t, h] of choices) {
      const r = el('input', { type: 'radio', name: 'newmap-from', value: v, checked: opt.from === v, disabled: v === 'area' && !meta.area });
      r.addEventListener('change', () => { opt.from = v; tplSel.disabled = v !== 'tpl'; });
      radios.append(el('label', { class: 'radio' }, r, el('span', {}, el('strong', {}, t), h ? el('small', {}, h) : null)));
    }
    radios.append(el('div', { class: 'radio-sub' }, tplSel));
    const ok = await formDialog({ title: 'Nuevo mapa en este proyecto', body: el('div', {}, el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, 'Nombre del mapa'), nameIn), radios), ok: 'Crear el mapa', validate: () => (opt.name.trim() ? true : 'El mapa necesita un nombre.') });
    if (!ok) return;
    await this.saveCurrent({ thumb: true });
    let state;
    if (opt.from === 'copy') state = JSON.parse(serializeState(this.state));
    else if (opt.from === 'area') state = buildFirstMap(meta, meta.area, { start: 'blank', mediaId: this.state.media.profileId, themeId: this.state.thesis.themeId || meta.themeId, mapName: opt.name, layers: ['ign-departamentos', 'ign-localidades', 'ign-rios', 'ign-ruta-nac', 'ign-ruta-prov'] });
    else if (opt.from === 'tpl') {
      const t = TEMPLATES.find((x) => x.id === opt.tpl);
      if (t.build.after) { try { await t.build.after(this); } catch (e) { /* noop */ } }
      state = t.build();
    } else {
      const s = JSON.parse(serializeState(this.state));
      s.layers = s.layers.filter((l) => l.def === 'graticule' || (getDef(l.def) && getDef(l.def).kind === 'raster') || l.def === 'ign-departamentos' || l.def === 'ign-localidades');
      s.sites = []; s.texts = []; s.insets = s.insets.filter((z) => z.mode === 'context');
      s.interp = normalizeState({}).interp;
      s.caption = { ...s.caption, figure: opt.name, lead: '' };
      state = s;
    }
    state.title = opt.name.trim();
    const m = await createMap(cur.projectId, state.title, state);
    await this.reloadMaps();
    location.hash = `#/p/${cur.projectId}/${m.id}`;
  }

  async deleteCurrentMap() {
    const cur = this.current;
    if (cur.maps.length < 2) return;
    const ok = await confirmDialog({ title: 'Eliminar mapa', text: `¿Eliminar el mapa «${this.state.title}» de este proyecto?`, note: 'No se puede deshacer. Los otros mapas del proyecto no se tocan.', ok: 'Eliminar', danger: true });
    if (!ok) return;
    const id = cur.mapId;
    this.current = null;
    await deleteMap(id);
    const maps = await listMaps(cur.projectId);
    location.hash = `#/p/${cur.projectId}/${maps[0].id}`;
    this.toast('Mapa eliminado.');
  }

  async editProjectMeta() {
    const cur = this.current;
    const before = { ...cur.project.meta };
    const meta = defaultMeta({ ...cur.project.meta });
    const { grid } = metaFields(meta);
    const ok = await formDialog({ title: 'Datos del proyecto', body: grid, ok: 'Guardar', wide: true, validate: () => (meta.name.trim() ? true : 'El proyecto necesita un nombre.') });
    if (!ok) return;
    const p = await saveProjectMeta(cur.projectId, meta);
    cur.project = p;
    // el mapa abierto toma los cambios en los campos que seguían los datos del proyecto
    const th = this.state.thesis;
    if (!th.title || th.title === before.title) th.title = meta.title;
    if (!th.keywords || th.keywords === before.keywords) th.keywords = meta.keywords;
    if (!th.period || th.period === before.period) th.period = meta.period;
    this.state.credits = { author: meta.author || '', year: meta.year || '', institution: meta.institution || '', license: meta.license || '' };
    this.commit('overlay');
    this.renderProjectBar();
    this.renderLeft();
    document.title = `${this.state.title} · ${meta.name} · Mapas-Tesis`;
    this.toast('Datos del proyecto guardados.');
  }

  async newMapFromTemplate(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t || !this.current) return;
    if (t.build.after) {
      try { await t.build.after(this); } catch (err) { this.toast(`No se pudo preparar el modelo: ${err.message}`, 'error'); }
    }
    await this.saveCurrent({ thumb: true });
    const state = t.build();
    const m = await createMap(this.current.projectId, t.name, state);
    await this.reloadMaps();
    location.hash = `#/p/${this.current.projectId}/${m.id}`;
    this.toast(`Nuevo mapa en el proyecto, desde el modelo «${t.name}». El mapa anterior quedó intacto.`);
  }

  initEditor() {
    this.editorReady = true;
    this.$ = {
      stage: document.getElementById('stage'), pasteboard: document.getElementById('pasteboard'), paper: document.getElementById('paper'),
      mapMain: document.getElementById('map-main'), overlay: document.getElementById('overlay'), left: document.getElementById('left-body'),
      inspector: document.getElementById('inspector-body'), status: document.getElementById('statusbar'), title: document.getElementById('title'),
      projection: document.getElementById('projection'), toast: document.getElementById('toast'),
    };
    this.computePxPerMm();
    const f0 = frameRect(this.state);
    Object.assign(this.$.mapMain.style, { left: `${f0.x * this.pxPerMm}px`, top: `${f0.y * this.pxPerMm}px`, width: `${f0.w * this.pxPerMm}px`, height: `${f0.h * this.pxPerMm}px` });
    this.mainCtx = new MapCtx({ app: this, target: this.$.mapMain, role: 'main', pxPerMm: this.pxPerMm });
    this.wireMainMap();
    this.buildInsets();
    this.setupChrome();
    this.setupPointer();
    this.setupKeyboard();
    this.layout();
    this.renderLeft();
    this.renderInspector();
    new ResizeObserver(debounce(() => this.layout(), 60)).observe(this.$.pasteboard);
    this.applyPreviewFilter();
  }

  // Imágenes de planos y del modelo de referencia (IndexedDB): se cargan en memoria y se redibujan las capas
  async preloadImages() {
    const keys = new Set(this.state.interp.sources.map((s) => s.key).filter(Boolean));
    if (this.state.modelRef && this.state.modelRef.key) keys.add(this.state.modelRef.key);
    let missing = 0;
    for (const k of keys) { try { if (!(await getImage(k))) missing++; } catch (e) { missing++; } }
    for (const l of this.state.layers) if (l.def === 'georef') l.rev += 1;
    this.commit('layers', { history: false });
    this.updateModelRef();
    if (missing) this.toast(`Faltan ${missing} imagen(es) de planos en este navegador: abrí el proyecto guardado (.json) que las incluye o volvé a cargarlas.`, 'warn');
  }

  // ---------- geometría de la vista previa ----------
  computePxPerMm() {
    const pb = this.$.pasteboard;
    const availW = Math.max(200, pb.clientWidth - 48), availH = Math.max(200, pb.clientHeight - 48);
    const p = this.state.page;
    const fit = Math.min(availW / p.widthMM, availH / p.heightMM);
    this.pxPerMm = Math.max(0.5, fit * (this.ui.previewZoom || 1));
    return this.pxPerMm;
  }

  layout() {
    const s = this.computePxPerMm();
    const p = this.state.page;
    const paper = this.$.paper;
    paper.style.width = `${p.widthMM * s}px`;
    paper.style.height = `${p.heightMM * s}px`;
    paper.style.background = p.background;
    const f = frameRect(this.state);
    Object.assign(this.$.mapMain.style, { left: `${f.x * s}px`, top: `${f.y * s}px`, width: `${f.w * s}px`, height: `${f.h * s}px` });
    this.mainCtx.setPxPerMm(s);
    this.mainCtx.map.updateSize();
    this.layoutInsets();
    const dpr = window.devicePixelRatio || 1;
    const c = this.$.overlay;
    c.width = Math.round(p.widthMM * s * dpr);
    c.height = Math.round(p.heightMM * s * dpr);
    c.style.width = `${p.widthMM * s}px`;
    c.style.height = `${p.heightMM * s}px`;
    this.redraw();
    this.updateStatusSoon();
    this.applyPreviewFilter();
  }

  layoutInsets() {
    const s = this.pxPerMm;
    for (const z of this.state.insets) {
      const v = this.insetViews.get(z.id);
      if (!v) continue;
      Object.assign(v.el.style, {
        left: `${z.x * s}px`, top: `${z.y * s}px`, width: `${z.w * s}px`, height: `${(z.shape === 'circle' ? z.w : z.h) * s}px`,
        borderRadius: z.shape === 'circle' ? '50%' : z.shape === 'rounded' ? `${Math.min(z.w, z.h) * 0.1 * s}px` : '0',
        background: z.bg,
      });
      v.ctx.setPxPerMm(s);
      v.ctx.map.updateSize();
    }
  }

  buildInsets() {
    const ids = new Set(this.state.insets.map((z) => z.id));
    for (const [id, v] of this.insetViews) {
      if (!ids.has(id)) { v.ctx.dispose(); v.el.remove(); this.insetViews.delete(id); }
    }
    for (const z of this.state.insets) {
      if (z.shape === 'circle') z.h = z.w;
      let v = this.insetViews.get(z.id);
      if (!v) {
        const elx = el('div', { class: 'inset', dataset: { id: z.id } });
        const target = el('div', { class: 'inset-map' });
        elx.appendChild(target);
        this.$.paper.insertBefore(elx, this.$.overlay);
        Object.assign(elx.style, { left: `${z.x * this.pxPerMm}px`, top: `${z.y * this.pxPerMm}px`, width: `${z.w * this.pxPerMm}px`, height: `${z.h * this.pxPerMm}px` });
        const ctx = new MapCtx({ app: this, target, role: 'inset', insetId: z.id, pxPerMm: this.pxPerMm });
        v = { el: elx, ctx };
        this.insetViews.set(z.id, v);
        ctx.map.on('moveend', () => {
          if (ctx._applying) return;
          const zz = this.state.insets.find((x) => x.id === z.id);
          if (!zz) return;
          const r = ctx.readView();
          zz.center = r.center; zz.mpm = r.mpm;
          this.redraw();
          this.scheduleHistory(); this.scheduleSave();
        });
        ctx.map.on('postrender', () => this.redraw());
      } else {
        v.ctx.applyView();
        v.ctx.sync();
      }
    }
    // orden de apilado según el estado
    this.state.insets.forEach((z, i) => { const v = this.insetViews.get(z.id); if (v) v.el.style.zIndex = String(10 + i); });
    this.layoutInsets();
  }

  wireMainMap() {
    const m = this.mainCtx.map;
    m.on('postrender', () => this.redraw());
    m.on('moveend', () => {
      if (this.mainCtx._applying) return;
      const r = this.mainCtx.readView();
      this.state.view.center = r.center;
      this.state.view.mpm = r.mpm;
      this.state.view.rotation = r.rotation;
      this.redraw();
      this.updateStatusSoon();
      this.scheduleHistory(); this.scheduleSave();
    });
  }

  previewGeo() {
    const s = this.pxPerMm;
    const f = frameRect(this.state);
    const mk = (ctx, ox, oy) => ({
      projection: ctx.projection,
      toPage: (c) => { const px = ctx.map.getPixelFromCoordinate(c); return px ? [ox + px[0] / s, oy + px[1] / s] : null; },
      fromPage: (pt) => ctx.map.getCoordinateFromPixel([(pt[0] - ox) * s, (pt[1] - oy) * s]),
    });
    const geo = { frame: f, main: mk(this.mainCtx, f.x, f.y), insets: {} };
    for (const z of this.state.insets) {
      const v = this.insetViews.get(z.id);
      if (v && v.ctx.map.getView() && v.ctx.map.getSize()) geo.insets[z.id] = mk(v.ctx, z.x, z.y);
    }
    return geo;
  }

  drawPreviewOverlay() {
    const c = this.$.overlay;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!this.mainCtx.map.getSize()) return;
    const dpr = window.devicePixelRatio || 1;
    const hits = [];
    try {
      drawOverlay(ctx, this.pxPerMm * dpr, this.previewGeo(), this.state, { preview: true, selection: this.selection, hits });
    } catch (err) {
      console.error('overlay', err);
    }
    this.hits = hits;
  }

  // ---------- cambios de estado ----------
  commit(kind = 'overlay', { history = true } = {}) {
    switch (kind) {
      case 'layers':
        this.mainCtx.sync();
        for (const v of this.insetViews.values()) v.ctx.sync();
        break;
      case 'sites':
        this.mainCtx.syncSites(); this.mainCtx.sync();
        for (const v of this.insetViews.values()) { v.ctx.syncSites(); v.ctx.sync(); }
        break;
      case 'view':
        this.mainCtx.applyView();
        for (const v of this.insetViews.values()) v.ctx.applyView();
        this.mainCtx.sync();
        for (const v of this.insetViews.values()) v.ctx.sync();
        break;
      case 'insets':
        this.buildInsets();
        break;
      case 'page':
        this.layout();
        break;
      case 'projection':
        this.mainCtx.applyView();
        this.mainCtx.sync();
        for (const v of this.insetViews.values()) { v.ctx.applyView(); v.ctx.sync(); }
        break;
      default:
        break;
    }
    this.redraw();
    this.updateStatusSoon();
    if (history) {
      this.scheduleHistory(); this.scheduleSave(); this.scheduleThumb();
      const ss = document.getElementById('save-state');
      if (ss) { ss.textContent = 'Guardando…'; ss.classList.add('dirty'); }
    }
  }

  refreshAll() {
    this.layout();
    this.commit('layers');
    this.buildInsets();
    this.renderLeft();
    this.renderInspector();
    this.applyPreviewFilter();
  }

  applyState() {
    this.stopDraw && this.stopDraw(true);
    for (const v of this.insetViews.values()) { v.ctx.dispose(); v.el.remove(); }
    this.insetViews.clear();
    this.selection = null;
    this.mainCtx.applyView();
    this.mainCtx.rebuildAll();
    this.mainCtx.sync();
    this.buildInsets();
    this.layout();
    this.$.title.value = this.state.title;
    this.$.projection.value = this.state.projection;
    this.renderLeft();
    this.renderInspector();
    this.applyPreviewFilter();
    this.updateModelRef();
    this.redraw();
  }

  // Un modelo nunca pisa el mapa abierto: se agrega como mapa nuevo del proyecto
  loadTemplate(id) { return this.newMapFromTemplate(id); }

  // Corre leyenda, norte y escala hacia adentro del marco si quedaron afuera (y reparte la leyenda en columnas si es muy alta)
  keepInside(depth = 0) {
    if (depth > 4) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const st = this.state;
      const f = frameRect(st);
      let changed = false;
      for (const h of this.hits) {
        if (!['legend', 'north', 'scale'].includes(h.kind) || !h.poly) continue;
        const xs = h.poly.map((p) => p[0]), ys = h.poly.map((p) => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const o = h.kind === 'legend' ? st.legend : h.kind === 'north' ? st.north : st.scalebar;
        if (h.kind === 'legend' && y1 - y0 > f.h * 0.92 && (st.legend.columns || 1) < 3) { st.legend.columns = (st.legend.columns || 1) + 1; changed = true; continue; }
        let dx = 0, dy = 0;
        if (x1 > f.x + f.w - 1) dx = f.x + f.w - 1 - x1;
        if (x0 + dx < f.x + 1) dx = f.x + 1 - x0;
        if (y1 > f.y + f.h - 1) dy = f.y + f.h - 1 - y1;
        if (y0 + dy < f.y + 1) dy = f.y + 1 - y0;
        if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) { o.x = Math.round((o.x + dx) * 10) / 10; o.y = Math.round((o.y + dy) * 10) / 10; changed = true; }
      }
      if (changed) { this.commit('overlay'); this.keepInside(depth + 1); }
    }));
  }

  // ---------- utilidades para los paneles ----------
  frameSize() { return frameRect(this.state); }
  viewBBoxLL() {
    const m = this.mainCtx.map;
    const ext = m.getView().calculateExtent(m.getSize());
    const ll = transformExtent(ext, this.mainCtx.projection, 'EPSG:4326', 16);
    return [Math.max(-180, ll[0]), Math.max(-85, ll[1]), Math.min(180, ll[2]), Math.min(85, ll[3])];
  }
  setProjection(code) {
    this.state.projection = code;
    if (code === 'EPSG:3031' || code === 'EPSG:6932') this.state.view.rotation = rotationForMeridian(code, this.state.view.center[0], this.state.view.center[1]);
    else this.state.view.rotation = 0;
    this.mainCtx.projection = '';
    this.$.projection.value = code;
    this.commit('projection');
    this.toast(projInfo(code).detail);
  }
  addSiteAt(name, lon, lat) {
    const s = { id: uid('S'), name: name || `Sitio ${this.state.sites.length + 1}`, lon, lat, cats: [], label: { show: true }, note: '' };
    this.state.sites.push(s);
    this.commit('sites');
    this.renderLeft();
    this.toast(`Sitio agregado: ${s.name}`);
  }
  applyPreviewFilter() {
    if (!this.$ || !this.$.paper) return;
    const f = simulationFilter(this.state, this.pxPerMm || 1);
    this.$.paper.style.filter = f || '';
  }
  async updateModelRef() {
    const mr = this.state.modelRef || {};
    let img = this.$.paper.querySelector('.model-ref-img');
    if (!mr.key || !mr.show) { if (img) img.remove(); return; }
    const v = await getImage(mr.key);
    if (!v) return;
    if (!img) { img = el('img', { class: 'model-ref-img', alt: '' }); this.$.paper.insertBefore(img, this.$.overlay); }
    if (img.getAttribute('src') !== v.url) img.src = v.url;
    img.style.opacity = String(mr.opacity == null ? 0.45 : mr.opacity);
  }

  // ---------- dibujo de interpretación ----------
  startDraw() {
    this.stopDraw(true);
    if (isLocked(this.state)) { this.toast('La versión activa está fijada: duplicala para dibujar.', 'warn'); return; }
    const it = this.state.interp;
    const cat = it.categories.find((c) => c.id === it.drawCat) || it.categories[0];
    ensureInterpLayer(this);
    this.commit('layers', { history: false });
    const type = cat.geom === 'point' ? 'Point' : cat.geom === 'line' ? 'LineString' : 'Polygon';
    const tmp = new VectorSource();
    const draw = new Draw({ source: tmp, type, stopClick: true });
    const fmt = new GeoJSON();
    draw.on('drawend', (e) => {
      const g = fmt.writeGeometryObject(e.feature.getGeometry(), { dataProjection: 'EPSG:4326', featureProjection: this.mainCtx.projection, decimals: 7 });
      const f = addFeature(this.state, g, { cat: cat.id, cert: it.drawCert });
      setTimeout(() => { tmp.clear(); bumpInterp(this); this.select({ kind: 'interp', id: f.id }); if (this.ui.tab === 'interp') this.renderLeft(); }, 0);
    });
    this.mainCtx.map.addInteraction(draw);
    this._draw = draw;
    this.mode = 'draw';
    this.$.paper.classList.add('mode-draw');
    this.toast(cat.geom === 'point' ? `Dibujando «${cat.name}»: tocá el mapa. Esc termina.` : `Dibujando «${cat.name}»: tocá para agregar vértices y doble toque para cerrar. Esc termina.`);
  }
  startModify() {
    this.stopDraw(true);
    if (isLocked(this.state)) { this.toast('La versión activa está fijada.', 'warn'); return; }
    const ls = interpLayer(this.state, false);
    const layer = ls && this.mainCtx.olLayers.get(ls.uid);
    if (!layer || !layer._interpSource) { this.toast('No hay trazos para editar en esta versión.'); return; }
    const mod = new Modify({ source: layer._interpSource });
    const fmt = new GeoJSON();
    mod.on('modifyend', (e) => {
      const v = activeVersion(this.state);
      e.features.forEach((f) => {
        const rec = v.features.features.find((x) => x.id === f.getId());
        if (rec) rec.geometry = fmt.writeGeometryObject(f.getGeometry(), { dataProjection: 'EPSG:4326', featureProjection: this.mainCtx.projection, decimals: 7 });
      });
      this.redraw(); this.scheduleHistory(); this.scheduleSave();
    });
    this.mainCtx.map.addInteraction(mod);
    this._draw = mod;
    this.mode = 'modify';
    this.$.paper.classList.add('mode-draw');
    this.toast('Arrastrá los vértices de los trazos. Esc termina.');
  }
  stopDraw(silent) {
    if (this._draw) { this.mainCtx.map.removeInteraction(this._draw); this._draw = null; }
    const was = this.mode === 'draw' || this.mode === 'modify';
    if (was) { this.mode = null; this.$.paper.classList.remove('mode-draw'); }
    if (was && !silent && this.ui.tab === 'interp') this.renderLeft();
    if (was && this.mode === null) bumpInterp(this);
  }
  interpFeatureAt(e) {
    const ls = interpLayer(this.state, false);
    const layer = ls && this.mainCtx.olLayers.get(ls.uid);
    if (!layer) return null;
    const px = this.mainCtx.map.getEventPixel(e);
    let id = null;
    this.mainCtx.map.forEachFeatureAtPixel(px, (f) => { id = f.getId(); return true; }, { layerFilter: (l) => l === layer, hitTolerance: 5 });
    return id;
  }

  // Prueba de exportación en memoria (no descarga nada): devuelve tamaño, peso y teselas fallidas
  async checkExport(fmt = 'png', dpi = 150) {
    const t0 = performance.now();
    if (fmt === 'svg') {
      const r = await renderSvg(this, dpi);
      return { fmt, dpi, bytes: r.svg.length, tileErrors: r.tileErrors, ms: Math.round(performance.now() - t0) };
    }
    const r = await renderRaster(this, dpi);
    const enc = { png: () => canvasToPng(r.canvas, dpi), tiff: () => canvasToTiff(r.canvas, dpi), pdf: () => canvasToPdf(r.canvas, this.state), jpeg: () => canvasToJpeg(r.canvas, dpi) }[fmt];
    const blob = await enc();
    const th = document.createElement('canvas');
    const k = 520 / r.W;
    th.width = Math.round(r.W * k); th.height = Math.round(r.H * k);
    th.getContext('2d').drawImage(r.canvas, 0, 0, th.width, th.height);
    this.lastCheck = th.toDataURL('image/jpeg', 0.85);
    return { fmt, dpi, W: r.W, H: r.H, bytes: blob.size, tileErrors: r.tileErrors, ms: Math.round(performance.now() - t0) };
  }

  undo() { const j = this.history.undo(); if (j) { this.state = normalizeState(JSON.parse(j)); this.applyState(); this.scheduleSave(); } }
  redo() { const j = this.history.redo(); if (j) { this.state = normalizeState(JSON.parse(j)); this.applyState(); this.scheduleSave(); } }

  applyOpacity(ls) {
    for (const ctx of [this.mainCtx, ...[...this.insetViews.values()].map((v) => v.ctx)]) {
      const l = ctx.olLayers.get(ls.uid);
      if (l) l.setOpacity(ls.opacity);
    }
  }

  styleChanged(ls) {
    ls._styleVersion = (ls._styleVersion || 0) + 1;
    this.commit('layers');
  }

  select(sel) {
    this.selection = sel;
    this.renderInspector();
    this.redraw();
    document.body.classList.toggle('has-selection', !!sel);
  }

  setMode(mode, draft) {
    this.mode = mode;
    this.modeDraft = draft || null;
    this.$.paper.classList.toggle('mode-add', mode === 'add-site');
    if (mode === 'add-site') this.toast('Tocá el mapa o un zoom para ubicar el sitio. Esc cancela.');
  }

  flyTo(center, mpm, rotation) {
    this.state.view.center = center;
    this.state.view.mpm = mpm;
    if (rotation !== undefined) this.state.view.rotation = rotation;
    else if (projInfo(this.state.projection).polar && this.state.projection !== 'CONI:BICONT') this.state.view.rotation = rotationForMeridian(this.mainCtx.projection, center[0], center[1]);
    this.commit('view');
    this.renderLeftSoon();
  }

  pageToLonLat(pt) {
    const geo = this.previewGeo();
    const c = geo.main.fromPage(pt);
    return c ? toLonLatFrom(this.mainCtx.projection, c) : null;
  }
  lonLatToPage(ll) {
    if (!ll || !Number.isFinite(ll[0])) return null;
    return this.previewGeo().main.toPage(lonLatTo(this.mainCtx.projection, ll));
  }

  currentScaleInfo() {
    try { return scaleInfo(this.previewGeo(), this.state); } catch (e) { return null; }
  }
  sourcesShort() { return sourcesShort(this.state); }

  // ---------- avisos ----------
  onLayerError(ls, err) {
    const msg = err && err.message ? err.message : String(err);
    this.layerErrors.set(ls.uid, msg);
    // los errores de varias capas se agrupan en un solo aviso
    this._errBatch = this._errBatch || new Map();
    this._errBatch.set(ls.uid, { name: ls.name, msg });
    clearTimeout(this._errTimer);
    this._errTimer = setTimeout(() => {
      const items = [...this._errBatch.values()];
      this._errBatch.clear();
      if (!items.length || Date.now() - (this._lastErrToast || 0) < 15000) return;
      this._lastErrToast = Date.now();
      const names = items.map((x) => `«${x.name}»`);
      const text = items.length === 1 ? `No se pudo cargar ${names[0]}: ${items[0].msg}.` : `No se pudieron cargar ${items.length} capas (${names.slice(0, 4).join(', ')}${items.length > 4 ? '…' : ''}): ${items[0].msg}.`;
      this.toast(`${text} Revisá la conexión o probá más tarde.`, 'error');
    }, 1200);
    this.renderLeftSoon();
  }
  onTileError() { this._tileErrors = (this._tileErrors || 0) + 1; this.updateStatusSoon(); }
  onTileLoad(d) { this.loading = Math.max(0, this.loading + d); this.updateStatusSoon(); }
  layerStatus(uid) {
    if (this.layerErrors.has(uid)) return { kind: 'error', text: this.layerErrors.get(uid) };
    const l = this.mainCtx && this.mainCtx.olLayers.get(uid);
    if (l && l._viewSource && l._viewSource._tooFar) return { kind: 'far', text: 'Esta capa se carga al acercar el mapa (o activá «Cargar también a escala menor»).' };
    return null;
  }

  toast(msg, kind = 'info') {
    const t = this.$.toast;
    const item = el('div', { class: `toast-item ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
    t.appendChild(item);
    setTimeout(() => { item.classList.add('out'); setTimeout(() => item.remove(), 400); }, kind === 'error' ? 7000 : 4200);
  }

  // ---------- paneles ----------
  showTab(name) {
    if (this.ui.tab === 'interp' && name !== 'interp' && (this.mode === 'draw' || this.mode === 'modify')) this.stopDraw(true);
    this.ui.tab = name;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    this.renderLeft();
  }
  renderLeft() {
    const root = this.$.left;
    const scroll = root.scrollTop;
    if (this.ui.tab === 'tesis') renderThesisPanel(this, root);
    else if (this.ui.tab === 'capas') renderLayersPanel(this, root);
    else if (this.ui.tab === 'sitios') renderSitesPanel(this, root);
    else if (this.ui.tab === 'interp') renderInterpPanel(this, root);
    else renderFigurePanel(this, root);
    root.scrollTop = scroll;
  }
  renderInspector() {
    renderInspector(this, this.$.inspector);
    document.getElementById('inspector').classList.toggle('active', !!this.selection);
  }

  updateStatus() {
    const st = this.$.status;
    const info = this.currentScaleInfo();
    const scaleTxt = info && Number.isFinite(info.rf) ? `1:${fmtInt(roundScale(info.rf))}` : '—';
    st.querySelector('[data-k="scale"]').textContent = scaleTxt;
    st.querySelector('[data-k="scale"]').title = info && info.variation > 0.08 ? `La escala varía ${Math.round(info.variation * 100)}% dentro del mapa` : 'Escala en el centro del mapa, al tamaño de impresión';
    st.querySelector('[data-k="proj"]').textContent = projInfo(this.state.projection).name;
    st.querySelector('[data-k="load"]').textContent = this.loading > 0 ? `Cargando ${this.loading} teselas…` : '';
    st.querySelector('[data-k="size"]').textContent = `${fmtNum(this.state.page.widthMM, 1)} × ${fmtNum(this.state.page.heightMM, 1)} mm`;
  }

  // ---------- controles generales ----------
  setupChrome() {
    const projSel = this.$.projection;
    const order = ['Argentina (POSGAR 2007)', 'Antártida y bicontinental', 'UTM', 'Históricas', 'Mundiales'];
    for (const g of order) {
      const og = el('optgroup', { label: g });
      for (const p of PROJECTIONS.filter((x) => x.group === g && x.list !== false)) og.append(el('option', { value: p.code }, p.name));
      projSel.append(og);
    }
    projSel.value = this.state.projection;
    projSel.addEventListener('change', () => { this.setProjection(projSel.value); this.renderLeft(); });
    setupSearch(this);
    this.$.title.value = this.state.title;
    this.$.title.addEventListener('change', async () => {
      const v = this.$.title.value.trim() || 'Mapa sin nombre';
      this.$.title.value = v;
      this.state.title = v;
      this.commit('overlay');
      if (this.current) {
        await renameMap(this.current.mapId, v);
        const it = this.current.maps.find((x) => x.id === this.current.mapId);
        if (it) it.name = v;
        document.title = `${v} · ${this.current.project.meta.name} · Mapas-Tesis`;
      }
    });
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-export').addEventListener('click', () => openExportDialog(this));
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => this.showTab(b.dataset.tab)));
    document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
      const z = b.dataset.zoom;
      this.ui.previewZoom = z === 'fit' ? 1 : Math.max(0.5, Math.min(4, this.ui.previewZoom * (z === 'in' ? 1.25 : 0.8)));
      this.layout();
    }));
    // Menú de proyecto
    const menuBtn = document.getElementById('btn-project');
    const menu = document.getElementById('project-menu');
    menuBtn.addEventListener('click', () => { const open = menu.hasAttribute('hidden'); menu.toggleAttribute('hidden', !open); menuBtn.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== menuBtn) { menu.setAttribute('hidden', ''); menuBtn.setAttribute('aria-expanded', 'false'); } });
    const slug = (t) => String(t || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').toLowerCase().slice(0, 50);
    menu.querySelector('[data-act="save"]').addEventListener('click', async () => {
      menu.setAttribute('hidden', '');
      if (!this.current) return;
      await this.saveCurrent({ thumb: true });
      this.toast('Preparando el proyecto completo, con todos sus mapas y planos…');
      const obj = await exportProject(this.current.projectId);
      downloadBlob(new Blob([JSON.stringify(obj)], { type: 'application/json' }), `${slug(this.current.project.meta.name)}.tesis.json`);
    });
    menu.querySelector('[data-act="save-map"]').addEventListener('click', async () => {
      menu.setAttribute('hidden', '');
      const data = JSON.parse(serializeState(this.state));
      const keys = new Set(this.state.interp.sources.map((x) => x.key).filter(Boolean));
      if (this.state.modelRef && this.state.modelRef.key) keys.add(this.state.modelRef.key);
      if (keys.size) data.images = await exportImages([...keys]);
      downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${slug(this.state.title)}.mapa.json`);
    });
    menu.querySelector('[data-act="meta"]').addEventListener('click', () => { menu.setAttribute('hidden', ''); this.editProjectMeta(); });
    menu.querySelector('[data-act="new-map"]').addEventListener('click', () => { menu.setAttribute('hidden', ''); this.newMapDialog(); });
    menu.querySelector('[data-act="home"]').addEventListener('click', () => { menu.setAttribute('hidden', ''); this.goHome(); });
    const openInput = document.getElementById('open-project');
    menu.querySelector('[data-act="open"]').addEventListener('click', () => { openInput.click(); menu.setAttribute('hidden', ''); });
    openInput.addEventListener('change', async () => {
      const f = openInput.files[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await readFileAs(f, 'text'));
        if (obj.formato === 'mapas-tesis-proyecto') {
          const p = await importProject(obj, f.name.replace(/\.json$/i, ''));
          this.toast(`Proyecto importado como nuevo: ${p.meta.name}`);
          location.hash = `#/p/${p.id}`;
        } else if (this.current) {
          // un mapa suelto se agrega al proyecto abierto
          if (obj.images) { await importImages(obj.images); delete obj.images; }
          await this.saveCurrent({ thumb: true });
          const st = normalizeState(obj);
          const m = await createMap(this.current.projectId, st.title || f.name.replace(/\.json$/i, ''), st);
          await this.reloadMaps();
          location.hash = `#/p/${this.current.projectId}/${m.id}`;
          this.toast(`Mapa agregado al proyecto: ${st.title}`);
        }
      } catch (err) { this.toast(`No se pudo abrir el archivo: ${err.message}`, 'error'); }
      openInput.value = '';
    });
    menu.querySelector('[data-act="sites-geojson"]').addEventListener('click', () => {
      const fc = { type: 'FeatureCollection', features: this.state.sites.map((s) => ({ type: 'Feature', properties: { nombre: s.name, categorias: (s.cats || []).map((c) => (this.state.categories.find((k) => k.id === c) || {}).name).join('|'), nota: s.note || '' }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) };
      downloadBlob(new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' }), 'sitios.geojson');
      menu.setAttribute('hidden', '');
    });
    menu.querySelector('[data-act="sites-csv"]').addEventListener('click', () => {
      const rows = [['nombre', 'latitud', 'longitud', 'lat_gms', 'lon_gms', 'categorias', 'nota']];
      for (const s of this.state.sites) rows.push([s.name, s.lat.toFixed(6), s.lon.toFixed(6), formatDMS(s.lat, true, { decimals: 1 }), formatDMS(s.lon, false, { decimals: 1 }), (s.cats || []).map((c) => (this.state.categories.find((k) => k.id === c) || {}).name).join('|'), s.note || '']);
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
      downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), 'sitios.csv');
      menu.setAttribute('hidden', '');
    });
    const tplBox = menu.querySelector('[data-templates]');
    if (tplBox) for (const t of TEMPLATES) tplBox.append(el('button', { type: 'button', role: 'menuitem', onclick: () => { this.newMapFromTemplate(t.id); menu.setAttribute('hidden', ''); } }, t.name));
    // Paneles en pantallas angostas
    document.querySelectorAll('[data-toggle-panel]').forEach((b) => b.addEventListener('click', () => {
      document.body.classList.toggle(`show-${b.dataset.togglePanel}`);
    }));
  }

  // ---------- interacción con la figura ----------
  pointerMM(e) {
    const r = this.$.paper.getBoundingClientRect();
    return [(e.clientX - r.left) / this.pxPerMm, (e.clientY - r.top) / this.pxPerMm];
  }

  scopeAt(pt) {
    const z = insetAt(this.state, pt);
    const geo = this.previewGeo();
    if (z && geo.insets[z.id]) return { scope: geo.insets[z.id], insetId: z.id, ctx: this.insetViews.get(z.id).ctx };
    return { scope: geo.main, insetId: null, ctx: this.mainCtx };
  }

  siteAt(pt) {
    const { scope, insetId } = this.scopeAt(pt);
    let best = null, bestD = Infinity;
    for (const s of this.state.sites) {
      const p = scope.toPage(lonLatTo(scope.projection, [s.lon, s.lat]));
      if (!p) continue;
      const d = Math.hypot(p[0] - pt[0], p[1] - pt[1]);
      const cfg = siteSymbolCfg(s, this.state);
      const r = Math.max(2, ((cfg.size || 6) * PT_MM) / 2 + 0.8);
      if (d < r && d < bestD) { best = { kind: 'site', id: s.id, insetId }; bestD = d; }
    }
    return best;
  }

  setupPointer() {
    const paper = this.$.paper;
    let drag = null;
    paper.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (this.mode === 'draw' || this.mode === 'modify') return; // OpenLayers dibuja
      const pt = this.pointerMM(e);
      if (this.mode === 'add-site') {
        const { scope } = this.scopeAt(pt);
        const c = scope.fromPage(pt);
        if (c) {
          const ll = toLonLatFrom(scope.projection, c);
          const d = this.modeDraft || {};
          const s = { id: uid('S'), name: d.name || `Sitio ${this.state.sites.length + 1}`, lon: ll[0], lat: ll[1], cats: d.cats || [], label: { show: true }, note: '' };
          this.state.sites.push(s);
          this.setMode(null);
          this.commit('sites');
          this.ui.expandedSites.add(s.id);
          this.select({ kind: 'site', id: s.id });
          this.renderLeft();
        }
        e.stopPropagation(); e.preventDefault();
        return;
      }
      let hit = hitTest(this.hits, pt, this.state, this.selection);
      if (!hit) hit = this.siteAt(pt);
      if (!hit) hit = footprintAt(this.hits, pt, this.state);
      if (!hit) { drag = { kind: 'map', start: pt, moved: false }; return; }
      e.stopPropagation(); e.preventDefault();
      paper.setPointerCapture(e.pointerId);
      const sel = hit.kind === 'footprint' || hit.kind === 'inset-resize' ? { kind: 'inset', id: hit.id } : hit.kind === 'text-rotate' ? { kind: 'text', id: hit.id } : { kind: hit.kind, id: hit.id };
      if (!this.selection || this.selection.kind !== sel.kind || this.selection.id !== sel.id) this.select(sel);
      drag = { ...hit, start: pt, last: pt, moved: false, pointerId: e.pointerId };
      if (hit.kind === 'text') {
        const t = this.state.texts.find((x) => x.id === hit.id);
        drag.origin = textPosition(this.previewGeo(), t);
      }
      if (hit.kind === 'footprint') {
        const z = this.state.insets.find((x) => x.id === hit.id);
        drag.startCoord = this.previewGeo().main.fromPage(pt);
        drag.centerMain = lonLatTo(this.mainCtx.projection, z.center);
      }
    }, true);

    paper.addEventListener('pointermove', (e) => {
      const pt = this.pointerMM(e);
      this.showCursorCoords(pt);
      if (!drag || drag.kind === 'map') { this.updateCursor(pt); if (drag && drag.kind === 'map' && Math.hypot(pt[0] - drag.start[0], pt[1] - drag.start[1]) > 0.8) drag.moved = true; return; }
      e.stopPropagation();
      const dx = pt[0] - drag.last[0], dy = pt[1] - drag.last[1];
      drag.last = pt;
      drag.moved = true;
      const st = this.state;
      const nudge = (o) => { o.x += dx; o.y += dy; };
      if (drag.kind === 'text') {
        const t = st.texts.find((x) => x.id === drag.id);
        const np = [drag.origin[0] + (pt[0] - drag.start[0]), drag.origin[1] + (pt[1] - drag.start[1])];
        if (t.anchor === 'geo') { const ll = this.pageToLonLat(np); if (ll) { t.lon = ll[0]; t.lat = ll[1]; } } else { t.x = np[0]; t.y = np[1]; }
      } else if (drag.kind === 'text-rotate') {
        const t = st.texts.find((x) => x.id === drag.id);
        const c = textPosition(this.previewGeo(), t);
        let a = (Math.atan2(pt[1] - c[1], pt[0] - c[0]) * 180) / Math.PI + 90;
        if (a > 180) a -= 360;
        if (!e.shiftKey) { const snap = Math.round(a / 15) * 15; if (Math.abs(snap - a) < 3) a = snap; }
        t.rotation = Math.round(a * 10) / 10;
      } else if (drag.kind === 'legend') nudge(st.legend);
      else if (drag.kind === 'north') nudge(st.north);
      else if (drag.kind === 'scale') nudge(st.scalebar);
      else if (drag.kind === 'inset') {
        const z = st.insets.find((x) => x.id === drag.id);
        nudge(z);
        this.layoutInsets();
      } else if (drag.kind === 'inset-resize') {
        const z = st.insets.find((x) => x.id === drag.id);
        if (z.shape === 'circle') { const d = Math.max(10, Math.max(pt[0] - z.x, pt[1] - z.y) - 1); z.w = d; z.h = d; }
        else { z.w = Math.max(10, pt[0] - z.x - 1); z.h = Math.max(10, pt[1] - z.y - 1); }
        this.layoutInsets();
      } else if (drag.kind === 'footprint') {
        const z = st.insets.find((x) => x.id === drag.id);
        const cur = this.previewGeo().main.fromPage(pt);
        if (cur && drag.startCoord) {
          const nc = [drag.centerMain[0] + (cur[0] - drag.startCoord[0]), drag.centerMain[1] + (cur[1] - drag.startCoord[1])];
          z.center = toLonLatFrom(this.mainCtx.projection, nc);
          const v = this.insetViews.get(z.id);
          if (v) v.ctx.applyView();
        }
      } else if (drag.kind === 'site') {
        const s = st.sites.find((x) => x.id === drag.id);
        const { scope } = this.scopeAt(pt);
        const c = scope.fromPage(pt);
        if (c) {
          const ll = toLonLatFrom(scope.projection, c);
          s.lon = ll[0]; s.lat = ll[1];
        }
      }
      this.redraw();
    }, true);

    const end = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.kind === 'map') {
        if (!d.moved) {
          const fid = this.interpFeatureAt(e);
          if (fid) { this.select({ kind: 'interp', id: fid }); if (this.ui.tab === 'interp') this.renderLeft(); }
          else if (this.selection) this.select(null);
        }
        return;
      }
      try { paper.releasePointerCapture(d.pointerId); } catch (err) { /* noop */ }
      if (d.moved) {
        const r1 = (o, keys) => { if (o) keys.forEach((k) => { if (Number.isFinite(o[k])) o[k] = Math.round(o[k] * 10) / 10; }); };
        if (d.kind === 'inset' || d.kind === 'inset-resize') r1(this.state.insets.find((x) => x.id === d.id), ['x', 'y', 'w', 'h']);
        if (d.kind === 'legend') r1(this.state.legend, ['x', 'y']);
        if (d.kind === 'north') r1(this.state.north, ['x', 'y']);
        if (d.kind === 'scale') r1(this.state.scalebar, ['x', 'y']);
        if (d.kind === 'text') r1(this.state.texts.find((x) => x.id === d.id), ['x', 'y']);
        if (d.kind === 'site') this.commit('sites');
        else if (d.kind === 'inset-resize' || d.kind === 'inset') { this.layoutInsets(); this.commit('overlay'); }
        else this.commit('overlay');
        this.renderInspector();
        if (d.kind === 'site') this.renderLeftSoon();
      }
    };
    paper.addEventListener('pointerup', end, true);
    paper.addEventListener('pointercancel', end, true);
    paper.addEventListener('dblclick', (e) => {
      const pt = this.pointerMM(e);
      const hit = hitTest(this.hits, pt, this.state, this.selection);
      if (hit && hit.kind === 'text') {
        e.stopPropagation(); e.preventDefault();
        this.select({ kind: 'text', id: hit.id });
        const ta = document.querySelector('#inspector-body textarea[data-focus="text"]');
        if (ta) { ta.focus(); ta.select(); }
      }
    }, true);
    paper.addEventListener('pointerleave', () => { this.$.status.querySelector('[data-k="coord"]').textContent = ''; });
  }

  updateCursor(pt) {
    const paper = this.$.paper;
    if (this.mode === 'add-site') { paper.style.cursor = 'crosshair'; return; }
    const hit = hitTest(this.hits, pt, this.state, this.selection) || this.siteAt(pt) || footprintAt(this.hits, pt, this.state);
    let cur = '';
    if (hit) cur = hit.kind === 'inset-resize' ? 'nwse-resize' : hit.kind === 'text-rotate' ? 'alias' : 'move';
    paper.style.cursor = cur;
  }

  showCursorCoords(pt) {
    const { scope } = this.scopeAt(pt);
    const c = scope.fromPage(pt);
    const out = this.$.status.querySelector('[data-k="coord"]');
    if (!c) { out.textContent = ''; return; }
    const ll = toLonLatFrom(scope.projection, c);
    if (!ll || !Number.isFinite(ll[0])) { out.textContent = ''; return; }
    out.textContent = `${formatDMS(ll[1], true)}  ${formatDMS(ll[0], false)}   (${ll[1].toFixed(4)}, ${ll[0].toFixed(4)})`;
  }

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('on-home') || document.querySelector('dialog[open]')) return;
      const tag = (e.target && e.target.tagName) || '';
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
      if (typing) return;
      if (e.key === 'Escape') {
        if (this.mode === 'draw' || this.mode === 'modify') { if (this._draw && this._draw.abortDrawing) this._draw.abortDrawing(); this.stopDraw(); return; }
        if (this.mode) { this.setMode(null); this.renderLeft(); } else this.select(null);
        return;
      }
      const sel = this.selection;
      if (!sel) return;
      const st = this.state;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (sel.kind === 'interp') { if (!isLocked(st)) { removeFeature(st, sel.id); this.select(null); bumpInterp(this); this.renderLeft(); } return; }
        if (sel.kind === 'text') st.texts = st.texts.filter((t) => t.id !== sel.id);
        else if (sel.kind === 'inset') st.insets = st.insets.filter((t) => t.id !== sel.id);
        else if (sel.kind === 'site') st.sites = st.sites.filter((t) => t.id !== sel.id);
        else if (sel.kind === 'legend') st.legend.show = false;
        else if (sel.kind === 'north') st.north.show = false;
        else if (sel.kind === 'scale') st.scalebar.show = false;
        this.select(null);
        this.commit(sel.kind === 'inset' ? 'insets' : sel.kind === 'site' ? 'sites' : 'overlay');
        this.renderLeft();
        return;
      }
      const step = e.shiftKey ? 5 : 0.5;
      const dirs = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (dirs[e.key]) {
        e.preventDefault();
        const [dx, dy] = dirs[e.key];
        let o = null;
        if (sel.kind === 'text') { const t = st.texts.find((x) => x.id === sel.id); if (t && t.anchor === 'page') o = t; else if (t) { const p = this.lonLatToPage([t.lon, t.lat]); const ll = p && this.pageToLonLat([p[0] + dx, p[1] + dy]); if (ll) { t.lon = ll[0]; t.lat = ll[1]; } } }
        else if (sel.kind === 'legend') o = st.legend;
        else if (sel.kind === 'north') o = st.north;
        else if (sel.kind === 'scale') o = st.scalebar;
        else if (sel.kind === 'inset') o = st.insets.find((x) => x.id === sel.id);
        if (o) { o.x += dx; o.y += dy; }
        if (sel.kind === 'inset') this.layoutInsets();
        this.commit('overlay');
        this.renderInspector();
      }
    });
  }
}

const app = new App();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => app.boot());
else app.boot();
