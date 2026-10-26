// Caché local de capas vectoriales pedidas a servidores (IGN y otros WFS): cada tesela de una grilla fija
// en grados se guarda en IndexedDB. Así un mapa ya cargado se sigue viendo y exportando cuando el servidor no responde,
// y las vistas que se repiten cargan al instante. Base aparte de la de proyectos para no forzar actualizaciones.
const NAME = 'mapas-tesis-capas';
const STORE = 'teselas';
export const FRESH_MS = 7 * 864e5;
const MAX_AGE_MS = 120 * 864e5;

let dbp = null;
function openCache() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('sin IndexedDB')); return; }
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => d.close(); resolve(d); };
      r.onerror = () => reject(r.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
function tx(mode, fn) {
  return openCache().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
export async function cacheGet(key) { try { return (await tx('readonly', (st) => st.get(key))) || null; } catch (e) { return null; } }
export async function cachePut(key, obj) { try { await tx('readwrite', (st) => st.put({ t: Date.now(), obj }, key)); } catch (e) { /* sin espacio: se sigue sin caché */ } }
export async function cacheInfo() {
  try {
    const all = await tx('readonly', (st) => st.getAll());
    let bytes = 0;
    for (const v of all) bytes += JSON.stringify(v.obj).length;
    return { n: all.length, bytes };
  } catch (e) { return { n: 0, bytes: 0 }; }
}
export async function cacheClear() { try { await tx('readwrite', (st) => st.clear()); } catch (e) { /* noop */ } }
export async function cachePrune() {
  try {
    const keys = await tx('readonly', (st) => st.getAllKeys());
    const vals = await tx('readonly', (st) => st.getAll());
    const old = keys.filter((k, i) => Date.now() - (vals[i] && vals[i].t) > MAX_AGE_MS);
    if (old.length) await tx('readwrite', (st) => { old.forEach((k) => st.delete(k)); return null; });
  } catch (e) { /* noop */ }
}

// Grilla fija: teselas de 0,5° para vistas amplias y de 0,125° para vistas de detalle
export function gridTiles(ll, viewWidthDeg) {
  const size = viewWidthDeg > 0.45 ? 0.5 : 0.125;
  const out = [];
  const x0 = Math.floor(ll[0] / size) * size, y0 = Math.floor(ll[1] / size) * size;
  for (let x = x0; x < ll[2] - 1e-9; x += size) {
    for (let y = y0; y < ll[3] - 1e-9; y += size) {
      const b = [x, y, x + size, y + size].map((v) => Math.round(v * 1e6) / 1e6);
      out.push({ b, id: `${size}:${b[0]}:${b[1]}` });
    }
  }
  return out;
}
