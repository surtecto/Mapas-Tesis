// Simbología: símbolos puntuales, tramas, guiones y funciones de estilo de OpenLayers
import { Style, Stroke, Fill, Text } from 'ol/style.js';
import { PT_MM, rgba } from './util.js';

export const SHAPES = [
  ['circle', 'Círculo'], ['square', 'Cuadrado'], ['triangle', 'Triángulo'], ['triangle-down', 'Triángulo invertido'],
  ['diamond', 'Rombo'], ['star', 'Estrella'], ['pentagon', 'Pentágono'], ['hexagon', 'Hexágono'],
  ['cross', 'Cruz'], ['x', 'Aspa'], ['none', 'Sin símbolo'],
];

export const DASH_OPTIONS = [
  ['solid', 'Continua'], ['dashed', 'Discontinua'], ['short', 'Discontinua corta'], ['long', 'Trazos largos'],
  ['dotted', 'Punteada'], ['dashdot', 'Punto y raya'], ['dashdotdot', 'Raya y dos puntos'],
];
const DASHES = {
  solid: [], dashed: [3.5, 2.2], short: [1.8, 1.5], long: [7, 2.8], dotted: [0.01, 2], dashdot: [4.5, 1.8, 0.01, 1.8], dashdotdot: [4.5, 1.6, 0.01, 1.6, 0.01, 1.6],
};
export function dashArray(name, widthPx, minUnitPx = 1) {
  const d = DASHES[name] || [];
  if (!d.length) return undefined;
  const f = Math.max(widthPx, minUnitPx);
  return d.map((v) => v * f);
}
export function dashCap(name) { return name === 'dotted' || name === 'dashdot' || name === 'dashdotdot' ? 'round' : 'butt'; }

export const PATTERNS = [
  ['none', 'Sin trama'], ['diag', 'Diagonal ／'], ['diag2', 'Diagonal ＼'], ['cross', 'Cruzada ✕'], ['horiz', 'Horizontal'], ['vert', 'Vertical'], ['grid', 'Cuadrícula'], ['dots', 'Puntos'],
  ['stipple', 'Punteado irregular (arenas, médanos)'], ['dash-h', 'Rayas cortas (agua, bajos)'], ['wave', 'Ondas (agua)'], ['marsh', 'Bañado (matas)'],
  ['grass', 'Pastizal'], ['rows', 'Surcos (cultivo)'], ['brick', 'Ladrillo (construido)'], ['triangles', 'Triángulos (monte)'],
];

export const DECOS = [
  ['none', 'Sin decoración'], ['casing', 'Con borde (calle, ruta)'], ['double', 'Doble línea'], ['rail', 'Ferrocarril (tramos alternados)'],
  ['ties', 'Ferrocarril (durmientes)'], ['ticks', 'Peine a un lado (barranca, frente)'], ['ticks2', 'Peine a ambos lados'], ['teeth', 'Dientes (frontera, frente de avance)'],
  ['arrows', 'Flechas de sentido (recorrido, flujo)'], ['circles', 'Postes (telégrafo, alambrado)'], ['crosses', 'Cruces (límite, alambrado)'],
];

// ---------- símbolos ----------
export function shapePath(ctx, x, y, r, shape) {
  ctx.beginPath();
  const poly = (n, rot = -Math.PI / 2, rr = r) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  switch (shape) {
    case 'square': ctx.rect(x - r * 0.886, y - r * 0.886, r * 1.772, r * 1.772); break;
    case 'triangle': poly(3, -Math.PI / 2, r * 1.2); break;
    case 'triangle-down': poly(3, Math.PI / 2, r * 1.2); break;
    case 'diamond': poly(4, -Math.PI / 2, r * 1.15); break;
    case 'pentagon': poly(5, -Math.PI / 2, r * 1.05); break;
    case 'hexagon': poly(6, 0, r * 1.02); break;
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 1.25 : r * 0.52;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'cross': {
      const t = r * 0.36;
      ctx.moveTo(x - t, y - r); ctx.lineTo(x + t, y - r); ctx.lineTo(x + t, y - t); ctx.lineTo(x + r, y - t);
      ctx.lineTo(x + r, y + t); ctx.lineTo(x + t, y + t); ctx.lineTo(x + t, y + r); ctx.lineTo(x - t, y + r);
      ctx.lineTo(x - t, y + t); ctx.lineTo(x - r, y + t); ctx.lineTo(x - r, y - t); ctx.lineTo(x - t, y - t);
      ctx.closePath();
      break;
    }
    case 'x': {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.translate(-x, -y);
      shapePath(ctx, x, y, r * 1.1, 'cross');
      ctx.restore();
      break;
    }
    default: ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

// cfg: {shape, size(pt), fill, fillOpacity, stroke, strokeWidth(pt), strokeOpacity, colors?:[], multi?: 'pie'|'rings'}
export function drawSymbol(ctx, x, y, cfg, pxPerPt) {
  if (!cfg || cfg.shape === 'none' || !(cfg.size > 0)) return;
  const r = (cfg.size / 2) * pxPerPt;
  const colors = cfg.colors && cfg.colors.length ? cfg.colors : [cfg.fill];
  const fo = cfg.fillOpacity == null ? 1 : cfg.fillOpacity;
  ctx.save();
  if (colors.length > 1) {
    ctx.save();
    shapePath(ctx, x, y, r, cfg.shape);
    ctx.clip();
    const n = colors.length;
    if (cfg.multi === 'rings') {
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.6 * (1 - i / n), 0, Math.PI * 2);
        ctx.fillStyle = rgba(colors[i], fo);
        ctx.fill();
      }
    } else if (cfg.multi === 'halves-v') {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = rgba(colors[i], fo);
        ctx.fillRect(x - r * 1.6 + (i * 3.2 * r) / n, y - r * 1.6, (3.2 * r) / n + 0.5, r * 3.2);
      }
    } else {
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n, a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r * 1.6, a0, a1);
        ctx.closePath();
        ctx.fillStyle = rgba(colors[i], fo);
        ctx.fill();
      }
    }
    ctx.restore();
  } else if (colors[0] && fo > 0) {
    shapePath(ctx, x, y, r, cfg.shape);
    ctx.fillStyle = rgba(colors[0], fo);
    ctx.fill();
  }
  const sw = (cfg.strokeWidth || 0) * pxPerPt;
  if (sw > 0 && cfg.stroke && (cfg.strokeOpacity == null || cfg.strokeOpacity > 0)) {
    shapePath(ctx, x, y, r, cfg.shape);
    ctx.lineWidth = sw;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(cfg.stroke, cfg.strokeOpacity == null ? 1 : cfg.strokeOpacity);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- tramas ----------
const patternCache = new Map();
export function getPattern(kind, color, spacingPx, lineWidthPx) {
  if (!kind || kind === 'none') return null;
  const s = Math.max(['marsh', 'grass', 'triangles', 'brick', 'wave', 'stipple'].includes(kind) ? 7 : 3, Math.round(spacingPx));
  const lw = Math.max(0.5, lineWidthPx);
  const key = `${kind}|${color}|${s}|${lw.toFixed(2)}`;
  if (patternCache.has(key)) return patternCache.get(key);
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const x = c.getContext('2d');
  x.strokeStyle = color; x.fillStyle = color; x.lineWidth = lw; x.lineCap = 'square';
  const line = (x0, y0, x1, y1) => { x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); };
  if (kind === 'diag' || kind === 'cross') { line(-1, s + 1, s + 1, -1); line(-1, 1, 1, -1); line(s - 1, s + 1, s + 1, s - 1); }
  if (kind === 'diag2' || kind === 'cross') { line(-1, -1, s + 1, s + 1); line(s - 1, -1, s + 1, 1); line(-1, s - 1, 1, s + 1); }
  if (kind === 'horiz' || kind === 'grid') line(0, s / 2, s, s / 2);
  if (kind === 'vert' || kind === 'grid') line(s / 2, 0, s / 2, s);
  if (kind === 'dots') { x.beginPath(); x.arc(s / 2, s / 2, lw * 1.1, 0, Math.PI * 2); x.fill(); }
  if (kind === 'stipple') {
    // posiciones fijas pseudoaleatorias (reproducibles en cada exportación)
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(rnd() * s, rnd() * s, lw * (0.7 + rnd() * 0.6), 0, Math.PI * 2); x.fill(); }
  }
  if (kind === 'dash-h') { line(s * 0.1, s * 0.3, s * 0.45, s * 0.3); line(s * 0.6, s * 0.8, s * 0.95, s * 0.8); }
  if (kind === 'wave') {
    x.beginPath();
    for (let i = 0; i <= 12; i++) { const px = (i / 12) * s, py = s * 0.5 + Math.sin((i / 12) * Math.PI * 2) * s * 0.14; if (i === 0) x.moveTo(px, py); else x.lineTo(px, py); }
    x.stroke();
  }
  if (kind === 'marsh') {
    // mata de juncos sobre una línea corta: símbolo cartográfico clásico de bañado
    const bx = s * 0.5, by = s * 0.62, w = s * 0.42;
    line(bx - w / 2, by, bx + w / 2, by);
    line(bx, by, bx, by - s * 0.3); line(bx - w * 0.28, by, bx - w * 0.4, by - s * 0.2); line(bx + w * 0.28, by, bx + w * 0.4, by - s * 0.2);
  }
  if (kind === 'grass') { const bx = s * 0.3, by = s * 0.4; line(bx - s * 0.08, by - s * 0.12, bx, by); line(bx, by, bx + s * 0.08, by - s * 0.12); const cx = s * 0.75, cy = s * 0.88; line(cx - s * 0.08, cy - s * 0.12, cx, cy); line(cx, cy, cx + s * 0.08, cy - s * 0.12); }
  if (kind === 'rows') { for (let i = 0; i < 3; i++) { x.beginPath(); x.arc((i + 0.5) * (s / 3), s / 2, lw * 0.9, 0, Math.PI * 2); x.fill(); } }
  if (kind === 'brick') { line(0, s * 0.25, s, s * 0.25); line(0, s * 0.75, s, s * 0.75); line(s * 0.25, s * 0.25, s * 0.25, s * 0.75); line(s * 0.75, 0, s * 0.75, s * 0.25); line(s * 0.75, s * 0.75, s * 0.75, s); }
  if (kind === 'triangles') { x.beginPath(); x.moveTo(s * 0.5, s * 0.25); x.lineTo(s * 0.72, s * 0.7); x.lineTo(s * 0.28, s * 0.7); x.closePath(); x.stroke(); }
  const pat = x.createPattern(c, 'repeat');
  patternCache.set(key, pat);
  return pat;
}


// ---------- líneas decoradas ----------
// Dibuja una polilínea (en píxeles del lienzo) con su decoración. l: estilo de línea; k: px por punto tipográfico.
// Se usa en el mapa (renderer de OpenLayers), en la leyenda y en la exportación SVG.
export function drawDecoratedLine(ctx, pts, l, k, colorOverride) {
  if (!pts || pts.length < 2) return;
  const color = colorOverride || l.color;
  const op = l.opacity == null ? 1 : l.opacity;
  const w = Math.max(0.3, (l.width || 0.5) * k);
  const deco = l.deco || 'none';
  const dc = l.decoColor || (deco === 'double' || deco === 'rail' ? '#ffffff' : color);
  const path = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
  const stroke = (col, width, dash, cap = 'butt') => {
    path();
    ctx.strokeStyle = rgba(col, op); ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = dash && dash.length ? cap : 'round';
    ctx.setLineDash(dash || []); ctx.stroke();
  };
  ctx.save();
  if (deco === 'casing') { stroke(dc, w * 1.9); stroke(color, w); }
  else if (deco === 'double') { stroke(color, w * 2.4); stroke(dc, w * 1.0); }
  else if (deco === 'rail') { stroke(color, w * 1.7); stroke(dc, w * 0.85, [w * 4, w * 4]); }
  else stroke(color, w, dashArray(l.dash || 'solid', w, k * 0.6), dashCap(l.dash || 'solid'));
  ctx.setLineDash([]);
  if (['ties', 'ticks', 'ticks2', 'teeth', 'arrows', 'circles', 'crosses'].includes(deco)) {
    const spacing = Math.max(2, (l.decoSpacing || (deco === 'arrows' ? 9 : deco === 'circles' ? 4 : 2.6)) * k * 2.835);
    const size = Math.max(1, (l.decoSize || (deco === 'ties' ? 1.6 : deco === 'arrows' ? 2.2 : 1.8)) * k * 2.835);
    ctx.strokeStyle = rgba(dc, op); ctx.fillStyle = rgba(dc, op);
    ctx.lineWidth = Math.max(0.5, w * (deco === 'ties' ? 0.9 : 0.75)); ctx.lineCap = 'butt';
    walkLine(pts, spacing, spacing * 0.5, (x, y, a) => {
      const nx = -Math.sin(a), ny = Math.cos(a), tx = Math.cos(a), ty = Math.sin(a);
      ctx.beginPath();
      if (deco === 'ties') { ctx.moveTo(x - nx * size, y - ny * size); ctx.lineTo(x + nx * size, y + ny * size); ctx.stroke(); }
      else if (deco === 'ticks') { ctx.moveTo(x, y); ctx.lineTo(x + nx * size, y + ny * size); ctx.stroke(); }
      else if (deco === 'ticks2') { ctx.moveTo(x - nx * size, y - ny * size); ctx.lineTo(x + nx * size, y + ny * size); ctx.stroke(); }
      else if (deco === 'teeth') { ctx.moveTo(x - tx * size * 0.6, y - ty * size * 0.6); ctx.lineTo(x + nx * size, y + ny * size); ctx.lineTo(x + tx * size * 0.6, y + ty * size * 0.6); ctx.closePath(); ctx.fill(); }
      else if (deco === 'arrows') { ctx.moveTo(x - tx * size + nx * size * 0.7, y - ty * size + ny * size * 0.7); ctx.lineTo(x, y); ctx.lineTo(x - tx * size - nx * size * 0.7, y - ty * size - ny * size * 0.7); ctx.lineWidth = Math.max(0.6, w * 0.9); ctx.stroke(); }
      else if (deco === 'circles') { ctx.arc(x, y, size * 0.45, 0, Math.PI * 2); ctx.fill(); }
      else if (deco === 'crosses') { const r = size * 0.55; ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); ctx.stroke(); }
    });
  }
  ctx.restore();
}

// Recorre una polilínea colocando marcas cada 'step' píxeles (callback con posición y ángulo)
export function walkLine(pts, step, offset, cb) {
  let next = offset;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    const ang = Math.atan2(dy, dx);
    while (next <= acc + len) {
      const t = (next - acc) / len;
      cb(a[0] + dx * t, a[1] + dy * t, ang);
      next += step;
    }
    acc += len;
  }
}

// Clasificación de un valor según el modo de la capa: valores únicos o rangos numéricos
export function classify(cz, v) {
  if (!cz || !cz.field || v === undefined || v === null || v === '') return undefined;
  if (cz.mode === 'ranges') {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const r = (cz.ranges || []).find((x) => n >= Number(x.min) && n <= Number(x.max));
    return r ? r.color : undefined;
  }
  return cz.values ? cz.values[v] : undefined;
}

// ---------- texto ----------
export function fontString({ font = 'Source Sans 3', sizePx = 10, bold = false, italic = false, weight }) {
  const w = weight || (bold ? 700 : 400);
  const fam = /\s/.test(font) ? `"${font}"` : font;
  return `${italic ? 'italic ' : ''}${w} ${sizePx.toFixed(2)}px ${fam}, sans-serif`;
}

// Espaciado de letras aproximado para OpenLayers (inserta espacios finos)
export function spacedText(text, letterSpacing) {
  if (!text) return '';
  if (!(letterSpacing > 0)) return text;
  const n = Math.max(1, Math.round(letterSpacing / 0.12));
  const sp = ' '.repeat(n);
  return text.split('\n').map((line) => Array.from(line).join(sp)).join('\n');
}

const CLASS_LABEL = {
  mar: { italic: true, upper: true, spacing: 0.35, color: '#3f7fb3', scale: 1.25 },
  pasaje: { italic: true, upper: true, spacing: 0.3, color: '#3f7fb3', scale: 1.1 },
  estrecho: { italic: true, upper: false, spacing: 0.05, color: '#3f7fb3', scale: 0.9 },
  bahia: { italic: true, upper: false, spacing: 0, color: '#3f7fb3', scale: 0.85 },
  peninsula: { italic: false, upper: true, spacing: 0.25, color: '#33414d', scale: 1.05 },
  archipielago: { italic: false, upper: true, spacing: 0.15, color: '#33414d', scale: 0.95 },
  isla: { italic: false, upper: false, spacing: 0, color: '#2b3843', scale: 0.85 },
  barrera: { italic: true, upper: false, spacing: 0.08, color: '#4f7f99', scale: 0.95 },
  region: { italic: false, upper: true, spacing: 0.4, color: '#5a6670', scale: 1.15, bold: true },
  polo: { italic: false, upper: false, spacing: 0, color: '#1d2b38', scale: 1, bold: true },
};
export function classLabelStyle(cls) { return CLASS_LABEL[cls] || CLASS_LABEL.isla; }

// ---------- funciones de estilo de capas vectoriales ----------
// ctx: { pxPerMm (px CSS por mm de papel), pixelRatio }
// Filtro por atributos hecho en el navegador: [{ field, op, value }] con op =, ≠, >, <, ≥, ≤, contiene, vacío
const normTxt = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function passFilter(feature, rules, mode = 'all') {
  const test = (r) => {
    if (!r || !r.field) return true;
    const v = feature.get(r.field);
    const a = Number(v), b = Number(r.value);
    const num = r.value !== '' && Number.isFinite(a) && Number.isFinite(b);
    switch (r.op) {
      case '=': return num ? a === b : normTxt(v) === normTxt(r.value);
      case '≠': return num ? a !== b : normTxt(v) !== normTxt(r.value);
      case '>': return num && a > b;
      case '<': return num && a < b;
      case '≥': return num && a >= b;
      case '≤': return num && a <= b;
      case 'contiene': return normTxt(v).includes(normTxt(r.value));
      case 'vacío': return v == null || String(v).trim() === '';
      case 'no vacío': return !(v == null || String(v).trim() === '');
      default: return true;
    }
  };
  return mode === 'any' ? rules.some(test) : rules.every(test);
}

export function propSymbolSize(pt, v) {
  const mn = pt.sizeMin == null ? 2 : pt.sizeMin, mx = pt.sizeMax == null ? 18 : pt.sizeMax;
  return mn + (mx - mn) * Math.sqrt(Math.max(0, v) / pt.sizeMaxValue);
}

export function makeVectorStyleFn(getLayerState, def, ctx) {
  const cache = new Map();
  let cacheVersion = -1;
  let cacheScale = -1;
  return function styleFn(feature) {
    const layerState = getLayerState();
    if (!layerState) return null;
    const flt = layerState.params && layerState.params.filter;
    if (flt && flt.length && !passFilter(feature, flt, layerState.params.filterMode)) return null;
    const st = layerState.style;
    if (layerState._styleVersion !== cacheVersion || ctx.pxPerMm !== cacheScale) {
      cache.clear(); cacheVersion = layerState._styleVersion; cacheScale = ctx.pxPerMm;
    }
    const pxPerPt = ctx.pxPerMm * PT_MM;
    const geomType = feature.getGeometry() ? feature.getGeometry().getType() : 'Point';
    const cat = st.categorize && st.categorize.field ? feature.get(st.categorize.field) : undefined;
    const catColor = classify(st.categorize, cat);
    if (st.categorize && st.categorize.field && st.categorize.hideOthers && catColor === undefined) return null;
    const lab = st.label || {};
    let text = '';
    let labelCfg = lab;
    if (lab.show && lab.field) {
      const v = feature.get(lab.field);
      text = v == null ? '' : String(v);
      if (lab.byClass) {
        const cl = classLabelStyle(feature.get('clase'));
        labelCfg = { ...lab, italic: cl.italic, bold: cl.bold || lab.bold, uppercase: cl.upper, letterSpacing: cl.spacing, color: cl.color, size: lab.size * cl.scale };
      }
      if (labelCfg.uppercase) text = text.toLocaleUpperCase('es');
      if (lab.prefixRemove) text = text.replace(/^(Base|Isla)\s+/i, '');
    }
    const isPoint = geomType === 'Point' || geomType === 'MultiPoint';
    // símbolos proporcionales: el área del símbolo crece con el valor (raíz cuadrada)
    let propSize = null;
    if (isPoint && st.point.sizeField && st.point.sizeMaxValue > 0) {
      const v = Number(feature.get(st.point.sizeField));
      if (Number.isFinite(v)) propSize = propSymbolSize(st.point, v);
    }
    const key = `${geomType}|${catColor || ''}|${text}|${feature.get('clase') || ''}|${propSize == null ? '' : propSize.toFixed(2)}`;
    if (cache.has(key)) return cache.get(key);
    const styles = [];
    const isLine = geomType === 'LineString' || geomType === 'MultiLineString';
    if (isPoint) {
      const p = { ...st.point };
      if (catColor) p.fill = catColor;
      if (propSize != null) p.size = propSize;
      if (p.shape !== 'none' && p.size > 0) {
        styles.push(new Style({
          renderer(coords, state) {
            const pr = state.pixelRatio;
            const draw = (c) => drawSymbol(state.context, c[0], c[1], p, pxPerPt * pr);
            if (Array.isArray(coords[0])) coords.forEach(draw); else draw(coords);
          },
        }));
      }
    } else if (isLine) {
      const l = st.line;
      const w = l.width * pxPerPt;
      if (l.deco && l.deco !== 'none') {
        styles.push(new Style({
          renderer(coords, state) {
            const k = pxPerPt * state.pixelRatio;
            const lines = Array.isArray(coords[0][0]) ? coords : [coords];
            for (const ln of lines) drawDecoratedLine(state.context, ln, l, k, catColor);
          },
        }));
      } else {
        styles.push(new Style({
          stroke: new Stroke({ color: rgba(catColor || l.color, l.opacity == null ? 1 : l.opacity), width: w, lineDash: dashArray(l.dash, w, pxPerPt * 0.6), lineCap: dashCap(l.dash), lineJoin: 'round' }),
        }));
      }
    } else {
      const pg = st.polygon;
      const fillColor = catColor || pg.fill;
      const sw = pg.strokeWidth * pxPerPt;
      if (pg.fillOpacity > 0) styles.push(new Style({ fill: new Fill({ color: rgba(fillColor, pg.fillOpacity) }) }));
      if (pg.pattern && pg.pattern !== 'none') {
        const pat = getPattern(pg.pattern, rgba(pg.patternColor, 1), pg.patternSpacing * ctx.pxPerMm * ctx.pixelRatio, (pg.patternWidth || 0.25) * pxPerPt * ctx.pixelRatio);
        if (pat) styles.push(new Style({ fill: new Fill({ color: pat }) }));
      }
      if (sw > 0 && pg.strokeOpacity > 0) {
        styles.push(new Style({ stroke: new Stroke({ color: rgba(pg.stroke, pg.strokeOpacity), width: sw, lineDash: dashArray(pg.dash, sw, pxPerPt * 0.6), lineCap: dashCap(pg.dash), lineJoin: 'round' }) }));
      }
    }
    if (text) {
      const sizePx = labelCfg.size * pxPerPt;
      styles.push(new Style({
        text: new Text({
          text: spacedText(text, labelCfg.letterSpacing),
          font: fontString({ font: labelCfg.font, sizePx, bold: labelCfg.bold, italic: labelCfg.italic }),
          fill: new Fill({ color: labelCfg.color }),
          stroke: labelCfg.haloWidth > 0 ? new Stroke({ color: labelCfg.halo, width: labelCfg.haloWidth * pxPerPt * 2 }) : undefined,
          offsetX: (labelCfg.offsetX || 0) * pxPerPt,
          offsetY: isPoint ? (labelCfg.offsetY || 0) * pxPerPt : 0,
          placement: isLine && lab.alongLine ? 'line' : 'point',
          overflow: true,
          textAlign: 'center',
          padding: [1, 1, 1, 1],
        }),
      }));
    }
    cache.set(key, styles);
    return styles;
  };
}
