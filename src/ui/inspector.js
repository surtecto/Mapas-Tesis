// Inspector: propiedades del elemento seleccionado
import { el, clear, uid } from '../util.js';
import { field, inlineFields, num, color, select, check, range, button, details, text } from './forms.js';
import { FONTS } from '../catalog.js';
import { DASH_OPTIONS, SHAPES } from '../styles.js';
import { PROJECTIONS } from '../projections.js';
import { legendItems } from '../overlay.js';
import { siteBody } from './sitesPanel.js';
import { featureEditor } from './interpPanel.js';

const ALIGN = [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']];

export function renderInspector(app, root) {
  clear(root);
  const sel = app.selection;
  const st = app.state;
  if (!sel) {
    root.append(
      el('h2', { class: 'insp-title' }, 'Edición'),
      el('p', { class: 'insp-empty' }, 'Tocá un elemento de la figura para editarlo: textos, leyenda, flecha de norte, escala, zooms o sitios.'),
      el('ul', { class: 'tips' },
        el('li', {}, 'Arrastrá el mapa para encuadrar; la rueda acerca y aleja.'),
        el('li', {}, 'El borde de un zoom lo mueve por la hoja; el interior desplaza su contenido.'),
        el('li', {}, 'El círculo chico sobre el mapa marca qué se amplía: arrastralo para cambiar el área.'),
        el('li', {}, 'Los sitios se arrastran para corregir su posición.'),
        el('li', {}, 'Supr borra el elemento seleccionado; las flechas lo desplazan 0,5 mm (con Mayús, 5 mm).'),
        el('li', {}, 'Ctrl+Z deshace; Ctrl+Mayús+Z rehace.'),
        el('li', {}, 'En la pestaña Interpretación, los trazos dibujados se tocan para editar su nombre, período, fuente y certeza.')),
    );
    return;
  }
  const title = (t, onDelete) => el('div', { class: 'insp-head' }, el('h2', { class: 'insp-title' }, t),
    onDelete ? button('Eliminar', onDelete, { kind: 'small danger' }) : null,
    button('Cerrar', () => app.select(null), { kind: 'small ghost' }));
  if (sel.kind === 'text') {
    const t = st.texts.find((x) => x.id === sel.id);
    if (!t) return;
    root.append(title('Texto', () => { st.texts = st.texts.filter((x) => x !== t); app.select(null); app.commit('overlay'); app.renderLeft(); }), textEditor(app, t));
  } else if (sel.kind === 'legend') root.append(title('Leyenda'), legendEditor(app));
  else if (sel.kind === 'north') root.append(title('Flecha de norte'), northEditor(app));
  else if (sel.kind === 'scale') root.append(title('Escala gráfica'), scaleEditor(app));
  else if (sel.kind === 'inset') {
    const z = st.insets.find((x) => x.id === sel.id);
    if (!z) return;
    root.append(title(z.mode === 'detail' ? 'Zoom de detalle' : 'Mapa de ubicación', () => { st.insets = st.insets.filter((x) => x !== z); app.select(null); app.commit('insets'); app.renderLeft(); }), insetEditor(app, z));
  } else if (sel.kind === 'interp') {
    root.append(title('Elemento de interpretación'), featureEditor(app, sel.id));
  } else if (sel.kind === 'site') {
    const s = st.sites.find((x) => x.id === sel.id);
    if (!s) return;
    root.append(title('Sitio de estudio'), siteBody(app, s));
  }
}

function textEditor(app, t) {
  const ch = () => app.commit('overlay');
  const live = () => app.commit('overlay', { history: false });
  const ta = text(t, 'text', { multiline: true, rows: 3, onInput: live, onChange: ch });
  ta.setAttribute('data-focus', 'text');
  return el('div', {},
    field('Contenido (Enter = nueva línea)', ta),
    inlineFields(field('Tipografía', select(t, 'font', FONTS, { onChange: ch })), field('Tamaño', num(t, 'size', { min: 3, max: 96, step: 0.5, unit: 'pt', onChange: ch }))),
    inlineFields(field('Color', color(t, 'color', { onChange: ch, onInput: live })), field('Alineación', select(t, 'align', ALIGN, { onChange: ch }))),
    el('div', { class: 'check-row' }, check(t, 'bold', 'Negrita', { onChange: ch }), check(t, 'italic', 'Cursiva', { onChange: ch }), check(t, 'uppercase', 'Mayúsculas', { onChange: ch })),
    inlineFields(field('Espaciado entre letras', num(t, 'letterSpacing', { min: 0, max: 2, step: 0.05, unit: 'em', onChange: ch })), field('Interlineado', num(t, 'lineHeight', { min: 0.8, max: 3, step: 0.05, unit: '×', onChange: ch }))),
    field('Rotación', range(t, 'rotation', { min: -180, max: 180, step: 1, onInput: live, onChange: ch, format: (v) => `${v}°` })),
    inlineFields(field('Halo', color(t, 'halo', { onChange: ch })), field('Grosor del halo', num(t, 'haloWidth', { min: 0, max: 5, step: 0.1, unit: 'pt', onChange: ch }))),
    details('Recuadro de fondo', !!t.bg.show,
      check(t.bg, 'show', 'Mostrar recuadro', { onChange: ch }),
      inlineFields(field('Color', color(t.bg, 'color', { onChange: ch })), field('Opacidad', range(t.bg, 'opacity', { onChange: ch, onInput: live, format: (v) => `${Math.round(v * 100)}%` }))),
      inlineFields(field('Relleno interno', num(t.bg, 'pad', { min: 0, max: 10, step: 0.2, unit: 'mm', onChange: ch })), field('Esquinas', num(t.bg, 'radius', { min: 0, max: 10, step: 0.2, unit: 'mm', onChange: ch })))),
    field('Anclaje', select(t, 'anchor', [['page', 'A la hoja (queda fijo al mover el mapa)'], ['geo', 'Al mapa (sigue a una coordenada)']], {
      onChange: (v) => {
        if (v === 'geo') { const ll = app.pageToLonLat([t.x, t.y]); if (ll) { t.lon = ll[0]; t.lat = ll[1]; } }
        else { const p = app.lonLatToPage([t.lon, t.lat]); if (p) { t.x = p[0]; t.y = p[1]; } }
        ch(); app.renderInspector();
      },
    })),
    t.anchor === 'page'
      ? inlineFields(field('X', num(t, 'x', { step: 0.5, unit: 'mm', onChange: ch })), field('Y', num(t, 'y', { step: 0.5, unit: 'mm', onChange: ch })))
      : inlineFields(field('Latitud', num(t, 'lat', { min: -90, max: 90, step: 0.01, unit: '°', onChange: ch })), field('Longitud', num(t, 'lon', { min: -180, max: 180, step: 0.01, unit: '°', onChange: ch }))),
  );
}

function legendEditor(app) {
  const L = app.state.legend;
  const ch = () => app.commit('overlay');
  const items = legendItems(app.state);
  const list = el('ul', { class: 'legend-items' });
  items.forEach((it, i) => {
    const ov = L.overrides[it.key] || (L.overrides[it.key] = {});
    if (ov.label == null) ov.label = it.label;
    const vis = { v: !ov.hidden };
    list.append(el('li', {},
      check(vis, 'v', '', { onChange: (v) => { ov.hidden = !v; ch(); } }),
      text(ov, 'label', { onChange: ch }),
      el('button', { type: 'button', class: 'icon ghost', title: 'Subir', 'aria-label': 'Subir', onclick: () => {
        const keys = items.map((x) => x.key);
        if (i > 0) { [keys[i - 1], keys[i]] = [keys[i], keys[i - 1]]; L.order = keys; ch(); app.renderInspector(); }
      } }, '↑')));
  });
  const customDraft = { label: 'Nuevo elemento', kind: 'point', color: '#444444', shape: 'circle' };
  return el('div', {},
    field('Título', text(L, 'title', { placeholder: 'Opcional', onChange: ch })),
    field('Elementos (desmarcá para ocultar, editá el texto)', list),
    details('Agregar elemento propio', false,
      field('Texto', text(customDraft, 'label')),
      inlineFields(field('Tipo', select(customDraft, 'kind', [['point', 'Punto'], ['line', 'Línea'], ['polygon', 'Área']])), field('Color', color(customDraft, 'color'))),
      field('Forma (puntos)', select(customDraft, 'shape', SHAPES)),
      button('Agregar', () => {
        const sym = customDraft.kind === 'point' ? { type: 'point', cfg: { shape: customDraft.shape, size: 6, fill: customDraft.color, fillOpacity: 1, stroke: '#ffffff', strokeWidth: 0.6 } }
          : customDraft.kind === 'line' ? { type: 'line', line: { color: customDraft.color, width: 0.8, dash: 'solid', opacity: 1 } }
            : { type: 'polygon', pg: { fill: customDraft.color, fillOpacity: 0.5, pattern: 'none', stroke: customDraft.color, strokeWidth: 0.5, strokeOpacity: 1, dash: 'solid' } };
        L.custom.push({ id: uid('LG'), label: customDraft.label, sym });
        ch(); app.renderInspector();
      }, { kind: 'small' })),
    inlineFields(field('Tipografía', select(L, 'font', FONTS, { onChange: ch })), field('Tamaño', num(L, 'size', { min: 4, max: 30, step: 0.5, unit: 'pt', onChange: ch }))),
    inlineFields(field('Color de texto', color(L, 'color', { onChange: ch })), field('Símbolos', num(L, 'symbolSize', { min: 3, max: 30, step: 0.5, unit: 'pt', onChange: ch }))),
    el('div', { class: 'check-row' }, check(L, 'bold', 'Texto en negrita', { onChange: ch })),
    inlineFields(field('Fondo', color(L, 'bg', { onChange: ch })), field('Opacidad', range(L, 'bgOpacity', { onChange: ch, onInput: () => app.commit('overlay', { history: false }), format: (v) => `${Math.round(v * 100)}%` }))),
    inlineFields(field('Borde', color(L, 'border', { onChange: ch })), field('Grosor', num(L, 'borderWidth', { min: 0, max: 4, step: 0.1, unit: 'pt', onChange: ch }))),
    inlineFields(field('Esquinas', num(L, 'radius', { min: 0, max: 10, step: 0.2, unit: 'mm', onChange: ch })), field('Margen interno', num(L, 'padding', { min: 0, max: 12, step: 0.2, unit: 'mm', onChange: ch }))),
    inlineFields(field('Columnas', num(L, 'columns', { min: 1, max: 4, step: 1, onChange: ch })), field('Separación', num(L, 'gap', { min: 0, max: 10, step: 0.2, unit: 'mm', onChange: ch }))),
    inlineFields(field('X', num(L, 'x', { step: 0.5, unit: 'mm', onChange: ch })), field('Y', num(L, 'y', { step: 0.5, unit: 'mm', onChange: ch }))),
  );
}

function northEditor(app) {
  const n = app.state.north;
  const ch = () => app.commit('overlay');
  return el('div', {},
    field('Estilo', select(n, 'style', [['circle', 'Círculo con N (modelo 1)'], ['arrow', 'Flecha llena'], ['half', 'Flecha bicolor'], ['line', 'Flecha con línea'], ['rose', 'Rosa de los vientos']], { onChange: ch })),
    inlineFields(field('Tamaño', num(n, 'size', { min: 4, max: 60, step: 0.5, unit: 'mm', onChange: ch })), field('Color', color(n, 'color', { onChange: ch }))),
    inlineFields(field('Fondo', color(n, 'bg', { onChange: ch })), field('Opacidad del fondo', range(n, 'bgOpacity', { onChange: ch, format: (v) => `${Math.round(v * 100)}%` }))),
    check(n, 'trueNorth', 'Norte verdadero en la posición de la flecha', { onChange: ch }),
    el('p', { class: 'hint' }, 'En proyecciones polares los meridianos convergen: la flecha apunta al norte geográfico en el lugar donde la ubicás.'),
    inlineFields(field('X (centro)', num(n, 'x', { step: 0.5, unit: 'mm', onChange: ch })), field('Y (centro)', num(n, 'y', { step: 0.5, unit: 'mm', onChange: ch }))),
  );
}

function scaleEditor(app) {
  const sb = app.state.scalebar;
  const ch = () => app.commit('overlay');
  return el('div', {},
    field('Estilo', select(sb, 'style', [['alternating', 'Bloques alternados'], ['double', 'Doble trazo'], ['line', 'Línea con marcas']], { onChange: ch })),
    inlineFields(field('Unidades', select(sb, 'units', [['km', 'Kilómetros'], ['m', 'Metros'], ['nmi', 'Millas náuticas']], { onChange: ch })), field('Segmentos', num(sb, 'segments', { min: 1, max: 8, step: 1, onChange: ch }))),
    inlineFields(field('Largo máximo', num(sb, 'lengthMM', { min: 8, max: 200, step: 1, unit: 'mm', onChange: ch })), field('Alto', num(sb, 'height', { min: 0.4, max: 6, step: 0.1, unit: 'mm', onChange: ch }))),
    inlineFields(field('Tipografía', select(sb, 'font', FONTS, { onChange: ch })), field('Tamaño', num(sb, 'size', { min: 3, max: 20, step: 0.5, unit: 'pt', onChange: ch }))),
    inlineFields(field('Color', color(sb, 'color', { onChange: ch })), field('Fondo', color(sb, 'bg', { onChange: ch }))),
    field('Opacidad del fondo', range(sb, 'bgOpacity', { onChange: ch, format: (v) => `${Math.round(v * 100)}%` })),
    check(sb, 'showRF', 'Mostrar escala numérica (1:N)', { onChange: ch }),
    el('p', { class: 'hint' }, 'El largo se redondea a un valor exacto (1, 2, 2,5 o 5 × 10ⁿ) medido sobre el elipsoide en la posición de la barra.'),
    inlineFields(field('X', num(sb, 'x', { step: 0.5, unit: 'mm', onChange: ch })), field('Y', num(sb, 'y', { step: 0.5, unit: 'mm', onChange: ch }))),
  );
}

function insetEditor(app, z) {
  const ch = () => app.commit('overlay');
  const chIns = () => app.commit('insets');
  const projOpts = [['same', 'Igual que el mapa principal'], ...PROJECTIONS.map((p) => [p.code, p.name])];
  const zoomObj = { f: Math.round((app.state.view.mpm / z.mpm) * 10) / 10 };
  const centerObj = { lat: Number(z.center[1].toFixed(4)), lon: Number(z.center[0].toFixed(4)) };
  const sitesVis = { v: z.layers.__sites__ !== false };
  return el('div', {},
    field('Nombre', text(z, 'name', { onChange: () => app.renderLeft() })),
    inlineFields(field('Tipo', select(z, 'mode', [['detail', 'Zoom de detalle (lupa)'], ['context', 'Mapa de ubicación (contexto)']], { onChange: () => { chIns(); app.renderInspector(); } })),
      field('Forma', select(z, 'shape', [['circle', 'Círculo'], ['rect', 'Rectángulo'], ['rounded', 'Rectángulo redondeado']], { onChange: (v) => { if (v === 'circle') z.h = z.w; chIns(); } }))),
    inlineFields(field(z.shape === 'circle' ? 'Diámetro' : 'Ancho', num(z, 'w', { min: 8, max: 600, step: 0.5, unit: 'mm', onChange: () => { if (z.shape === 'circle') z.h = z.w; chIns(); } })),
      z.shape === 'circle' ? el('div', {}) : field('Alto', num(z, 'h', { min: 8, max: 600, step: 0.5, unit: 'mm', onChange: chIns }))),
    inlineFields(field('X', num(z, 'x', { step: 0.5, unit: 'mm', onChange: chIns })), field('Y', num(z, 'y', { step: 0.5, unit: 'mm', onChange: chIns }))),
    inlineFields(field('Aumento respecto del mapa', num(zoomObj, 'f', { min: 0.01, max: 2000, step: 0.5, unit: '×', onChange: (v) => { z.mpm = app.state.view.mpm / v; chIns(); } })),
      field('Fondo', color(z, 'bg', { onChange: chIns }))),
    inlineFields(field('Latitud del centro', num(centerObj, 'lat', { min: -90, max: 90, step: 0.01, unit: '°', onChange: (v) => { z.center = [z.center[0], v]; chIns(); } })),
      field('Longitud del centro', num(centerObj, 'lon', { min: -180, max: 180, step: 0.01, unit: '°', onChange: (v) => { z.center = [v, z.center[1]]; chIns(); } }))),
    field('Proyección del recuadro', select(z, 'projection', projOpts, { onChange: chIns })),
    el('div', { class: 'check-row' }, check(sitesVis, 'v', 'Mostrar sitios', { onChange: (v) => { z.layers.__sites__ = v; app.commit('layers'); } }), check(z, 'graticule', 'Grilla', { onChange: () => app.commit('layers') })),
    details('Borde del recuadro', true,
      inlineFields(field('Color', color(z.border, 'color', { onChange: ch })), field('Grosor', num(z.border, 'width', { min: 0, max: 6, step: 0.1, unit: 'pt', onChange: ch }))),
      field('Tipo de línea', select(z.border, 'dash', DASH_OPTIONS, { onChange: ch }))),
    z.mode === 'detail' ? details('Área ampliada y conectores', true,
      check(z.footprint, 'show', 'Marcar el área ampliada sobre el mapa', { onChange: ch }),
      inlineFields(field('Color', color(z.footprint, 'color', { onChange: ch })), field('Grosor', num(z.footprint, 'width', { min: 0, max: 6, step: 0.1, unit: 'pt', onChange: ch }))),
      inlineFields(field('Tipo de línea', select(z.footprint, 'dash', DASH_OPTIONS, { onChange: ch })), field('Relleno', range(z.footprint, 'fillOpacity', { onChange: ch, format: (v) => `${Math.round(v * 100)}%` }))),
      field('Conectores', select(z.connector, 'type', [['tangent', 'Dos líneas tangentes (embudo)'], ['center', 'Una línea entre centros'], ['none', 'Sin conectores']], { onChange: ch })),
      inlineFields(field('Color', color(z.connector, 'color', { onChange: ch })), field('Grosor', num(z.connector, 'width', { min: 0, max: 6, step: 0.1, unit: 'pt', onChange: ch }))),
      field('Tipo de conector', select(z.connector, 'dash', DASH_OPTIONS, { onChange: ch })))
      : details('Recuadro del mapa principal', true,
        check(z.extentBox, 'show', 'Marcar la extensión del mapa principal', { onChange: ch }),
        inlineFields(field('Color', color(z.extentBox, 'color', { onChange: ch })), field('Grosor', num(z.extentBox, 'width', { min: 0, max: 6, step: 0.1, unit: 'pt', onChange: ch }))),
        field('Tipo de línea', select(z.extentBox, 'dash', DASH_OPTIONS, { onChange: ch }))),
    el('p', { class: 'hint' }, 'Qué capas se ven en este recuadro: Capas › abrir capa › Visibilidad en los zooms.'),
  );
}
