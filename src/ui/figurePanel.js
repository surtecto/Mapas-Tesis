// Panel de figura: página, vista, elementos de composición, zooms, textos, epígrafe y plantillas
import { el, clear, fmtInt, roundScale, formatDMS } from '../util.js';
import { field, inlineFields, num, color, select, check, button, details, text } from './forms.js';
import { PAGE_PRESETS, newInset, newText } from '../state.js';
import { TEMPLATES } from '../templates.js';
import { rotationForMeridian, projInfo } from '../projections.js';
import { frameRect } from '../overlay.js';
import { buildCaption } from '../caption.js';
import { MEDIA, QUALITIES, getMedia, applyMediaPage, checkLegibility, fitToMedia, exportDpi, SIMULATIONS } from '../media.js';

const TEXT_PRESETS = [
  { name: 'Título', t: { text: 'Título del mapa', size: 12, bold: true, align: 'center' } },
  { name: 'Mar u océano', t: { text: 'Mar de Weddell', size: 9, italic: true, uppercase: true, letterSpacing: 0.35, color: '#2f6f9f', halo: '#ffffff', haloWidth: 0.8, anchor: 'geo' } },
  { name: 'Región', t: { text: 'Península Antártica', size: 7.5, uppercase: true, letterSpacing: 0.25, color: '#33414d', halo: '#ffffff', haloWidth: 0.9, anchor: 'geo' } },
  { name: 'Rótulo', t: { text: 'Rótulo', size: 7, color: '#1d2b38', halo: '#ffffff', haloWidth: 1, anchor: 'geo' } },
  { name: 'Fig. N', t: { text: 'Fig. 1', size: 14, bold: true, align: 'left' } },
  { name: 'Fuentes', t: { text: 'Fuentes: IGN; SCAR ADD; REMA/IBCSO', size: 5.5, color: '#4a5560', align: 'left' } },
];

export function renderFigurePanel(app, root) {
  clear(root);
  const st = app.state;
  root.append(
    details('Destino de la figura: dónde se va a ver', true, mediaEditor(app)),
    details('Página y tamaño de la figura', false, pageEditor(app)),
    details('Vista del mapa', true, viewEditor(app)),
    details('Elementos', true, elementsEditor(app)),
    details(`Zooms y mapas de ubicación (${st.insets.length})`, true, insetsEditor(app)),
    details(`Textos (${st.texts.length})`, true, textsEditor(app)),
    details('Epígrafe y fuentes', false, captionEditor(app)),
    details('Modelos de ejemplo', false, templatesEditor(app)),
  );
}

function mediaEditor(app) {
  const st = app.state;
  const m = getMedia(st.media.profileId);
  const groups = [...new Set(MEDIA.map((x) => x.group))];
  const sel = el('select', {});
  for (const g of groups) {
    const og = el('optgroup', { label: g });
    for (const x of MEDIA.filter((y) => y.group === g)) og.append(el('option', { value: x.id, selected: x.id === m.id }, x.name));
    sel.append(og);
  }
  sel.addEventListener('change', () => {
    st.media.profileId = sel.value;
    st.media.quality = 'estandar';
    const nm = getMedia(sel.value);
    applyMediaPage(st, nm, { relayout: true });
    app.commit('page'); app.commit('view'); app.buildInsets(); app.renderLeft(); app.keepInside();
    app.toast(`Destino: ${nm.name}. La hoja ahora mide ${nm.page.w.toFixed(1).replace('.', ',')} × ${nm.page.h.toFixed(1).replace('.', ',')} mm; reacomodá los elementos si hace falta.`);
  });
  const dpi = exportDpi(st);
  const px = [Math.round((st.page.widthMM / 25.4) * dpi), Math.round((st.page.heightMM / 25.4) * dpi)];
  const q = select(st.media, 'quality', (QUALITIES[m.kind] || []).map((x) => [x[0], x[1]]), { onChange: () => app.renderLeft() });
  const res = checkLegibility(st);
  const issues = el('ul', { class: 'legib' });
  res.issues.slice(0, 12).forEach((i) => issues.append(el('li', { class: i.level }, el('strong', {}, i.what), ': ', i.msg)));
  const sizeOk = Math.abs(st.page.widthMM - m.page.w) < 0.5 && Math.abs(st.page.heightMM - m.page.h) < 0.5;
  return el('div', {},
    field('Destino', sel),
    m.notes ? el('p', { class: 'note' }, m.notes) : null,
    inlineFields(field('Calidad', q), el('div', { class: 'field' }, el('span', { class: 'label-spacer' }), el('span', { class: 'media-px' }, `${px[0]} × ${px[1]} px · ${String(Math.round(dpi * 10) / 10).replace('.', ',')} ppp`))),
    !sizeOk ? el('div', { class: 'btn-row' }, el('span', { class: 'hint' }, `La hoja (${fmt(st.page.widthMM)} × ${fmt(st.page.heightMM)} mm) no es la del destino.`), button('Usar el tamaño del destino', () => { applyMediaPage(st, m, { relayout: true }); app.commit('page'); app.commit('view'); app.buildInsets(); app.renderLeft(); app.keepInside(); }, { kind: 'small' })) : null,
    el('h3', { class: 'sub-h' }, res.issues.length ? `Legibilidad: ${res.issues.length} ${res.issues.length === 1 ? 'aviso' : 'avisos'}` : 'Legibilidad: todo dentro de los mínimos'),
    res.issues.length ? issues : el('p', { class: 'ok-note' }, m.kind === 'print' ? `Textos ≥ ${fmt(res.minText)} pt, líneas ≥ ${fmt(res.minLine)} pt.` : `Textos ≥ ${m.min.textPx} px, líneas ≥ ${m.min.linePx} px.`),
    res.issues.length ? el('div', { class: 'btn-row' }, button('Ajustar al destino', () => {
      fitToMedia(st);
      app.refreshAll();
      app.keepInside();
      app.toast('Ajustado: lo más chico llega al mínimo del destino y lo demás crece en proporción, conservando la jerarquía. Revisá que la leyenda siga entrando.');
    }, { kind: 'small primary' })) : null,
    el('h3', { class: 'sub-h' }, 'Color y simulación'),
    inlineFields(
      field('Salida', select(st.render, 'colorMode', [['color', 'Color'], ['grises', 'Escala de grises']], { onChange: () => { app.applyPreviewFilter(); app.renderLeft(); } })),
      field('Ver como…', select(st.render, 'simulate', SIMULATIONS, { onChange: () => app.applyPreviewFilter() }))),
    st.render.colorMode === 'grises' ? el('p', { class: 'note' }, 'La exportación sale en grises (PNG, TIFF y PDF en escala de grises). Para que las categorías se distingan sin color, el estilo «Blanco y negro para imprimir» usa tramas y luminosidades separadas.') : null,
  );
}
function fmt(v) { return (Math.round(v * 100) / 100).toString().replace('.', ','); }

function pageEditor(app) {
  const p = app.state.page;
  const ch = () => app.commit('page');
  const presetObj = { v: PAGE_PRESETS.find((x) => x.id === p.preset) ? p.preset : 'custom' };
  const sel = select(presetObj, 'v', [['custom', 'Personalizado'], ...PAGE_PRESETS.map((x) => [x.id, x.name])], {
    onChange: (v) => {
      const pr = PAGE_PRESETS.find((x) => x.id === v);
      if (pr) { p.widthMM = pr.w; p.heightMM = pr.h; }
      p.preset = v;
      ch(); app.renderLeft();
    },
  });
  const custom = () => { p.preset = 'custom'; ch(); };
  const m = p.margins;
  return el('div', {},
    field('Formato', sel),
    inlineFields(field('Ancho', num(p, 'widthMM', { min: 30, max: 1200, step: 1, unit: 'mm', onChange: custom })), field('Alto', num(p, 'heightMM', { min: 30, max: 1200, step: 1, unit: 'mm', onChange: custom }))),
    el('div', { class: 'btn-row' }, button('Girar orientación', () => { [p.widthMM, p.heightMM] = [p.heightMM, p.widthMM]; p.preset = 'custom'; ch(); app.renderLeft(); }, { kind: 'small' })),
    el('p', { class: 'hint' }, 'Márgenes: espacio fuera del marco del mapa para los rótulos de coordenadas.'),
    inlineFields(field('Superior', num(m, 'top', { min: 0, max: 60, step: 0.5, unit: 'mm', onChange: ch })), field('Inferior', num(m, 'bottom', { min: 0, max: 60, step: 0.5, unit: 'mm', onChange: ch }))),
    inlineFields(field('Izquierdo', num(m, 'left', { min: 0, max: 60, step: 0.5, unit: 'mm', onChange: ch })), field('Derecho', num(m, 'right', { min: 0, max: 60, step: 0.5, unit: 'mm', onChange: ch }))),
    inlineFields(field('Fondo (océano / papel)', color(p, 'background', { onChange: ch })), field('Marco', el('div', { class: 'check-row' }, check(p.frame, 'show', 'Mostrar', { onChange: ch })))),
    inlineFields(field('Color del marco', color(p.frame, 'color', { onChange: ch })), field('Grosor', num(p.frame, 'width', { min: 0, max: 4, step: 0.1, unit: 'pt', onChange: ch }))),
  );
}

function viewEditor(app) {
  const st = app.state;
  const info = app.currentScaleInfo();
  const scaleObj = { n: info ? Math.round(roundScale(info.rf)) : 0 };
  const rotObj = { deg: Math.round(((st.view.rotation || 0) * 180) / Math.PI * 10) / 10 };
  const centerObj = { lat: Number(st.view.center[1].toFixed(4)), lon: Number(st.view.center[0].toFixed(4)) };
  const pi = projInfo(st.projection);
  const merObj = { lon: -60 };
  return el('div', {},
    el('p', { class: 'note' }, pi.detail),
    inlineFields(
      field('Escala (1:N, a tamaño de impresión)', num(scaleObj, 'n', { min: 1000, max: 500000000, step: 1000, onChange: (v) => {
        const cur = app.currentScaleInfo();
        if (cur && cur.rf > 0) { st.view.mpm *= v / cur.rf; app.commit('view'); app.renderLeft(); }
      } }))),
    info && info.variation > 0.08 ? el('p', { class: 'warn-note' }, `La escala varía ${Math.round(info.variation * 100)}% dentro del mapa: la escala gráfica vale cerca de donde está ubicada.`) : null,
    inlineFields(field('Latitud del centro', num(centerObj, 'lat', { min: -90, max: 90, step: 0.01, unit: '°', onChange: (v) => { st.view.center = [st.view.center[0], v]; app.commit('view'); } })),
      field('Longitud del centro', num(centerObj, 'lon', { min: -180, max: 180, step: 0.01, unit: '°', onChange: (v) => { st.view.center = [v, st.view.center[1]]; app.commit('view'); } }))),
    inlineFields(field('Rotación', num(rotObj, 'deg', { min: -180, max: 180, step: 0.5, unit: '°', onChange: (v) => { st.view.rotation = (v * Math.PI) / 180; app.commit('view'); } })),
      field('Meridiano hacia arriba', el('span', { class: 'inline-pair' }, num(merObj, 'lon', { min: -180, max: 180, step: 1, unit: '°' }),
        button('Orientar', () => { st.view.rotation = rotationForMeridian(app.mainCtx.projection, merObj.lon, st.view.center[1]); app.commit('view'); app.renderLeft(); }, { kind: 'small' })))),
    el('div', { class: 'btn-row wrap' },
      button('Península Antártica', () => { app.flyTo([-61, -66], 9000); }, { kind: 'small' }),
      button('Norte de la península', () => { app.flyTo([-58, -63.6], 2600); }, { kind: 'small' }),
      button('Sector Antártico', () => { app.flyTo([-50, -72], 16000); }, { kind: 'small' }),
      button('Antártida completa', () => { app.flyTo([0, -90], 30000, 0); }, { kind: 'small' }),
      button('Argentina bicontinental', () => { app.flyTo([-58, -55], 40000, 0); }, { kind: 'small' }),
      button('Pago Gilense', () => { app.flyTo([-59.47, -34.435], 330, 0); }, { kind: 'small' }),
      button('Provincia de Buenos Aires', () => { app.flyTo([-60.5, -37], 4200, 0); }, { kind: 'small' })),
  );
}

function elementsEditor(app) {
  const st = app.state;
  const ch = () => app.commit('overlay');
  const grat = st.layers.find((l) => l.def === 'graticule');
  const sel = (kind, id) => button('Editar', () => app.select({ kind, id }), { kind: 'small ghost' });
  return el('div', { class: 'elements' },
    el('div', { class: 'el-row' }, check(st.legend, 'show', 'Leyenda', { onChange: ch }), sel('legend', 'legend')),
    el('div', { class: 'el-row' }, check(st.north, 'show', 'Flecha de norte', { onChange: ch }), sel('north', 'north')),
    el('div', { class: 'el-row' }, check(st.scalebar, 'show', 'Escala gráfica', { onChange: ch }), sel('scale', 'scale')),
    grat ? el('div', { class: 'el-row' }, check(grat, 'visible', 'Grilla de coordenadas', { onChange: () => app.commit('layers') }),
      button('Editar', () => { app.ui.expanded.add(grat.uid); app.showTab('capas'); }, { kind: 'small ghost' })) : null,
  );
}

function insetsEditor(app) {
  const st = app.state;
  const list = el('ul', { class: 'mini-list' });
  for (const z of st.insets) {
    list.append(el('li', {},
      el('button', { type: 'button', class: 'mini-item', onclick: () => app.select({ kind: 'inset', id: z.id }) }, `${z.name} · ${z.mode === 'detail' ? 'detalle' : 'ubicación'}`),
      el('button', { type: 'button', class: 'icon ghost', title: 'Eliminar', 'aria-label': `Eliminar ${z.name}`, onclick: () => { st.insets = st.insets.filter((x) => x !== z); app.select(null); app.commit('insets'); app.renderLeft(); } }, '×')));
  }
  const f = frameRect(st);
  const addDetail = button('Agregar zoom de detalle', () => {
    const d = Math.min(f.w, f.h) * 0.42;
    const z = newInset({ name: `Zoom ${st.insets.length + 1}`, x: f.x + f.w - d - 6, y: f.y + 6, w: d, h: d, center: st.view.center.slice(), mpm: st.view.mpm / 4 });
    st.insets.push(z);
    app.commit('insets'); app.select({ kind: 'inset', id: z.id }); app.renderLeft();
    app.toast('Arrastrá el círculo chico del mapa para elegir qué se amplía. Dentro del zoom: arrastrar desplaza y la rueda acerca.');
  }, { kind: 'small primary' });
  const addContext = button('Agregar mapa de ubicación bicontinental', () => {
    const w = Math.min(f.w, f.h) * 0.32, h = w * 1.25;
    const z = newInset({
      name: 'Ubicación bicontinental', mode: 'context', shape: 'rect', x: f.x + 5, y: f.y + 5, w, h, center: [-58, -55], mpm: 36000 * (60 / w),
      projection: 'CONI:BICONT', bg: '#f3f3f3', border: { color: '#1d1d1d', width: 0.5, dash: 'solid' }, connector: { type: 'none', color: '#1d1d1d', width: 0.5, dash: 'solid' },
    });
    z.layers = {};
    st.layers.forEach((l) => { z.layers[l.uid] = l.def === 'ne-paises' || l.def === 'add-costa' || l.def === 'ref-sector'; });
    if (!st.layers.some((l) => l.def === 'ne-paises')) app.toast('Sugerencia: agregá la capa «Países (Natural Earth, vista argentina)» para ver el continente en el mapa de ubicación.');
    st.insets.push(z);
    app.commit('insets'); app.select({ kind: 'inset', id: z.id }); app.renderLeft();
  }, { kind: 'small' });
  return el('div', {}, list, el('div', { class: 'btn-row wrap' }, addDetail, addContext));
}

function textsEditor(app) {
  const st = app.state;
  const list = el('ul', { class: 'mini-list' });
  for (const t of st.texts) {
    list.append(el('li', {},
      el('button', { type: 'button', class: 'mini-item', onclick: () => app.select({ kind: 'text', id: t.id }) }, t.text.split('\n')[0] || '(vacío)'),
      el('button', { type: 'button', class: 'icon ghost', title: 'Eliminar', 'aria-label': 'Eliminar texto', onclick: () => { st.texts = st.texts.filter((x) => x !== t); app.select(null); app.commit('overlay'); app.renderLeft(); } }, '×')));
  }
  const row = el('div', { class: 'btn-row wrap' });
  for (const p of TEXT_PRESETS) {
    row.append(button(p.name, () => {
      const f = frameRect(st);
      const center = [f.x + f.w / 2, f.y + f.h / 2];
      const t = newText({ ...p.t, x: p.t.align === 'left' ? f.x + 8 : center[0], y: p.name === 'Fig. N' || p.name === 'Fuentes' ? f.y + f.h - 6 : p.name === 'Título' ? f.y + 8 : center[1] });
      if (t.anchor === 'geo') { t.lon = st.view.center[0]; t.lat = st.view.center[1]; }
      if (p.name === 'Fuentes') t.text = `Fuentes: ${app.sourcesShort()}`;
      st.texts.push(t);
      app.commit('overlay'); app.select({ kind: 'text', id: t.id }); app.renderLeft();
    }, { kind: 'small' }));
  }
  return el('div', {}, list, el('p', { class: 'hint' }, 'Agregar texto:'), row);
}

function captionEditor(app) {
  const st = app.state;
  const out = el('textarea', { rows: 9, class: 'caption-out', readonly: true });
  const refresh = () => { out.value = buildCaption(st); };
  refresh();
  if (st.caption.withSites === undefined) st.caption.withSites = true;
  return el('div', {},
    field('Rótulo de la figura', text(st.caption, 'figure', { onChange: refresh })),
    field('Descripción', text(st.caption, 'lead', { multiline: true, rows: 3, onChange: refresh })),
    el('div', { class: 'check-row' }, check(st.caption, 'withSites', 'Incluir coordenadas de los sitios', { onChange: refresh }), check(st.caption, 'withNotes', 'Incluir notas de los sitios', { onChange: refresh })),
    field('Epígrafe generado (proyección, datum y fuentes de las capas visibles)', out),
    el('div', { class: 'btn-row' }, button('Copiar epígrafe', async () => {
      try { await navigator.clipboard.writeText(out.value); app.toast('Epígrafe copiado.'); } catch (e) { out.select(); app.toast('Seleccioné el texto: copialo con Ctrl+C.'); }
    }, { kind: 'small primary' })),
  );
}

function templatesEditor(app) {
  const box = el('div', { class: 'templates' });
  for (const t of TEMPLATES) {
    box.append(el('div', { class: 'tpl' }, el('span', {}, t.name), button('Usar', () => app.loadTemplate(t.id), { kind: 'small' })));
  }
  box.append(el('p', { class: 'hint' }, 'Usar una plantilla reemplaza el proyecto actual (podés deshacer con Ctrl+Z).'));
  return box;
}
