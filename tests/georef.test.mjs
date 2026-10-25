import { createRequire } from "module"; const proj4 = createRequire(import.meta.url)("proj4");
import { fitModel, METHODS } from '/home/claude/Mapas-Tesis/src/georef.js';
const P = proj4('EPSG:4326', '+proj=laea +lat_0=-34.45 +lon_0=-59.45 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');
// homografía real en metros: plano 2000x1200 px, ~5 m/px, girado 40° y con perspectiva leve
const a = 40 * Math.PI / 180;
const Hm = (u, v) => { const w = 1 + 0.00006 * u + 0.00002 * v; const x = (5 * Math.cos(a) * u - 5 * Math.sin(a) * v) / w; const y = (-5 * Math.sin(a) * u - 5 * Math.cos(a) * v) / w; return P.inverse([x, y]); };
const pts = [];
for (let i = 0; i < 16; i++) { const u = (i % 4) * 600 + 100 + (i * 37) % 50, v = Math.floor(i / 4) * 330 + 80; const [lon, lat] = Hm(u, v); pts.push({ id: 'p' + i, px: u, py: v, lon, lat }); }
for (const m of METHODS.map((x) => x.id)) {
  const r = fitModel(pts, m, { imageSize: [2000, 1200] });
  if (!r.ok) { console.log(m, "FALLA", r.msg); continue; } const t = [1000, 600]; const ll = r.forward(...t), truth = Hm(...t);
  const err = Math.hypot(...P.forward(ll).map((v, i) => v - P.forward(truth)[i]));
  const q = r.inverse(...ll);
  console.log(m.padEnd(10), 'rms', r.rms.toFixed(2), r.loo ? 'loo ' + r.loo.rms.toFixed(2) : '', 'err centro', err.toFixed(2), 'm; vuelta', q.map((v) => v.toFixed(2)).join(','), 'mpp', r.mpp.toFixed(2));
}
// pocos puntos
console.log(fitModel(pts.slice(0, 2), 'affine').msg);
console.log(fitModel([pts[0], pts[0], pts[0], pts[1]], 'projective').msg);
