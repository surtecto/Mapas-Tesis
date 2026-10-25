// Pestaña Análisis: clasificar valores, geoprocesos, patrón de puntos, medir, perfil topográfico y llamadas.
import Draw from 'ol/interaction/Draw.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { el, clear, uid, downloadBlob } from '../util.js';
import { field, inlineFields, select, check, button, details, text, num } from './forms.js';
import { baseStyle, defOf } from '../catalog.js';
import {
  layerFC, sitesFC, vectorLayers, geomKind, numericFields, METHODS, RAMPS, RAMP_NAMES, rangesFor, rampColors,
  bufferRings, thiessen, hexDensity, kernelBands, countInPolygons, nnIndex, ellipse, measureLength, measureArea, elevationProfile,
} from '../analysis.js';

const fmtGeo = new GeoJSON();

function layerOptions(state, { kinds = null, withSites = false } = {}) {
  const opts = [];
  if (withSites && state.sites.length) opts.push(['__sites__', `Sitios de estudio (${state.sites.length})`]);
  for (const l of vectorLayers(state)) {
    const d = defOf(l);
    const g = l.def === 'user' ? geomKind(l.data || { features: [] }) : d && d.geom;
    if (kinds && g && !kinds.includes(g)) continue;
    opts.push([l.uid, l.name]);
  }
  return opts;
}
function fcOf(app, id) {
  if (id === '__sites__') return sitesFC(app.state);
  const ls = app.state.layers.find((l) => l.uid === id);
  return ls ? layerFC(app, ls) : { type: 'FeatureCollection', features: [] };
}
function nameOf(app, id) { return id === '__sites__' ? 'sitios de estudio' : (app.state.layers.find((l) => l.uid === id) || {}).name || 'capa'; }

// Capa propia con el resultado de un análisis
export function addResultLayer(app, name, fc, style, { legendLabel, note, method } = {}) {
  const g = geomKind(fc) || 'polygon';
  const ls = {
    uid: uid('L'), def: 'user', name, visible: true, opacity: 1, blend: 'normal',
    adjust: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0 }, clip: 'none',
    style: baseStyle(style || {}), params: { analysis: method || '' }, legend: { show: true, label: legendLabel || name }, insets: {}, rev: 0, _styleVersion: 0, data: fc, note: note || '',
  };
  const gi = app.state.layers.findIndex((l) => l.def === 'graticule');
  app.state.layers.splice(gi >= 0 ? gi : app.state.layers.length, 0, ls);
  app.ui.expanded.add(ls.uid);
  app.commit('layers');
  app.keepInside();
  app.toast(`Resultado agregado: ${name} (${fc.features.length} ${g === 'point' ? 'puntos' : g === 'line' ? 'líneas' : 'polígonos'}).`);
  return ls;
}

export function renderAnalysisPanel(app, root) {
  clear(root);
  const st = app.state;
  const ui = app.ui.an || (app.ui.an = {});
  root.append(
    el('div', { class: 'panel-intro' }, el('p', {}, 'Herramientas para leer el territorio con números: clases, áreas de influencia, densidades, patrones de puntos, mediciones y perfiles. Cada resultado se agrega como capa propia y se puede restilizar, exportar y citar.')),
    details('Clasificar una capa por sus valores', ui.open === 'classes', classesTool(app, ui)),
    details('Áreas de influencia', ui.open === 'buffer', bufferTool(app, ui)),
    details('Densidad de puntos', ui.open === 'density', densityTool(app, ui)),
    details('Polígonos de Thiessen', ui.open === 'thiessen', thiessenTool(app, ui)),
    details('Contar puntos en polígonos', ui.open === 'count', countTool(app, ui)),
    details('Patrón de puntos: agrupado o disperso', ui.open === 'pattern', patternTool(app, ui)),
    details('Medir distancias y superficies', ui.open === 'measure', measureTool(app, ui)),
    details('Perfil topográfico', ui.open === 'profile', profileTool(app, ui)),
    details('Llamadas sobre el mapa', ui.open === 'callout', calloutTool(app, ui)),
  );
  root.querySelectorAll('details').forEach((d, i) => d.addEventListener('toggle', () => { if (d.open) ui.open = ['classes', 'buffer', 'density', 'thiessen', 'count', 'pattern', 'measure', 'profile', 'callout'][i]; }));
  void st;
}

// ---------- clasificar ----------
function classesTool(app, ui) {
  const st = app.state;
  const o = ui.cls || (ui.cls = { layer: '', field: '', method: 'jenks', k: 5, ramp: 'tierra', mode: 'color' });
  const opts = layerOptions(st);
  if (!opts.length) return el('p', { class: 'note' }, 'Agregá una capa vectorial (servicios oficiales, datos propios o un resultado de análisis).');
  if (!opts.some(([v]) => v === o.layer)) o.layer = opts[0][0];
  const fieldBox = el('div');
  const info = el('p', { class: 'note' });
  const paintFields = () => {
    clear(fieldBox);
    const fc = fcOf(app, o.layer);
    const nf = numericFields(fc);
    if (!nf.length) { fieldBox.append(el('p', { class: 'note' }, fc.features.length ? 'Esta capa no tiene campos numéricos.' : 'La capa todavía no cargó objetos en la vista.')); return; }
    if (!nf.includes(o.field)) o.field = nf[0];
    const g = geomKind(fc);
    fieldBox.append(field('Campo numérico', select(o, 'field', nf)));
    if (g === 'point') fieldBox.append(field('Representación', select(o, 'mode', [['color', 'Color por clases (coropleta de puntos)'], ['size', 'Símbolos proporcionales al valor']])));
    info.textContent = `${fc.features.length} objetos cargados${geomKind(fc) ? '' : ''}.`;
  };
  paintFields();
  const apply = () => {
    const ls = st.layers.find((l) => l.uid === o.layer);
    if (!ls || !ls.style) return;
    const fc = fcOf(app, o.layer);
    const vals = fc.features.map((f) => Number(f.properties[o.field])).filter(Number.isFinite);
    if (vals.length < 2) { app.toast('No hay valores suficientes para clasificar.', 'warn'); return; }
    if (o.mode === 'size' && geomKind(fc) === 'point') {
      const mx = Math.max(...vals);
      ls.style.point = { ...ls.style.point, sizeField: o.field, sizeMaxValue: mx, sizeMin: 2, sizeMax: 18, fillOpacity: 0.75 };
      ls.style.categorize = { field: '', values: {} };
      app.toast(`Símbolos proporcionales por «${o.field}» (área proporcional al valor; máximo ${mx.toLocaleString('es-AR')}).`);
    } else {
      const ranges = rangesFor(vals, Number(o.k), o.method, o.ramp);
      ls.style.categorize = { field: o.field, mode: 'ranges', values: {}, ranges };
      if (ls.style.point) ls.style.point.sizeField = '';
      if (ls.style.polygon) { ls.style.polygon.fillOpacity = Math.max(0.7, ls.style.polygon.fillOpacity || 0); ls.style.polygon.stroke = '#ffffff'; ls.style.polygon.strokeWidth = 0.2; }
      app.toast(`«${ls.name}» clasificada por «${o.field}»: ${ranges.length} clases (${METHODS.find((m) => m[0] === o.method)[1].toLowerCase()}).`);
    }
    if (ls.legend) { ls.legend.show = true; ls.legend.label = ls.legend.label || ls.name; }
    app.styleChanged(ls);
    app.commit('overlay');
    app.renderLeft();
  };
  const sw = el('div', { class: 'ramp-preview' });
  const paintRamp = () => { clear(sw); rampColors(o.ramp, Number(o.k)).forEach((c) => sw.append(el('span', { style: { background: c } }))); };
  paintRamp();
  return el('div', {},
    el('p', { class: 'note' }, 'Ordena los valores de un campo en clases y las colorea con una rampa secuencial. Los cortes naturales separan donde los datos saltan; los cuantiles reparten la misma cantidad por clase; los intervalos iguales facilitan comparar mapas.'),
    field('Capa', select(o, 'layer', opts, { onChange: paintFields })),
    fieldBox, info,
    inlineFields(field('Método', select(o, 'method', METHODS)), field('Clases', num(o, 'k', { min: 2, max: 9, step: 1, onChange: paintRamp }))),
    field('Rampa', select(o, 'ramp', Object.keys(RAMPS).map((k) => [k, RAMP_NAMES[k]]), { onChange: paintRamp })),
    sw,
    el('div', { class: 'btn-row' }, button('Aplicar a la capa', apply, { kind: 'primary small' })),
  );
}

// ---------- áreas de influencia ----------
function bufferTool(app, ui) {
  const o = ui.buf || (ui.buf = { layer: '', dists: '1, 2, 5' });
  const opts = layerOptions(app.state, { withSites: true });
  if (!opts.length) return el('p', { class: 'note' }, 'Hace falta una capa o sitios de estudio.');
  if (!opts.some(([v]) => v === o.layer)) o.layer = opts[0][0];
  return el('div', {},
    el('p', { class: 'note' }, 'Anillos a distancias fijas alrededor de puntos, líneas o polígonos: radio de acción de un establecimiento, franja ribereña, accesibilidad desde un camino.'),
    field('Alrededor de', select(o, 'layer', opts)),
    field('Distancias (km, separadas por comas)', text(o, 'dists')),
    el('div', { class: 'btn-row' }, button('Calcular', () => {
      const kms = String(o.dists).split(/[;,\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => x > 0).slice(0, 8);
      if (!kms.length) { app.toast('Escribí al menos una distancia en kilómetros.', 'warn'); return; }
      const fc = fcOf(app, o.layer);
      if (!fc.features.length) { app.toast('La capa no tiene objetos cargados en la vista.', 'warn'); return; }
      const res = bufferRings(fc, kms);
      const cols = rampColors('azules', kms.length + 1).slice(1).reverse();
      const ranges = [...kms].sort((a, b) => a - b).map((k, i) => ({ min: k - 1e-9, max: k + 1e-9, color: cols[i], label: `hasta ${k.toLocaleString('es-AR')} km` }));
      addResultLayer(app, `Áreas de influencia (${kms.join(', ')} km) de ${nameOf(app, o.layer)}`, res,
        { polygon: { fill: '#4a90c4', fillOpacity: 0.28, stroke: '#22609c', strokeWidth: 0.4, dash: 'dashed' }, categorize: { field: 'dist_km', mode: 'ranges', values: {}, ranges } },
        { method: 'buffer', legendLabel: 'Áreas de influencia' });
    }, { kind: 'primary small' })),
  );
}

// ---------- densidad ----------
function densityTool(app, ui) {
  const o = ui.den || (ui.den = { layer: '', method: 'hex', cell: 2, bw: 3, levels: 5 });
  const opts = layerOptions(app.state, { kinds: ['point'], withSites: true });
  if (!opts.length) return el('p', { class: 'note' }, 'Hace falta una capa de puntos (o sitios de estudio).');
  if (!opts.some(([v]) => v === o.layer)) o.layer = opts[0][0];
  return el('div', {},
    el('p', { class: 'note' }, 'Dónde se concentran los puntos. Los hexágonos cuentan por celda; el núcleo (kernel) suaviza la cuenta con un radio de influencia y la muestra en bandas.'),
    field('Puntos', select(o, 'layer', opts)),
    field('Método', select(o, 'method', [['hex', 'Hexágonos (conteo por celda)'], ['kde', 'Densidad por núcleo (bandas)']])),
    inlineFields(field('Celda (radio)', num(o, 'cell', { min: 0.1, max: 100, step: 0.1, unit: 'km' })), field('Radio del núcleo', num(o, 'bw', { min: 0.1, max: 200, step: 0.1, unit: 'km' }))),
    el('div', { class: 'btn-row' }, button('Calcular en la vista', () => {
      const fc = fcOf(app, o.layer);
      if (fc.features.length < 3) { app.toast('Hacen falta al menos tres puntos en la vista.', 'warn'); return; }
      const bb = app.viewBBoxLL();
      try {
        if (o.method === 'hex') {
          const res = hexDensity(fc, bb, Number(o.cell));
          const vals = res.features.map((f) => f.properties.n);
          addResultLayer(app, `Puntos por hexágono (${nameOf(app, o.layer)})`, res,
            { polygon: { fill: '#c99b5e', fillOpacity: 0.85, stroke: '#ffffff', strokeWidth: 0.2 }, categorize: { field: 'n', mode: 'ranges', values: {}, ranges: rangesFor(vals, 5, 'jenks', 'rojos') } },
            { method: 'hex', legendLabel: 'Puntos por celda' });
        } else {
          const { fc: res } = kernelBands(fc, bb, Number(o.bw), Number(o.levels) || 5);
          const cols = rampColors('rojos', res.features.length + 1).slice(1);
          const ranges = res.features.map((f, i) => ({ min: f.properties.nivel - 0.5, max: f.properties.nivel + 0.5, color: cols[i], label: `${f.properties.desde.toLocaleString('es-AR')} – ${f.properties.hasta.toLocaleString('es-AR')} pts/km²` }));
          addResultLayer(app, `Densidad por núcleo, radio ${o.bw} km (${nameOf(app, o.layer)})`, res,
            { polygon: { fill: '#d2513a', fillOpacity: 0.6, stroke: '#a42a24', strokeWidth: 0.15 }, categorize: { field: 'nivel', mode: 'ranges', values: {}, ranges } },
            { method: 'kde', legendLabel: 'Densidad (puntos por km²)' });
        }
      } catch (e) { app.toast(`No se pudo calcular: ${e.message}`, 'error'); }
    }, { kind: 'primary small' })),
  );
}

// ---------- Thiessen ----------
function thiessenTool(app, ui) {
  const o = ui.th || (ui.th = { layer: '' });
  const opts = layerOptions(app.state, { kinds: ['point'], withSites: true });
  if (!opts.length) return el('p', { class: 'note' }, 'Hace falta una capa de puntos (o sitios de estudio).');
  if (!opts.some(([v]) => v === o.layer)) o.layer = opts[0][0];
  return el('div', {},
    el('p', { class: 'note' }, 'Divide la vista en el área más cercana a cada punto: una primera hipótesis de áreas de servicio o de influencia (escuelas, postas, estaciones).'),
    field('Puntos', select(o, 'layer', opts)),
    el('div', { class: 'btn-row' }, button('Calcular en la vista', () => {
      try {
        const res = thiessen(fcOf(app, o.layer), app.viewBBoxLL());
        addResultLayer(app, `Polígonos de Thiessen (${nameOf(app, o.layer)})`, res, { polygon: { fill: '#ffffff', fillOpacity: 0, stroke: '#2f5d8c', strokeWidth: 0.5, dash: 'solid' } }, { method: 'thiessen' });
      } catch (e) { app.toast(`No se pudo calcular: ${e.message}`, 'error'); }
    }, { kind: 'primary small' })),
  );
}

// ---------- contar ----------
function countTool(app, ui) {
  const o = ui.cnt || (ui.cnt = { polys: '', pts: '' });
  const po = layerOptions(app.state, { kinds: ['polygon'] });
  const pt = layerOptions(app.state, { kinds: ['point'], withSites: true });
  if (!po.length || !pt.length) return el('p', { class: 'note' }, 'Hacen falta una capa de polígonos y una de puntos.');
  if (!po.some(([v]) => v === o.polys)) o.polys = po[0][0];
  if (!pt.some(([v]) => v === o.pts)) o.pts = pt[0][0];
  return el('div', {},
    el('p', { class: 'note' }, 'Cuenta cuántos puntos caen en cada polígono (por ejemplo, escuelas por radio censal) y calcula la densidad por km². El resultado queda clasificado y se puede reclasificar.'),
    field('Polígonos', select(o, 'polys', po)),
    field('Puntos', select(o, 'pts', pt)),
    el('div', { class: 'btn-row' }, button('Contar', () => {
      const res = countInPolygons(fcOf(app, o.polys), fcOf(app, o.pts));
      if (!res.features.length) { app.toast('No hay polígonos cargados en la vista.', 'warn'); return; }
      const vals = res.features.map((f) => f.properties.n);
      addResultLayer(app, `${nameOf(app, o.pts)} por ${nameOf(app, o.polys)}`, res,
        { polygon: { fill: '#e3c99a', fillOpacity: 0.85, stroke: '#ffffff', strokeWidth: 0.2 }, label: { field: 'n', show: false, size: 6 }, categorize: { field: 'n', mode: 'ranges', values: {}, ranges: rangesFor(vals, 5, 'jenks', 'tierra') } },
        { method: 'count', legendLabel: `Cantidad de ${nameOf(app, o.pts)}` });
    }, { kind: 'primary small' })),
  );
}

// ---------- patrón ----------
function patternTool(app, ui) {
  const o = ui.pat || (ui.pat = { layer: '' });
  const opts = layerOptions(app.state, { kinds: ['point'], withSites: true });
  if (!opts.length) return el('p', { class: 'note' }, 'Hace falta una capa de puntos (o sitios de estudio).');
  if (!opts.some(([v]) => v === o.layer)) o.layer = opts[0][0];
  const out = el('div', { class: 'an-out' });
  return el('div', {},
    el('p', { class: 'note' }, 'El índice de vecino más próximo (Clark y Evans) compara la distancia media al punto más cercano con la esperable si los puntos estuvieran al azar en la vista. La elipse de desvío muestra hacia dónde se orienta la distribución.'),
    field('Puntos', select(o, 'layer', opts)),
    el('div', { class: 'btn-row' },
      button('Vecino más próximo', () => {
        clear(out);
        try {
          const fc = fcOf(app, o.layer);
          const [W, S, E, N] = app.viewBBoxLL();
          const area = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[W, S], [E, S], [E, N], [W, N], [W, S]]] } };
          const r = nnIndex(fc, area);
          const R = r.nearestNeighborIndex;
          const reading = R < 0.85 ? 'agrupado' : R > 1.15 ? 'disperso (regular)' : 'cercano al azar';
          const sig = Math.abs(r.zScore) > 2.58 ? 'muy significativo (p < 0,01)' : Math.abs(r.zScore) > 1.96 ? 'significativo (p < 0,05)' : 'no significativo';
          out.append(el('table', { class: 'stat-table' }, el('tbody', {},
            el('tr', {}, el('td', {}, 'Puntos'), el('td', { class: 'num' }, String(fc.features.length))),
            el('tr', {}, el('td', {}, 'Distancia media observada'), el('td', { class: 'num' }, `${r.observedMeanDistance.toLocaleString('es-AR', { maximumFractionDigits: 2 })} km`)),
            el('tr', {}, el('td', {}, 'Esperada al azar'), el('td', { class: 'num' }, `${r.expectedMeanDistance.toLocaleString('es-AR', { maximumFractionDigits: 2 })} km`)),
            el('tr', {}, el('td', {}, 'Índice R'), el('td', { class: 'num' }, R.toLocaleString('es-AR', { maximumFractionDigits: 3 }))),
            el('tr', {}, el('td', {}, 'Puntaje z'), el('td', { class: 'num' }, r.zScore.toLocaleString('es-AR', { maximumFractionDigits: 2 }))))),
          el('p', { class: 'note' }, `Patrón ${reading}, ${sig}. Ojo: el resultado depende del área de referencia (aquí, la vista del mapa); con otra ventana cambia.`));
        } catch (e) { out.append(el('p', { class: 'warn-note' }, e.message)); }
      }, { kind: 'small' }),
      button('Centro medio y elipse', () => {
        try {
          const res = ellipse(fcOf(app, o.layer));
          addResultLayer(app, `Elipse de desvío estándar (${nameOf(app, o.layer)})`, res,
            { polygon: { fill: '#6a4c93', fillOpacity: 0.12, stroke: '#6a4c93', strokeWidth: 0.7, dash: 'dashed' }, point: { shape: 'cross', size: 7, fill: '#6a4c93', stroke: '#ffffff', strokeWidth: 0.4 } },
            { method: 'ellipse' });
        } catch (e) { app.toast(`No se pudo calcular: ${e.message}`, 'error'); }
      }, { kind: 'small' })),
    out,
  );
}

// ---------- medir ----------
function measureTool(app, ui) {
  const out = el('div', { class: 'an-out' });
  const start = (type) => {
    app.stopAnalysisDraw();
    const draw = new Draw({ source: new VectorSource(), type });
    app.analysisDraw = draw;
    app.mainCtx.map.addInteraction(draw);
    app.toast(type === 'LineString' ? 'Tocá para marcar puntos; doble toque termina la medición.' : 'Tocá para marcar los vértices; doble toque cierra la superficie.');
    draw.on('drawend', (e) => {
      const g = fmtGeo.writeGeometryObject(e.feature.getGeometry(), { featureProjection: app.mainCtx.projection, dataProjection: 'EPSG:4326' });
      const f = { type: 'Feature', properties: {}, geometry: g };
      clear(out);
      if (type === 'LineString') {
        const km = measureLength(f);
        f.properties = { medida: 'distancia', km: Number(km.toFixed(3)) };
        out.append(el('p', {}, el('strong', {}, `${km.toLocaleString('es-AR', { maximumFractionDigits: km < 10 ? 2 : 1 })} km`), ' (distancia geodésica, sobre el elipsoide).'));
      } else {
        const m2 = measureArea(f);
        f.properties = { medida: 'superficie', ha: Number((m2 / 1e4).toFixed(2)), km2: Number((m2 / 1e6).toFixed(4)) };
        out.append(el('p', {}, el('strong', {}, `${(m2 / 1e4).toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha`), ` (${(m2 / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 3 })} km², superficie geodésica).`));
      }
      out.append(el('div', { class: 'btn-row' }, button('Guardar como capa', () => {
        addResultLayer(app, type === 'LineString' ? `Medición: ${f.properties.km} km` : `Medición: ${f.properties.ha} ha`, { type: 'FeatureCollection', features: [f] },
          { line: { color: '#b5523b', width: 0.8, dash: 'dashed' }, polygon: { fill: '#b5523b', fillOpacity: 0.12, stroke: '#b5523b', strokeWidth: 0.8, dash: 'dashed' }, label: { show: true, field: type === 'LineString' ? 'km' : 'ha', size: 6.5 } },
          { method: 'measure' });
      }, { kind: 'small' })));
      setTimeout(() => app.stopAnalysisDraw(), 0);
    });
  };
  return el('div', {},
    el('p', { class: 'note' }, 'Mediciones geodésicas (no dependen de la proyección del mapa). Esc cancela.'),
    el('div', { class: 'btn-row' }, button('Medir distancia', () => start('LineString'), { kind: 'small' }), button('Medir superficie', () => start('Polygon'), { kind: 'small' })),
    out,
  );
}

// ---------- perfil ----------
function profileTool(app, ui) {
  const o = ui.prof || (ui.prof = { title: 'Perfil topográfico A–B', layer: true });
  const out = el('div', { class: 'an-out' });
  const go = () => {
    app.stopAnalysisDraw();
    const draw = new Draw({ source: new VectorSource(), type: 'LineString' });
    app.analysisDraw = draw;
    app.mainCtx.map.addInteraction(draw);
    app.toast('Dibujá el corte: tocá el inicio, los quiebres y doble toque en el final.');
    draw.on('drawend', async (e) => {
      const g = fmtGeo.writeGeometryObject(e.feature.getGeometry(), { featureProjection: app.mainCtx.projection, dataProjection: 'EPSG:4326', decimals: 6 });
      setTimeout(() => app.stopAnalysisDraw(), 0);
      clear(out);
      out.append(el('p', { class: 'note' }, 'Leyendo el modelo de elevación…'));
      try {
        const prof = await elevationProfile(g.coordinates);
        const zs = prof.points.map((p) => p[1]);
        const zmin = Math.min(...zs), zmax = Math.max(...zs);
        clear(out);
        out.append(el('p', {}, `${prof.total.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km; cotas entre ${Math.round(zmin)} y ${Math.round(zmax)} m (desnivel ${Math.round(zmax - zmin)} m).`));
        const st = app.state;
        const f = app.frameSize();
        const w = Math.round(Math.min(110, f.w * 0.62)), h = Math.round(Math.max(28, w * 0.36));
        const chart = {
          id: uid('G'), kind: 'profile', x: Math.round((f.x + f.w - w - 3) * 10) / 10, y: Math.round((f.y + f.h - h - 3) * 10) / 10, w, h, title: o.title, labelA: 'A', labelB: 'B',
          data: prof.points.map((p) => [Number(p[0].toFixed(3)), Number(p[1].toFixed(1))]), line: '#5b3a1e', fill: '#c9b48f', size: 6, font: st.legend.font || 'Source Sans 3', bg: true,
          source: 'Modelo de elevación Terrarium (Mapzen/AWS, a partir de SRTM y otros)', coords: g.coordinates,
        };
        st.charts.push(chart);
        if (o.layer) {
          const ln = { type: 'Feature', properties: { nombre: '', titulo: o.title }, geometry: g };
          const ends = [g.coordinates[0], g.coordinates[g.coordinates.length - 1]].map((c, i) => ({ type: 'Feature', properties: { nombre: i ? 'B' : 'A' }, geometry: { type: 'Point', coordinates: c } }));
          addResultLayer(app, `Corte ${o.title}`, { type: 'FeatureCollection', features: [ln, ...ends] },
            { line: { color: '#5b3a1e', width: 0.9, dash: 'solid' }, point: { shape: 'circle', size: 3.5, fill: '#5b3a1e', stroke: '#ffffff', strokeWidth: 0.5 }, label: { show: true, field: 'nombre', size: 7, bold: true, offsetY: -5 } },
            { method: 'profile', legendLabel: 'Corte del perfil' });
        }
        app.select({ kind: 'chart', id: chart.id });
        app.commit('overlay');
        app.toast('Perfil agregado a la figura: se arrastra y se edita como cualquier elemento.');
      } catch (err) { clear(out); out.append(el('p', { class: 'warn-note' }, `No se pudo leer la elevación: ${err.message}`)); }
    });
  };
  return el('div', {},
    el('p', { class: 'note' }, 'Dibujá un corte sobre el mapa: el perfil se agrega a la figura con su exageración vertical calculada y rotulada, para que la llanura no parezca una sierra ni una mesa.'),
    field('Título', text(o, 'title')),
    check(o, 'layer', 'Dibujar también el corte A–B en el mapa'),
    el('div', { class: 'btn-row' }, button('Dibujar el corte', go, { kind: 'primary small' })),
    out,
  );
}

// ---------- llamadas ----------
function calloutTool(app) {
  return el('div', {},
    el('p', { class: 'note' }, 'Un texto con una línea fina que señala un punto del mapa: para nombrar lo que no tiene rótulo propio, explicar un detalle o marcar una observación de campo.'),
    el('div', { class: 'btn-row' }, button('Agregar una llamada', () => app.setMode('add-callout'), { kind: 'primary small' })),
    el('p', { class: 'note' }, 'Después de tocar el punto, el texto queda seleccionado: escribí, movelo o cambiá su estilo en el panel de la derecha.'),
  );
}

export function exportAnalysisCSV(rows, name) { downloadBlob(new Blob(['﻿' + rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv' }), name); }
