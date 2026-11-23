// Diálogo de exportación de la figura
import { el, clear, downloadBlob, fmtInt } from '../util.js';
import { field, inlineFields, select, check, range, button, text } from './forms.js';
import { exportSize, renderRaster, renderSvg, canvasToPng, canvasToJpeg, canvasToTiff, canvasToPdf } from '../exporter.js';
import { getMedia, exportDpi, checkLegibility } from '../media.js';
import { defOf } from '../catalog.js';
import { frameRect } from '../overlay.js';
import { lonLatTo, resolutionFromMpm, projInfo } from '../projections.js';

// Archivo de georreferencia de la figura exportada (seis líneas): permite abrir la imagen en QGIS en su lugar.
// Vale para toda la página porque el mapa no está rotado y su escala es constante en el sistema del mapa.
export function worldFileFor(state, dpi) {
  if (Math.abs(state.view.rotation || 0) > 1e-6) return null;
  const f = frameRect(state);
  const code = state.projection;
  const u = resolutionFromMpm(code, state.view.center, state.view.mpm, 1); // unidades del mapa por mm de papel
  const c = lonLatTo(code, state.view.center);
  const px = (u * 25.4) / dpi;
  const x0 = c[0] - (f.x + f.w / 2) * u, y0 = c[1] + (f.y + f.h / 2) * u;
  return { text: [px, 0, 0, -px, x0 + px / 2, y0 - px / 2].map((v) => v.toFixed(8)).join('\n') + '\n', code };
}
const WF_EXT = { png: 'pgw', jpeg: 'jgw', tiff: 'tfw' };

const FORMATS = [
  ['png', 'PNG (sin pérdida)'],
  ['tiff', 'TIFF (exigido por muchas revistas)'],
  ['pdf', 'PDF (tamaño exacto en mm)'],
  ['jpeg', 'JPEG (liviano)'],
  ['svg', 'SVG por capas (editable en Illustrator o Inkscape)'],
];

function slug(s) {
  return String(s || 'mapa').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'mapa';
}

export function openExportDialog(app) {
  const dlg = document.getElementById('export-dialog');
  const st = app.state;
  const media = getMedia(st.media.profileId);
  const opts = app.ui.exportOpts || (app.ui.exportOpts = { format: media.format, dpi: String(exportDpi(st)), quality: 0.92, lossless: false, name: slug(st.title) });
  if (app.ui.exportProfile !== `${media.id}|${st.media.quality}`) { opts.dpi = String(exportDpi(st)); opts.format = media.format; app.ui.exportProfile = `${media.id}|${st.media.quality}`; }
  opts.name = slug(st.title);
  const body = dlg.querySelector('.dlg-body');
  clear(body);
  const summary = el('div', { class: 'export-summary', 'aria-live': 'polite' });
  const progress = el('div', { class: 'export-progress', 'aria-live': 'polite' });
  const qualityRow = el('div', {});
  const legib = checkLegibility(st);
  const noCors = st.layers.filter((l) => l.visible && defOf(l) && defOf(l).noCors);
  const updateSummary = () => {
    const dpi = Number(opts.dpi);
    const { W, H, ok } = exportSize(st, dpi);
    const mp = (W * H) / 1e6;
    clear(summary);
    summary.append(...[
      el('div', { class: 'sum-line' }, el('strong', {}, `${st.page.widthMM} × ${st.page.heightMM} mm`), ` a ${dpi} ppp`),
      el('div', { class: 'sum-line' }, `${fmtInt(W)} × ${fmtInt(H)} píxeles (${mp.toFixed(1).replace('.', ',')} megapíxeles)`),
      !ok ? el('p', { class: 'warn-note' }, 'Supera el límite de lienzo del navegador: bajá la resolución o el tamaño de la página.') : null,
      ok && mp > 40 ? el('p', { class: 'warn-note' }, 'Imagen muy grande: puede tardar varios minutos y requerir mucha memoria.') : null,
      opts.format === 'svg' ? el('p', { class: 'note' }, 'Cada capa del mapa se incrusta como imagen en su propio grupo; textos, leyenda, norte, escala, conectores y sitios quedan como vectores editables.') : null,
      st.render.colorMode === 'grises' ? el('p', { class: 'note' }, 'Salida en escala de grises (Figura › Destino).') : null,
      legib.issues.length ? el('p', { class: 'warn-note' }, `Para «${media.name}» hay ${legib.issues.length} avisos de legibilidad (Figura › Destino de la figura).`) : null,
      noCors.length ? el('p', { class: 'warn-note' }, `Quedan fuera de la exportación porque su servidor no lo permite (sin CORS): ${noCors.map((l) => `«${l.name}»`).join(', ')}.`) : null].filter(Boolean)
    );
    clear(qualityRow);
    if (opts.format === 'jpeg' || (opts.format === 'pdf' && !opts.lossless)) qualityRow.append(field('Calidad JPEG', range(opts, 'quality', { min: 0.6, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` })));
    if (opts.format === 'pdf') qualityRow.append(check(opts, 'lossless', 'PDF sin pérdida (más pesado)', { onChange: updateSummary }));
    if (WF_EXT[opts.format]) {
      const can = Math.abs(st.view.rotation || 0) < 1e-6;
      if (!can) opts.world = false;
      const wc = check(opts, 'world', `Sumar el archivo de georreferencia (.${WF_EXT[opts.format]}) para abrir la figura en QGIS`, {});
      if (!can) wc.querySelector('input').disabled = true;
      qualityRow.append(wc, el('p', { class: 'note' }, can ? `Se descarga un segundo archivo con el mismo nombre. En QGIS, asignale a la imagen el sistema del mapa: ${/^EPSG:/.test(st.projection) ? st.projection : projInfo(st.projection).name}.` : 'No disponible con el mapa rotado.'));
    }
  };
  const fmtSel = select(opts, 'format', FORMATS, { onChange: updateSummary });
  const dpiList = [['150', '150 ppp (borrador, pantalla)'], ['300', '300 ppp (fotografías, imágenes en color)'], ['600', '600 ppp (figuras combinadas con texto)'], ['1200', '1200 ppp (dibujo lineal)']];
  const pd = String(exportDpi(st));
  if (!dpiList.some((d) => d[0] === pd)) dpiList.unshift([pd, `${pd.replace('.', ',')} ppp (según el destino: ${media.name})`]);
  else dpiList.forEach((d) => { if (d[0] === pd) d[1] += ' · destino'; });
  if (!dpiList.some((d) => d[0] === opts.dpi)) opts.dpi = pd;
  const dpiSel = select(opts, 'dpi', dpiList, { onChange: updateSummary });
  const go = button('Exportar', async () => {
    go.disabled = true;
    clear(progress);
    progress.textContent = 'Preparando…';
    const dpi = Number(opts.dpi);
    try {
      const onProgress = (msg) => { progress.textContent = msg; };
      let blob, ext, tileErrors = 0;
      if (opts.format === 'svg') {
        const r = await renderSvg(app, dpi, { onProgress });
        blob = new Blob([r.svg], { type: 'image/svg+xml' }); ext = 'svg'; tileErrors = r.tileErrors;
      } else {
        const r = await renderRaster(app, dpi, { onProgress });
        tileErrors = r.tileErrors;
        progress.textContent = 'Codificando…';
        if (opts.format === 'png') { blob = await canvasToPng(r.canvas, dpi); ext = 'png'; }
        else if (opts.format === 'jpeg') { blob = await canvasToJpeg(r.canvas, dpi, opts.quality); ext = 'jpg'; }
        else if (opts.format === 'tiff') { blob = canvasToTiff(r.canvas, dpi); ext = 'tif'; }
        else { blob = await canvasToPdf(r.canvas, st, { lossless: opts.lossless, quality: opts.quality }); ext = 'pdf'; }
        r.canvas.width = 1; r.canvas.height = 1;
      }
      const fname = `${slug(opts.name)}.${ext}`;
      downloadBlob(blob, fname);
      if (opts.world && WF_EXT[opts.format]) {
        const wf = worldFileFor(st, dpi);
        if (wf) setTimeout(() => downloadBlob(new Blob([wf.text], { type: 'text/plain' }), `${slug(opts.name)}.${WF_EXT[opts.format]}`), 400);
      }
      progress.textContent = `Listo: ${fname} (${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB).${tileErrors ? ` Atención: ${tileErrors} teselas no se pudieron descargar y faltan en la imagen.` : ''}`;
      app.lastExport = { name: fname, size: blob.size, tileErrors };
    } catch (err) {
      console.error(err);
      progress.textContent = `No se pudo exportar: ${err.message}`;
    } finally {
      go.disabled = false;
    }
  }, { kind: 'primary' });
  body.append(
    field('Formato', fmtSel),
    field('Resolución', dpiSel),
    qualityRow,
    field('Nombre del archivo', text(opts, 'name')),
    summary,
    el('div', { class: 'btn-row end' }, button('Cerrar', () => dlg.close(), { kind: 'ghost' }), go),
    progress,
  );
  updateSummary();
  if (!dlg.open) dlg.showModal();
}
