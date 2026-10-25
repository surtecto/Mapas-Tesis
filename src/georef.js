// Georreferenciación de planos históricos: modelos de transformación entre píxeles de la imagen y el terreno.
// Los puntos de control (GCP) relacionan un píxel del plano (px, py; y hacia abajo) con una coordenada (lon, lat WGS 84).
// El ajuste se hace en un plano métrico local (Lambert acimutal equivalente centrada en los puntos), de modo que
// los residuos se expresan en metros sobre el terreno.
import proj4 from 'proj4';

export const METHODS = [
  { id: 'helmert', name: 'Helmert (semejanza: traslación, giro y escala)', min: 2, exact: false,
    hint: 'Conserva la forma del plano. Para planos dibujados con cuidado y sin deformaciones del soporte.' },
  { id: 'affine', name: 'Afín (admite escalas distintas y cizalla)', min: 3, exact: false,
    hint: 'Corrige papel encogido o estirado de manera pareja. Es la opción prudente para la mayoría de los planos.' },
  { id: 'projective', name: 'Proyectiva (foto de un plano tomada en ángulo)', min: 4, exact: false,
    hint: 'Corrige la perspectiva de una fotografía hecha con el celular en el archivo. Con 4 puntos el ajuste es exacto: agregá más para controlar.' },
  { id: 'poly2', name: 'Polinomial de 2.º orden', min: 6, exact: false,
    hint: 'Absorbe curvaturas suaves del soporte o de la proyección del plano. Fuera de los puntos puede deformar mucho.' },
  { id: 'poly3', name: 'Polinomial de 3.er orden', min: 10, exact: false,
    hint: 'Para mapas regionales antiguos con proyecciones desconocidas. Necesita puntos bien repartidos.' },
  { id: 'tps', name: 'Lámina delgada (deformación elástica)', min: 3, exact: true,
    hint: 'Pasa exactamente por todos los puntos y deforma entre ellos. Muestra cómo «hay que torcer» el plano para que coincida: es una interpretación, no una corrección neutra.' },
];
export function methodInfo(id) { return METHODS.find((m) => m.id === id) || METHODS[1]; }

// ---------- álgebra lineal mínima ----------
// Mínimos cuadrados por Householder: A (m×k, filas), b (m) → x (k)
export function lstsq(A, b) {
  const m = A.length, k = A[0].length;
  const R = A.map((r) => r.slice());
  const y = b.slice();
  for (let j = 0; j < k; j++) {
    let norm = 0;
    for (let i = j; i < m; i++) norm += R[i][j] * R[i][j];
    norm = Math.sqrt(norm);
    if (norm < 1e-14) continue;
    const alpha = R[j][j] > 0 ? -norm : norm;
    const v = new Array(m).fill(0);
    v[j] = R[j][j] - alpha;
    for (let i = j + 1; i < m; i++) v[i] = R[i][j];
    let vv = 0;
    for (let i = j; i < m; i++) vv += v[i] * v[i];
    if (vv < 1e-28) continue;
    for (let c = j; c < k; c++) {
      let s = 0;
      for (let i = j; i < m; i++) s += v[i] * R[i][c];
      s = (2 * s) / vv;
      for (let i = j; i < m; i++) R[i][c] -= s * v[i];
    }
    let s = 0;
    for (let i = j; i < m; i++) s += v[i] * y[i];
    s = (2 * s) / vv;
    for (let i = j; i < m; i++) y[i] -= s * v[i];
  }
  const x = new Array(k).fill(0);
  for (let j = k - 1; j >= 0; j--) {
    let s = y[j];
    for (let c = j + 1; c < k; c++) s -= R[j][c] * x[c];
    x[j] = Math.abs(R[j][j]) < 1e-12 ? 0 : s / R[j][j];
  }
  return x;
}

// Sistema cuadrado por eliminación de Gauss con pivoteo parcial (varios lados derechos)
export function solveSquare(M, B) {
  const n = M.length, cols = B[0].length;
  const A = M.map((r, i) => r.concat(B[i]));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) throw new Error('Sistema singular: hay puntos repetidos o alineados.');
    if (p !== c) [A[p], A[c]] = [A[c], A[p]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (!f) continue;
      for (let k = c; k < n + cols; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((r, i) => r.slice(n).map((v) => v / A[i][i]));
}

// ---------- normalización ----------
function normalizer(pts) {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  let d = 0;
  for (const p of pts) d += Math.hypot(p[0] - mx, p[1] - my);
  const s = d / n || 1;
  return { fwd: (p) => [(p[0] - mx) / s, (p[1] - my) / s], inv: (p) => [p[0] * s + mx, p[1] * s + my], s };
}

function polyTerms(order) {
  const t = [];
  for (let tot = 0; tot <= order; tot++) for (let i = tot; i >= 0; i--) t.push([i, tot - i]);
  return t;
}
function evalTerms(terms, u, v) { return terms.map(([i, j]) => Math.pow(u, i) * Math.pow(v, j)); }

// Ajusta una función 2D → 2D genérica (src → dst) en coordenadas normalizadas
function fitDirect(method, src, dst) {
  const Ns = normalizer(src), Nd = normalizer(dst);
  const S = src.map(Ns.fwd), D = dst.map(Nd.fwd);
  const n = S.length;
  if (method === 'helmert') {
    // x = a u - b v + c ; y = b u + a v + d
    const A = [], b = [];
    for (let i = 0; i < n; i++) {
      const [u, v] = S[i];
      A.push([u, -v, 1, 0]); b.push(D[i][0]);
      A.push([v, u, 0, 1]); b.push(D[i][1]);
    }
    const [a, bb, c, d] = lstsq(A, b);
    const f = (p) => { const [u, v] = Ns.fwd(p); return Nd.inv([a * u - bb * v + c, bb * u + a * v + d]); };
    const det = a * a + bb * bb;
    const g = (q) => { const [x, y] = Nd.fwd(q); const X = x - c, Y = y - d; return Ns.inv([(a * X + bb * Y) / det, (-bb * X + a * Y) / det]); };
    return { f, g };
  }
  if (method === 'affine') {
    const A = S.map(([u, v]) => [1, u, v]);
    const px = lstsq(A, D.map((p) => p[0])), py = lstsq(A, D.map((p) => p[1]));
    const f = (p) => { const [u, v] = Ns.fwd(p); return Nd.inv([px[0] + px[1] * u + px[2] * v, py[0] + py[1] * u + py[2] * v]); };
    const det = px[1] * py[2] - px[2] * py[1];
    const g = (q) => {
      const [x, y] = Nd.fwd(q); const X = x - px[0], Y = y - py[0];
      return Ns.inv([(py[2] * X - px[2] * Y) / det, (-py[1] * X + px[1] * Y) / det]);
    };
    return { f, g };
  }
  if (method === 'projective') {
    const A = [], b = [];
    for (let i = 0; i < n; i++) {
      const [u, v] = S[i], [x, y] = D[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    const h = lstsq(A, b);
    const H = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
    const Hi = inv3(H);
    const app = (M, p) => { const w = M[2][0] * p[0] + M[2][1] * p[1] + M[2][2]; return [(M[0][0] * p[0] + M[0][1] * p[1] + M[0][2]) / w, (M[1][0] * p[0] + M[1][1] * p[1] + M[1][2]) / w, w]; };
    // signo del denominador en la zona de los puntos (más allá de la «línea del horizonte» la transformación se invierte)
    const sgnF = Math.sign(S.reduce((a, p) => a + (H[2][0] * p[0] + H[2][1] * p[1] + 1), 0)) || 1;
    const sgnG = Math.sign(D.reduce((a, p) => a + (Hi[2][0] * p[0] + Hi[2][1] * p[1] + Hi[2][2]), 0)) || 1;
    const f = (p) => { const r = app(H, Ns.fwd(p)); return r[2] * sgnF <= 1e-9 ? [NaN, NaN] : Nd.inv(r); };
    const g = (q) => { const r = app(Hi, Nd.fwd(q)); return r[2] * sgnG <= 1e-9 ? [NaN, NaN] : Ns.inv(r); };
    return { f, g };
  }
  if (method === 'poly2' || method === 'poly3') {
    const terms = polyTerms(method === 'poly2' ? 2 : 3);
    const A = S.map(([u, v]) => evalTerms(terms, u, v));
    const cx = lstsq(A, D.map((p) => p[0])), cy = lstsq(A, D.map((p) => p[1]));
    const f = (p) => { const [u, v] = Ns.fwd(p); const t = evalTerms(terms, u, v); let x = 0, y = 0; for (let i = 0; i < t.length; i++) { x += cx[i] * t[i]; y += cy[i] * t[i]; } return Nd.inv([x, y]); };
    return { f, g: null };
  }
  if (method === 'tps') return fitTps(S, D, Ns, Nd);
  throw new Error('Método desconocido');
}

function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) throw new Error('Transformación proyectiva degenerada: revisá que los puntos no estén alineados.');
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

// Lámina delgada (thin plate spline) en coordenadas normalizadas, con suavizado opcional
function tpsKernel(r2) { return r2 < 1e-20 ? 0 : r2 * Math.log(r2); }
function fitTps(S, D, Ns, Nd, lambda = 0) {
  const n = S.length;
  const N = n + 3;
  const M = Array.from({ length: N }, () => new Array(N).fill(0));
  const B = Array.from({ length: N }, () => [0, 0]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = S[i][0] - S[j][0], dy = S[i][1] - S[j][1];
      M[i][j] = tpsKernel(dx * dx + dy * dy) + (i === j ? lambda : 0);
    }
    M[i][n] = 1; M[i][n + 1] = S[i][0]; M[i][n + 2] = S[i][1];
    M[n][i] = 1; M[n + 1][i] = S[i][0]; M[n + 2][i] = S[i][1];
    B[i] = [D[i][0], D[i][1]];
  }
  const W = solveSquare(M, B);
  const f = (p) => {
    const [u, v] = Ns.fwd(p);
    let x = W[n][0] + W[n + 1][0] * u + W[n + 2][0] * v;
    let y = W[n][1] + W[n + 1][1] * u + W[n + 2][1] * v;
    for (let i = 0; i < n; i++) {
      const dx = u - S[i][0], dy = v - S[i][1];
      const k = tpsKernel(dx * dx + dy * dy);
      x += W[i][0] * k; y += W[i][1] * k;
    }
    return Nd.inv([x, y]);
  };
  return { f, g: null };
}

// ---------- modelo completo ----------
function localProj(lon0, lat0) {
  const def = `+proj=laea +lat_0=${lat0} +lon_0=${lon0} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`;
  const p = proj4('EPSG:4326', def);
  return { toLocal: (ll) => p.forward(ll), toLL: (xy) => p.inverse(xy) };
}

export function activeGcps(gcps) {
  return (gcps || []).filter((g) => g.on !== false && Number.isFinite(g.px) && Number.isFinite(g.py) && Number.isFinite(g.lon) && Number.isFinite(g.lat));
}

// Devuelve { ok, method, n, forward(px,py)→[lon,lat], inverse(lon,lat)→[px,py], residuals, rms, mpp, msg }
export function fitModel(gcps, method, { imageSize } = {}) {
  const pts = activeGcps(gcps);
  const info = methodInfo(method);
  if (pts.length < info.min) {
    return { ok: false, method, n: pts.length, msg: `${info.name.split(' (')[0]}: hacen falta al menos ${info.min} puntos activos (hay ${pts.length}).`, residuals: [] };
  }
  const lon0 = pts.reduce((a, g) => a + g.lon, 0) / pts.length;
  const lat0 = pts.reduce((a, g) => a + g.lat, 0) / pts.length;
  const L = localProj(lon0, lat0);
  // píxeles con y hacia arriba para que Helmert no necesite reflexión
  const src = pts.map((g) => [g.px, -g.py]);
  const dst = pts.map((g) => L.toLocal([g.lon, g.lat]));
  let fwdFit, invFit;
  try {
    fwdFit = fitDirect(method, src, dst);
    invFit = fwdFit.g ? { f: fwdFit.g } : fitDirect(method, dst, src);
  } catch (err) {
    return { ok: false, method, n: pts.length, msg: err.message, residuals: [] };
  }
  const forward = (px, py) => {
    const xy = fwdFit.f([px, -py]);
    if (!Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return [NaN, NaN];
    return L.toLL(xy);
  };
  const inverse = (lon, lat) => {
    const uv = invFit.f(L.toLocal([lon, lat]));
    return [uv[0], -uv[1]];
  };
  // residuos (m) en el terreno
  const residuals = [];
  let sum = 0;
  pts.forEach((g, i) => {
    const xy = fwdFit.f(src[i]);
    const dx = xy[0] - dst[i][0], dy = xy[1] - dst[i][1];
    const d = Math.hypot(dx, dy);
    residuals.push({ id: g.id, dx, dy, d });
    sum += d * d;
  });
  let rms = Math.sqrt(sum / pts.length);
  // en la lámina delgada los residuos son nulos: se informa el error de validación cruzada (dejando cada punto afuera)
  let loo = null;
  const exactCount = { helmert: 2, affine: 3, projective: 4, poly2: 6, poly3: 10 }[method];
  if ((info.exact || pts.length === exactCount) && pts.length > info.min && pts.length <= 80) {
    loo = [];
    let s2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const s = src.filter((_, j) => j !== i), d = dst.filter((_, j) => j !== i);
      try {
        const m = fitDirect(method, s, d);
        const xy = m.f(src[i]);
        const e = Math.hypot(xy[0] - dst[i][0], xy[1] - dst[i][1]);
        loo.push({ id: pts[i].id, d: e }); s2 += e * e;
      } catch (err) { loo.push({ id: pts[i].id, d: NaN }); }
    }
    loo.rms = Math.sqrt(s2 / pts.length);
  }
  // metros por píxel en el centro de los puntos
  const cpx = pts.reduce((a, g) => a + g.px, 0) / pts.length, cpy = pts.reduce((a, g) => a + g.py, 0) / pts.length;
  const a = fwdFit.f([cpx, -cpy]), b = fwdFit.f([cpx + 10, -cpy]), c = fwdFit.f([cpx, -cpy - 10]);
  const mpp = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - a[0], c[1] - a[1])) / 20;
  // escala aproximada del plano si se conoce su resolución de escaneo (ppp)
  const out = { ok: true, method, n: pts.length, forward, inverse, residuals, rms, loo, mpp, center: [lon0, lat0], msg: '' };
  if (imageSize) out.outline = imageOutline(out, imageSize[0], imageSize[1]);
  return out;
}

// Borde de la imagen llevado al terreno (para recortar el dibujo y medir el área cubierta)
export function imageOutline(model, W, H, k = 24) {
  const pts = [];
  const side = (x0, y0, x1, y1) => { for (let i = 0; i < k; i++) pts.push([x0 + ((x1 - x0) * i) / k, y0 + ((y1 - y0) * i) / k]); };
  side(0, 0, W, 0); side(W, 0, W, H); side(W, H, 0, H); side(0, H, 0, 0);
  return pts.map(([x, y]) => model.forward(x, y)).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export function modelHash(src) {
  const s = JSON.stringify([src.method, activeGcps(src.gcps).map((g) => [g.px, g.py, g.lon, g.lat].map((v) => Math.round(v * 1e6)))]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Descripción en texto para el epígrafe y la ficha metodológica
export function modelSummary(model, gr) {
  if (!model || !model.ok) return model ? model.msg : 'Sin georreferenciar';
  const name = methodInfo(model.method).name.split(' (')[0].toLowerCase();
  const err = model.loo && methodInfo(model.method).exact ? `error de validación cruzada ${fmtM(model.loo.rms)}` : `error medio cuadrático ${fmtM(model.rms)}`;
  return `transformación ${name} con ${model.n} puntos de control (${err})`;
}
export function fmtM(v) {
  if (!Number.isFinite(v)) return '—';
  if (v < 1) return `${v.toFixed(2).replace('.', ',')} m`;
  if (v < 1000) return `${Math.round(v)} m`;
  return `${(v / 1000).toFixed(2).replace('.', ',')} km`;
}
