// Contexto de mapa: un ol/Map (principal, zoom o exportación) sincronizado con el estado
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import VectorLayer from 'ol/layer/Vector.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import DragPan from 'ol/interaction/DragPan.js';
import { getDef, defOf } from './catalog.js';
import { buildOlLayer } from './layers.js';
import { ensureProjection, lonLatTo, toLonLatFrom, resolutionFromMpm, mpmFromResolution } from './projections.js';

let ctxCounter = 0;

export function autoGraticuleInterval(mpm) {
  const targetMM = 32;
  const deg = (mpm * targetMM) / 111320;
  const list = [90, 45, 30, 20, 15, 10, 5, 2, 1, 0.5, 0.25, 1 / 6, 1 / 12, 1 / 30, 1 / 60];
  let best = list[0];
  for (const v of list) if (v >= deg * 0.6) best = v;
  return best;
}

export class MapCtx {
  constructor({ app, target, role = 'main', insetId = null, pixelRatio, pxPerMm, interactive = true, forExport = false }) {
    this.id = ++ctxCounter;
    this.app = app;
    this.role = role;
    this.insetId = insetId;
    this.pxPerMm = pxPerMm;
    this.pixelRatio = pixelRatio || window.devicePixelRatio || 1;
    this.forExport = forExport;
    this.olLayers = new Map();
    this.pending = 0;
    this.tileErrors = 0;
    this._unlisten = [];
    this.hideSites = false;
    this._applying = false;
    this.projection = this.computeProjection();
    this.map = new OlMap({
      target,
      controls: [],
      pixelRatio: this.pixelRatio,
      interactions: interactive ? defaultInteractions({ altShiftDragRotate: false, pinchRotate: false, keyboard: false, shiftDragZoom: false, dragPan: false }).extend([new DragPan()]) : [],
      layers: [],
      moveTolerance: 2,
    });
    this.applyView();
    this.sync();
    this.map.on('postrender', () => this.applyLayerCss());
    this.map.on('moveend', () => {
      const res = this.map.getView().getResolution();
      for (const l of this.olLayers.values()) if (l._esriSource && l._esriSource._onResolution) l._esriSource._onResolution(res);
    });
  }

  getState() { return this.app.state; }
  getLayerState(uid) { return this.app.state.layers.find((l) => l.uid === uid); }
  inset() { return this.insetId ? this.app.state.insets.find((z) => z.id === this.insetId) : null; }
  onLayerError(ls, err) { if (this.app.onLayerError) this.app.onLayerError(ls, err, this); }

  computeProjection() {
    const st = this.app.state;
    let code = st.projection;
    if (this.role === 'inset') {
      const ins = this.inset();
      if (ins && ins.projection && ins.projection !== 'same') code = ins.projection;
    }
    return ensureProjection(code);
  }

  viewParams() {
    const st = this.app.state;
    if (this.role === 'inset') {
      const ins = this.inset();
      const same = !ins.projection || ins.projection === 'same';
      return { center: ins.center, mpm: ins.mpm, rotation: same ? st.view.rotation : (ins.rotation || 0) };
    }
    return { center: st.view.center, mpm: st.view.mpm, rotation: st.view.rotation || 0 };
  }

  applyView() {
    this._applying = true;
    const proj = this.computeProjection();
    const projChanged = proj !== this.projection;
    this.projection = proj;
    const { center, mpm, rotation } = this.viewParams();
    const res = resolutionFromMpm(proj, center, mpm, this.pxPerMm);
    const cur = this.map.getView();
    if (!cur || projChanged || cur.getProjection().getCode() !== proj) {
      this.map.setView(new View({
        projection: proj, center: lonLatTo(proj, center), resolution: res, rotation,
        constrainResolution: false, smoothResolutionConstraint: false, multiWorld: true,
        maxResolution: 200000, minResolution: 0.05,
      }));
      if (projChanged) this.rebuildAll();
    } else {
      cur.setCenter(lonLatTo(proj, center));
      cur.setResolution(res);
      cur.setRotation(rotation);
    }
    this._applying = false;
  }

  // Estado de vista actual expresado de forma independiente de la proyección
  readView() {
    const v = this.map.getView();
    const c = v.getCenter();
    return {
      center: toLonLatFrom(this.projection, c),
      mpm: mpmFromResolution(this.projection, c, v.getResolution(), this.pxPerMm),
      rotation: v.getRotation(),
    };
  }

  setPxPerMm(v) {
    if (Math.abs(v - this.pxPerMm) < 1e-6) return;
    this.pxPerMm = v;
    this.map.updateSize();
    this.applyView();
    this.sync(true);
  }

  layerVisible(ls) {
    const def = defOf(ls);
    // un servidor sin CORS no deja leer sus imágenes: la capa se ve en pantalla pero no entra en la exportación
    if (this.forExport && def && def.noCors) return false;
    if (this.role === 'inset') {
      const ins = this.inset();
      const o = ins && ins.layers ? ins.layers[ls.uid] : undefined;
      if (o === true || o === false) return o;
      // los mapas de ubicación muestran solo las capas elegidas para ellos; los planos y trazos de interpretación, nunca por defecto
      if (ins && ins.mode === 'context') return false;
      if (ls.def === 'interp' || ls.def === 'georef') return !!ls.visible && ins.mode !== 'context';
      return !!ls.visible;
    }
    return !!ls.visible;
  }

  layerKey(ls) {
    const def = defOf(ls);
    let k = `${ls.rev}|${this.projection}`;
    if (ls.style && ls.style.label) {
      k += `|${ls.style.label.show && ls.style.label.declutter ? 'd' : ''}`;
    }
    if (ls.def === 'dem-analitico') k += `|${JSON.stringify(ls.params)}`;
    return k;
  }

  rebuildAll() {
    for (const l of this.olLayers.values()) this.map.removeLayer(l);
    this.olLayers.clear();
  }

  sync(forceStyles = false) {
    const st = this.app.state;
    const present = new Set();
    st.layers.forEach((ls, idx) => {
      present.add(ls.uid);
      const vis = this.layerVisible(ls);
      const key = this.layerKey(ls);
      let layer = this.olLayers.get(ls.uid);
      if (layer && layer._cmKey !== key) {
        this.map.removeLayer(layer);
        this.olLayers.delete(ls.uid);
        layer = null;
      }
      if (!vis && !layer) return;
      if (!layer) {
        layer = buildOlLayer(ls, this);
        if (!layer) return;
        layer._cmKey = key;
        this.trackLayer(layer);
        this.olLayers.set(ls.uid, layer);
        this.map.addLayer(layer);
      }
      layer.setVisible(vis);
      layer.setOpacity(Number(ls.opacity));
      layer.setZIndex(idx + 1);
      if (layer instanceof VectorLayer) layer.changed();
    });
    for (const [uid, layer] of this.olLayers) {
      if (!present.has(uid)) { this.map.removeLayer(layer); this.olLayers.delete(uid); }
    }
    if (forceStyles) this.map.render();
  }

  syncSites() { /* los sitios se dibujan en la capa de composición */ }

  trackLayer(layer) {
    const src = layer.getSource && layer.getSource();
    if (!src || !src.on || !src.getTile) return;
    if (this.forExport) {
      const fn = () => { this.tileErrors += 1; };
      src.on('tileloaderror', fn);
      this._unlisten.push(() => src.un('tileloaderror', fn));
      return;
    }
    if (src._cmTracked) return;
    src._cmTracked = true;
    const app = this.app;
    src.on('tileloadstart', () => app.onTileLoad && app.onTileLoad(1));
    src.on('tileloadend', () => app.onTileLoad && app.onTileLoad(-1));
    src.on('tileloaderror', () => { if (app.onTileLoad) app.onTileLoad(-1); if (app.onTileError) app.onTileError(layer.get('cmUid'), this); });
  }

  applyLayerCss() {
    const vp = this.map.getViewport();
    for (const ls of this.app.state.layers) {
      const elx = vp.querySelector(`.cm-${ls.uid}`);
      if (!elx) continue;
      const a = ls.adjust || {};
      const f = [];
      if (a.brightness != null && Number(a.brightness) !== 100) f.push(`brightness(${a.brightness}%)`);
      if (a.contrast != null && Number(a.contrast) !== 100) f.push(`contrast(${a.contrast}%)`);
      if (a.saturate != null && Number(a.saturate) !== 100) f.push(`saturate(${a.saturate}%)`);
      if (a.grayscale && Number(a.grayscale) > 0) f.push(`grayscale(${a.grayscale}%)`);
      const filter = f.join(' ');
      if (elx.style.filter !== filter) elx.style.filter = filter;
      const blend = ls.blend && ls.blend !== 'normal' ? ls.blend : '';
      if (elx.style.mixBlendMode !== blend) elx.style.mixBlendMode = blend;
    }
  }

  // Espera a que todo esté dibujado (teselas y datos vectoriales)
  async whenReady(timeoutMs = 90000) {
    const t0 = performance.now();
    const vectorPending = () => {
      let n = 0;
      for (const l of this.olLayers.values()) {
        const s = l.getSource && l.getSource();
        if (s && s._loading) n++;
      }
      return n;
    };
    // espera datos vectoriales estáticos
    while (vectorPending() > 0 && performance.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 150));
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      this.map.once('rendercomplete', finish);
      setTimeout(finish, Math.max(1000, timeoutMs - (performance.now() - t0)));
      this.map.render();
    });
    // una segunda pasada para capas vectoriales cargadas por extensión
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      this.map.once('rendercomplete', finish);
      setTimeout(finish, 4000);
      this.map.render();
    });
  }

  dispose() {
    this._unlisten.forEach((f) => f());
    this.map.setTarget(null);
    this.map.dispose();
  }
}
