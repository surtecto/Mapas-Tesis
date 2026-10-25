// Almacén de imágenes de planos (IndexedDB) y procesamiento para superponerlos al mapa.
// Las imágenes no viajan en el historial ni en localStorage: se guardan aparte y se incrustan solo al guardar el proyecto.
const DB = 'mapas-tesis';
const STORE = 'imagenes';
const MAX_SIDE = 6000;

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('El navegador no permite guardar imágenes (IndexedDB).')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const req = fn(st);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Operación cancelada'));
  });
}

// memoria: key → { blob, url, w, h }
const mem = new Map();
const processed = new Map(); // key|hash → Promise<url>

export async function putImage(key, blob, w, h) {
  try { await tx('readwrite', (st) => st.put({ blob, w, h }, key)); } catch (e) { /* sin IndexedDB: queda en memoria */ }
  const prev = mem.get(key);
  if (prev && prev.url) URL.revokeObjectURL(prev.url);
  mem.set(key, { blob, url: URL.createObjectURL(blob), w, h });
  return mem.get(key);
}
export async function getImage(key) {
  if (mem.has(key)) return mem.get(key);
  let rec = null;
  try { rec = await tx('readonly', (st) => st.get(key)); } catch (e) { rec = null; }
  if (!rec) return null;
  const v = { blob: rec.blob, url: URL.createObjectURL(rec.blob), w: rec.w, h: rec.h };
  mem.set(key, v);
  return v;
}
export function peekImage(key) { return mem.get(key) || null; }
export async function deleteImage(key) {
  try { await tx('readwrite', (st) => st.delete(key)); } catch (e) { /* noop */ }
  const v = mem.get(key);
  if (v && v.url) URL.revokeObjectURL(v.url);
  mem.delete(key);
  for (const k of processed.keys()) if (k.startsWith(key + '|')) processed.delete(k);
}

// Decodifica un archivo de imagen y lo reduce si supera el tamaño de trabajo
export async function ingestFile(file) {
  const bmp = await createImageBitmap(file);
  let { width: w, height: h } = bmp;
  let blob = file;
  if (Math.max(w, h) > MAX_SIDE || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    w = c.width; h = c.height;
  }
  bmp.close && bmp.close();
  return { blob, w, h };
}

export async function ingestUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = await r.blob();
  return ingestFile(new File([b], url.split('/').pop() || 'plano.jpg', { type: b.type || 'image/jpeg' }));
}

// Miniatura (data URL) para las tarjetas de fuentes
export async function thumbnail(key, max = 160) {
  const v = await getImage(key);
  if (!v) return null;
  const img = await loadImg(v.url);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

export function loadImg(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    im.src = url;
  });
}

// ---------- procesamiento para superponer ----------
// proc: { crop: {x,y,w,h} (fracciones 0..1), paper: bool, threshold: 0..1, softness, tint: '#hex'|'' , gray: bool }
export function procHash(proc) {
  return JSON.stringify(proc || {});
}
export function needsProcessing(proc) {
  if (!proc) return false;
  const c = proc.crop;
  return !!(proc.paper || proc.tint || proc.gray || (c && (c.x > 0 || c.y > 0 || c.w < 1 || c.h < 1)));
}

// Devuelve una URL de la imagen procesada (o la original si no hace falta procesar)
export function processedUrl(key, proc) {
  const v = mem.get(key);
  if (!v) return null;
  if (!needsProcessing(proc)) return Promise.resolve(v.url);
  const pk = `${key}|${procHash(proc)}`;
  if (!processed.has(pk)) processed.set(pk, processImage(v, proc));
  return processed.get(pk);
}
export function processedReady(key, proc) {
  const v = mem.get(key);
  if (!v) return null;
  if (!needsProcessing(proc)) return v.url;
  const p = processed.get(`${key}|${procHash(proc)}`);
  return p && p._done ? p._url : null;
}

function hexRgb(h) { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

async function processImage(v, proc) {
  const img = await loadImg(v.url);
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, W, H);
  const a = d.data;
  const crop = proc.crop || { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.floor(crop.x * W), y0 = Math.floor(crop.y * H), x1 = Math.ceil((crop.x + crop.w) * W), y1 = Math.ceil((crop.y + crop.h) * H);
  const th = proc.threshold == null ? 0.72 : proc.threshold;
  const soft = proc.softness == null ? 0.12 : proc.softness;
  const tint = proc.tint ? hexRgb(proc.tint) : null;
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      const i = (yy * W + xx) * 4;
      if (xx < x0 || xx >= x1 || yy < y0 || yy >= y1) { a[i + 3] = 0; continue; }
      const r = a[i], g = a[i + 1], b = a[i + 2];
      const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (proc.paper) {
        // el papel claro se vuelve transparente; la tinta queda
        const t = (L - (th - soft)) / Math.max(1e-3, soft);
        const alpha = 1 - Math.max(0, Math.min(1, t));
        a[i + 3] = Math.round(a[i + 3] * alpha);
      }
      if (tint) {
        // tinta monocroma: conserva la intensidad del trazo
        const k = proc.paper ? 1 : L;
        a[i] = tint[0] + (255 - tint[0]) * (proc.paper ? 0 : k);
        a[i + 1] = tint[1] + (255 - tint[1]) * (proc.paper ? 0 : k);
        a[i + 2] = tint[2] + (255 - tint[2]) * (proc.paper ? 0 : k);
      } else if (proc.gray) {
        const gv = Math.round(L * 255);
        a[i] = gv; a[i + 1] = gv; a[i + 2] = gv;
      }
    }
  }
  x.putImageData(d, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return URL.createObjectURL(blob);
}

// marca las promesas resueltas para consulta síncrona
const _origSet = processed.set.bind(processed);
processed.set = (k, p) => {
  p.then((u) => { p._done = true; p._url = u; }).catch(() => { p._done = true; p._url = null; });
  return _origSet(k, p);
};

// ---------- serialización (guardar/abrir proyecto) ----------
export async function exportImages(keys) {
  const out = {};
  for (const k of keys) {
    const v = await getImage(k);
    if (!v) continue;
    out[k] = { w: v.w, h: v.h, data: await blobToDataUrl(v.blob) };
  }
  return out;
}
export async function importImages(obj) {
  for (const [k, v] of Object.entries(obj || {})) {
    try {
      const blob = await (await fetch(v.data)).blob();
      await putImage(k, blob, v.w, v.h);
    } catch (e) { /* imagen dañada: se ignora */ }
  }
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}
