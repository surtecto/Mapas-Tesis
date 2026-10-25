// Imágenes en el tiempo y coberturas: escenas por fecha (Sentinel-2 y Landsat desde 1972), mosaicos anuales,
// cobertura del suelo con paleta propia, superficies y cambios entre años, y clasificación propia (k-means).
import { el, clear, downloadBlob, uid } from '../util.js';
import {
  SENSORS, LANDCOVER, LC_PALETTES, EOX_YEARS, searchScenes, sceneLayerDef, landcoverLayerDef, eoxLayerDef,
  landcoverValues, areaByClass, changeMatrix, changeImage, exportBands, classify, labelsToPng, fmtHa,
} from '../imagery.js';
import { newServiceLayerState, newText } from '../state.js';
import { putImage } from '../imagestore.js';
import { insertIndexFor } from './layersPanel.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SEASONS = [['', 'Todo el año'], ['12,1,2', 'Verano (dic–feb)'], ['3,4,5', 'Otoño (mar–may)'], ['6,7,8', 'Invierno (jun–ago)'], ['9,10,11', 'Primavera (sep–nov)']];

function dialogEl() {
  let d = document.getElementById('imagery-dialog');
  if (!d) { d = el('dialog', { id: 'imagery-dialog', class: 'svc-dialog img-dialog', 'aria-label': 'Imágenes y coberturas' }); document.body.append(d); }
  return d;
}

function addLayer(app, def, over = {}, { below = false } = {}) {
  const st = app.state;
  const ls = newServiceLayerState(def, over);
  if (def.classes) ls.legend = { show: true, label: def.name };
  st.layers.splice(insertIndexFor(st, def), 0, ls);
  if (below) { /* las imágenes ya van debajo de los vectores */ }
  app.commit('layers');
  app.ui.expanded.add(ls.uid);
  app.renderLeft();
  app.keepInside();
  return ls;
}

function csv(rows) { return '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'); }

export function openImageryDialog(app, { tab } = {}) {
  const d = dialogEl();
  clear(d);
  const ui = app.ui.img || (app.ui.img = { tab: 'fecha', sensor: 's2', render: 'Natural Color with DRA', from: '', to: '', cloud: 20, season: '', fill: true, lcYear: 2025, lcYear2: 2017, lcPal: 'tesis', k: 6, kSensor: 's2', scenes: null });
  if (tab) ui.tab = tab;
  const body = el('div', { class: 'img-body' });
  const tabs = el('div', { class: 'seg img-tabs', role: 'tablist' });
  const TABS = [['fecha', 'Imagen por fecha'], ['anual', 'Mosaicos anuales'], ['cobertura', 'Cobertura del suelo'], ['clasif', 'Clasificación propia']];
  const paintTabs = () => {
    clear(tabs);
    TABS.forEach(([k, t]) => tabs.append(el('button', { type: 'button', role: 'tab', 'aria-selected': String(ui.tab === k), class: ui.tab === k ? 'on' : '', onclick: () => { ui.tab = k; paintTabs(); paint(); } }, t)));
  };
  const view = () => app.viewBBoxLL();
  const paint = () => {
    clear(body);
    if (ui.tab === 'fecha') body.append(tabFecha());
    else if (ui.tab === 'anual') body.append(tabAnual());
    else if (ui.tab === 'cobertura') body.append(tabCobertura());
    else body.append(tabClasif());
  };
  const fld = (label, control, hint) => el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, label), control, hint ? el('span', { class: 'wf-h' }, hint) : null);
  const selectOf = (obj, key, options, onChange) => {
    const s = el('select', {}, ...options.map(([v, t]) => el('option', { value: v, selected: String(obj[key]) === String(v) }, t)));
    s.addEventListener('change', () => { obj[key] = s.value; onChange && onChange(s.value); });
    return s;
  };

  // ----- imagen por fecha -----
  function tabFecha() {
    const s = SENSORS[ui.sensor];
    if (!s.renders.some((r) => r[0] === ui.render)) ui.render = s.renders[0][0];
    const list = el('div', { class: 'scene-list' });
    const fromIn = el('input', { type: 'date', value: ui.from, min: ui.sensor === 'landsat' ? '1972-07-25' : '' });
    const toIn = el('input', { type: 'date', value: ui.to, max: new Date().toISOString().slice(0, 10) });
    fromIn.addEventListener('change', () => { ui.from = fromIn.value; });
    toIn.addEventListener('change', () => { ui.to = toIn.value; });
    const cloud = el('input', { type: 'range', min: 0, max: 80, step: 5, value: ui.cloud });
    const cloudOut = el('output', {}, `${ui.cloud}%`);
    cloud.addEventListener('input', () => { ui.cloud = Number(cloud.value); cloudOut.textContent = `${ui.cloud}%`; });
    const search = el('button', { type: 'button', class: 'btn primary' }, 'Buscar fechas en la vista');
    const paintScenes = () => {
      clear(list);
      if (!ui.scenes) { list.append(el('p', { class: 'note' }, `Se buscan las escenas que cubren la vista actual del mapa. ${s.name}: ${s.span}.`)); return; }
      if (!ui.scenes.length) { list.append(el('p', { class: 'note' }, 'No hay escenas con esas condiciones: ampliá el rango de fechas o la nubosidad.')); return; }
      // resumen por año para elegir rápido en series largas (Landsat)
      const years = [...new Set(ui.scenes.map((x) => x.date.slice(0, 4)))];
      if (years.length > 3) list.append(el('p', { class: 'note' }, `${ui.scenes.length} fechas entre ${years[years.length - 1]} y ${years[0]}.`));
      const table = el('table', { class: 'scene-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'Fecha'), el('th', {}, 'Nubes'), el('th', {}, ui.sensor === 'landsat' ? 'Sensor' : 'Teselas'), el('th', {}, ''))));
      const tb = el('tbody');
      for (const sc of ui.scenes.slice(0, 250)) {
        const [y, m, dd] = sc.date.split('-');
        tb.append(el('tr', {},
          el('td', {}, `${Number(dd)} ${MONTHS[Number(m) - 1]} ${y}`),
          el('td', {}, el('span', { class: 'cloudbar', style: { '--c': `${Math.round(sc.cloud * 100)}%` } }), ` ${Math.round(sc.cloud * 100)}%`),
          el('td', {}, ui.sensor === 'landsat' ? String(sc.sensor || '').replace('LANDSAT-', 'L').replace('Landsat ', 'L') : String(sc.count)),
          el('td', { class: 'acts' },
            el('button', { type: 'button', class: 'btn small', onclick: () => { addScene(sc); } }, 'Agregar'),
            el('button', { type: 'button', class: 'btn small ghost', title: 'Agregar como «antes» o «después» para comparar con cortina', onclick: () => compare(sc) }, 'Comparar'))));
      }
      table.append(tb);
      list.append(table);
    };
    search.addEventListener('click', async () => {
      search.disabled = true; search.textContent = 'Buscando…';
      try {
        ui.scenes = await searchScenes(ui.sensor, view(), { from: ui.from, to: ui.to, maxCloud: ui.cloud / 100, months: ui.season ? ui.season.split(',').map(Number) : null });
      } catch (e) { ui.scenes = null; app.toast(`No se pudieron buscar escenas: ${e.message}`, 'error'); }
      search.disabled = false; search.textContent = 'Buscar fechas en la vista';
      paintScenes();
    });
    const addScene = (sc) => {
      addLayer(app, sceneLayerDef(ui.sensor, sc, ui.render, { fill: ui.fill, maxCloud: Math.max(0.2, ui.cloud / 100) }), { opacity: 1 });
      app.toast(`Imagen agregada: ${s.name} del ${sc.date.split('-').reverse().join('/')}${ui.fill ? ', con huecos completados por fechas cercanas' : ''}.`);
    };
    const compare = (sc) => {
      const prev = app.state.layers.filter((l) => l.def === 'svc' && l.svc.type === 'svc-image');
      const ls = addLayer(app, sceneLayerDef(ui.sensor, sc, ui.render, { fill: ui.fill, maxCloud: Math.max(0.2, ui.cloud / 100) }), { opacity: 1 });
      if (prev.length) {
        // la nueva va encima con cortina al 50 %: a la izquierda se ve la nueva, a la derecha la anterior
        const other = prev[prev.length - 1];
        ls.params.swipe = 50; ls.params.swipeSide = 'left';
        const older = (other.svc.date || '') < (sc.date || '') ? other : ls;
        const newer = older === ls ? other : ls;
        addDateLabels(app, older, newer, ls);
        app.commit('layers');
        app.renderLeft();
        app.toast('Comparación armada: la cortina se ajusta en la capa de arriba (pestaña Capas).');
      } else app.toast('Primera imagen agregada. Elegí otra fecha y tocá «Comparar» para armar la cortina.');
    };
    return el('div', { class: 'img-pane' },
      el('div', { class: 'img-form' },
        el('div', { class: 'seg' }, ...Object.values(SENSORS).map((x) => el('button', { type: 'button', class: ui.sensor === x.id ? 'on' : '', onclick: () => { ui.sensor = x.id; ui.scenes = null; paint(); } }, `${x.name} (${x.res} m)`))),
        el('p', { class: 'note' }, s.span),
        fld('Representación', selectOf(ui, 'render', s.renders)),
        el('div', { class: 'wf-row' }, fld('Desde', fromIn), fld('Hasta', toIn)),
        fld('Estación', selectOf(ui, 'season', SEASONS)),
        fld('Nubosidad máxima', el('div', { class: 'range-row' }, cloud, cloudOut)),
        (() => { const c = el('input', { type: 'checkbox', checked: ui.fill }); c.addEventListener('change', () => { ui.fill = c.checked; }); return el('label', { class: 'check' }, c, el('span', {}, 'Completar los huecos con fechas cercanas (±20 días)')); })(),
        el('div', { class: 'btn-row' }, search,
          el('button', { type: 'button', class: 'btn ghost', onclick: () => { addLayer(app, sceneLayerDef(ui.sensor, null, ui.render)); app.toast(`Mosaico más despejado de ${s.name} agregado.`); } }, 'Agregar el mosaico más despejado'))),
      el('div', { class: 'img-results' }, list));
    // eslint-disable-next-line no-unreachable
  }

  // ----- mosaicos anuales -----
  function tabAnual() {
    const grid = el('div', { class: 'year-grid' });
    for (const y of EOX_YEARS) {
      grid.append(el('button', { type: 'button', class: 'year-btn', onclick: () => { addLayer(app, eoxLayerDef(y)); app.toast(`Mosaico ${y} agregado.`); } },
        el('strong', {}, String(y)), el('span', {}, 'Sentinel-2 sin nubes')));
    }
    return el('div', { class: 'img-pane single' },
      el('p', { class: 'wiz-lead' }, 'Mosaicos anuales de Sentinel-2 sin nubes (EOX): una imagen pareja por año, buena como base y para comparar años con la cortina.'),
      grid,
      el('p', { class: 'note' }, 'Para fechas puntuales o años anteriores a 2016, usá «Imagen por fecha» con Landsat (desde 1972).'));
  }

  // ----- cobertura del suelo -----
  function tabCobertura() {
    const out = el('div', { class: 'img-results' });
    const yearOpts = LANDCOVER.years.map((y) => [y, String(y)]);
    const palOpts = Object.entries(LC_PALETTES).map(([k, p]) => [k, p.name]);
    const statsBtn = el('button', { type: 'button', class: 'btn' }, 'Superficie por clase en la vista');
    const changeBtn = el('button', { type: 'button', class: 'btn' }, 'Cambios entre los dos años');
    statsBtn.addEventListener('click', async () => {
      statsBtn.disabled = true; statsBtn.textContent = 'Calculando…';
      try {
        const g = await landcoverValues(Number(ui.lcYear), view());
        const areas = areaByClass(g);
        const total = [...areas.values()].reduce((a, b) => a + b, 0);
        clear(out);
        const rows = [['Clase', 'Hectáreas', '%']];
        const tb = el('tbody');
        for (const c of LANDCOVER.classes) {
          const a = areas.get(c.v) || 0;
          if (!a) continue;
          rows.push([c.name, (a / 1e4).toFixed(1), ((a / total) * 100).toFixed(1)]);
          tb.append(el('tr', {}, el('td', {}, el('span', { class: 'sw-mini', style: { background: (LC_PALETTES[ui.lcPal] || LC_PALETTES.tesis).colors[c.v] } }), c.name), el('td', { class: 'num' }, fmtHa(a)), el('td', { class: 'num' }, `${((a / total) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`)));
        }
        out.append(el('h3', {}, `Cobertura ${ui.lcYear} en la vista`),
          el('p', { class: 'note' }, `Superficie total ${fmtHa(total)} ha, con píxeles de ${Math.round(g.pxMeters)} m (corregidos por latitud). Es un recuento sobre la vista del mapa, no sobre un polígono.`),
          el('table', { class: 'stat-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'Clase'), el('th', {}, 'ha'), el('th', {}, '%'))), tb),
          el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => downloadBlob(new Blob([csv(rows)], { type: 'text/csv' }), `cobertura-${ui.lcYear}.csv`) }, 'Descargar CSV')));
      } catch (e) { app.toast(`No se pudo calcular: ${e.message}`, 'error'); }
      statsBtn.disabled = false; statsBtn.textContent = 'Superficie por clase en la vista';
    });
    changeBtn.addEventListener('click', async () => {
      changeBtn.disabled = true; changeBtn.textContent = 'Calculando…';
      try {
        const y1 = Math.min(Number(ui.lcYear), Number(ui.lcYear2)), y2 = Math.max(Number(ui.lcYear), Number(ui.lcYear2));
        if (y1 === y2) throw new Error('elegí dos años distintos');
        const bb = view();
        const [g1, g2] = await Promise.all([landcoverValues(y1, bb), landcoverValues(y2, bb)]);
        const m = changeMatrix(g1, g2);
        const cls = LANDCOVER.classes.filter((c) => [...m.keys()].some((k) => k.startsWith(`${c.v}>`) || k.endsWith(`>${c.v}`)));
        const total = [...m.values()].reduce((a, b) => a + b, 0);
        let changed = 0;
        m.forEach((v, k) => { const [a, b] = k.split('>'); if (a !== b) changed += v; });
        const rows = [[`${y1} \\ ${y2}`, ...cls.map((c) => c.name)]];
        const thead = el('tr', {}, el('th', {}, `${y1} → ${y2}`), ...cls.map((c) => el('th', {}, c.name)));
        const tb = el('tbody');
        for (const a of cls) {
          const r = [a.name];
          const tr = el('tr', {}, el('th', {}, a.name));
          for (const b of cls) {
            const v = m.get(`${a.v}>${b.v}`) || 0;
            r.push((v / 1e4).toFixed(1));
            tr.append(el('td', { class: `num${a.v === b.v ? ' diag' : v / total > 0.01 ? ' hot' : ''}` }, v ? fmtHa(v) : '·'));
          }
          rows.push(r);
          tb.append(tr);
        }
        // las mayores transiciones
        const top = [...m.entries()].filter(([k]) => { const [a, b] = k.split('>'); return a !== b; }).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const nameOf = (v) => (LANDCOVER.classes.find((c) => String(c.v) === String(v)) || {}).name || v;
        clear(out);
        out.append(el('h3', {}, `Cambios de cobertura ${y1}–${y2}`),
          el('p', { class: 'note' }, `Cambió de clase el ${((changed / total) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} % de la vista (${fmtHa(changed)} ha de ${fmtHa(total)} ha). Filas: cobertura en ${y1}; columnas: en ${y2}; en hectáreas. Parte del cambio es error de clasificación: leelo como tendencia, no como medición.`),
          el('div', { class: 'matrix-wrap' }, el('table', { class: 'stat-table matrix' }, el('thead', {}, thead), tb)),
          top.length ? el('ol', { class: 'top-changes' }, ...top.map(([k, v]) => { const [a, b] = k.split('>'); return el('li', {}, `${nameOf(a)} → ${nameOf(b)}: ${fmtHa(v)} ha`); })) : null,
          el('div', { class: 'btn-row' },
            el('button', { type: 'button', class: 'btn small primary', onclick: async () => {
              const pal = LC_PALETTES[ui.lcPal] || LC_PALETTES.tesis;
              const classes = LANDCOVER.classes.map((c) => ({ v: c.v, id: c.v, name: `Pasó a ${c.name.toLowerCase()}`, color: pal.colors[c.v] || c.color, show: true }));
              const img = await changeImage(g1, g2, classes);
              const key = `calc-${uid('C')}`;
              await putImage(key, img.blob, img.w, img.h);
              const used = new Set(); for (const k2 of m.keys()) { const [a, b] = k2.split('>'); if (a !== b) used.add(Number(b)); }
              addLayer(app, {
                id: 'svc', kind: 'raster', type: 'svc-img', name: `Cambios de cobertura ${y1}–${y2}`, key, extent: g1.b, labels: false,
                classes: classes.filter((c) => used.has(c.v)), provider: { id: 'landcover', short: 'Cobertura 10 m', name: LANDCOVER.attribution },
                attribution: LANDCOVER.attribution, cite: `Elaboración propia sobre ${LANDCOVER.cite}, años ${y1} y ${y2}: píxeles que cambiaron de clase, coloreados por la clase de llegada`,
              }, { opacity: 1 });
              app.toast('Mapa de cambios agregado (solo los píxeles que cambiaron de clase).');
            } }, 'Agregar el mapa de cambios'),
            el('button', { type: 'button', class: 'btn small ghost', onclick: () => downloadBlob(new Blob([csv(rows)], { type: 'text/csv' }), `cambios-cobertura-${y1}-${y2}.csv`) }, 'Descargar la matriz (CSV)')));
      } catch (e) { app.toast(`No se pudo calcular: ${e.message}`, 'error'); }
      changeBtn.disabled = false; changeBtn.textContent = 'Cambios entre los dos años';
    });
    out.append(el('p', { class: 'note' }, 'Serie anual de cobertura del suelo a 10 m (Impact Observatory, Microsoft y Esri), 2017–2025. La paleta se aplica en el servidor y cada clase se puede ocultar o recolorear desde la capa.'));
    return el('div', { class: 'img-pane' },
      el('div', { class: 'img-form' },
        el('div', { class: 'wf-row' }, fld('Año', selectOf(ui, 'lcYear', yearOpts)), fld('Comparar con', selectOf(ui, 'lcYear2', yearOpts))),
        fld('Paleta', selectOf(ui, 'lcPal', palOpts)),
        el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn primary', onclick: () => { addLayer(app, landcoverLayerDef(Number(ui.lcYear), ui.lcPal), { opacity: 0.85 }); app.toast(`Cobertura ${ui.lcYear} agregada.`); } }, 'Agregar al mapa')),
        el('h3', {}, 'Análisis en la vista'),
        el('div', { class: 'btn-col' }, statsBtn, changeBtn)),
      out);
  }

  // ----- clasificación propia -----
  function tabClasif() {
    const out = el('div', { class: 'img-results' });
    const kIn = el('input', { type: 'number', min: 3, max: 12, step: 1, value: ui.k });
    kIn.addEventListener('change', () => { ui.k = Math.max(3, Math.min(12, Number(kIn.value) || 6)); });
    const sceneSel = el('select', {});
    const fillScenes = () => {
      clear(sceneSel);
      sceneSel.append(el('option', { value: '' }, 'Mosaico más despejado (sin fecha fija)'));
      const imgs = app.state.layers.filter((l) => l.def === 'svc' && l.svc.type === 'svc-image' && l.svc.sensor === ui.kSensor && l.svc.date);
      imgs.forEach((l) => sceneSel.append(el('option', { value: l.uid }, `${l.svc.date.split('-').reverse().join('/')} (capa del mapa)`)));
    };
    fillScenes();
    const run = el('button', { type: 'button', class: 'btn primary' }, 'Clasificar la vista');
    const prog = el('p', { class: 'note', 'aria-live': 'polite' });
    let ctl = null;
    const cancel = el('button', { type: 'button', class: 'btn ghost', hidden: true, onclick: () => { if (ctl) ctl.abort(); } }, 'Cancelar');
    run.addEventListener('click', async () => {
      run.disabled = true;
      cancel.hidden = false;
      ctl = new AbortController();
      const t0 = Date.now();
      const tick = setInterval(() => { prog.textContent = `El servidor de imágenes está componiendo las seis bandas de la vista (${Math.round((Date.now() - t0) / 1000)} s; la primera vez suele tardar entre 20 segundos y un minuto).`; }, 1000);
      try {
        const s = SENSORS[ui.kSensor];
        const src = sceneSel.value ? app.state.layers.find((l) => l.uid === sceneSel.value) : null;
        const mosaic = src ? src.svc.mosaic : sceneLayerDef(ui.kSensor, null, 'None').mosaic;
        run.textContent = 'Descargando bandas…';
        const img = await exportBands(ui.kSensor, view(), mosaic, 560, ctl.signal);
        clearInterval(tick);
        prog.textContent = '';
        run.textContent = 'Agrupando píxeles…';
        await new Promise((r) => setTimeout(r, 30));
        const res = classify(img, ui.k);
        const blob = await labelsToPng(res.labels, res.w, res.h);
        const key = `calc-${uid('K')}`;
        await putImage(key, blob, res.w, res.h);
        const total = res.classes.reduce((a, c) => a + c.area, 0);
        const when = src ? src.svc.date : 'mosaico más despejado';
        const def = {
          id: 'svc', kind: 'raster', type: 'svc-img', name: `Clasificación ${s.name} ${src ? src.svc.date.split('-').reverse().join('/') : ''} (${ui.k} clases)`.replace('  ', ' '),
          key, extent: img.b, labels: true, provider: { id: ui.kSensor, short: s.name, name: s.name },
          classes: res.classes.map((c) => ({ id: c.id, name: c.name, color: c.color, show: true, area: c.area, ndvi: Number(c.ndvi.toFixed(3)) })),
          attribution: `${s.attribution}; clasificación propia`, cite: `Elaboración propia: clasificación no supervisada (k-means, ${ui.k} clases, 6 bandas de reflectancia, NDVI y NDWI; píxel de ${Math.round(img.pxMeters)} m) sobre ${s.cite}, ${when}`,
          method: { k: ui.k, px: Math.round(img.pxMeters), sensor: ui.kSensor, date: when },
        };
        addLayer(app, def, { opacity: 0.9 });
        clear(out);
        const rows = [['Clase', 'Hectáreas', '%', 'NDVI medio']];
        const tb = el('tbody');
        for (const c of def.classes) {
          rows.push([c.name, (c.area / 1e4).toFixed(1), ((c.area / total) * 100).toFixed(1), c.ndvi]);
          tb.append(el('tr', {}, el('td', {}, el('span', { class: 'sw-mini', style: { background: c.color } }), c.name), el('td', { class: 'num' }, fmtHa(c.area)), el('td', { class: 'num' }, `${((c.area / total) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`), el('td', { class: 'num' }, c.ndvi.toLocaleString('es-AR'))));
        }
        out.append(el('h3', {}, 'Resultado'),
          el('p', { class: 'note' }, `Las clases son grupos de píxeles con respuesta espectral parecida; los nombres son una sugerencia según el NDVI y el NDWI medios. Revisalos con la imagen y renombralos desde la capa: la interpretación es tuya. Píxel de ${Math.round(img.pxMeters)} m.`),
          el('table', { class: 'stat-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'Clase'), el('th', {}, 'ha'), el('th', {}, '%'), el('th', {}, 'NDVI'))), tb),
          el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => downloadBlob(new Blob([csv(rows)], { type: 'text/csv' }), 'clasificacion.csv') }, 'Descargar CSV')));
      } catch (e) { app.toast(e.name === 'AbortError' ? 'Clasificación cancelada.' : `No se pudo clasificar: ${e.message}`, e.name === 'AbortError' ? 'info' : 'error'); }
      clearInterval(tick);
      prog.textContent = '';
      cancel.hidden = true;
      run.disabled = false; run.textContent = 'Clasificar la vista';
    });
    out.append(el('p', { class: 'note' }, 'Agrupa los píxeles de la vista según su respuesta en seis bandas (azul, verde, rojo, infrarrojo cercano y dos de onda corta) más el NDVI y el NDWI. Sirve para explorar patrones del paisaje que la cobertura global no distingue; no reemplaza una clasificación supervisada con verdad de campo.'));
    return el('div', { class: 'img-pane' },
      el('div', { class: 'img-form' },
        el('div', { class: 'seg' }, ...Object.values(SENSORS).map((x) => el('button', { type: 'button', class: ui.kSensor === x.id ? 'on' : '', onclick: () => { ui.kSensor = x.id; paint(); } }, x.name))),
        fld('Imagen', sceneSel, 'Para fijar una fecha, agregá antes la imagen desde «Imagen por fecha».'),
        fld('Cantidad de clases', kIn),
        el('div', { class: 'btn-row' }, run, cancel),
        prog,
        el('p', { class: 'note' }, 'La vista se baja a unos 560 píxeles de lado: para más detalle, acercá el mapa al área de interés.')),
      out);
  }

  d.append(
    el('header', { class: 'svc-top' },
      el('div', {}, el('h2', {}, 'Imágenes y coberturas'), el('p', {}, 'Imágenes satelitales por fecha (Sentinel-2 del último año, Landsat desde 1972), mosaicos anuales, cobertura del suelo 2017–2025 con superficies y cambios, y clasificación propia de la vista.')),
      el('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cerrar')),
    el('div', { class: 'img-tabs-wrap' }, tabs),
    body);
  paintTabs();
  paint();
  d.showModal();
}

// Rótulos «antes / después» arriba del mapa, con las fechas de cada imagen
function addDateLabels(app, older, newer, top) {
  const st = app.state;
  const f = app.frameSize();
  const fmt = (l) => (l.svc.date ? l.svc.date.split('-').reverse().join('/') : '');
  const leftIsNewer = top === newer && (top.params.swipeSide || 'left') === 'left';
  const left = leftIsNewer ? newer : older, right = leftIsNewer ? older : newer;
  st.texts = st.texts.filter((t) => !t._swipeLabel && !(t.tag === 'swipe'));
  const cx = f.x + (f.w * Number(top.params.swipe || 50)) / 100;
  const box = { show: true, color: '#1d1d1d', opacity: 0.72, pad: 1.2, radius: 0.6 };
  st.texts.push(newText({ text: fmt(left), x: cx - 2.5, y: f.y + 5, size: 8.5, bold: true, color: '#ffffff', align: 'right', bg: box, tag: 'swipe' }));
  st.texts.push(newText({ text: fmt(right), x: cx + 2.5, y: f.y + 5, size: 8.5, bold: true, color: '#ffffff', align: 'left', bg: box, tag: 'swipe' }));
}
