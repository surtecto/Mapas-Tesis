// Inspector de objetos elegidos en el mapa: atributos, medidas y estilo propio de la selección
import { getArea, getLength } from 'ol/sphere.js';
import { el } from '../util.js';
import { field, inlineFields, num, color, select, check, range, button, details, text } from './forms.js';
import { SHAPES, DASH_OPTIONS, PATTERNS, classify } from '../styles.js';
import { geomOf } from './styleEditor.js';
import { featuresByKeys, groupsOfSelection, effectiveStyle, guessName, newGroup, assignToGroup, removeFromGroups, featureKey } from '../features.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const clone = (o) => JSON.parse(JSON.stringify(o || {}));

function styleControls(geom, g, onChange) {
  if (geom === 'point') {
    const p = g.point;
    return el('div', {},
      inlineFields(field('Símbolo', select(p, 'shape', SHAPES, { onChange })), field('Tamaño', num(p, 'size', { min: 0, max: 40, step: 0.5, unit: 'pt', onChange }))),
      inlineFields(field('Relleno', color(p, 'fill', { onChange })), field('Borde', color(p, 'stroke', { onChange }))));
  }
  if (geom === 'line') {
    const l = g.line;
    return el('div', {},
      inlineFields(field('Color', color(l, 'color', { onChange })), field('Grosor', num(l, 'width', { min: 0, max: 8, step: 0.05, unit: 'pt', onChange }))),
      inlineFields(field('Tipo de línea', select(l, 'dash', DASH_OPTIONS, { onChange })), field('Opacidad', range(l, 'opacity', { onChange, format: pct }))));
  }
  const pg = g.polygon;
  return el('div', {},
    inlineFields(field('Relleno', color(pg, 'fill', { onChange })), field('Opacidad', range(pg, 'fillOpacity', { onChange, format: pct }))),
    inlineFields(field('Trama', select(pg, 'pattern', PATTERNS, { onChange })), field('Color de trama', color(pg, 'patternColor', { onChange }))),
    inlineFields(field('Contorno', color(pg, 'stroke', { onChange })), field('Grosor', num(pg, 'strokeWidth', { min: 0, max: 8, step: 0.05, unit: 'pt', onChange }))),
    field('Tipo de contorno', select(pg, 'dash', DASH_OPTIONS, { onChange })));
}

function measures(feats, projection) {
  let a = 0, l = 0;
  for (const f of feats) {
    const g = f.getGeometry();
    if (!g) continue;
    const t = g.getType();
    if (/Polygon/.test(t)) a += getArea(g, { projection });
    else if (/Line/.test(t)) l += getLength(g, { projection });
  }
  const out = [];
  if (a > 0) out.push(a >= 1e6 ? `${(a / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km² (${Math.round(a / 1e4).toLocaleString('es-AR')} ha)` : `${(a / 1e4).toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha`);
  if (l > 0) out.push(l >= 1000 ? `${(l / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km` : `${Math.round(l)} m`);
  return out.join(' · ');
}

function attrTable(f) {
  const p = f.getProperties();
  const gname = f.getGeometryName();
  const rows = Object.entries(p).filter(([k, v]) => k !== gname && (v == null || typeof v !== 'object')).slice(0, 40);
  if (!rows.length) return el('p', { class: 'note' }, 'El objeto no tiene atributos.');
  return el('table', { class: 'attr-table' }, el('tbody', {}, rows.map(([k, v]) => el('tr', {}, el('th', {}, k), el('td', {}, v == null || v === '' ? '—' : String(v))))));
}

export function featureInspector(app, sel) {
  const ls = app.state.layers.find((l) => l.uid === sel.id);
  if (!ls) return el('p', { class: 'insp-empty' }, 'La capa de estos objetos ya no está en el mapa.');
  const geom = geomOf(ls) || 'polygon';
  const olLayer = app.mainCtx.olLayers.get(ls.uid);
  const feats = featuresByKeys(olLayer, sel.fids);
  const n = sel.fids.length;
  const changed = () => { app.styleChanged(ls); app.renderLeftSoon(); };
  const root = el('div', { class: 'feat-insp' });
  const add = (...nodes) => root.append(...nodes.filter(Boolean));
  root.append(el('p', { class: 'feat-layer' }, el('span', {}, 'Capa'), el('strong', {}, ls.name)));
  const m = feats.length ? measures(feats, app.mainCtx.projection) : '';
  if (m) root.append(el('p', { class: 'feat-measure' }, n > 1 ? `Suma de la selección: ${m}` : m));

  // estilo propio
  const groups = groupsOfSelection(ls, sel.fids);
  const g = groups.length === 1 ? groups[0] : null;
  if (g) {
    const whole = g.fids.length === n;
    add(
      el('h3', { class: 'feat-sub' }, whole ? 'Característica propia' : `Parte de «${g.name}»`),
      el('p', { class: 'note' }, whole ? `${n === 1 ? 'Este objeto tiene' : 'Estos objetos tienen'} estilo propio y una entrada en la leyenda; el resto de la capa sigue con el suyo.`
        : `La característica reúne ${g.fids.length} objetos: lo que cambies acá vale para todos. Para tratar aparte la selección, separala.`),
      field('Nombre en la leyenda', text(g, 'name', { onChange: () => { app.commit('overlay'); app.renderLeftSoon(); } })),
      styleControls(geom, g, changed),
      el('div', { class: 'check-row' },
        check(g, 'legend', 'Figura en la leyenda', { onChange: () => app.commit('overlay') }),
        check(g, 'hidden', 'Ocultar del mapa', { onChange: changed })),
      el('div', { class: 'btn-row' },
        whole ? null : button('Seleccionar toda la característica', () => app.selectFeatures(ls.uid, g.fids), { kind: 'small' }),
        whole ? null : button('Separar la selección', () => {
          const ng = newGroup(ls, { polygon: clone(g.polygon), line: clone(g.line), point: clone(g.point) }, `${g.name} (parte)`);
          assignToGroup(ls, ng, sel.fids); changed(); app.renderInspector();
        }, { kind: 'small' }),
        button('Volver al estilo de la capa', () => { removeFromGroups(ls, sel.fids); changed(); app.renderInspector(); }, { kind: 'small ghost' })),
    );
  } else {
    const inGroups = groups.filter(Boolean);
    const mixed = groups.length > 1;
    const base = effectiveStyle(ls, feats[0], classify);
    const draft = newGroup(ls, base, guessName(n === 1 ? feats[0] : null, ls) || undefined);
    const ensure = () => {
      if (!ls.groups || !ls.groups.includes(draft)) assignToGroup(ls, draft, sel.fids);
      changed();
    };
    const others = [...inGroups, ...(ls.groups || []).filter((x) => !inGroups.includes(x))];
    const pick = { g: others[0] ? others[0].id : '' };
    const note = !mixed ? 'Al cambiar cualquier valor, la selección pasa a ser una característica propia con su entrada en la leyenda. El resto de la capa conserva su estilo y su clasificación.'
      : inGroups.length === 1 ? `Parte de la selección ya es «${inGroups[0].name}»: podés sumar el resto a esa característica, o cambiar un valor para que todos formen una nueva.`
        : 'La selección mezcla objetos de distintas características: al cambiar un valor pasan a formar una nueva.';
    add(
      el('h3', { class: 'feat-sub' }, n === 1 ? 'Estilo propio para este objeto' : `Estilo propio para los ${n} objetos`),
      el('p', { class: 'note' }, note),
      field('Nombre en la leyenda', text(draft, 'name', { onChange: () => { if (ls.groups && ls.groups.includes(draft)) { app.commit('overlay'); app.renderLeftSoon(); } } })),
      styleControls(geom, draft, ensure),
      el('div', { class: 'check-row' }, check(draft, 'hidden', 'Ocultar del mapa', { onChange: ensure })),
      others.length ? inlineFields(
        field('O sumarlos a una característica', select(pick, 'g', others.map((x) => [x.id, x.name]))),
        el('div', { class: 'field' }, el('span', { class: 'label-spacer' }), button('Sumar', () => {
          const tg = ls.groups.find((x) => x.id === pick.g);
          if (!tg) return;
          assignToGroup(ls, tg, sel.fids); changed(); app.renderInspector();
        }, { kind: 'small' }))) : null,
    );
  }

  // atributos y selección de parecidos
  if (feats.length) {
    const f0 = feats[0];
    const p = f0.getProperties();
    const gname = f0.getGeometryName();
    const flds = Object.keys(p).filter((k) => k !== gname && (p[k] == null || typeof p[k] !== 'object'));
    const cz = ls.style && ls.style.categorize;
    const opts = [...(cz && cz.field ? [['__clase__', 'Misma clase de color']] : []), ...flds.map((k) => [k, k])];
    const sim = { f: opts[0] ? opts[0][0] : '' };
    add(details(n > 1 ? `Atributos (primero de ${n})` : 'Atributos', true, attrTable(f0)));
    if (opts.length) {
      root.append(details('Elegir objetos parecidos', false,
        inlineFields(field('Mismo valor de', select(sim, 'f', opts)),
          el('div', { class: 'field' }, el('span', { class: 'label-spacer' }), button('Elegir', () => {
            const src = olLayer && olLayer.getSource();
            if (!src) return;
            const same = sim.f === '__clase__'
              ? (() => { const c0 = classify(cz, f0.get(cz.field)); return (f) => classify(cz, f.get(cz.field)) === c0; })()
              : (f) => String(f.get(sim.f)) === String(f0.get(sim.f));
            const fids = [...new Set(src.getFeatures().filter(same).map(featureKey))];
            app.selectFeatures(ls.uid, fids);
            app.toast(`${fids.length} objeto${fids.length === 1 ? '' : 's'} elegido${fids.length === 1 ? '' : 's'}.`);
          }, { kind: 'small' }))),
        el('p', { class: 'note' }, 'Busca entre los objetos cargados en la vista actual.')));
    }
  } else {
    root.append(el('p', { class: 'note' }, 'Los objetos elegidos no están cargados en la vista actual; su estilo propio se aplica igual cuando el mapa los vuelve a mostrar.'));
  }
  root.append(el('p', { class: 'hint-line' }, 'Mayús + clic suma o quita objetos de la selección · Esc la cierra.'));
  return root;
}

// lista de características de una capa, en el panel de capas
export function groupsList(app, ls) {
  const geom = geomOf(ls) || 'polygon';
  const swatch = (g) => (geom === 'line' ? g.line.color : geom === 'point' ? g.point.fill : g.polygon.fill);
  if (!ls.groups || !ls.groups.length) return el('p', { class: 'note' }, 'Para darle estilo propio a un objeto (un polígono, un tramo, un punto), tocalo en el mapa.');
  const rows = ls.groups.map((g) => el('div', { class: 'grp-row' },
    el('span', { class: 'grp-sw', style: { background: swatch(g), opacity: g.hidden ? 0.25 : 1 } }),
    el('span', { class: 'grp-name', title: g.name }, g.name),
    el('span', { class: 'grp-n', title: 'Objetos' }, String(g.fids.length)),
    button('Elegir', () => app.selectFeatures(ls.uid, g.fids), { kind: 'small ghost' }),
    button('', () => {
      ls.groups = ls.groups.filter((x) => x !== g);
      app.styleChanged(ls);
      if (app.selection && app.selection.kind === 'feature') app.renderInspector();
      app.renderLeft();
    }, { kind: 'icon ghost', icon: '×', title: 'Quitar: los objetos vuelven al estilo de la capa' })));
  return details(`Características propias (${ls.groups.length})`, true,
    el('p', { class: 'note' }, 'Objetos elegidos en el mapa con estilo y entrada de leyenda propios.'), ...rows);
}
