// Herramienta de selección: elegir objetos de UNA capa con un clic, un rectángulo, un lazo o por sus atributos,
// y combinar cada elección con la anterior (nueva, sumar, quitar, quedarse con los que ya estaban).
import DragBox from 'ol/interaction/DragBox.js';
import Draw from 'ol/interaction/Draw.js';
import DragPan from 'ol/interaction/DragPan.js';
import GeoJSONFormat from 'ol/format/GeoJSON.js';
import { fromExtent } from 'ol/geom/Polygon.js';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style.js';
import booleanIntersects from '@turf/boolean-intersects';
import booleanWithin from '@turf/boolean-within';
import { el, clear } from '../util.js';
import { passFilter } from '../styles.js';
import { featureKey, groupOf } from '../features.js';
import { fieldsOf } from './styleEditor.js';
import { defOf } from '../catalog.js';
import { addResultLayer } from './analysisPanel.js';

const MODES = [['click', 'Clic', 'Un clic elige el objeto de la capa que está debajo'], ['box', 'Rectángulo', 'Arrastrá sobre el mapa para encerrar objetos'], ['lasso', 'Lazo', 'Dibujá a mano alzada el contorno que encierra los objetos'], ['attr', 'Por atributo', 'Elegir los objetos que cumplen condiciones en su tabla']];
const OPS = [['new', 'Nueva'], ['add', 'Sumar'], ['remove', 'Quitar'], ['within', 'Dentro de lo elegido']];
const RULE_OPS = [['=', 'es igual a'], ['≠', 'no es'], ['es uno de', 'es uno de (a; b; c)'], ['contiene', 'contiene'], ['empieza con', 'empieza con'], ['>', 'mayor que'], ['≥', 'desde'], ['<', 'menor que'], ['≤', 'hasta'], ['vacío', 'está vacío'], ['no vacío', 'no está vacío']];
const NOVAL = new Set(['vacío', 'no vacío']);
const fmtN = (v) => (Number.isInteger(v) ? v.toLocaleString('es-AR') : v.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

const gj = new GeoJSONFormat();
const toGeo = (g) => gj.writeGeometryObject(g);

// partes simples de una geometría (turf no compara bien multipartes en «dentro de»)
function parts(geo) {
  if (geo.type === 'MultiPolygon') return geo.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }));
  if (geo.type === 'MultiLineString') return geo.coordinates.map((c) => ({ type: 'LineString', coordinates: c }));
  if (geo.type === 'MultiPoint') return geo.coordinates.map((c) => ({ type: 'Point', coordinates: c }));
  if (geo.type === 'GeometryCollection') return geo.geometries.flatMap(parts);
  return [geo];
}

export class SelectTool {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.cfg = { layer: null, mode: 'click', op: 'new', whole: false, combine: 'all', rules: [{ field: '', op: '=', value: '' }], collapsed: false };
    this.inter = null;
    this.mods = { shift: false, alt: false };
  }

  // ---------- capas ----------
  layers() {
    const app = this.app;
    return app.state.layers.filter((ls) => app.selectableLayer(ls) && app.mainCtx.olLayers.get(ls.uid)).slice().reverse();
  }
  layer() { return this.app.state.layers.find((l) => l.uid === this.cfg.layer) || null; }
  olLayer() { return this.cfg.layer ? this.app.mainCtx.olLayers.get(this.cfg.layer) : null; }
  features() {
    const ol = this.olLayer();
    const src = ol && ol.getSource && ol.getSource();
    return src && src.getFeatures ? src.getFeatures() : [];
  }
  // solo lo que se ve: el filtro de la capa y las características ocultas no cuentan
  visible(ls, f) {
    const flt = ls.params && ls.params.filter;
    if (flt && flt.length && !passFilter(f, flt, ls.params.filterMode)) return false;
    if (ls.groups && ls.groups.length) { const g = groupOf(ls, featureKey(f)); if (g && g.hidden) return false; }
    return true;
  }
  pickDefaultLayer() {
    const list = this.layers();
    const sel = this.app.selection;
    if (sel && sel.kind === 'feature' && list.some((l) => l.uid === sel.id)) this.cfg.layer = sel.id;
    else if (!list.some((l) => l.uid === this.cfg.layer)) {
      // la de arriba que no sea el contorno del área de estudio, si hay otra
      const pref = list.find((l) => !(l.params && l.params.sem === 'study-area')) || list[0];
      this.cfg.layer = pref ? pref.uid : null;
    }
  }

  // ---------- abrir y cerrar ----------
  toggle() { if (this.active) this.close(); else this.open(); }
  open() {
    if (this.active) return;
    this.active = true;
    this.pickDefaultLayer();
    this.installMode();
    this.render();
    this.app.$.paper.classList.add('mode-select');
    const b = document.getElementById('btn-select');
    if (b) b.setAttribute('aria-pressed', 'true');
    if (!this._modsBound) {
      this._modsBound = true;
      const rec = (e) => { this.mods = { shift: !!e.shiftKey, alt: !!e.altKey }; };
      this.app.$.paper.addEventListener('pointerdown', rec, true);
    }
  }
  close() {
    if (!this.active) return;
    this.active = false;
    this.removeMode();
    this.app.$.paper.classList.remove('mode-select');
    const b = document.getElementById('btn-select');
    if (b) b.setAttribute('aria-pressed', 'false');
    this.app.renderInspector();
  }
  refresh() { if (this.active) this.pickDefaultLayer(); }

  // ---------- interacciones del mapa ----------
  dragPan(on) {
    this.app.mainCtx.map.getInteractions().forEach((i) => { if (i instanceof DragPan) i.setActive(on); });
  }
  removeMode() {
    if (this.inter) { try { this.app.mainCtx.map.removeInteraction(this.inter); } catch (e) { /* noop */ } this.inter = null; }
    this.dragPan(true);
  }
  installMode() {
    this.removeMode();
    const map = this.app.mainCtx.map;
    if (this.cfg.mode === 'box') {
      this.inter = new DragBox({ condition: () => true, className: 'sel-dragbox' });
      this.inter.on('boxend', (e) => {
        const ev = e.mapBrowserEvent && e.mapBrowserEvent.originalEvent;
        const mods = ev ? { shift: ev.shiftKey, alt: ev.altKey } : this.mods;
        this.selectByShape(this.inter.getGeometry(), mods);
      });
      map.addInteraction(this.inter);
      this.dragPan(false);
    } else if (this.cfg.mode === 'lasso') {
      const stroke = new Stroke({ color: '#e4007c', width: 1.6, lineDash: [5, 4] });
      this.inter = new Draw({
        type: 'Polygon', freehand: true,
        style: new Style({ stroke, fill: new Fill({ color: 'rgba(228,0,124,0.08)' }), image: new CircleStyle({ radius: 3, fill: new Fill({ color: '#e4007c' }) }) }),
      });
      this.inter.on('drawend', (e) => { const g = e.feature.getGeometry(); setTimeout(() => this.selectByShape(g, this.mods), 0); });
      map.addInteraction(this.inter);
      this.dragPan(false);
    }
  }
  abortDrawing() { if (this.inter && this.inter.abortDrawing) { this.inter.abortDrawing(); return true; } return false; }

  // ---------- elegir ----------
  apply(fids, mods = {}) {
    const ls = this.layer();
    if (!ls) return;
    const op = mods.shift ? 'add' : mods.alt ? 'remove' : this.cfg.op;
    const sel = this.app.selection;
    const cur = sel && sel.kind === 'feature' && sel.id === ls.uid ? sel.fids : [];
    const set = new Set(fids);
    let out;
    if (op === 'add') out = [...new Set([...cur, ...fids])];
    else if (op === 'remove') out = cur.filter((x) => !set.has(x));
    else if (op === 'within') out = cur.filter((x) => set.has(x));
    else out = [...set];
    this.app.selectFeatures(ls.uid, out);
    this.paintCount();
    return { op, n: out.length };
  }
  clickAt(e) {
    const ls = this.layer();
    const ol = this.olLayer();
    if (!ls || !ol) { this.app.toast('Elegí primero sobre qué capa seleccionar.', 'warn'); return; }
    const pt = this.app.pointerMM(e);
    if (this.app.scopeAt(pt).insetId) return;
    const m = this.app.mainCtx.map;
    let fid = null;
    m.forEachFeatureAtPixel(m.getEventPixel(e), (f) => { fid = featureKey(f); return true; }, { layerFilter: (l) => l === ol, hitTolerance: 4 });
    const mods = { shift: e.shiftKey, alt: e.altKey };
    if (fid) this.apply([fid], mods);
    else if (!mods.shift && !mods.alt && this.cfg.op === 'new') this.app.select(null);
  }
  selectByShape(geom, mods) {
    const ls = this.layer();
    const ol = this.olLayer();
    if (!ls || !ol || !geom) return;
    const src = ol.getSource();
    const ext = geom.getExtent();
    const shape = toGeo(geom);
    const cands = (src.getFeaturesInExtent ? src.getFeaturesInExtent(ext) : src.getFeatures()).filter((f) => f.getGeometry() && this.visible(ls, f));
    const out = [];
    for (const f of cands) {
      const g = toGeo(f.getGeometry());
      let ok = false;
      try { ok = this.cfg.whole ? parts(g).every((p) => booleanWithin(p, shape)) : booleanIntersects(g, shape); } catch (err) { ok = f.getGeometry().intersectsExtent(ext); }
      if (ok) out.push(featureKey(f));
    }
    this.apply(out, mods);
    if (!out.length) this.app.toast(this.cfg.whole ? 'Ningún objeto de la capa queda entero adentro.' : 'Ningún objeto de la capa toca lo dibujado.');
  }
  matching() {
    const ls = this.layer();
    if (!ls) return [];
    const rules = this.cfg.rules.filter((r) => r.field);
    if (!rules.length) return [];
    return this.features().filter((f) => this.visible(ls, f) && passFilter(f, rules, this.cfg.combine));
  }
  selectByAttributes() {
    const fs = this.matching();
    const r = this.apply([...new Set(fs.map(featureKey))], {});
    const cumplen = `${fs.length} objeto${fs.length === 1 ? ' cumple' : 's cumplen'} las condiciones`;
    this.app.toast(r && r.op !== 'new' ? `${cumplen}; quedan ${r.n} elegido${r.n === 1 ? '' : 's'}.` : `${cumplen}.`);
  }
  all() { const ls = this.layer(); if (ls) this.apply(this.features().filter((f) => this.visible(ls, f)).map(featureKey), {}); }
  invert() {
    const ls = this.layer();
    if (!ls) return;
    const sel = this.app.selection;
    const cur = new Set(sel && sel.kind === 'feature' && sel.id === ls.uid ? sel.fids : []);
    const out = [...new Set(this.features().filter((f) => this.visible(ls, f)).map(featureKey))].filter((k) => !cur.has(k));
    this.app.selectFeatures(ls.uid, out);
    this.paintCount();
  }
  selectedFeatures() {
    const sel = this.app.selection;
    if (!sel || sel.kind !== 'feature' || sel.id !== this.cfg.layer) return [];
    const want = new Set(sel.fids);
    const seen = new Set();
    return this.features().filter((f) => { const k = featureKey(f); if (!want.has(k) || seen.has(k)) return false; seen.add(k); return true; });
  }
  zoomTo() {
    const fs = this.selectedFeatures();
    if (!fs.length) return;
    const ext = fs.reduce((e, f) => { const x = f.getGeometry().getExtent(); return [Math.min(e[0], x[0]), Math.min(e[1], x[1]), Math.max(e[2], x[2]), Math.max(e[3], x[3])]; }, [Infinity, Infinity, -Infinity, -Infinity]);
    const view = this.app.mainCtx.map.getView();
    view.fit(fromExtent(ext), { padding: [30, 30, 30, 30], maxZoom: 18, duration: 250 });
  }
  copyToLayer() {
    const ls = this.layer();
    const fs = this.selectedFeatures();
    if (!ls || !fs.length) { this.app.toast('No hay objetos elegidos de esta capa.', 'warn'); return; }
    const fc = gj.writeFeaturesObject(fs, { featureProjection: this.app.mainCtx.projection, dataProjection: 'EPSG:4326', decimals: 7 });
    fc.features.forEach((f, i) => { if (f.properties) delete f.properties.geometry; if (f.id == null) f.id = `f${i + 1}`; });
    const style = JSON.parse(JSON.stringify(ls.style));
    delete style.categorize;
    addResultLayer(this.app, `${ls.name} (selección)`, fc, style, { legendLabel: `${ls.legend && ls.legend.label ? ls.legend.label : ls.name} (selección)`, method: 'seleccion' });
    this.app.renderLeft();
  }

  // ---------- panel ----------
  paintCount() {
    const out = document.querySelector('#inspector-body .sel-tool .st-count');
    if (!out) return;
    const sel = this.app.selection;
    const n = sel && sel.kind === 'feature' && sel.id === this.cfg.layer ? sel.fids.length : 0;
    const tot = this.features().length;
    out.textContent = `${n.toLocaleString('es-AR')} de ${tot.toLocaleString('es-AR')}`;
    out.title = `${n} objeto${n === 1 ? '' : 's'} elegido${n === 1 ? '' : 's'} de ${tot} cargado${tot === 1 ? '' : 's'} en la capa`;
  }
  seg(options, key, onChange) {
    return el('div', { class: 'seg', role: 'group' }, options.map(([v, t, title]) => el('button', {
      type: 'button', class: this.cfg[key] === v ? 'on' : '', 'aria-pressed': String(this.cfg[key] === v), title: title || '',
      onclick: () => { this.cfg[key] = v; onChange && onChange(v); this.render(); },
    }, t)));
  }
  fieldStats(field) {
    const vals = this.features().map((f) => f.get(field)).filter((v) => v != null && String(v).trim() !== '');
    if (!vals.length) return { text: 'sin valores en lo cargado', values: [] };
    const nums = vals.map(Number).filter(Number.isFinite);
    const distinct = [...new Set(vals.map(String))];
    if (nums.length >= vals.length * 0.9) {
      const mn = Math.min(...nums), mx = Math.max(...nums), mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return { numeric: true, text: `${nums.length.toLocaleString('es-AR')} valores numéricos · de ${fmtN(mn)} a ${fmtN(mx)} · promedio ${fmtN(mean)}${distinct.length === vals.length ? ' · todos distintos' : ''}`, values: distinct.slice(0, 200) };
    }
    return { text: `${vals.length.toLocaleString('es-AR')} valores · ${distinct.length.toLocaleString('es-AR')} distintos`, values: distinct.sort((a, b) => a.localeCompare(b, 'es')).slice(0, 200) };
  }
  attrSection(ls) {
    const flds = fieldsOf(this.app, ls);
    const box = el('div', { class: 'st-attr' });
    if (!flds.length) { box.append(el('p', { class: 'note' }, 'La capa todavía no tiene objetos cargados: acercá o esperá a que termine de cargar.')); return box; }
    this.cfg.rules.forEach((r) => { if (!r.field || !flds.includes(r.field)) r.field = flds[0]; });
    const preview = el('span', { class: 'st-preview' });
    const paintPreview = () => { const n = this.matching().length; preview.textContent = `${n.toLocaleString('es-AR')} cumple${n === 1 ? '' : 'n'}`; };
    this.cfg.rules.forEach((r, i) => {
      const stats = this.fieldStats(r.field);
      const dlId = `st-vals-${i}`;
      const fSel = el('select', { 'aria-label': 'Campo' }, flds.map((f) => el('option', { value: f, selected: r.field === f }, f)));
      const oSel = el('select', { 'aria-label': 'Condición' }, RULE_OPS.map(([v, t]) => el('option', { value: v, selected: r.op === v }, t)));
      const vIn = el('input', { type: 'text', value: r.value || '', 'aria-label': 'Valor', list: dlId, placeholder: stats.numeric ? 'número' : 'valor', hidden: NOVAL.has(r.op) });
      const dl = el('datalist', { id: dlId }, stats.values.map((v) => el('option', { value: v })));
      fSel.addEventListener('change', () => {
        r.field = fSel.value; r.value = '';
        // un campo de texto no admite «mayor que»: la condición vuelve a «es igual a»
        if (['>', '≥', '<', '≤'].includes(r.op) && !this.fieldStats(r.field).numeric) r.op = '=';
        this.render();
      });
      oSel.addEventListener('change', () => { r.op = oSel.value; vIn.hidden = NOVAL.has(r.op); paintPreview(); });
      vIn.addEventListener('input', () => { r.value = vIn.value; paintPreview(); });
      vIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.selectByAttributes(); } });
      box.append(el('div', { class: 'st-rule' }, fSel, oSel, vIn, dl,
        this.cfg.rules.length > 1 ? el('button', { type: 'button', class: 'icon ghost', 'aria-label': 'Quitar condición', onclick: () => { this.cfg.rules.splice(i, 1); this.render(); } }, '×') : null),
      el('p', { class: 'st-stats' }, `${r.field}: ${stats.text}`));
    });
    box.append(el('div', { class: 'st-row' },
      el('button', { type: 'button', class: 'btn small ghost', onclick: () => { this.cfg.rules.push({ field: flds[0], op: '=', value: '' }); this.render(); } }, '+ condición'),
      this.cfg.rules.length > 1 ? el('select', { 'aria-label': 'Combinar condiciones', onchange: (e) => { this.cfg.combine = e.target.value; paintPreview(); } },
        el('option', { value: 'all', selected: this.cfg.combine === 'all' }, 'que se cumplan todas'),
        el('option', { value: 'any', selected: this.cfg.combine === 'any' }, 'que se cumpla alguna')) : null,
      preview,
      el('button', { type: 'button', class: 'btn small primary', onclick: () => this.selectByAttributes() }, 'Elegir')));
    paintPreview();
    return box;
  }
  // el panel vive arriba del inspector: no tapa el mapa y deja abajo los atributos y el estilo de lo elegido
  render() { if (this.active) this.app.renderInspector(); }
  build() {
    const app = this.app;
    const p = el('section', { class: 'sel-tool', 'aria-label': 'Herramienta de selección' });
    const list = this.layers();
    if (list.length && !list.some((l) => l.uid === this.cfg.layer)) this.pickDefaultLayer();
    const ls = this.layer();
    p.append(el('header', { class: 'st-head' },
      el('strong', {}, 'Seleccionar'),
      el('span', { class: 'st-count' }),
      el('button', { type: 'button', class: 'icon ghost', title: this.cfg.collapsed ? 'Desplegar' : 'Plegar', 'aria-label': this.cfg.collapsed ? 'Desplegar' : 'Plegar', onclick: () => { this.cfg.collapsed = !this.cfg.collapsed; this.render(); } }, this.cfg.collapsed ? '▾' : '▴'),
      el('button', { type: 'button', class: 'icon ghost', title: 'Cerrar la herramienta', 'aria-label': 'Cerrar la herramienta', onclick: () => this.close() }, '×')));
    if (this.cfg.collapsed) { setTimeout(() => this.paintCount(), 0); return p; }
    if (!list.length) {
      p.append(el('p', { class: 'note' }, 'No hay capas vectoriales visibles para elegir objetos. Prendé o agregá una capa (propia, del IGN o de un servicio).'));
      return p;
    }
    const lSel = el('select', { 'aria-label': 'Capa sobre la que se selecciona' }, list.map((l) => el('option', { value: l.uid, selected: l.uid === this.cfg.layer }, l.name)));
    lSel.addEventListener('change', () => { this.cfg.layer = lSel.value; this.cfg.rules = [{ field: '', op: '=', value: '' }]; this.render(); });
    const def = ls && ls.def !== 'user' ? defOf(ls) : null;
    const partial = def && (def.type === 'wfs-view' || ((def.type === 'svc-wfs' || def.type === 'svc-arcgis') && !def.whole));
    p.append(...[
      el('label', { class: 'st-field' }, el('span', {}, 'Sobre la capa'), lSel),
      partial ? el('p', { class: 'st-note' }, 'Esta capa carga solo lo que entra en la vista: se eligen los objetos cargados.') : null,
      el('div', { class: 'st-field' }, el('span', {}, 'Cómo'), this.seg(MODES, 'mode', () => this.installMode())),
      this.cfg.mode === 'box' || this.cfg.mode === 'lasso' ? el('label', { class: 'st-check' }, el('input', { type: 'checkbox', checked: this.cfg.whole, onchange: (e) => { this.cfg.whole = e.target.checked; } }), el('span', {}, 'Solo los que quedan enteros adentro')) : null,
      el('div', { class: 'st-field' }, el('span', {}, 'Al elegir'), this.seg(OPS, 'op')),
      el('p', { class: 'st-hint' }, this.cfg.mode === 'click' ? 'Tocá un objeto de la capa en el mapa.' : this.cfg.mode === 'box' ? 'Arrastrá sobre el mapa para dibujar el rectángulo.' : this.cfg.mode === 'lasso' ? 'Mantené apretado y dibujá el contorno.' : 'Armá las condiciones con los campos de la capa.', ' Mayús suma · Alt quita · Esc limpia.'),
      this.cfg.mode === 'attr' && ls ? this.attrSection(ls) : null,
      el('div', { class: 'st-actions' },
        el('button', { type: 'button', class: 'btn small ghost', onclick: () => this.all() }, 'Todos'),
        el('button', { type: 'button', class: 'btn small ghost', onclick: () => this.invert() }, 'Invertir'),
        el('button', { type: 'button', class: 'btn small ghost', onclick: () => app.select(null) }, 'Ninguno'),
        el('button', { type: 'button', class: 'btn small ghost', onclick: () => this.zoomTo() }, 'Acercar'),
        el('button', { type: 'button', class: 'btn small ghost', title: 'Crea una capa propia con los objetos elegidos', onclick: () => this.copyToLayer() }, 'Copiar a capa nueva')),
    ].filter(Boolean));
    setTimeout(() => this.paintCount(), 0);
    return p;
  }
}
