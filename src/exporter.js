// Exportación de la figura: PNG, JPEG, TIFF y PDF a la resolución pedida, y SVG por capas
import { zlibSync } from 'fflate';
import { MapCtx } from './mapctx.js';
import { drawOverlay, frameRect, insetShapePath } from './overlay.js';
import { SvgCtx } from './svgctx.js';
import { CSS_PX_PER_MM, el } from './util.js';
import { FONTS } from './catalog.js';

export const MAX_SIDE = 16384;
export const MAX_AREA = 120e6;

export function exportSize(state, dpi) {
  const W = Math.round((state.page.widthMM / 25.4) * dpi);
  const H = Math.round((state.page.heightMM / 25.4) * dpi);
  return { W, H, ok: W <= MAX_SIDE && H <= MAX_SIDE && W * H <= MAX_AREA };
}

export async function ensureFonts(state) {
  const fams = new Set(['Source Sans 3']);
  state.texts.forEach((t) => fams.add(t.font));
  fams.add(state.legend.font); fams.add(state.north.font); fams.add(state.scalebar.font); fams.add(state.siteStyle.label.font);
  state.layers.forEach((l) => l.style && l.style.label && fams.add(l.style.label.font));
  const loads = [];
  for (const f of fams) {
    if (!f || !FONTS.includes(f)) continue;
    for (const v of ['400', '700', 'italic 400', 'italic 700']) loads.push(document.fonts.load(`${v} 16px "${f}"`).catch(() => null));
  }
  await Promise.all(loads);
  await document.fonts.ready;
}

function geoFor(mainCtx, insetCtxs, frame, pxPerMm) {
  const toPageFn = (mctx, ox, oy) => (coord) => {
    const px = mctx.map.getPixelFromCoordinate(coord);
    if (!px) return null;
    return [ox + px[0] / pxPerMm, oy + px[1] / pxPerMm];
  };
  const fromPageFn = (mctx, ox, oy) => (pt) => mctx.map.getCoordinateFromPixel([(pt[0] - ox) * pxPerMm, (pt[1] - oy) * pxPerMm]);
  const geo = {
    frame,
    main: { projection: mainCtx.projection, toPage: toPageFn(mainCtx, frame.x, frame.y), fromPage: fromPageFn(mainCtx, frame.x, frame.y) },
    insets: {},
  };
  for (const { ins, ctx } of insetCtxs) {
    geo.insets[ins.id] = { projection: ctx.projection, toPage: toPageFn(ctx, ins.x, ins.y), fromPage: fromPageFn(ctx, ins.x, ins.y) };
  }
  return geo;
}

const BLEND = { multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft-light': 'soft-light', darken: 'darken', lighten: 'lighten', 'hard-light': 'hard-light', luminosity: 'luminosity' };

function layerCanvases(map) {
  return Array.from(map.getViewport().querySelectorAll('.cm-layer canvas, canvas.cm-layer, .ol-layer canvas')).filter((c) => c.width > 0 && c.height > 0);
}
function layerUidOf(canvas) {
  const elx = canvas.closest('[class*="cm-"]') || canvas.parentNode;
  const m = /cm-((?:L|__)[\w]+)/.exec(elx ? elx.className : '');
  return m ? m[1] : null;
}

function drawCanvasInto(ctx, canvas, ox, oy, pr) {
  const container = canvas.parentNode;
  const opacity = (container && container.style.opacity) || canvas.style.opacity;
  ctx.globalAlpha = opacity === '' || opacity == null ? 1 : Number(opacity);
  const blend = container && container.style.mixBlendMode;
  ctx.globalCompositeOperation = BLEND[blend] || 'source-over';
  ctx.filter = (container && container.style.filter) || 'none';
  let matrix;
  const tr = canvas.style.transform;
  const mm = tr && /^matrix\(([^(]*)\)$/.exec(tr);
  if (mm) matrix = mm[1].split(',').map(Number);
  else matrix = [parseFloat(canvas.style.width) / canvas.width || 1, 0, 0, parseFloat(canvas.style.height) / canvas.height || 1, 0, 0];
  ctx.setTransform(matrix[0] * pr, matrix[1] * pr, matrix[2] * pr, matrix[3] * pr, matrix[4] * pr + ox, matrix[5] * pr + oy);
  const bg = container && container.style.backgroundColor;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(canvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}

// Construye mapas fuera de pantalla a la resolución de salida y espera a que carguen
async function buildExportMaps(app, dpi, { onProgress } = {}) {
  const st = app.state;
  const frame = frameRect(st);
  const pr = dpi / 96;
  const host = el('div', { class: 'export-host', style: { position: 'fixed', left: '-30000px', top: '0', pointerEvents: 'none' } });
  document.body.appendChild(host);
  const mk = (wMM, hMM) => {
    const d = el('div', { style: { position: 'absolute', left: '0', top: '0', width: `${wMM * CSS_PX_PER_MM}px`, height: `${hMM * CSS_PX_PER_MM}px` } });
    host.appendChild(d);
    return d;
  };
  const mainCtx = new MapCtx({ app, target: mk(frame.w, frame.h), role: 'main', pixelRatio: pr, pxPerMm: CSS_PX_PER_MM, interactive: false, forExport: true });
  const insetCtxs = st.insets.map((ins) => {
    const ctx = new MapCtx({ app, target: mk(ins.w, ins.h), role: 'inset', insetId: ins.id, pixelRatio: pr, pxPerMm: CSS_PX_PER_MM, interactive: false, forExport: true });
    return { ins, ctx };
  });
  const all = [mainCtx, ...insetCtxs.map((x) => x.ctx)];
  let done = 0;
  onProgress && onProgress(`Cargando teselas a ${dpi} ppp…`, 0);
  await Promise.all(all.map((c) => c.whenReady().then(() => { done++; onProgress && onProgress(`Mapas listos: ${done} de ${all.length}`, done / all.length); })));
  const cleanup = () => { all.forEach((c) => c.dispose()); host.remove(); };
  const tileErrors = all.reduce((a, c) => a + c.tileErrors, 0);
  return { mainCtx, insetCtxs, frame, pr, cleanup, tileErrors };
}

export async function renderRaster(app, dpi, opts = {}) {
  const st = app.state;
  await ensureFonts(st);
  const { W, H, ok } = exportSize(st, dpi);
  if (!ok) throw new Error(`La imagen resultante (${W} × ${H} px) supera el límite del navegador. Bajá la resolución o el tamaño.`);
  const maps = await buildExportMaps(app, dpi, opts);
  try {
    const s = dpi / 25.4;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = st.page.background || '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const f = maps.frame;
    ctx.save();
    ctx.beginPath(); ctx.rect(f.x * s, f.y * s, f.w * s, f.h * s); ctx.clip();
    for (const c of layerCanvases(maps.mainCtx.map)) drawCanvasInto(ctx, c, f.x * s, f.y * s, maps.pr);
    ctx.restore();
    for (const { ins, ctx: ictx } of maps.insetCtxs) {
      ctx.save();
      insetShapePath(ctx, s, ins);
      ctx.clip();
      ctx.fillStyle = ins.bg || '#ffffff';
      ctx.fillRect(ins.x * s, ins.y * s, ins.w * s, ins.h * s);
      for (const c of layerCanvases(ictx.map)) drawCanvasInto(ctx, c, ins.x * s, ins.y * s, maps.pr);
      ctx.restore();
    }
    const geo = geoFor(maps.mainCtx, maps.insetCtxs, f, CSS_PX_PER_MM);
    drawOverlay(ctx, s, geo, st, { preview: false });
    if (st.render && st.render.colorMode === 'grises') toGray(canvas);
    return { canvas, W, H, tileErrors: maps.tileErrors };
  } finally {
    maps.cleanup();
  }
}

export async function renderSvg(app, dpi, opts = {}) {
  const st = app.state;
  await ensureFonts(st);
  const maps = await buildExportMaps(app, dpi, opts);
  try {
    const s = 1; // unidades SVG = mm
    const pxPerMm = dpi / 25.4;
    const svg = new SvgCtx(st.page.widthMM, st.page.heightMM);
    svg.beginGroup('fondo', 'Fondo');
    svg.fillStyle = st.page.background || '#ffffff';
    svg.fillRect(0, 0, st.page.widthMM, st.page.heightMM);
    svg.endGroup();
    const f = maps.frame;
    const layerName = (uid) => {
      if (uid === '__sites__') return 'Sitios';
      const ls = st.layers.find((l) => l.uid === uid);
      return ls ? ls.name : uid;
    };
    const rasterGroups = (map, wMM, hMM, prefix, clipFn) => {
      const byUid = new Map();
      for (const c of layerCanvases(map)) {
        const uid = layerUidOf(c) || 'capa';
        if (!byUid.has(uid)) byUid.set(uid, []);
        byUid.get(uid).push(c);
      }
      for (const [uid, canvases] of byUid) {
        const W = Math.round(wMM * pxPerMm), H = Math.round(hMM * pxPerMm);
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const octx = off.getContext('2d');
        for (const c of canvases) drawCanvasInto(octx, c, 0, 0, maps.pr);
        svg.beginGroup(`${prefix}-${uid}`, `${prefix === 'mapa' ? '' : 'Zoom: '}${layerName(uid)}`);
        svg.save();
        clipFn();
        svg.drawImage(off, 0, 0, wMM, hMM);
        svg.restore();
        svg.endGroup();
      }
    };
    svg.save();
    svg.translate(f.x, f.y);
    rasterGroups(maps.mainCtx.map, f.w, f.h, 'mapa', () => { svg.beginPath(); svg.rect(0, 0, f.w, f.h); svg.clip(); });
    svg.restore();
    const geo = geoFor(maps.mainCtx, maps.insetCtxs, f, CSS_PX_PER_MM);
    for (const { ins, ctx: ictx } of maps.insetCtxs) {
      svg.beginGroup(`zoom-${ins.id}`, ins.name || 'Zoom');
      svg.save();
      insetShapePath(svg, 1, ins);
      svg.clip();
      svg.fillStyle = ins.bg || '#ffffff';
      svg.fillRect(ins.x, ins.y, ins.w, ins.h);
      svg.save();
      svg.translate(ins.x, ins.y);
      rasterGroups(ictx.map, ins.w, ins.h, `zoom${ins.id}`, () => {});
      svg.restore();
      svg.restore();
      svg.endGroup();
    }
    drawOverlay(svg, s, geo, st, { preview: false });
    return { svg: svg.toString(st.page.widthMM, st.page.heightMM, st.title, { gray: !!(st.render && st.render.colorMode === 'grises') }), tileErrors: maps.tileErrors };
  } finally {
    maps.cleanup();
  }
}

// Conversión a escala de grises (luminancia Rec. 709), para tesis impresas en blanco y negro
export function toGray(canvas) {
  const x = canvas.getContext('2d');
  const step = 2048;
  for (let y0 = 0; y0 < canvas.height; y0 += step) {
    const h = Math.min(step, canvas.height - y0);
    const d = x.getImageData(0, y0, canvas.width, h);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const v = Math.round(0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]);
      a[i] = v; a[i + 1] = v; a[i + 2] = v;
    }
    x.putImageData(d, 0, y0);
  }
  canvas._gray = true;
}

// ---------- codificadores ----------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function canvasToPng(canvas, dpi) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // inserta pHYs tras IHDR (8 + 25 bytes)
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(bytes.subarray(33), 54);
  return new Blob([out], { type: 'image/png' });
}

export async function canvasToJpeg(canvas, dpi, quality = 0.92) {
  const flat = flatten(canvas);
  const blob = await new Promise((r) => flat.toBlob(r, 'image/jpeg', quality));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // JFIF APP0: densidad en ppp
  if (bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 10)) === 'JFIF') {
    bytes[13] = 1;
    bytes[14] = (dpi >> 8) & 255; bytes[15] = dpi & 255;
    bytes[16] = (dpi >> 8) & 255; bytes[17] = dpi & 255;
  }
  return new Blob([bytes], { type: 'image/jpeg' });
}

function flatten(canvas, bg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(canvas, 0, 0);
  return c;
}

function rgbBytes(canvas) {
  const { width: W, height: H } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255;
    rgb[j] = data[i] * a + 255 * (1 - a);
    rgb[j + 1] = data[i + 1] * a + 255 * (1 - a);
    rgb[j + 2] = data[i + 2] * a + 255 * (1 - a);
  }
  return rgb;
}

// TIFF RGB 8 bits con compresión Deflate (Adobe), resolución en ppp
export function canvasToTiff(canvas, dpi) {
  const W = canvas.width, H = canvas.height;
  const gray = !!canvas._gray;
  let raw = rgbBytes(canvas);
  if (gray) { const g = new Uint8Array(W * H); for (let i = 0, j = 0; i < g.length; i++, j += 3) g[i] = raw[j]; raw = g; }
  const comp = zlibSync(raw, { level: 6 });
  const software = 'Mapas-Tesis\0';
  const entries = [
    [256, 4, [W]], [257, 4, [H]], [258, 3, gray ? [8] : [8, 8, 8]], [259, 3, [8]], [262, 3, [gray ? 1 : 2]], [273, 4, [0]],
    [277, 3, [gray ? 1 : 3]], [278, 4, [H]], [279, 4, [comp.length]], [282, 5, [dpi]], [283, 5, [dpi]], [284, 3, [1]], [296, 3, [2]], [305, 2, software],
  ].sort((a, b) => a[0] - b[0]);
  const ifdSize = 2 + entries.length * 12 + 4;
  const extraStart = 8 + ifdSize;
  let extra = [];
  let extraLen = 0;
  const typeSize = { 2: 1, 3: 2, 4: 4, 5: 8 };
  for (const e of entries) {
    const n = e[1] === 2 ? e[2].length : e[2].length;
    const len = typeSize[e[1]] * n;
    e.count = n;
    if (len > 4) { e.offset = extraStart + extraLen; extraLen += len + (len % 2); extra.push(e); }
  }
  const dataOffset = extraStart + extraLen;
  entries.find((e) => e[0] === 273)[2] = [dataOffset];
  const buf = new Uint8Array(dataOffset + comp.length);
  const dv = new DataView(buf.buffer);
  buf.set([0x4d, 0x4d, 0x00, 0x2a]);
  dv.setUint32(4, 8);
  let p = 8;
  dv.setUint16(p, entries.length); p += 2;
  const writeVal = (type, vals, at) => {
    if (type === 2) { for (let i = 0; i < vals.length; i++) buf[at + i] = vals.charCodeAt(i); return; }
    vals.forEach((v, i) => {
      if (type === 3) dv.setUint16(at + i * 2, v);
      else if (type === 4) dv.setUint32(at + i * 4, v);
      else if (type === 5) { dv.setUint32(at + i * 8, Math.round(v * 100)); dv.setUint32(at + i * 8 + 4, 100); }
    });
  };
  for (const e of entries) {
    dv.setUint16(p, e[0]); dv.setUint16(p + 2, e[1]); dv.setUint32(p + 4, e.count);
    if (e.offset) { dv.setUint32(p + 8, e.offset); writeVal(e[1], e[2], e.offset); } else writeVal(e[1], e[2], p + 8);
    p += 12;
  }
  dv.setUint32(p, 0);
  buf.set(comp, dataOffset);
  return new Blob([buf], { type: 'image/tiff' });
}

// PDF de una página con la imagen embebida (JPEG o Flate sin pérdida), tamaño de página exacto en mm
export async function canvasToPdf(canvas, state, { lossless = false, quality = 0.92 } = {}) {
  const W = canvas.width, H = canvas.height;
  const wPt = (state.page.widthMM / 25.4) * 72, hPt = (state.page.heightMM / 25.4) * 72;
  let imgBytes, filter;
  if (lossless) { imgBytes = zlibSync(rgbBytes(canvas), { level: 6 }); filter = '/FlateDecode'; }
  else {
    const blob = await new Promise((r) => flatten(canvas).toBlob(r, 'image/jpeg', quality));
    imgBytes = new Uint8Array(await blob.arrayBuffer()); filter = '/DCTDecode';
  }
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
  const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const pdfStr = (t) => {
    const str = String(t);
    if (/^[\x20-\x7e]*$/.test(str)) return `(${str.replace(/[\\()]/g, (m) => '\\' + m)})`;
    let hex = 'FEFF';
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (cp > 0xffff) { const v = cp - 0x10000; hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); }
      else hex += cp.toString(16).padStart(4, '0');
    }
    return `<${hex.toUpperCase()}>`;
  };
  const now = new Date();
  const d = `D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}00`;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(3)} ${hPt.toFixed(3)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${imgBytes.length} >>\nstream\n`); push(imgBytes); push('\nendstream'); });
  const content = `q ${wPt.toFixed(3)} 0 0 ${hPt.toFixed(3)} 0 0 cm /Im0 Do Q`;
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  obj(6, () => push(`<< /Title ${pdfStr(state.title || 'Mapa')} /Creator (Mapas-Tesis) /Producer (Mapas-Tesis) /CreationDate (${d}) >>`));
  const xref = pos;
  push(`xref\n0 7\n0000000000 65535 f \n`);
  for (let i = 1; i <= 6; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
