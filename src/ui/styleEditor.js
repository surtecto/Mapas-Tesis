// Editor de simbología para capas vectoriales
import { el, clear } from '../util.js';
import { field, inlineFields, num, color, select, check, range, button, details, text } from './forms.js';
import { SHAPES, DASH_OPTIONS, PATTERNS, DECOS } from '../styles.js';
import { FONTS, getDef, defOf } from '../catalog.js';
import { PALETTES, paletteColors } from '../palette.js';
import { classBreaks } from '../analysis.js';

// nombres y valores que delatan un código (identificador) y no una magnitud
const ID_NAME = /^(id|gid|fid|oid|objectid|object_id|ogc_fid|sitecode|site_code|cod|codigo|code|cuit|link|in1|cca|cde|clave|nro|numero)$|(_id|_cod|_code|codigo|sitecode)$/i;
function looksLikeId(field, nums) {
  if (ID_NAME.test(field)) return true;
  if (nums.length < 8) return false;
  const uniq = new Set(nums).size;
  return uniq === nums.length && nums.every(Number.isInteger) && nums[nums.length - 1] - nums[0] > nums.length * 5;
}

export function geomOf(ls) {
  if (ls.def === 'user') {
    const f = ls.data && ls.data.features && ls.data.features.find((x) => x.geometry);
    const t = f ? f.geometry.type : 'Point';
    return /Point/.test(t) ? 'point' : /Line/.test(t) ? 'line' : 'polygon';
  }
  const d = defOf(ls);
  return d ? d.geom : null;
}

export function fieldsOf(app, ls) {
  const d = defOf(ls);
  if (d && d.fields && d.fields.length) return d.fields;
  const feats = sampleFeatures(app, ls);
  const keys = new Set();
  feats.slice(0, 50).forEach((f) => Object.keys(f.getProperties()).forEach((k) => k !== 'geometry' && keys.add(k)));
  return Array.from(keys);
}

function sampleFeatures(app, ls) {
  const l = app.mainCtx && app.mainCtx.olLayers.get(ls.uid);
  const src = l && l.getSource && l.getSource();
  return src && src.getFeatures ? src.getFeatures() : [];
}

export function styleEditor(app, ls) {
  const st = ls.style;
  const changed = () => app.styleChanged(ls);
  const geom = geomOf(ls);
  const root = el('div', { class: 'style-editor' });
  if (geom === 'point') {
    const p = st.point;
    root.append(
      inlineFields(field('Símbolo', select(p, 'shape', SHAPES, { onChange: changed })), field('Tamaño', num(p, 'size', { min: 0, max: 40, step: 0.5, unit: 'pt', onChange: changed }))),
      inlineFields(field('Relleno', color(p, 'fill', { onChange: changed })), field('Opacidad', range(p, 'fillOpacity', { onChange: changed, onInput: changed, format: (v) => `${Math.round(v * 100)}%` }))),
      inlineFields(field('Borde', color(p, 'stroke', { onChange: changed })), field('Grosor', num(p, 'strokeWidth', { min: 0, max: 6, step: 0.1, unit: 'pt', onChange: changed }))),
    );
  } else if (geom === 'line') {
    const l = st.line;
    const decoDefault = (d) => (d === 'casing' ? '#3a3a3a' : ['double', 'rail'].includes(d) ? '#ffffff' : l.color);
    if (!l.decoColor && l.deco && l.deco !== 'none') l.decoColor = decoDefault(l.deco);
    root.append(
      inlineFields(field('Color', color(l, 'color', { onChange: changed })), field('Grosor', num(l, 'width', { min: 0, max: 8, step: 0.05, unit: 'pt', onChange: changed }))),
      inlineFields(field('Tipo de línea', select(l, 'dash', DASH_OPTIONS, { onChange: changed })), field('Opacidad', range(l, 'opacity', { onChange: changed, onInput: changed, format: (v) => `${Math.round(v * 100)}%` }))),
      field('Decoración', select(l, 'deco', DECOS, { onChange: (d) => { l.decoColor = decoDefault(d); changed(); app.renderLeft(); } })),
      l.deco && l.deco !== 'none' ? inlineFields(field('Color de la decoración', color(l, 'decoColor', { onChange: changed })),
        ['casing', 'double', 'rail'].includes(l.deco) ? el('span') : field('Separación', num(l, 'decoSpacing', { min: 0.8, max: 30, step: 0.2, unit: 'mm', onChange: changed }))) : null,
    );

  } else if (geom === 'polygon') {
    const pg = st.polygon;
    root.append(
      inlineFields(field('Relleno', color(pg, 'fill', { onChange: changed })), field('Opacidad', range(pg, 'fillOpacity', { onChange: changed, onInput: changed, format: (v) => `${Math.round(v * 100)}%` }))),
      inlineFields(field('Trama', select(pg, 'pattern', PATTERNS, { onChange: changed })), field('Color de trama', color(pg, 'patternColor', { onChange: changed }))),
      inlineFields(field('Separación', num(pg, 'patternSpacing', { min: 0.6, max: 8, step: 0.1, unit: 'mm', onChange: changed })), field('Grosor trama', num(pg, 'patternWidth', { min: 0.1, max: 3, step: 0.05, unit: 'pt', onChange: changed }))),
      inlineFields(field('Contorno', color(pg, 'stroke', { onChange: changed })), field('Grosor', num(pg, 'strokeWidth', { min: 0, max: 8, step: 0.05, unit: 'pt', onChange: changed }))),
      inlineFields(field('Tipo de contorno', select(pg, 'dash', DASH_OPTIONS, { onChange: changed })), field('Opac. contorno', range(pg, 'strokeOpacity', { onChange: changed, onInput: changed, format: (v) => `${Math.round(v * 100)}%` }))),
    );
  }
  // rótulos
  const flds = fieldsOf(app, ls);
  if (flds.length) {
    const lb = st.label;
    const fieldOptions = flds.map((f) => [f, f]);
    if (!lb.field || !flds.includes(lb.field)) lb.field = flds[0];
    root.append(details('Rótulos', !!lb.show,
      check(lb, 'show', 'Mostrar rótulos', { onChange: () => { app.styleChanged(ls, true); } }),
      inlineFields(field('Campo', select(lb, 'field', fieldOptions, { onChange: changed })), field('Tamaño', num(lb, 'size', { min: 3, max: 30, step: 0.5, unit: 'pt', onChange: changed }))),
      field('Tipografía', select(lb, 'font', FONTS, { onChange: changed })),
      inlineFields(field('Color', color(lb, 'color', { onChange: changed })), field('Halo', color(lb, 'halo', { onChange: changed }))),
      inlineFields(field('Grosor halo', num(lb, 'haloWidth', { min: 0, max: 4, step: 0.1, unit: 'pt', onChange: changed })), field('Desplaz. vertical', num(lb, 'offsetY', { min: -40, max: 40, step: 0.5, unit: 'pt', onChange: changed }))),
      el('div', { class: 'check-row' },
        check(lb, 'bold', 'Negrita', { onChange: changed }), check(lb, 'italic', 'Cursiva', { onChange: changed }), check(lb, 'uppercase', 'Mayúsculas', { onChange: changed })),
      inlineFields(field('Espaciado', num(lb, 'letterSpacing', { min: 0, max: 1.5, step: 0.05, unit: 'em', onChange: changed })),
        el('div', { class: 'field' }, el('span', { class: 'label-spacer' }), check(lb, 'declutter', 'Evitar superposición', { onChange: () => app.styleChanged(ls, true) }))),
    ));
  }
  // categorías por atributo
  if (flds.length && geom) root.append(categorizeEditor(app, ls, flds));
  return root;
}

function categorizeEditor(app, ls, flds) {
  const st = ls.style;
  if (!st.categorize) st.categorize = { field: '', values: {} };
  const cz = st.categorize;
  const body = el('div', {});
  const list = el('div', { class: 'cat-values' });
  const render = () => {
    clear(list);
    if (cz.mode === 'ranges') {
      (cz.ranges || []).forEach((r, i) => {
        list.append(el('div', { class: 'cat-value range-row' },
          color(r, 'color', { onChange: () => app.styleChanged(ls) }),
          el('span', { class: 'range-mm' }, num(r, 'min', { step: 1, onChange: () => app.styleChanged(ls), width: '64px' }), '–', num(r, 'max', { step: 1, onChange: () => app.styleChanged(ls), width: '64px' })),
          button('', () => { cz.ranges.splice(i, 1); render(); app.styleChanged(ls); }, { kind: 'icon ghost', title: 'Quitar rango', icon: '×' })));
      });
      return;
    }
    for (const [val, col] of Object.entries(cz.values || {})) {
      const obj = { c: col };
      list.append(el('div', { class: 'cat-value' },
        color(obj, 'c', { onChange: (v) => { cz.values[val] = v; app.styleChanged(ls); } }),
        el('span', { class: 'cat-name' }, String(val)),
        button('', () => { delete cz.values[val]; render(); app.styleChanged(ls); }, { kind: 'icon ghost', title: 'Quitar valor', icon: '×' })));
    }
  };
  if (!cz.mode) cz.mode = 'values';
  const fieldSel = select(cz, 'field', [['', 'Sin clasificar'], ...flds.map((f) => [f, f])], { onChange: () => { cz.values = {}; render(); app.styleChanged(ls); } });
  const modeSel = select(cz, 'mode', [['values', 'Valores únicos'], ['ranges', 'Rangos numéricos (períodos, cantidades)']], { onChange: () => { render(); app.styleChanged(ls); app.renderLeft(); } });
  // la paleta elegida queda guardada en la capa: la que se ve en la lista es la que se usa al generar
  if (!cz.palette || !PALETTES.some((p) => p.id === cz.palette)) cz.palette = cz.mode === 'ranges' ? 'periodos' : 'okabe';
  const palObj = { get p() { return cz.palette; }, set p(v) { cz.palette = v; } };
  const palSel = select(cz, 'palette', PALETTES.map((p) => [p.id, p.name]));
  if (!cz.breaks) cz.breaks = { n: 5, how: 'jenks', manual: '' };
  const breaksObj = cz.breaks;
  const warn = el('p', { class: 'note warn-note' });
  warn.hidden = true;
  const genRanges = () => {
    const nums = sampleFeatures(app, ls).map((f) => Number(f.get(cz.field))).filter(Number.isFinite).sort((a, b) => a - b);
    let br = [];
    if (breaksObj.manual.trim()) br = breaksObj.manual.split(/[;,\s]+/).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    else if (nums.length) {
      const n = Math.max(2, Math.min(9, breaksObj.n));
      br = classBreaks(nums, n, breaksObj.how).map((v) => Math.round(v * 100) / 100);
    }
    br = [...new Set(br)];
    if (br.length < 2) { app.toast('No hay valores numéricos en la vista actual (o escribí los cortes a mano).', 'warn'); return; }
    warn.hidden = !looksLikeId(cz.field, nums);
    warn.textContent = `«${cz.field}» parece un código que identifica cada objeto, no una medida: ordenarlo en rangos agrupa números que no expresan cantidad ni intensidad. ¿Qué se quiere mostrar? Con «Valores únicos» cada código tiene su color; para comparar magnitudes conviene un atributo medido (superficie, caudal, población), y para destacar algunos objetos alcanza con tocarlos en el mapa.`;
    const cols = paletteColors(PALETTES.find((p) => p.id === palObj.p), br.length - 1);
    cz.ranges = [];
    for (let i = 0; i < br.length - 1; i++) cz.ranges.push({ min: i === 0 ? br[i] : br[i] + (Number.isInteger(br[i]) ? 1 : 0.01), max: br[i + 1], color: cols[i], label: '' });
    cz.ranges[0].min = br[0];
    render(); app.styleChanged(ls);
  };
  const loadBtn = button('Leer valores', () => {
    if (!cz.field) return;
    if (cz.mode === 'ranges') { genRanges(); return; }
    const vals = new Set();
    sampleFeatures(app, ls).forEach((f) => { const v = f.get(cz.field); if (v != null && v !== '') vals.add(String(v)); });
    const arr = Array.from(vals).slice(0, 24);
    const cols = paletteColors(PALETTES.find((p) => p.id === palObj.p), arr.length);
    cz.values = {};
    arr.forEach((v, i) => { cz.values[v] = cols[i]; });
    render();
    app.styleChanged(ls);
    if (!arr.length) app.toast('La capa todavía no tiene datos cargados en la vista actual.');
  }, { kind: 'small' });
  body.append(
    inlineFields(field('Clasificar por', fieldSel), field('Modo', modeSel)),
    cz.mode === 'ranges' ? inlineFields(field('Clases', num(breaksObj, 'n', { min: 2, max: 9, step: 1 })), field('Método', select(breaksObj, 'how', [['jenks', 'Cortes naturales (Jenks)'], ['quantile', 'Cuantiles'], ['equal', 'Intervalos iguales'], ['stddev', 'Desvío estándar']]))) : null,
    cz.mode === 'ranges' ? field('Cortes a mano (opcional)', text(breaksObj, 'manual', { placeholder: '1825, 1850, 1870, 1885, 1900, 1925' })) : null,
    inlineFields(field('Paleta', palSel), el('div', { class: 'field' }, el('span', { class: 'label-spacer' }), cz.mode === 'ranges' ? button('Generar rangos', genRanges, { kind: 'small' }) : loadBtn)),
    warn,
    list,
    check(cz, 'hideOthers', 'Ocultar elementos sin valor asignado', { onChange: () => app.styleChanged(ls) }),
  );
  if (cz.mode === 'ranges' && cz.field && cz.ranges && cz.ranges.length) {
    const nums = sampleFeatures(app, ls).map((f) => Number(f.get(cz.field))).filter(Number.isFinite).sort((a, b) => a - b);
    if (looksLikeId(cz.field, nums)) { warn.hidden = false; warn.textContent = `«${cz.field}» parece un código que identifica cada objeto, no una medida: sus rangos no expresan cantidad. Probá «Valores únicos», un atributo medido, o tocá en el mapa los objetos que querés destacar.`; }
  }
  render();
  return details('Colores por categoría (atributo)', !!cz.field, body);
}
