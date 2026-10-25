// Georreferenciador: el plano a la izquierda, el terreno a la derecha y la tabla de puntos de control abajo.
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import TileWMS from 'ol/source/TileWMS.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style.js';
import { fromLonLat, toLonLat, transform } from 'ol/proj.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import { el, clear, uid, formatDMS, parseCoordPair, parseCoordValue } from '../util.js';
import { button, select, check, range } from './forms.js';
import { METHODS, methodInfo, fitModel, fmtM, activeGcps } from '../georef.js';
import { getImage, loadImg } from '../imagestore.js';
import { georefImageLayer } from '../layers.js';
import { EMBEDDED } from '../embedded.js';
import { georefOf, ensureGeorefLayer, isLocked } from '../interp.js';
import { registerProjections, gkFaja } from '../projections.js';

const BASES = [
  ['esri', 'Imagen satelital (Esri)'],
  ['argenmap', 'Argenmap (IGN)'],
  ['gris', 'Argenmap gris (IGN)'],
  ['arba', 'Parcelario ARBA sobre imagen'],
  ['none', 'Sin fondo'],
];
const IGN = (n) => `https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/${n}@EPSG%3A3857@png/{z}/{x}/{-y}.png`;

export async function openGeorefDialog(app, src) {
  const dlg = document.getElementById('georef-dialog');
  const body = dlg.querySelector('.gr-body');
  clear(body);
  registerProjections();
  const st = app.state;
  const locked = isLocked(st);
  const gr = georefOf(st, src.id, true);
  const img = await getImage(src.key);
  if (!img) { app.toast('No encuentro la imagen de este plano en el navegador. Volvé a cargarla.', 'error'); return; }
  const image = await loadImg(img.url);
  const ui = { sel: null, base: 'esri', snap: true, preview: true, previewOpacity: 0.55, residualScale: 1, sys: 'll' };
  let model = null;

  // ---------- estructura ----------
  const title = el('h2', { id: 'georef-title' }, `Georreferenciar: ${src.title || 'plano'}`);
  const methodObj = { m: gr.method };
  const methodSel = select(methodObj, 'm', METHODS.map((m) => [m.id, m.name]), { onChange: (v) => { if (locked) return; gr.method = v; refit(); } });
  const stats = el('div', { class: 'gr-stats', 'aria-live': 'polite' });
  const hint = el('p', { class: 'gr-hint' });
  const planCanvas = el('canvas', { class: 'gr-canvas', tabindex: '0', 'aria-label': 'Plano: tocá un punto reconocible para crear un punto de control' });
  const planWrap = el('div', { class: 'gr-pane gr-plan' }, el('div', { class: 'gr-pane-h' }, el('strong', {}, 'Plano'), el('span', {}, 'Tocá un punto reconocible (esquina, cruce, mojón). Rueda: zoom. Arrastrar: mover.')), planCanvas);
  const mapDiv = el('div', { class: 'gr-map' });
  const baseObj = { v: ui.base };
  const baseSel = select(baseObj, 'v', BASES, { onChange: (v) => { ui.base = v; setBase(); } });
  const snapChk = check(ui, 'snap', 'Imantar a vértices de mensuras', {});
  const prevChk = check(ui, 'preview', 'Ver el plano superpuesto', { onChange: () => refreshPreview() });
  const prevRange = range(ui, 'previewOpacity', { min: 0.1, max: 1, step: 0.05, onInput: () => { if (previewLayer) previewLayer.setOpacity(ui.previewOpacity); }, format: (v) => `${Math.round(v * 100)}%` });
  const mapWrap = el('div', { class: 'gr-pane gr-terrain' },
    el('div', { class: 'gr-pane-h' }, el('strong', {}, 'Terreno'), baseSel, snapChk, prevChk, prevRange),
    mapDiv);
  const table = el('table', { class: 'gr-table' });
  const coordSys = { v: 'll' };
  const sysSel = select(coordSys, 'v', [['ll', 'Latitud y longitud (WGS 84)'], ['posgar', 'POSGAR 2007 Gauss-Krüger (Norte X, Este Y)'], ['inch', 'Campo Inchauspe Gauss-Krüger (cartas antiguas)']], { onChange: () => renderTable() });
  const close = button('Guardar y cerrar', () => finish(), { kind: 'primary' });
  const head = el('div', { class: 'gr-head' }, title, el('div', { class: 'gr-head-tools' }, el('label', { class: 'gr-method' }, el('span', {}, 'Transformación'), methodSel), close));
  const foot = el('div', { class: 'gr-foot' },
    el('div', { class: 'gr-foot-h' }, el('strong', {}, 'Puntos de control'), el('span', { class: 'gr-sys' }, 'Coordenadas en ', sysSel),
      button('Quitar el seleccionado', () => { if (ui.sel && !locked) { gr.gcps = gr.gcps.filter((g) => g.id !== ui.sel); ui.sel = null; refit(); } }, { kind: 'small ghost' })),
    el('div', { class: 'gr-table-wrap' }, table), stats, hint);
  body.append(head, el('div', { class: 'gr-panes' }, planWrap, mapWrap), foot);
  if (locked) body.prepend(el('p', { class: 'warn-note' }, 'Esta versión está fijada: los puntos se muestran pero no se pueden cambiar. Duplicá la versión para corregir la georreferenciación.'));
  if (!dlg.open) dlg.showModal();

  // ---------- plano (lienzo con zoom y desplazamiento) ----------
  const view = { k: 1, tx: 0, ty: 0 };
  const ctx = planCanvas.getContext('2d');
  const fitPlan = () => {
    const r = planCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    planCanvas.width = Math.max(10, Math.round(r.width * dpr)); planCanvas.height = Math.max(10, Math.round(r.height * dpr));
    if (!view.init) {
      view.k = Math.min(r.width / image.naturalWidth, r.height / image.naturalHeight) * 0.95;
      view.tx = (r.width - image.naturalWidth * view.k) / 2; view.ty = (r.height - image.naturalHeight * view.k) / 2;
      view.init = true;
    }
    drawPlan();
  };
  const toImg = (cx, cy) => [(cx - view.tx) / view.k, (cy - view.ty) / view.k];
  const toScreen = (px, py) => [px * view.k + view.tx, py * view.k + view.ty];
  function drawPlan() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, planCanvas.width, planCanvas.height);
    ctx.fillStyle = '#d7dde1'; ctx.fillRect(0, 0, planCanvas.width, planCanvas.height);
    ctx.save();
    ctx.translate(view.tx, view.ty); ctx.scale(view.k, view.k);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0);
    ctx.restore();
    // residuos: dónde «cae» cada punto según el modelo inverso
    gr.gcps.forEach((g, i) => {
      if (!Number.isFinite(g.px)) return;
      const [x, y] = toScreen(g.px, g.py);
      if (model && model.ok && g.on !== false && Number.isFinite(g.lon)) {
        const p = model.inverse(g.lon, g.lat);
        if (Number.isFinite(p[0])) {
          const [qx, qy] = toScreen(g.px + (p[0] - g.px) * ui.residualScale, g.py + (p[1] - g.py) * ui.residualScale);
          if (Math.hypot(qx - x, qy - y) > 1.5) {
            ctx.strokeStyle = '#c8102e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(qx, qy); ctx.stroke();
            ctx.beginPath(); ctx.arc(qx, qy, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#c8102e'; ctx.fill();
          }
        }
      }
      marker(ctx, x, y, i + 1, g.id === ui.sel, g.on === false, !Number.isFinite(g.lon));
    });
  }
  function marker(c, x, y, n, sel, off, pending) {
    c.save();
    c.lineWidth = sel ? 2.4 : 1.6;
    c.strokeStyle = off ? '#8a8a8a' : pending ? '#e8501c' : '#0b6e4f';
    c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x - 3, y); c.moveTo(x + 3, y); c.lineTo(x + 9, y); c.moveTo(x, y - 9); c.lineTo(x, y - 3); c.moveTo(x, y + 3); c.lineTo(x, y + 9); c.stroke();
    c.beginPath(); c.arc(x, y, sel ? 6 : 4.5, 0, Math.PI * 2); c.stroke();
    c.font = '700 12px Archivo, sans-serif'; c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.strokeText(String(n), x + 8, y - 8);
    c.fillStyle = off ? '#666' : pending ? '#b23d0f' : '#0b4f39'; c.fillText(String(n), x + 8, y - 8);
    c.restore();
  }
  let drag = null;
  planCanvas.addEventListener('pointerdown', (e) => {
    const r = planCanvas.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    // ¿sobre un punto existente? se arrastra
    const hit = gr.gcps.find((g) => Number.isFinite(g.px) && Math.hypot(...toScreen(g.px, g.py).map((v, i) => v - [cx, cy][i])) < 9);
    drag = { x: cx, y: cy, tx: view.tx, ty: view.ty, moved: false, gcp: hit && !locked ? hit : null };
    if (hit) { ui.sel = hit.id; renderTable(); drawPlan(); refreshMarkers(); }
    planCanvas.setPointerCapture(e.pointerId);
  });
  planCanvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = planCanvas.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    if (Math.hypot(cx - drag.x, cy - drag.y) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.gcp) { const p = toImg(cx, cy); drag.gcp.px = round1(p[0]); drag.gcp.py = round1(p[1]); drawPlan(); }
    else { view.tx = drag.tx + (cx - drag.x); view.ty = drag.ty + (cy - drag.y); drawPlan(); }
  });
  planCanvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.gcp && d.moved) { refit(); return; }
    if (d.moved || d.gcp || locked) return;
    const r = planCanvas.getBoundingClientRect();
    const p = toImg(e.clientX - r.left, e.clientY - r.top);
    if (p[0] < 0 || p[1] < 0 || p[0] > image.naturalWidth || p[1] > image.naturalHeight) return;
    // si hay un punto seleccionado sin píxel, lo completa; si no, crea uno nuevo
    let g = gr.gcps.find((x) => x.id === ui.sel && !Number.isFinite(x.px));
    if (!g) { g = { id: uid('P'), name: '', px: NaN, py: NaN, lon: NaN, lat: NaN, on: true }; gr.gcps.push(g); }
    g.px = round1(p[0]); g.py = round1(p[1]);
    ui.sel = g.id;
    if (!Number.isFinite(g.lon) && model && model.ok) {
      // sugerencia: posición estimada por el modelo actual (hay que confirmarla en el terreno)
      const ll = model.forward(g.px, g.py);
      if (Number.isFinite(ll[0])) olMap.getView().animate({ center: fromLonLat(ll), duration: 250 });
    }
    refit();
    hint.textContent = Number.isFinite(g.lon) ? '' : `Punto ${gr.gcps.indexOf(g) + 1}: ahora tocá el mismo lugar en el terreno (o escribí sus coordenadas en la tabla).`;
  });
  planCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = planCanvas.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    const nk = Math.max(0.02, Math.min(40, view.k * f));
    view.tx = cx - ((cx - view.tx) * nk) / view.k; view.ty = cy - ((cy - view.ty) * nk) / view.k; view.k = nk;
    drawPlan();
  }, { passive: false });

  // ---------- terreno (mapa) ----------
  const markers = new VectorSource();
  const snapSource = new VectorSource();
  try {
    const fmt = new GeoJSON();
    for (const k of ['data/atlas_mensuras_ahg.geojson', 'data/atlas_registro_grafico_1874.geojson']) snapSource.addFeatures(fmt.readFeatures(EMBEDDED[k], { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }));
  } catch (e) { /* noop */ }
  const snapLayer = new VectorLayer({ source: snapSource, style: new Style({ stroke: new Stroke({ color: 'rgba(255,214,0,0.9)', width: 1 }) }), visible: false });
  const baseLayer = new TileLayer({ preload: 1 });
  const arbaLayer = new TileLayer({ visible: false, source: new TileWMS({ url: 'https://geo.arba.gov.ar/geoserver/ows', params: { LAYERS: 'idera:Parcela', TRANSPARENT: true, FORMAT: 'image/png', VERSION: '1.3.0' }, projection: 'EPSG:3857', crossOrigin: 'anonymous' }) });
  const markerLayer = new VectorLayer({ source: markers, style: (f) => {
    const sel = f.get('sel'), off = f.get('off');
    const col = off ? '#8a8a8a' : sel ? '#e8501c' : '#0b6e4f';
    return new Style({
      image: new CircleStyle({ radius: sel ? 7 : 5.5, fill: new Fill({ color: 'rgba(255,255,255,0.25)' }), stroke: new Stroke({ color: col, width: sel ? 2.5 : 2 }) }),
      text: new Text({ text: String(f.get('n')), offsetX: 11, offsetY: -10, font: '700 12px Archivo, sans-serif', fill: new Fill({ color: col }), stroke: new Stroke({ color: '#fff', width: 3 }) }),
    });
  } });
  let previewLayer = null;
  const center = gr.gcps.find((g) => Number.isFinite(g.lon)) || null;
  const olMap = new OlMap({
    target: mapDiv, controls: [], layers: [baseLayer, arbaLayer, snapLayer, markerLayer],
    interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
    view: new View({ center: fromLonLat(center ? [center.lon, center.lat] : st.view.center), zoom: center ? 13 : 12, maxZoom: 20 }),
  });
  if (!center) {
    const ll = st.view.center;
    olMap.getView().setCenter(fromLonLat(ll));
  }
  function setBase() {
    arbaLayer.setVisible(ui.base === 'arba');
    if (ui.base === 'none') { baseLayer.setVisible(false); return; }
    baseLayer.setVisible(true);
    const url = ui.base === 'argenmap' ? IGN('capabaseargenmap') : ui.base === 'gris' ? IGN('mapabase_gris')
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    baseLayer.setSource(new XYZ({ url, crossOrigin: 'anonymous', maxZoom: ui.base === 'esri' || ui.base === 'arba' ? 19 : 18 }));
  }
  setBase();
  olMap.on('singleclick', (e) => {
    if (locked) return;
    let c = e.coordinate;
    if (ui.snap) {
      const px = e.pixel;
      let best = null, bd = 12;
      snapSource.forEachFeatureInExtent(olMap.getView().calculateExtent(olMap.getSize()), (f) => {
        const g = f.getGeometry();
        const rings = g.getType() === 'Polygon' ? g.getCoordinates() : g.getType() === 'MultiPolygon' ? g.getCoordinates().flat() : [];
        for (const r of rings) for (const v of r) {
          const p = olMap.getPixelFromCoordinate(v);
          const d = Math.hypot(p[0] - px[0], p[1] - px[1]);
          if (d < bd) { bd = d; best = v; }
        }
      });
      if (best) c = best;
    }
    const ll = toLonLat(c);
    let g = gr.gcps.find((x) => x.id === ui.sel && !Number.isFinite(x.lon));
    if (!g) g = gr.gcps.find((x) => !Number.isFinite(x.lon) && Number.isFinite(x.px));
    if (!g) { app.toast('Primero tocá el punto en el plano; después, el mismo lugar en el terreno.'); return; }
    g.lon = round7(ll[0]); g.lat = round7(ll[1]);
    ui.sel = g.id;
    hint.textContent = '';
    refit();
  });
  snapLayer.setVisible(ui.snap);
  snapChk.querySelector('input').addEventListener('change', () => snapLayer.setVisible(ui.snap));

  function refreshMarkers() {
    markers.clear();
    gr.gcps.forEach((g, i) => {
      if (!Number.isFinite(g.lon)) return;
      const f = new Feature(new Point(fromLonLat([g.lon, g.lat])));
      f.set('n', i + 1); f.set('sel', g.id === ui.sel); f.set('off', g.on === false);
      markers.addFeature(f);
    });
  }
  function refreshPreview() {
    if (previewLayer) { olMap.removeLayer(previewLayer); previewLayer = null; }
    if (!ui.preview || !model || !model.ok) return;
    try {
      previewLayer = georefImageLayer(src, gr, model, 'EPSG:3857', img.url, 'gr-preview');
      previewLayer.setOpacity(ui.previewOpacity);
      olMap.getLayers().insertAt(2, previewLayer);
    } catch (e) { console.error(e); }
  }

  // ---------- tabla ----------
  function renderTable() {
    clear(table);
    const faja = gkFaja(center ? center.lon : st.view.center[0]);
    const sys = coordSys.v;
    const code = sys === 'posgar' ? `EPSG:${5342 + faja}` : sys === 'inch' ? `EPSG:${22190 + faja}` : null;
    table.append(el('thead', {}, el('tr', {},
      el('th', {}, '#'), el('th', {}, 'Nombre'), el('th', {}, 'Píxel x, y'),
      el('th', {}, sys === 'll' ? 'Latitud' : `Norte X (faja ${faja})`), el('th', {}, sys === 'll' ? 'Longitud' : 'Este Y'),
      el('th', {}, 'Residuo'), el('th', {}, 'Usar'))));
    const tb = el('tbody');
    gr.gcps.forEach((g, i) => {
      const r = model && model.residuals ? model.residuals.find((x) => x.id === g.id) : null;
      const loo = model && model.loo ? model.loo.find((x) => x.id === g.id) : null;
      const tr = el('tr', { class: g.id === ui.sel ? 'sel' : '' });
      tr.addEventListener('click', (e) => {
        if (e.target.closest('input')) return;
        ui.sel = g.id; renderTable(); drawPlan(); refreshMarkers();
        if (Number.isFinite(g.lon)) olMap.getView().animate({ center: fromLonLat([g.lon, g.lat]), duration: 200 });
      });
      const name = el('input', { type: 'text', value: g.name || '', placeholder: 'esquina, cruce…', disabled: locked });
      name.addEventListener('change', () => { g.name = name.value; });
      let a = '', b = '';
      if (Number.isFinite(g.lat)) {
        if (sys === 'll') { a = g.lat.toFixed(6); b = g.lon.toFixed(6); }
        else { const xy = transform([g.lon, g.lat], 'EPSG:4326', code); a = Math.round(xy[1]).toString(); b = Math.round(xy[0]).toString(); }
      }
      const ia = el('input', { type: 'text', value: a, class: 'coord', disabled: locked, 'aria-label': `Punto ${i + 1}: ${sys === 'll' ? 'latitud' : 'norte'}` });
      const ib = el('input', { type: 'text', value: b, class: 'coord', disabled: locked, 'aria-label': `Punto ${i + 1}: ${sys === 'll' ? 'longitud' : 'este'}` });
      const apply = () => {
        if (sys === 'll') {
          const pair = parseCoordPair(`${ia.value}; ${ib.value}`);
          const lat = pair ? pair.lat : parseCoordValue(ia.value), lon = pair ? pair.lon : parseCoordValue(ib.value);
          if (Number.isFinite(lat) && Number.isFinite(lon)) { g.lat = lat; g.lon = lon; refit(); }
        } else {
          const N = parseNum(ia.value), E = parseNum(ib.value);
          if (Number.isFinite(N) && Number.isFinite(E)) { const ll = transform([E, N], code, 'EPSG:4326'); g.lon = round7(ll[0]); g.lat = round7(ll[1]); refit(); }
        }
      };
      ia.addEventListener('change', apply); ib.addEventListener('change', apply);
      const on = el('input', { type: 'checkbox', checked: g.on !== false, disabled: locked, 'aria-label': `Usar el punto ${i + 1}` });
      on.addEventListener('change', () => { g.on = on.checked; refit(); });
      const res = r ? fmtM(r.d) : loo ? `${fmtM(loo.d)} *` : '—';
      const bad = r && model && model.rms > 0 && r.d > model.rms * 2 && gr.gcps.length > methodInfo(gr.method).min + 1;
      tr.append(
        el('td', {}, String(i + 1)), el('td', {}, name),
        el('td', { class: 'num' }, Number.isFinite(g.px) ? `${Math.round(g.px)}, ${Math.round(g.py)}` : '—'),
        el('td', {}, ia), el('td', {}, ib),
        el('td', { class: `num${bad ? ' bad' : ''}`, title: bad ? 'Este punto se aparta mucho del resto: revisalo o desactivalo' : '' }, res),
        el('td', {}, on));
      tb.append(tr);
    });
    if (!gr.gcps.length) tb.append(el('tr', {}, el('td', { colspan: '7', class: 'empty-row' }, 'Todavía no hay puntos. Tocá una esquina o un cruce en el plano y después el mismo lugar en el terreno.')));
    table.append(tb);
  }

  function refit() {
    model = fitModel(gr.gcps, gr.method, { imageSize: [src.w, src.h] });
    gr._model = null;
    clear(stats);
    const info = methodInfo(gr.method);
    const n = activeGcps(gr.gcps).length;
    if (model.ok) {
      const exactNow = n === { helmert: 2, affine: 3, projective: 4, poly2: 6, poly3: 10 }[gr.method];
      stats.append(
        el('span', { class: 'gr-stat' }, el('b', {}, `${n}`), ' puntos'),
        info.exact ? el('span', { class: 'gr-stat' }, 'Validación cruzada: ', el('b', {}, model.loo ? fmtM(model.loo.rms) : '—'))
          : el('span', { class: 'gr-stat' }, 'Error medio cuadrático: ', el('b', {}, fmtM(model.rms))),
        el('span', { class: 'gr-stat' }, 'Escala del plano: ', el('b', {}, `${fmtM(model.mpp)} por píxel`)),
      );
      hint.textContent = exactNow ? `Con ${n} puntos la transformación ${info.name.split(' (')[0].toLowerCase()} pasa exactamente por todos: el error no se puede medir. Agregá al menos un punto de control más.`
        : info.exact ? 'La lámina delgada no tiene residuos: el asterisco (*) indica cuánto se equivocaría el modelo en cada punto si no lo tuviera (validación cruzada).'
          : info.hint;
    } else {
      stats.append(el('span', { class: 'gr-stat warn' }, model.msg));
      hint.textContent = info.hint;
    }
    renderTable(); drawPlan(); refreshMarkers(); refreshPreview();
  }

  function finish() {
    dlg.close();
  }
  dlg.addEventListener('close', () => {
    window.removeEventListener('resize', onResize);
    olMap.setTarget(null);
    gr._model = null;
    if (!locked && activeGcps(gr.gcps).length >= methodInfo(gr.method).min) ensureGeorefLayer(app, src);
    const ls = app.state.layers.find((l) => l.def === 'georef' && l.params && l.params.sourceId === src.id);
    if (ls) ls.rev += 1;
    app.commit('layers');
    app.renderLeft();
  }, { once: true });
  const onResize = () => { fitPlan(); olMap.updateSize(); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { fitPlan(); olMap.updateSize(); refit(); if (gr.gcps.some((g) => Number.isFinite(g.lon))) fitTerrain(); });
  setTimeout(() => { olMap.updateSize(); if (gr.gcps.some((g) => Number.isFinite(g.lon))) fitTerrain(); }, 350);
  function fitTerrain() {
    const pts = gr.gcps.filter((g) => Number.isFinite(g.lon)).map((g) => fromLonLat([g.lon, g.lat]));
    if (pts.length < 2) return;
    const ext = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    olMap.getView().fit(ext, { padding: [50, 50, 50, 50], maxZoom: 17, size: olMap.getSize() });
  }
}

// Admite 6.185.123,4 (uso argentino) y 6185123.4
function parseNum(v) {
  let t = String(v || '').trim().replace(/\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  return parseFloat(t);
}
function round1(v) { return Math.round(v * 10) / 10; }
function round7(v) { return Math.round(v * 1e7) / 1e7; }
