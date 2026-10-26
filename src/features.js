// Objetos de una capa vectorial: identidad estable y "características propias".
// Una característica es un grupo de objetos elegidos a mano (un polígono, varios) que lleva estilo propio y una
// entrada en la leyenda: la clasificación interpretativa que no sale de ningún atributo de la tabla.
import { uid } from './util.js';

const keyCache = new WeakMap();

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// GeoServer inventa ids pasajeros (capa.fid-3a1b_18f…_-7ffe) cuando la tabla o vista no tiene clave:
// cambian en cada pedido, así que no sirven para reconocer un objeto
export function stableId(f) {
  const id = f.getId();
  if (id == null || id === '') return null;
  const s = String(id);
  return /(^|\.)fid-[0-9a-f]+_[0-9a-f]+_/i.test(s) ? null : s;
}

// Id del servidor si es estable (WFS con clave, ArcGIS); si no, una huella de sus atributos,
// que no depende de la proyección y por eso vale igual en el mapa principal, los zooms y la exportación.
export function featureKey(f) {
  let k = keyCache.get(f);
  if (k) return k;
  const id = stableId(f);
  if (id) k = id;
  else {
    const p = f.getProperties();
    const gname = f.getGeometryName();
    const keys = Object.keys(p).filter((x) => x !== gname && x !== 'geometry' && (p[x] == null || typeof p[x] !== 'object')).sort();
    let s = keys.map((x) => `${x}=${p[x]}`).join('|');
    if (!s) { const g = f.getGeometry(); s = g && g.getFlatCoordinates ? g.getFlatCoordinates().slice(0, 6).map((v) => Math.round(v)).join(',') : 'x'; }
    k = `h${fnv(s)}`;
  }
  keyCache.set(f, k);
  return k;
}

// Los GeoJSON propios (archivos, dibujos, resultados de análisis) reciben ids por orden si no traen
export function ensureIds(fc) {
  if (!fc || !Array.isArray(fc.features)) return fc;
  const used = new Set(fc.features.map((f) => f && f.id).filter((x) => x != null));
  let n = 1;
  for (const f of fc.features) {
    if (!f || f.id != null) continue;
    while (used.has(`f${n}`)) n++;
    f.id = `f${n}`; used.add(f.id); n++;
  }
  return fc;
}

const groupIdx = new WeakMap();
export function groupOf(ls, fid) {
  const arr = ls && ls.groups;
  if (!arr || !arr.length) return null;
  let m = groupIdx.get(arr);
  const sig = `${ls._styleVersion}|${arr.length}`;
  if (!m || m.sig !== sig) {
    m = new Map();
    for (const g of arr) for (const id of g.fids || []) m.set(id, g);
    m.sig = sig;
    groupIdx.set(arr, m);
  }
  return m.get(fid) || null;
}

export function groupsOfSelection(ls, fids) {
  const set = new Set();
  for (const id of fids) { const g = groupOf(ls, id); set.add(g); }
  return [...set];
}

// estilo efectivo de un objeto: el de la capa, con el color de su categoría si la tiene
export function effectiveStyle(ls, feature, classify) {
  const st = ls.style;
  const cz = st.categorize;
  const col = cz && cz.field && feature ? classify(cz, feature.get(cz.field)) : undefined;
  const clone = (o) => JSON.parse(JSON.stringify(o || {}));
  const polygon = clone(st.polygon), line = clone(st.line), point = clone(st.point);
  if (col) { polygon.fill = col; line.color = col; point.fill = col; }
  // lo que se elige para destacar tiene que verse: relleno al menos al 60 %
  polygon.fillOpacity = Math.max(0.6, Number(polygon.fillOpacity) || 0);
  return { polygon, line, point };
}

const NAME_FIELDS = /^(nombre|name|nam|fna|gna|nombre_|nom|denominacion|descripcion|leyenda|label|titulo)$/i;
export function guessName(feature, ls) {
  if (!feature) return '';
  const p = feature.getProperties();
  const lab = ls.style && ls.style.label;
  if (lab && lab.field && p[lab.field] != null && p[lab.field] !== '') return String(p[lab.field]);
  const k = Object.keys(p).find((x) => NAME_FIELDS.test(x) && p[x] != null && String(p[x]).trim());
  return k ? String(p[k]) : '';
}

export function newGroup(ls, base, name) {
  return { id: uid('G'), name: name || `Selección ${(ls.groups || []).length + 1}`, fids: [], hidden: false, legend: true, polygon: base.polygon, line: base.line, point: base.point };
}

// asigna los objetos a un grupo (y los saca de cualquier otro); los grupos vacíos se descartan
export function assignToGroup(ls, g, fids) {
  if (!ls.groups) ls.groups = [];
  const set = new Set(fids);
  for (const o of ls.groups) if (o !== g) o.fids = o.fids.filter((x) => !set.has(x));
  if (!ls.groups.includes(g)) ls.groups.push(g);
  g.fids = [...new Set([...g.fids, ...fids])];
  ls.groups = ls.groups.filter((o) => o.fids.length);
}

export function removeFromGroups(ls, fids) {
  if (!ls.groups) return;
  const set = new Set(fids);
  for (const o of ls.groups) o.fids = o.fids.filter((x) => !set.has(x));
  ls.groups = ls.groups.filter((o) => o.fids.length);
}

// objetos cargados de una capa que tienen esos ids
export function featuresByKeys(olLayer, fids) {
  const src = olLayer && olLayer.getSource && olLayer.getSource();
  if (!src || !src.getFeatures) return [];
  const want = new Set(fids);
  return src.getFeatures().filter((f) => want.has(featureKey(f)));
}

// clave para no repetir un objeto que llega en dos teselas: id estable, o atributos + caja exacta
export function dedupKey(f) {
  const id = stableId(f);
  if (id) return `i:${id}`;
  const g = f.getGeometry();
  const e = g ? g.getExtent().map((v) => v.toFixed(2)).join(',') : '';
  return `h:${featureKey(f)}|${e}`;
}
