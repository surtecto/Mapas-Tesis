// Composición sobre el mapa: zooms (lupas), conectores, textos, leyenda, norte, escala, rótulos de grilla y marco.
// Todo se dibuja con la API Canvas 2D en milímetros de papel × s (px por mm), de modo que la vista previa,
// la exportación ráster y la exportación SVG comparten exactamente el mismo código.
import { getDistance } from 'ol/sphere.js';
import { PT_MM, rgba, convexHull, segmentPolygonT, polygonCentroid, niceLength, roundScale, fmtInt, formatGridLabel, pointInPolygon } from './util.js';
import { drawSymbol, dashArray, dashCap, fontString, getPattern, drawDecoratedLine } from './styles.js';
import { CERTAINTY } from './state.js';
import { lonLatTo, toLonLatFrom } from './projections.js';
import { getDef, defOf } from './catalog.js';
import { siteSymbolCfg } from './layers.js';

export const ACCENT = '#e8501c';

// ---------- geometría básica ----------
export function frameRect(state) {
  const p = state.page, m = p.margins || { top: 0, right: 0, bottom: 0, left: 0 };
  return { x: m.left, y: m.top, w: p.widthMM - m.left - m.right, h: p.heightMM - m.top - m.bottom };
}

export function insetOutline(ins, n = 120) {
  const pts = [];
  if (ins.shape === 'circle') {
    const r = Math.min(ins.w, ins.h) / 2, cx = ins.x + ins.w / 2, cy = ins.y + ins.h / 2;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  }
  const rad = ins.shape === 'rounded' ? Math.min(ins.w, ins.h) * 0.1 : 0;
  const x0 = ins.x, y0 = ins.y, x1 = ins.x + ins.w, y1 = ins.y + ins.h;
  const side = (ax, ay, bx, by, k) => { for (let i = 0; i < k; i++) pts.push([ax + ((bx - ax) * i) / k, ay + ((by - ay) * i) / k]); };
  const arc = (cx, cy, a0) => { for (let i = 0; i < 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); } };
  const k = Math.max(4, Math.round(n / 4));
  if (rad > 0) {
    side(x0 + rad, y0, x1 - rad, y0, k); arc(x1 - rad, y0 + rad, -Math.PI / 2);
    side(x1, y0 + rad, x1, y1 - rad, k); arc(x1 - rad, y1 - rad, 0);
    side(x1 - rad, y1, x0 + rad, y1, k); arc(x0 + rad, y1 - rad, Math.PI / 2);
    side(x0, y1 - rad, x0, y0 + rad, k); arc(x0 + rad, y0 + rad, Math.PI);
  } else {
    side(x0, y0, x1, y0, k); side(x1, y0, x1, y1, k); side(x1, y1, x0, y1, k); side(x0, y1, x0, y0, k);
  }
  return pts;
}

export function insetShapePath(ctx, s, ins) {
  ctx.beginPath();
  if (ins.shape === 'circle') {
    const r = Math.min(ins.w, ins.h) / 2;
    ctx.arc((ins.x + ins.w / 2) * s, (ins.y + ins.h / 2) * s, r * s, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (ins.shape === 'rounded') {
    const r = Math.min(ins.w, ins.h) * 0.1 * s;
    const x = ins.x * s, y = ins.y * s, w = ins.w * s, h = ins.h * s;
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - r); ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
    return;
  }
  ctx.rect(ins.x * s, ins.y * s, ins.w * s, ins.h * s);
}

function setStroke(ctx, s, st) {
  const lw = (st.width || 0) * PT_MM * s;
  ctx.lineWidth = lw;
  ctx.strokeStyle = rgba(st.color || '#000', st.opacity == null ? 1 : st.opacity);
  ctx.setLineDash(dashArray(st.dash || 'solid', lw, PT_MM * s * 0.6) || []);
  ctx.lineCap = dashCap(st.dash || 'solid');
  ctx.lineJoin = 'round';
  return lw;
}

function polyPath(ctx, s, pts, closed = true) {
  ctx.beginPath();
  let started = false;
  for (const p of pts) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { started = false; continue; }
    if (!started) { ctx.moveTo(p[0] * s, p[1] * s); started = true; } else ctx.lineTo(p[0] * s, p[1] * s);
  }
  if (closed) ctx.closePath();
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
export function distToOutline(p, pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) m = Math.min(m, distToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  return m;
}

// Transformaciones entre mapas
function insetToMainPage(geo, insGeo, pagePt) {
  const c = insGeo.fromPage(pagePt);
  if (!c) return null;
  const ll = toLonLatFrom(insGeo.projection, c);
  if (!ll || !Number.isFinite(ll[0])) return null;
  return geo.main.toPage(lonLatTo(geo.main.projection, ll));
}
function mainToInsetPage(geo, insGeo, pagePt) {
  const c = geo.main.fromPage(pagePt);
  if (!c) return null;
  const ll = toLonLatFrom(geo.main.projection, c);
  if (!ll || !Number.isFinite(ll[0])) return null;
  return insGeo.toPage(lonLatTo(insGeo.projection, ll));
}

export function lonLatAtPage(geo, pt) {
  const c = geo.main.fromPage(pt);
  if (!c) return null;
  return toLonLatFrom(geo.main.projection, c);
}

export function metersPerMmAt(geo, pt) {
  const a = lonLatAtPage(geo, [pt[0] - 0.5, pt[1]]);
  const b = lonLatAtPage(geo, [pt[0] + 0.5, pt[1]]);
  if (!a || !b) return NaN;
  return getDistance(a, b);
}

export function scaleInfo(geo, state) {
  const f = frameRect(state);
  const c = [f.x + f.w / 2, f.y + f.h / 2];
  const mc = metersPerMmAt(geo, c);
  const samples = [[f.x + f.w * 0.1, c[1]], [f.x + f.w * 0.9, c[1]], [c[0], f.y + f.h * 0.1], [c[0], f.y + f.h * 0.9]].map((p) => metersPerMmAt(geo, p)).filter(Number.isFinite);
  const mn = Math.min(mc, ...samples), mx = Math.max(mc, ...samples);
  return { rf: mc * 1000, variation: mn > 0 ? (mx - mn) / mn : 0, metersPerMm: mc };
}

// ---------- footprints y conectores ----------
function insetFootprint(geo, ins) {
  const ig = geo.insets[ins.id];
  if (!ig) return null;
  const outline = insetOutline(ins, 96);
  const pts = outline.map((p) => insetToMainPage(geo, ig, p));
  if (pts.some((p) => !p || !Number.isFinite(p[0]))) return null;
  return pts;
}

function tangentSegments(A, B) {
  const all = A.map((p) => [p[0], p[1], 0]).concat(B.map((p) => [p[0], p[1], 1]));
  const hull = convexHull(all.map((p) => [p[0], p[1]]));
  const tag = (h) => all[h[2]][2];
  const segs = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if (tag(a) !== tag(b)) segs.push([[a[0], a[1]], [b[0], b[1]]]);
  }
  return segs.length === 2 ? segs : [];
}

function centerSegment(A, B) {
  const ca = polygonCentroid(A), cb = polygonCentroid(B);
  const tA = segmentPolygonT(ca, cb, A), tB = segmentPolygonT(ca, cb, B);
  if (!tA.length || !tB.length) return null;
  const ta = Math.max(...tA), tb = Math.min(...tB);
  if (ta >= tb) return null;
  const P = (t) => [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t];
  return [P(ta), P(tb)];
}

function clipOutsideInsets(ctx, s, state, rect) {
  ctx.beginPath();
  ctx.rect(rect.x * s, rect.y * s, rect.w * s, rect.h * s);
  for (const z of state.insets) {
    const pts = insetOutline(z, 72);
    ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s);
    ctx.closePath();
  }
  ctx.clip('evenodd');
}

function contextBox(geo, state, ig) {
  const f = frameRect(state);
  const pts = [];
  const k = 30;
  const side = (ax, ay, bx, by) => { for (let i = 0; i < k; i++) pts.push([ax + ((bx - ax) * i) / k, ay + ((by - ay) * i) / k]); };
  side(f.x, f.y, f.x + f.w, f.y); side(f.x + f.w, f.y, f.x + f.w, f.y + f.h); side(f.x + f.w, f.y + f.h, f.x, f.y + f.h); side(f.x, f.y + f.h, f.x, f.y);
  const box = pts.map((p) => mainToInsetPage(geo, ig, p));
  return box.every((p) => p && Number.isFinite(p[0])) ? box : null;
}

function drawFootprints(ctx, s, geo, state, hits, fps) {
  const f = frameRect(state);
  for (const ins of state.insets) {
    if (ins.mode !== 'detail' || !geo.insets[ins.id]) continue;
    const fp = insetFootprint(geo, ins);
    if (!fp) continue;
    fps[ins.id] = fp;
    hits && hits.push({ kind: 'footprint', id: ins.id, poly: fp });
    if (!ins.footprint.show) continue;
    ctx.save();
    clipOutsideInsets(ctx, s, state, f);
    polyPath(ctx, s, fp, true);
    if (ins.footprint.fillOpacity > 0) { ctx.fillStyle = rgba(ins.footprint.fill, ins.footprint.fillOpacity); ctx.fill(); }
    setStroke(ctx, s, ins.footprint);
    if (ins.footprint.width > 0) ctx.stroke();
    ctx.restore();
  }
}

function drawConnectors(ctx, s, state, fps) {
  const page = { x: 0, y: 0, w: state.page.widthMM, h: state.page.heightMM };
  for (const ins of state.insets) {
    const fp = fps[ins.id];
    if (!fp || !ins.connector || ins.connector.type === 'none') continue;
    const outline = insetOutline(ins, 120);
    const segs = ins.connector.type === 'center' ? [centerSegment(fp, outline)].filter(Boolean) : tangentSegments(fp, outline);
    ctx.save();
    clipOutsideInsets(ctx, s, state, page);
    setStroke(ctx, s, ins.connector);
    for (const [a, b] of segs) { ctx.beginPath(); ctx.moveTo(a[0] * s, a[1] * s); ctx.lineTo(b[0] * s, b[1] * s); ctx.stroke(); }
    ctx.restore();
  }
}

function drawExtentBoxes(ctx, s, geo, state) {
  for (const ins of state.insets) {
    const ig = geo.insets[ins.id];
    if (!ig || ins.mode !== 'context' || !ins.extentBox || !ins.extentBox.show) continue;
    const box = contextBox(geo, state, ig);
    if (!box) continue;
    ctx.save();
    insetShapePath(ctx, s, ins);
    ctx.clip();
    const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    setStroke(ctx, s, ins.extentBox);
    if (size < 2.2) {
      const c = polygonCentroid(box);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.rect((c[0] - 1.2) * s, (c[1] - 1.2) * s, 2.4 * s, 2.4 * s); ctx.stroke();
    } else { polyPath(ctx, s, box, true); ctx.stroke(); }
    ctx.restore();
  }
}

function drawInsetBorders(ctx, s, state, hits) {
  for (const ins of state.insets) {
    if (ins.border && ins.border.width > 0) {
      ctx.save();
      setStroke(ctx, s, ins.border);
      insetShapePath(ctx, s, ins);
      ctx.stroke();
      ctx.restore();
    }
    hits && hits.push({ kind: 'inset', id: ins.id, outline: insetOutline(ins, 72) });
  }
}

// ---------- grilla de coordenadas (vectorial) ----------
const NICE_DEG = [90, 45, 30, 20, 15, 10, 5, 2, 1, 0.5, 0.25, 1 / 6, 1 / 12, 1 / 30, 1 / 60];
function pickInterval(deg) {
  let best = NICE_DEG[0], bd = Infinity;
  for (const v of NICE_DEG) { const d = Math.abs(Math.log(v / deg)); if (d < bd) { bd = d; best = v; } }
  return best;
}
export function graticuleIntervals(st, mpm, centerLat) {
  const latDeg = (mpm * 26) / 111320;
  const cos = Math.max(0.05, Math.cos((centerLat * Math.PI) / 180));
  const lonDeg = Math.min(60, latDeg / cos);
  const lat = st.interval && st.interval !== 'auto' ? Number(st.interval) : pickInterval(latDeg);
  const lon = st.intervalLon && st.intervalLon !== 'auto' ? Number(st.intervalLon) : pickInterval(lonDeg);
  return { lat, lon };
}

function scopeRange(scope, rect) {
  let minLat = 90, maxLat = -90;
  const lons = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const c = scope.fromPage([rect.x + (rect.w * i) / n, rect.y + (rect.h * j) / n]);
      if (!c) continue;
      const ll = toLonLatFrom(scope.projection, c);
      if (!ll || !Number.isFinite(ll[1])) continue;
      minLat = Math.min(minLat, ll[1]); maxLat = Math.max(maxLat, ll[1]);
      lons.push(ll[0]);
    }
  }
  let full = false;
  for (const pole of [-90, 90]) {
    const pp = scope.toPage(lonLatTo(scope.projection, [0, pole]));
    if (pp && pp[0] >= rect.x && pp[0] <= rect.x + rect.w && pp[1] >= rect.y && pp[1] <= rect.y + rect.h) {
      full = true;
      if (pole < 0) minLat = -90; else maxLat = 90;
    }
  }
  let minLon = -180, maxLon = 180;
  if (!full && lons.length) {
    let a = Math.min(...lons), b = Math.max(...lons);
    if (b - a > 180) {
      const shifted = lons.map((v) => (v < 0 ? v + 360 : v));
      a = Math.min(...shifted); b = Math.max(...shifted);
    }
    const pad = Math.max(1, (b - a) * 0.15);
    minLon = a - pad; maxLon = b + pad;
    if (maxLon - minLon >= 360) { minLon = -180; maxLon = 180; full = true; }
  } else full = true;
  const latPad = Math.max(0.5, (maxLat - minLat) * 0.15);
  return { minLat: Math.max(-90, minLat - latPad), maxLat: Math.min(90, maxLat + latPad), minLon, maxLon, full };
}

function strokeLine(ctx, s, scope, pts, maxJump) {
  ctx.beginPath();
  let prev = null;
  for (const ll of pts) {
    const p = scope.toPage(lonLatTo(scope.projection, ll));
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { prev = null; continue; }
    if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < maxJump) ctx.lineTo(p[0] * s, p[1] * s);
    else ctx.moveTo(p[0] * s, p[1] * s);
    prev = p;
  }
  ctx.stroke();
}

function drawGraticuleLines(ctx, s, scope, rect, st, intervals, mpm) {
  const r = scopeRange(scope, rect);
  const is3857 = scope.projection === 'EPSG:3857';
  const latLo = Math.max(r.minLat, is3857 ? -85 : -90), latHi = Math.min(r.maxLat, is3857 ? 85 : 90);
  const stepLat = Math.min(0.5, Math.max(0.002, (0.7 * mpm) / 111320));
  const maxJump = Math.max(rect.w, rect.h) * 0.5;
  setStroke(ctx, s, st.line);
  const I = intervals;
  // meridianos
  const lon0 = Math.ceil(r.minLon / I.lon - 1e-9) * I.lon;
  for (let lon = lon0, guard = 0; lon <= r.maxLon + 1e-9 && guard < 400; lon += I.lon, guard++) {
    if (r.full && lon >= 180 - 1e-9) continue;
    const pts = [];
    for (let lat = latLo; lat <= latHi + 1e-9; lat += stepLat) pts.push([lon, Math.min(lat, latHi)]);
    strokeLine(ctx, s, scope, pts, maxJump);
  }
  // paralelos
  const lat0 = Math.ceil(latLo / I.lat - 1e-9) * I.lat;
  for (let lat = lat0, guard = 0; lat <= latHi + 1e-9 && guard < 400; lat += I.lat, guard++) {
    if (Math.abs(lat) >= 89.999) continue;
    const cos = Math.max(0.02, Math.cos((lat * Math.PI) / 180));
    const stepLon = Math.min(1, Math.max(0.002, stepLat / cos));
    const pts = [];
    for (let lon = r.minLon; lon <= r.maxLon + 1e-9; lon += stepLon) pts.push([lon > 180 ? lon - 360 : lon, lat]);
    strokeLine(ctx, s, scope, pts, maxJump);
  }
}

export function graticuleLayer(state) { return state.layers.find((l) => l.def === 'graticule'); }

function drawGraticules(ctx, s, geo, state) {
  const gl = graticuleLayer(state);
  if (!gl) return;
  const st = gl.style;
  const f = frameRect(state);
  if (gl.visible) {
    const iv = graticuleIntervals(st, state.view.mpm, state.view.center[1]);
    ctx.save();
    clipOutsideInsets(ctx, s, state, f);
    ctx.globalAlpha = gl.opacity == null ? 1 : gl.opacity;
    drawGraticuleLines(ctx, s, geo.main, f, st, iv, state.view.mpm);
    ctx.restore();
  }
  for (const ins of state.insets) {
    const ig = geo.insets[ins.id];
    const o = ins.layers ? ins.layers[gl.uid] : undefined;
    const show = o === true || o === false ? o : !!ins.graticule;
    if (!ig || !show) continue;
    const iv = graticuleIntervals(st, ins.mpm, ins.center[1]);
    ctx.save();
    insetShapePath(ctx, s, ins);
    ctx.clip();
    drawGraticuleLines(ctx, s, ig, { x: ins.x, y: ins.y, w: ins.w, h: ins.h }, st, iv, ins.mpm);
    ctx.restore();
  }
}

// ---------- sitios ----------
function mPerMmScope(scope, p) {
  const a = scope.fromPage([p[0] - 0.5, p[1]]), b = scope.fromPage([p[0] + 0.5, p[1]]);
  if (!a || !b) return NaN;
  return getDistance(toLonLatFrom(scope.projection, a), toLonLatFrom(scope.projection, b));
}

export function siteLabelOffset(site, state) {
  const ss = state.siteStyle;
  const cfg = siteSymbolCfg(site, state);
  const dx = site.label && site.label.dx != null && site.label.dx !== '' ? Number(site.label.dx) : 0;
  const haloR = ss.halo && ss.halo.show && ss.halo.unit === 'pt' ? ss.halo.size / 2 : 0;
  const dy = site.label && site.label.dy != null && site.label.dy !== '' ? Number(site.label.dy) : -(Math.max(cfg.size / 2, haloR) + ss.label.size * 0.85);
  return [dx, dy];
}

function drawSitesIn(ctx, s, scope, state, { labels: withLabels = true } = {}) {
  const ss = state.siteStyle;
  const pxPerPt = PT_MM * s;
  const labels = [];
  for (const site of state.sites) {
    const p = scope.toPage(lonLatTo(scope.projection, [site.lon, site.lat]));
    if (!p || !Number.isFinite(p[0])) continue;
    const cfg = siteSymbolCfg(site, state);
    if (ss.halo && ss.halo.show) {
      let rmm = (ss.halo.size * PT_MM) / 2;
      if (ss.halo.unit === 'km') { const m = mPerMmScope(scope, p); if (m > 0) rmm = (ss.halo.km * 1000) / m; }
      const n = cfg.colors.length;
      const seg = (i) => [-Math.PI / 2 + (i * 2 * Math.PI) / n, -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n];
      ctx.save();
      ctx.setLineDash([]);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        if (n === 1) ctx.arc(p[0] * s, p[1] * s, rmm * s, 0, Math.PI * 2);
        else { const [a0, a1] = seg(i); ctx.moveTo(p[0] * s, p[1] * s); ctx.arc(p[0] * s, p[1] * s, rmm * s, a0, a1); ctx.closePath(); }
        ctx.fillStyle = rgba(cfg.colors[i], ss.halo.fillOpacity);
        ctx.fill();
      }
      ctx.lineWidth = ss.halo.strokeWidth * pxPerPt;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        if (n === 1) ctx.arc(p[0] * s, p[1] * s, rmm * s, 0, Math.PI * 2);
        else { const [a0, a1] = seg(i); ctx.arc(p[0] * s, p[1] * s, rmm * s, a0, a1); }
        ctx.strokeStyle = cfg.colors[i];
        ctx.stroke();
      }
      ctx.restore();
      if (cfg.size > 0 && ss.halo.dot !== false) drawSymbol(ctx, p[0] * s, p[1] * s, { ...cfg, size: Math.min(cfg.size, 3.5) }, pxPerPt);
    } else drawSymbol(ctx, p[0] * s, p[1] * s, cfg, pxPerPt);
    const lab = ss.label;
    const show = site.label && site.label.show === false ? false : lab.show;
    if (show && site.name && withLabels) labels.push({ site, p });
  }
  const lab = ss.label;
  for (const { site, p } of labels) {
    const [dx, dy] = siteLabelOffset(site, state);
    const x = (p[0] + dx * PT_MM) * s, y = (p[1] + dy * PT_MM) * s;
    ctx.save();
    ctx.font = fontString({ font: lab.font, sizePx: lab.size * PT_MM * s, bold: lab.bold, italic: lab.italic });
    ctx.textAlign = site.label && site.label.align === 'left' ? 'left' : site.label && site.label.align === 'right' ? 'right' : 'center';
    ctx.textBaseline = 'middle';
    if (lab.haloWidth > 0) { ctx.lineWidth = lab.haloWidth * pxPerPt * 2; ctx.strokeStyle = lab.halo; ctx.lineJoin = 'round'; ctx.strokeText(site.name, x, y); }
    ctx.fillStyle = lab.color;
    ctx.fillText(site.name, x, y);
    ctx.restore();
  }
}

function drawSites(ctx, s, geo, state) {
  const f = frameRect(state);
  if (state.sitesVisible !== false) {
    ctx.save();
    clipOutsideInsets(ctx, s, state, f);
    drawSitesIn(ctx, s, geo.main, state);
    ctx.restore();
  }
  for (const ins of state.insets) {
    const ig = geo.insets[ins.id];
    const o = ins.layers ? ins.layers.__sites__ : undefined;
    const show = o === true || o === false ? o : state.sitesVisible !== false;
    if (!ig || !show) continue;
    ctx.save();
    insetShapePath(ctx, s, ins);
    ctx.clip();
    // en los mapas de ubicación el sitio se marca sin rótulo (salvo que se pida)
    drawSitesIn(ctx, s, ig, state, { labels: ins.mode !== 'context' || !!ins.siteLabels });
    ctx.restore();
  }
}

// ---------- textos ----------
export function textMetrics(ctx, s, t) {
  const sizeMM = t.size * PT_MM;
  ctx.font = fontString({ font: t.font, sizePx: sizeMM * s, bold: t.bold, italic: t.italic });
  const lsPx = (t.letterSpacing || 0) * sizeMM * s;
  const hasLS = 'letterSpacing' in ctx;
  if (hasLS) ctx.letterSpacing = `${lsPx}px`;
  const raw = t.uppercase ? String(t.text || '').toLocaleUpperCase('es') : String(t.text || '');
  const lines = raw.split('\n');
  const widths = lines.map((l) => {
    let w = ctx.measureText(l).width;
    if (!hasLS) w += Math.max(0, Array.from(l).length - 1) * lsPx;
    return w / s;
  });
  const lh = sizeMM * (t.lineHeight || 1.2);
  return { lines, widths, lh, w: Math.max(0, ...widths), h: lh * lines.length, sizeMM, lsPx, hasLS };
}

function drawManualSpaced(ctx, line, x, y, lsPx, mode) {
  let cx = x;
  for (const ch of Array.from(line)) {
    if (mode === 'stroke') ctx.strokeText(ch, cx, y); else ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + lsPx;
  }
}

export function drawText(ctx, s, t, pos) {
  ctx.save();
  const m = textMetrics(ctx, s, t);
  const rot = ((t.rotation || 0) * Math.PI) / 180;
  ctx.translate(pos[0] * s, pos[1] * s);
  if (rot) ctx.rotate(rot);
  const ax = t.align === 'left' ? 0 : t.align === 'right' ? -m.w : -m.w / 2;
  const top = -m.h / 2;
  if (t.bg && t.bg.show) {
    const pad = t.bg.pad || 1;
    const r = (t.bg.radius || 0) * s;
    const x = (ax - pad) * s, y = (top - pad * 0.7) * s, w = (m.w + pad * 2) * s, h = (m.h + pad * 1.4) * s;
    ctx.beginPath();
    if (ctx.roundRect && r > 0) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    ctx.fillStyle = rgba(t.bg.color, t.bg.opacity == null ? 1 : t.bg.opacity);
    ctx.fill();
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  m.lines.forEach((line, i) => {
    const lw = m.widths[i];
    const lx = t.align === 'left' ? ax : t.align === 'right' ? ax + (m.w - lw) : ax + (m.w - lw) / 2;
    const ly = top + m.lh * (i + 0.5);
    if (t.haloWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = t.haloWidth * PT_MM * s * 2;
      ctx.strokeStyle = t.halo || '#fff';
      if (m.hasLS || !m.lsPx) ctx.strokeText(line, lx * s, ly * s); else drawManualSpaced(ctx, line, lx * s, ly * s, m.lsPx, 'stroke');
    }
    ctx.fillStyle = t.color;
    if (m.hasLS || !m.lsPx) ctx.fillText(line, lx * s, ly * s); else drawManualSpaced(ctx, line, lx * s, ly * s, m.lsPx, 'fill');
  });
  ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  // polígono de selección (mm)
  const pad = t.bg && t.bg.show ? t.bg.pad || 1 : 0.6;
  const corners = [[ax - pad, top - pad], [ax + m.w + pad, top - pad], [ax + m.w + pad, top + m.h + pad], [ax - pad, top + m.h + pad]];
  const c = Math.cos(rot), sn = Math.sin(rot);
  return corners.map(([x, y]) => [pos[0] + x * c - y * sn, pos[1] + x * sn + y * c]);
}

export function textPosition(geo, t) {
  if (t.anchor === 'geo' && Number.isFinite(t.lon) && Number.isFinite(t.lat)) {
    return geo.main.toPage(lonLatTo(geo.main.projection, [t.lon, t.lat]));
  }
  return [t.x, t.y];
}

// ---------- leyenda ----------
function userGeomType(ls) {
  const f = ls.data && ls.data.features && ls.data.features.find((x) => x.geometry);
  const t = f ? f.geometry.type : 'Point';
  if (/Point/.test(t)) return 'point';
  if (/Line/.test(t)) return 'line';
  return 'polygon';
}

export function legendItems(state) {
  const items = [];
  const usedCats = new Set();
  state.sites.forEach((s) => (s.cats || []).forEach((c) => usedCats.add(c)));
  const halo = state.siteStyle.halo && state.siteStyle.halo.show;
  const sitesOn = state.sitesVisible !== false; // sitios ocultos en el mapa principal: no van a la leyenda
  for (const c of sitesOn ? state.categories : []) {
    if (!usedCats.has(c.id) && state.legend.onlyUsed !== false) continue;
    items.push({ key: `cat:${c.id}`, label: c.name, sym: halo ? { type: 'halo', color: c.color, ss: state.siteStyle } : { type: 'point', cfg: { ...siteSymbolCfg({ cats: [c.id] }, state) } } });
  }
  for (const s of sitesOn ? state.sites : []) {
    if (s.cats && s.cats.length) continue;
    items.push({ key: `site:${s.id}`, label: s.name, sym: halo ? { type: 'halo', color: s.color || '#555', ss: state.siteStyle } : { type: 'point', cfg: siteSymbolCfg(s, state) } });
  }
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const ls = state.layers[i];
    if (ls.def === 'interp') { if (ls.visible && ls.legend && ls.legend.show !== false) interpLegendItems(state, ls, items); continue; }
    if (!ls.visible || !ls.legend || !ls.legend.show || !ls.style) continue;
    const def = ls.def === 'user' ? { geom: userGeomType(ls) } : defOf(ls);
    if (!def || !def.geom) continue;
    const st = ls.style;
    const cz = st.categorize || {};
    const cat = cz.field && cz.mode === 'ranges' ? (cz.ranges || []).map((r) => [r.label || `${r.min}–${r.max}`, r.color])
      : cz.field && cz.values ? Object.entries(cz.values) : [];
    if (cat.length && ls.legend.expand !== false) {
      for (const [val, col] of cat) {
        items.push({ key: `layer:${ls.uid}:${val}`, label: val, sym: symFromStyle(def.geom, st, col) });
      }
    } else {
      items.push({ key: `layer:${ls.uid}`, label: ls.legend.label || ls.name, sym: symFromStyle(def.geom, st) });
    }
  }
  for (const c of state.legend.custom || []) items.push({ key: `custom:${c.id}`, label: c.label, sym: c.sym });
  // personalizaciones
  const ov = state.legend.overrides || {};
  let out = items.map((it) => ({ ...it, label: ov[it.key] && ov[it.key].label != null ? ov[it.key].label : it.label, hidden: !!(ov[it.key] && ov[it.key].hidden) }));
  const order = state.legend.order || [];
  if (order.length) {
    out.sort((a, b) => {
      const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
      return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
    });
  }
  return out;
}

function interpLegendItems(state, ls, items) {
  const it = state.interp;
  const vid = ls.params && ls.params.version && ls.params.version !== 'active' ? ls.params.version : it.active;
  const ver = it.versions.find((v) => v.id === vid);
  if (!ver) return;
  if (ls.params && ls.params.ghost) {
    items.push({ key: `interp:ghost:${ver.id}`, label: `${ver.name} (versión anterior)`, sym: { type: 'line', line: { color: '#8a8a8a', width: 0.7, dash: 'short' } } });
    return;
  }
  const used = new Set(), certs = new Set();
  for (const f of ver.features.features || []) { used.add(f.properties && f.properties.cat); certs.add((f.properties && f.properties.cert) || 'cierta'); }
  for (const c of it.categories) if (used.has(c.id)) items.push({ key: `interp:${c.id}`, label: c.name, sym: { type: 'interp', cat: c, cert: 'cierta' } });
  if (certs.size > 1 || (certs.size === 1 && !certs.has('cierta'))) {
    for (const ce of CERTAINTY) if (certs.has(ce.id)) items.push({ key: `interp:cert:${ce.id}`, label: ce.name, sym: { type: 'cert', cert: ce.id } });
  }
}

function symFromStyle(geom, st, color) {
  if (geom === 'point') return { type: 'point', cfg: { ...st.point, fill: color || st.point.fill } };
  if (geom === 'line') return { type: 'line', line: { ...st.line, color: color || st.line.color } };
  return { type: 'polygon', pg: { ...st.polygon, fill: color || st.polygon.fill } };
}

function drawLegendSymbol(ctx, s, sym, x, y, size) {
  // x,y: centro; size en mm
  const pxPerPt = PT_MM * s;
  if (sym.type === 'point') {
    const cfg = { ...sym.cfg };
    if (cfg.shape === 'none') return;
    cfg.size = Math.min(cfg.size || 5, (size / PT_MM) * 1.1);
    drawSymbol(ctx, x * s, y * s, cfg, pxPerPt);
  } else if (sym.type === 'halo') {
    const r = (size / 2) * 0.95 * s;
    ctx.beginPath(); ctx.arc(x * s, y * s, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(sym.color, sym.ss.halo.fillOpacity); ctx.fill();
    ctx.lineWidth = Math.min(sym.ss.halo.strokeWidth, 2.2) * pxPerPt; ctx.strokeStyle = sym.color; ctx.setLineDash([]); ctx.stroke();
  } else if (sym.type === 'line') {
    ctx.save();
    if (sym.line.deco && sym.line.deco !== 'none') {
      drawDecoratedLine(ctx, [[(x - size * 0.75) * s, y * s], [(x + size * 0.75) * s, y * s]], { ...sym.line, decoSpacing: Math.min(sym.line.decoSpacing || 2.6, size * 0.6) }, pxPerPt);
    } else {
      setStroke(ctx, s, { color: sym.line.color, width: sym.line.width, dash: sym.line.dash, opacity: sym.line.opacity });
      ctx.beginPath(); ctx.moveTo((x - size * 0.75) * s, y * s); ctx.lineTo((x + size * 0.75) * s, y * s); ctx.stroke();
    }
    ctx.restore();
  } else if (sym.type === 'cert') {
    const ce = CERTAINTY.find((c) => c.id === sym.cert) || CERTAINTY[0];
    ctx.save();
    setStroke(ctx, s, { color: '#3a3a3a', width: 0.9, dash: ce.dash });
    ctx.beginPath(); ctx.moveTo((x - size * 0.75) * s, y * s); ctx.lineTo((x + size * 0.75) * s, y * s); ctx.stroke();
    ctx.restore();
  } else if (sym.type === 'interp') {
    const c = sym.cat;
    if (c.geom === 'line') {
      ctx.save();
      drawDecoratedLine(ctx, [[(x - size * 0.75) * s, y * s], [(x + size * 0.75) * s, y * s]], { color: c.color, width: c.width || 0.8, dash: 'solid', deco: c.deco || 'none', decoColor: c.decoColor, decoSpacing: Math.min(2.6, size * 0.6) }, pxPerPt);
      ctx.restore();
    } else if (c.geom === 'polygon') {
      drawLegendSymbol(ctx, s, { type: 'polygon', pg: { fill: c.color, fillOpacity: 0.35, pattern: c.pattern || 'none', patternColor: c.color, patternSpacing: 1.6, patternWidth: 0.3, stroke: c.color, strokeWidth: c.width || 0.6, strokeOpacity: 1, dash: 'solid' } }, x, y, size);
    } else {
      drawSymbol(ctx, x * s, y * s, { shape: c.shape || 'circle', size: Math.min(c.size || 5, (size / PT_MM) * 1.1), fill: c.color, fillOpacity: 1, stroke: '#ffffff', strokeWidth: 0.5 }, pxPerPt);
    }
  } else if (sym.type === 'polygon') {
    const pg = sym.pg;
    const w = size * 1.5, h = size * 0.85;
    const rx = (x - w / 2) * s, ry = (y - h / 2) * s;
    ctx.save();
    if (pg.fillOpacity > 0) { ctx.fillStyle = rgba(pg.fill, pg.fillOpacity); ctx.fillRect(rx, ry, w * s, h * s); }
    if (pg.pattern && pg.pattern !== 'none') {
      const pat = getPattern(pg.pattern, pg.patternColor, Math.max(3, pg.patternSpacing * s * 0.7), Math.max(0.6, (pg.patternWidth || 0.25) * pxPerPt));
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(rx, ry, w * s, h * s); }
    }
    if (pg.strokeWidth > 0) { setStroke(ctx, s, { color: pg.stroke, width: Math.min(pg.strokeWidth, 1.2), dash: pg.dash, opacity: pg.strokeOpacity }); ctx.strokeRect(rx, ry, w * s, h * s); }
    ctx.restore();
  }
}

export function drawLegend(ctx, s, state) {
  const L = state.legend;
  const items = legendItems(state).filter((i) => !i.hidden);
  if (!items.length && !L.title) return null;
  const sizeMM = L.size * PT_MM;
  const symMM = Math.max(L.symbolSize * PT_MM, sizeMM * 1.1);
  const rowH = Math.max(symMM * 1.15, sizeMM * 1.45);
  const pad = L.padding, gap = L.gap;
  ctx.font = fontString({ font: L.font, sizePx: sizeMM * s, bold: L.bold });
  const cols = Math.max(1, Math.min(4, L.columns || 1));
  const perCol = Math.ceil(items.length / cols);
  const colW = [];
  for (let c = 0; c < cols; c++) {
    const slice = items.slice(c * perCol, (c + 1) * perCol);
    const tw = Math.max(0, ...slice.map((it) => ctx.measureText(it.label).width / s));
    colW.push(symMM * 1.5 + gap + tw);
  }
  let titleH = 0, titleW = 0;
  if (L.title) {
    ctx.font = fontString({ font: L.font, sizePx: L.titleSize * PT_MM * s, bold: true });
    titleW = ctx.measureText(L.title).width / s;
    titleH = L.titleSize * PT_MM * 1.6;
  }
  const colGap = 4;
  const w = Math.max(titleW, colW.reduce((a, b) => a + b, 0) + colGap * (cols - 1)) + pad * 2;
  const h = titleH + perCol * rowH + pad * 2 - (items.length ? 0 : rowH);
  const x0 = L.x, y0 = L.y;
  ctx.save();
  ctx.beginPath();
  const r = (L.radius || 0) * s;
  if (ctx.roundRect && r > 0) ctx.roundRect(x0 * s, y0 * s, w * s, h * s, r); else ctx.rect(x0 * s, y0 * s, w * s, h * s);
  if (L.bgOpacity > 0) { ctx.fillStyle = rgba(L.bg, L.bgOpacity); ctx.fill(); }
  if (L.borderWidth > 0) { setStroke(ctx, s, { color: L.border, width: L.borderWidth }); ctx.stroke(); }
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  if (L.title) {
    ctx.font = fontString({ font: L.font, sizePx: L.titleSize * PT_MM * s, bold: true });
    ctx.fillStyle = L.color;
    ctx.fillText(L.title, (x0 + pad) * s, (y0 + pad + titleH * 0.4) * s);
  }
  ctx.font = fontString({ font: L.font, sizePx: sizeMM * s, bold: L.bold });
  let cx = x0 + pad;
  for (let c = 0; c < cols; c++) {
    const slice = items.slice(c * perCol, (c + 1) * perCol);
    slice.forEach((it, i) => {
      const cy = y0 + pad + titleH + rowH * (i + 0.5);
      drawLegendSymbol(ctx, s, it.sym, cx + symMM * 0.75, cy, symMM);
      ctx.font = fontString({ font: L.font, sizePx: sizeMM * s, bold: L.bold });
      ctx.fillStyle = L.color;
      ctx.fillText(it.label, (cx + symMM * 1.5 + gap) * s, cy * s);
    });
    cx += colW[c] + colGap;
  }
  ctx.restore();
  return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
}

// ---------- norte ----------
export function northAngle(geo, pt) {
  const ll = lonLatAtPage(geo, pt);
  if (!ll) return 0;
  const lat2 = Math.min(89.9, ll[1] + 0.05);
  const p1 = geo.main.toPage(lonLatTo(geo.main.projection, [ll[0], ll[1]]));
  const p2 = geo.main.toPage(lonLatTo(geo.main.projection, [ll[0], lat2]));
  if (!p1 || !p2) return 0;
  return Math.atan2(p2[0] - p1[0], -(p2[1] - p1[1]));
}

export function drawNorth(ctx, s, n, geo) {
  const S = n.size;
  const ang = n.trueNorth ? northAngle(geo, [n.x, n.y]) : 0;
  ctx.save();
  ctx.translate(n.x * s, n.y * s);
  ctx.rotate(ang);
  const u = S * s;
  const col = n.color;
  ctx.setLineDash([]);
  ctx.lineJoin = 'miter';
  const letter = (y, size, color = col) => {
    ctx.font = fontString({ font: n.font, sizePx: size * u, bold: true });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.fillText('N', 0, y * u);
  };
  if (n.style === 'circle') {
    ctx.beginPath(); ctx.arc(0, 0, u / 2, 0, Math.PI * 2);
    if (n.bgOpacity > 0) { ctx.fillStyle = rgba(n.bg, n.bgOpacity); ctx.fill(); }
    ctx.lineWidth = Math.max(0.6, 0.012 * u); ctx.strokeStyle = rgba(col, 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.42 * u); ctx.lineTo(0, 0.02 * u); ctx.lineWidth = 0.075 * u; ctx.strokeStyle = col; ctx.lineCap = 'butt'; ctx.stroke();
    letter(0.24, 0.36);
  } else if (n.style === 'arrow') {
    ctx.beginPath(); ctx.moveTo(0, -0.5 * u); ctx.lineTo(0.2 * u, 0.1 * u); ctx.lineTo(0, 0); ctx.lineTo(-0.2 * u, 0.1 * u); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    letter(0.32, 0.34);
  } else if (n.style === 'half') {
    ctx.beginPath(); ctx.moveTo(0, -0.5 * u); ctx.lineTo(0.22 * u, 0.3 * u); ctx.lineTo(0, 0.18 * u); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -0.5 * u); ctx.lineTo(-0.22 * u, 0.3 * u); ctx.lineTo(0, 0.18 * u); ctx.closePath();
    ctx.fillStyle = rgba(n.bg, 1); ctx.fill(); ctx.lineWidth = Math.max(0.5, 0.025 * u); ctx.strokeStyle = col; ctx.stroke();
    letter(-0.68, 0.3);
  } else if (n.style === 'rose') {
    const pts = (rOuter, rInner, k) => { const p = []; for (let i = 0; i < k * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / k; const r = i % 2 === 0 ? rOuter : rInner; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; };
    const star = pts(0.42 * u, 0.1 * u, 4);
    for (let i = 0; i < star.length; i += 2) {
      const tip = star[i], l = star[(i + star.length - 1) % star.length], r = star[(i + 1) % star.length];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(r[0], r[1]); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(l[0], l[1]); ctx.closePath(); ctx.fillStyle = rgba(n.bg, 1); ctx.fill();
      ctx.lineWidth = Math.max(0.4, 0.018 * u); ctx.strokeStyle = col; ctx.stroke();
    }
    letter(-0.6, 0.26);
  } else {
    // flecha simple con línea
    ctx.beginPath(); ctx.moveTo(0, 0.45 * u); ctx.lineTo(0, -0.3 * u); ctx.lineWidth = 0.05 * u; ctx.strokeStyle = col; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.5 * u); ctx.lineTo(0.13 * u, -0.22 * u); ctx.lineTo(-0.13 * u, -0.22 * u); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    letter(-0.7, 0.3);
  }
  ctx.restore();
  const h = S * 0.75;
  return [[n.x - h, n.y - h], [n.x + h, n.y - h], [n.x + h, n.y + h], [n.x - h, n.y + h]];
}

// ---------- escala gráfica ----------
function niceSegment(v) {
  if (!(v > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  let best = p;
  for (const k of [1, 2, 5, 10]) if (k * p <= v) best = k * p;
  return best;
}

export function scaleBarModel(geo, sb) {
  const mid = [sb.x + sb.lengthMM / 2, sb.y];
  const mpm = metersPerMmAt(geo, mid);
  if (!Number.isFinite(mpm) || mpm <= 0) return null;
  const unit = sb.units === 'nmi' ? { f: 1852, name: 'mn' } : sb.units === 'm' ? { f: 1, name: 'm' } : { f: 1000, name: 'km' };
  let maxU = (sb.lengthMM * mpm) / unit.f;
  let u = unit;
  if (sb.units === 'km' && maxU < 2) { u = { f: 1, name: 'm' }; maxU = sb.lengthMM * mpm; }
  const n = Math.max(1, Math.min(8, sb.segments || 2));
  let seg = niceSegment(maxU / n);
  let total = seg * n;
  if (!(total > 0)) { total = niceLength(maxU); seg = total / n; }
  const lenMM = (total * u.f) / mpm;
  return { total, seg, n, unit: u, lenMM, mpm, rf: mpm * 1000 };
}

function fmtScaleNum(v) {
  if (v >= 1) return fmtInt(v) === String(v) ? fmtInt(v) : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v);
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(v);
}

export function drawScaleBar(ctx, s, sb, geo) {
  const m = scaleBarModel(geo, sb);
  if (!m) return null;
  const n = Math.max(1, Math.min(8, sb.segments || 2));
  const h = sb.height;
  const x = sb.x, y = sb.y;
  const fs = sb.size * PT_MM;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = fontString({ font: sb.font, sizePx: fs * s });
  ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
  const labelY = y - 0.8;
  if (sb.bgOpacity > 0) {
    ctx.fillStyle = rgba(sb.bg, sb.bgOpacity);
    ctx.fillRect((x - 2.5) * s, (y - fs - 2.2) * s, (m.lenMM + 5 + fs * 2) * s, (h + fs + 3.8 + (sb.showRF ? fs * 1.4 : 0)) * s);
  }
  const lw = Math.max(0.35, 0.25 * PT_MM * s * 2.5);
  ctx.lineWidth = lw; ctx.strokeStyle = sb.color; ctx.fillStyle = sb.color;
  if (sb.style === 'alternating') {
    for (let i = 0; i < n; i++) {
      const sx = x + (m.lenMM * i) / n, w = m.lenMM / n;
      ctx.fillStyle = i % 2 === 0 ? sb.color : '#ffffff';
      ctx.fillRect(sx * s, y * s, w * s, h * s);
    }
    ctx.strokeRect(x * s, y * s, m.lenMM * s, h * s);
  } else if (sb.style === 'line') {
    ctx.beginPath(); ctx.moveTo(x * s, (y + h) * s); ctx.lineTo((x + m.lenMM) * s, (y + h) * s); ctx.stroke();
    for (let i = 0; i <= n; i++) { const sx = x + (m.lenMM * i) / n; ctx.beginPath(); ctx.moveTo(sx * s, (y + h) * s); ctx.lineTo(sx * s, (y + (i === 0 || i === n ? 0 : h * 0.45)) * s); ctx.stroke(); }
  } else {
    // doble línea (estilo clásico)
    for (let i = 0; i < n; i++) {
      const sx = x + (m.lenMM * i) / n, w = m.lenMM / n;
      ctx.fillStyle = sb.color;
      if (i % 2 === 0) ctx.fillRect(sx * s, y * s, w * s, (h / 2) * s); else ctx.fillRect(sx * s, (y + h / 2) * s, w * s, (h / 2) * s);
    }
    ctx.strokeRect(x * s, y * s, m.lenMM * s, h * s);
  }
  ctx.fillStyle = sb.color;
  // rótulos: todos los cortes si entran; si no, 0, mitad y final; si no, 0 y final
  const lab = (i) => { const v = (m.total * i) / n; return i === n ? `${fmtScaleNum(v)} ${m.unit.name}` : fmtScaleNum(v); };
  const widthOf = (i) => ctx.measureText(fmtScaleNum((m.total * i) / n)).width / s;
  const fits = (idx) => idx.every((i, k) => k === 0 || (m.lenMM * (i - idx[k - 1])) / n > (widthOf(i) + widthOf(idx[k - 1])) / 2 + 1.2);
  let labels = Array.from({ length: n + 1 }, (_, i) => i);
  if (!fits(labels)) labels = n % 2 === 0 ? [0, n / 2, n] : [0, n];
  if (!fits(labels)) labels = [0, n];
  for (const i of labels) {
    const sx = x + (m.lenMM * i) / n;
    const ox = i === n ? -widthOf(i) / 2 : 0;
    ctx.textAlign = i === n ? 'left' : 'center';
    ctx.fillText(lab(i), (sx + ox) * s, labelY * s);
  }
  if (sb.showRF) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`Escala 1:${fmtInt(roundScale(m.rf))}`, x * s, (y + h + 0.9) * s);
  }
  ctx.restore();
  const top = labelY - fs * 1.1;
  const bottom = y + h + (sb.showRF ? fs * 1.5 : 0.5);
  return [[x - 1, top], [x + m.lenMM + fs * 3, top], [x + m.lenMM + fs * 3, bottom], [x - 1, bottom]];
}

// ---------- rótulos de coordenadas en el marco ----------

function crossings(geo, a, b, steps, interval, isLat) {
  const out = [];
  let prev = null, prevPt = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const ll = lonLatAtPage(geo, pt);
    if (!ll || !Number.isFinite(ll[0])) { prev = null; continue; }
    const v = isLat ? ll[1] : ll[0];
    if (prev !== null) {
      if (!isLat && Math.abs(v - prev) > 180) { prev = v; prevPt = pt; continue; }
      const k0 = Math.floor(prev / interval + 1e-9), k1 = Math.floor(v / interval + 1e-9);
      if (k0 !== k1) {
        const kk = Math.max(k0, k1);
        const val = kk * interval;
        const f = (val - prev) / (v - prev || 1e-9);
        out.push({ pt: [prevPt[0] + (pt[0] - prevPt[0]) * f, prevPt[1] + (pt[1] - prevPt[1]) * f], value: val, isLat });
      }
    }
    prev = v; prevPt = pt;
  }
  return out;
}

export function drawFrameLabels(ctx, s, geo, state) {
  const gl = graticuleLayer(state);
  if (!gl || !gl.visible || !gl.style.label.show) return;
  const st = gl.style;
  const iv = graticuleIntervals(st, state.view.mpm, state.view.center[1]);
  const f = frameRect(state);
  const m = state.page.margins || {};
  const fs = st.label.size * PT_MM;
  const tick = Math.min(1.4, fs * 0.6);
  const forceInside = st.label.mode === 'inside';
  ctx.save();
  ctx.font = fontString({ font: st.label.font, sizePx: fs * s });
  ctx.fillStyle = st.label.color;
  ctx.strokeStyle = st.label.color;
  ctx.setLineDash([]);
  const edges = [
    { name: 'top', a: [f.x, f.y], b: [f.x + f.w, f.y], room: m.top || 0, normal: [0, -1] },
    { name: 'bottom', a: [f.x, f.y + f.h], b: [f.x + f.w, f.y + f.h], room: m.bottom || 0, normal: [0, 1] },
    { name: 'left', a: [f.x, f.y], b: [f.x, f.y + f.h], room: m.left || 0, normal: [-1, 0] },
    { name: 'right', a: [f.x + f.w, f.y], b: [f.x + f.w, f.y + f.h], room: m.right || 0, normal: [1, 0] },
  ];
  const which = st.label.edges || 'classic';
  for (const e of edges) {
    if (which === 'left-bottom' && (e.name === 'top' || e.name === 'right')) continue;
    const horizontalEdge = e.name === 'top' || e.name === 'bottom';
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    const steps = Math.max(80, Math.round(len * 4));
    let cs = [];
    if (which !== 'classic' || horizontalEdge) cs = cs.concat(crossings(geo, e.a, e.b, steps, iv.lon, false));
    if (which !== 'classic' || !horizontalEdge) cs = cs.concat(crossings(geo, e.a, e.b, steps, iv.lat, true));
    if (which === 'classic' && !cs.length) {
      // en vistas polares rotadas puede no haber cruces del tipo esperado: se usan los del otro tipo
      cs = crossings(geo, e.a, e.b, steps, horizontalEdge ? iv.lat : iv.lon, horizontalEdge);
    }
    cs.sort((p, q) => (horizontalEdge ? p.pt[0] - q.pt[0] : p.pt[1] - q.pt[1]));
    const outside = !forceInside && e.room >= fs * 1.6;
    let lastEnd = -Infinity;
    for (const c of cs) {
      if (c.isLat && Math.abs(c.value) >= 90) continue;
      const label = formatGridLabel(c.value, c.isLat);
      const w = ctx.measureText(label).width / s;
      const along = horizontalEdge ? c.pt[0] : c.pt[1];
      const vertical = !horizontalEdge && st.label.vertical !== false;
      const extent = horizontalEdge || vertical ? w : fs;
      if (along - extent / 2 < lastEnd + 1.5) continue;
      const lo = horizontalEdge ? f.x : f.y, hi = horizontalEdge ? f.x + f.w : f.y + f.h;
      if (along - extent / 2 < lo - (outside ? 3 : -0.5) || along + extent / 2 > hi + (outside ? 3 : -0.5)) continue;
      lastEnd = along + extent / 2;
      const dir = outside ? 1 : -1;
      ctx.lineWidth = Math.max(0.4, 0.3 * PT_MM * s);
      ctx.beginPath();
      ctx.moveTo(c.pt[0] * s, c.pt[1] * s);
      ctx.lineTo((c.pt[0] + e.normal[0] * tick * dir) * s, (c.pt[1] + e.normal[1] * tick * dir) * s);
      ctx.stroke();
      const off = tick + 0.6 + (horizontalEdge || vertical ? fs * 0.5 : w / 2);
      const lx = c.pt[0] + e.normal[0] * off * dir, ly = c.pt[1] + e.normal[1] * off * dir;
      ctx.save();
      ctx.translate(lx * s, ly * s);
      if (vertical) ctx.rotate(e.name === 'left' ? -Math.PI / 2 : Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (!outside) { ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.4 * s; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.strokeText(label, 0, 0); }
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------- dibujo completo ----------
export function drawOverlay(ctx, s, geo, state, opts = {}) {
  const hits = opts.hits || null;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const f = frameRect(state);
  const fps = {};
  // en SVG cada bloque queda en su propio grupo (capa en Illustrator / Inkscape)
  const group = (id, label, fn) => { if (ctx.beginGroup) ctx.beginGroup(id, label); fn(); if (ctx.endGroup) ctx.endGroup(); };
  group('grilla', 'Grilla de coordenadas', () => drawGraticules(ctx, s, geo, state));
  group('area-ampliada', 'Áreas ampliadas', () => drawFootprints(ctx, s, geo, state, hits, fps));
  group('sitios', 'Sitios de estudio', () => drawSites(ctx, s, geo, state));
  group('zooms', 'Zooms: marcos y conectores', () => { drawExtentBoxes(ctx, s, geo, state); drawConnectors(ctx, s, state, fps); drawInsetBorders(ctx, s, state, hits); });
  group('rotulos-grilla', 'Rótulos de coordenadas', () => drawFrameLabels(ctx, s, geo, state));
  group('textos', 'Textos', () => {
    for (const t of state.texts) {
      const pos = textPosition(geo, t);
      if (!pos || !Number.isFinite(pos[0])) continue;
      const poly = drawText(ctx, s, t, pos);
      hits && hits.push({ kind: 'text', id: t.id, poly, pos });
    }
  });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  if (state.legend.show) group('leyenda', 'Leyenda', () => { const poly = drawLegend(ctx, s, state); if (poly && hits) hits.push({ kind: 'legend', id: 'legend', poly }); });
  if (state.north.show) group('norte', 'Norte', () => { const poly = drawNorth(ctx, s, state.north, geo); if (hits) hits.push({ kind: 'north', id: 'north', poly }); });
  if (state.scalebar.show) group('escala', 'Escala gráfica', () => { const poly = drawScaleBar(ctx, s, state.scalebar, geo); if (poly && hits) hits.push({ kind: 'scale', id: 'scale', poly }); });
  if (state.page.frame && state.page.frame.show && state.page.frame.width > 0) {
    group('marco', 'Marco', () => {
      ctx.save();
      setStroke(ctx, s, { color: state.page.frame.color, width: state.page.frame.width, dash: 'solid' });
      ctx.lineJoin = 'miter';
      ctx.strokeRect(f.x * s, f.y * s, f.w * s, f.h * s);
      ctx.restore();
    });
  }
  if (opts.preview && opts.selection) drawSelection(ctx, s, state, hits || [], opts.selection);
}

export function drawSelection(ctx, s, state, hits, sel) {
  const h = hits.find((x) => x.kind === sel.kind && x.id === sel.id);
  if (!h) return;
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  if (h.kind === 'inset') {
    const ins = state.insets.find((z) => z.id === h.id);
    if (!ins) { ctx.restore(); return; }
    ctx.strokeRect((ins.x - 1) * s, (ins.y - 1) * s, (ins.w + 2) * s, (ins.h + 2) * s);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    const hx = (ins.x + ins.w + 1) * s, hy = (ins.y + ins.h + 1) * s;
    ctx.beginPath(); ctx.rect(hx - 5, hy - 5, 10, 10); ctx.fill(); ctx.stroke();
    // asa para mover
    const gx = (ins.x + ins.w / 2) * s, gy = (ins.y - 1) * s;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(gx - 22, gy - 16, 44, 14, 7); else ctx.rect(gx - 22, gy - 16, 44, 14);
    ctx.fillStyle = ACCENT; ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(gx + i * 6, gy - 9, 1.6, 0, Math.PI * 2); ctx.fill(); }
  } else if (h.poly) {
    polyPath(ctx, s, h.poly, true);
    ctx.stroke();
    if (h.kind === 'text') {
      const top = [(h.poly[0][0] + h.poly[1][0]) / 2, (h.poly[0][1] + h.poly[1][1]) / 2];
      const c = polygonCentroid(h.poly);
      const dx = top[0] - c[0], dy = top[1] - c[1], L = Math.hypot(dx, dy) || 1;
      const hp = [top[0] + (dx / L) * 4, top[1] + (dy / L) * 4];
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(top[0] * s, top[1] * s); ctx.lineTo(hp[0] * s, hp[1] * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(hp[0] * s, hp[1] * s, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      h.rotateHandle = hp;
    }
  }
  ctx.restore();
}

export function hitTest(hits, pt, state, sel) {
  // asas del elemento seleccionado
  if (sel && sel.kind === 'inset') {
    const ins = state.insets.find((z) => z.id === sel.id);
    if (ins) {
      if (Math.hypot(pt[0] - (ins.x + ins.w + 1), pt[1] - (ins.y + ins.h + 1)) < 3) return { kind: 'inset-resize', id: ins.id };
      if (Math.abs(pt[0] - (ins.x + ins.w / 2)) < 7 && pt[1] < ins.y && pt[1] > ins.y - 6) return { kind: 'inset', id: ins.id, grip: true };
    }
  }
  if (sel && sel.kind === 'text') {
    const h = hits.find((x) => x.kind === 'text' && x.id === sel.id);
    if (h && h.rotateHandle && Math.hypot(pt[0] - h.rotateHandle[0], pt[1] - h.rotateHandle[1]) < 2.5) return { kind: 'text-rotate', id: sel.id };
  }
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (h.kind === 'inset' || h.kind === 'footprint') continue;
    if (h.poly && pointInPolygon(pt, h.poly)) return { kind: h.kind, id: h.id };
  }
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (h.kind === 'inset' && distToOutline(pt, h.outline) < 1.8) return { kind: 'inset', id: h.id };
  }
  return null;
}

export function footprintAt(hits, pt, state) {
  for (const z of state.insets) if (pointInPolygon(pt, insetOutline(z, 48))) return null;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (h.kind === 'footprint' && pointInPolygon(pt, h.poly)) return { kind: 'footprint', id: h.id };
  }
  return null;
}

export function insetAt(state, pt) {
  for (let i = state.insets.length - 1; i >= 0; i--) {
    const z = state.insets[i];
    if (pointInPolygon(pt, insetOutline(z, 48))) return z;
  }
  return null;
}
