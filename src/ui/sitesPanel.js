// Panel de sitios de estudio, categorías y paletas (incluida la extracción desde gráficos estadísticos)
import { el, clear, uid, formatDMS, parseCoordPair, readFileAs } from '../util.js';
import { field, inlineFields, num, color, select, check, range, button, details, text } from './forms.js';
import { PALETTES, paletteColors, extractPaletteFromImage, paletteDiagnostics, getPalette } from '../palette.js';
import { SHAPES } from '../styles.js';
import { FONTS } from '../catalog.js';
import { parseCSV, detectLatLon } from './importers.js';
import { parseCoordValue } from '../util.js';

export function renderSitesPanel(app, root) {
  clear(root);
  root.append(
    addSiteForm(app),
    sitesList(app),
    el('h2', { class: 'panel-h' }, 'Categorías y colores'),
    categoriesView(app),
    paletteTool(app),
    el('h2', { class: 'panel-h' }, 'Símbolo de los sitios'),
    siteSymbolEditor(app),
  );
}

function addSiteForm(app) {
  const draft = { name: '', coords: '' };
  const name = text(draft, 'name', { placeholder: 'Ej.: Colonia Punta Stranger' });
  const coords = text(draft, 'coords', { placeholder: '-62.26, -58.62  ó  62°15′S 58°37′O' });
  const catsBox = el('div', { class: 'chips' });
  const chosen = new Set();
  for (const c of app.state.categories) {
    const id = `nc-${c.id}`;
    const cb = el('input', { type: 'checkbox', id });
    cb.addEventListener('change', () => { if (cb.checked) chosen.add(c.id); else chosen.delete(c.id); });
    catsBox.append(el('label', { class: 'chip', for: id }, cb, el('span', { class: 'dot', style: { background: c.color } }), c.name));
  }
  const add = button('Agregar sitio', () => {
    const p = parseCoordPair(draft.coords);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
      app.toast('Coordenadas no válidas. Usá "lat, lon" en grados decimales o con grados, minutos y hemisferio.', 'error');
      return;
    }
    app.state.sites.push({ id: uid('S'), name: draft.name || `Sitio ${app.state.sites.length + 1}`, lat: p.lat, lon: p.lon, cats: [...chosen], label: { show: true }, note: '' });
    app.commit('sites');
    app.renderLeft();
  }, { kind: 'primary small' });
  const pick = button(app.mode === 'add-site' ? 'Tocá el mapa para ubicar…' : 'Marcar en el mapa', () => {
    app.setMode(app.mode === 'add-site' ? null : 'add-site', { name: draft.name, cats: [...chosen] });
    app.renderLeft();
  }, { kind: `small${app.mode === 'add-site' ? ' active' : ''}` });
  const csv = el('input', { type: 'file', accept: '.csv,.tsv,.txt', class: 'file-input', id: 'sites-csv' });
  csv.addEventListener('change', async () => {
    const f = csv.files[0];
    if (!f) return;
    try {
      const { header, rows } = parseCSV(await readFileAs(f, 'text'));
      const cols = detectLatLon(header);
      if (!cols.lat || !cols.lon) throw new Error('faltan columnas de latitud y longitud');
      let added = 0;
      for (const r of rows) {
        const lat = parseCoordValue(r[cols.lat]), lon = parseCoordValue(r[cols.lon]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const cats = [];
        if (cols.cat && r[cols.cat]) {
          for (const nm of String(r[cols.cat]).split(/[|/+]/).map((x) => x.trim()).filter(Boolean)) {
            let c = app.state.categories.find((k) => k.name.toLowerCase() === nm.toLowerCase());
            if (!c) {
              const pal = getPalette(app.state.paletteId) || PALETTES[0];
              c = { id: uid('C'), name: nm, color: paletteColors(pal, app.state.categories.length + 1)[app.state.categories.length] };
              app.state.categories.push(c);
            }
            cats.push(c.id);
          }
        }
        app.state.sites.push({ id: uid('S'), name: cols.name ? r[cols.name] : `Sitio ${app.state.sites.length + 1}`, lat, lon, cats, label: { show: true }, note: '' });
        added++;
      }
      app.toast(`Sitios importados: ${added}`);
      app.commit('sites');
      app.renderLeft();
    } catch (err) {
      app.toast(`No se pudo leer el CSV: ${err.message}`, 'error');
    }
    csv.value = '';
  });
  return el('div', { class: 'add-site' },
    field('Nombre del sitio', name),
    field('Coordenadas (latitud, longitud)', coords),
    app.state.categories.length ? field('Categorías', catsBox) : null,
    el('div', { class: 'btn-row' }, add, pick, el('label', { class: 'btn small ghost', for: 'sites-csv' }, 'Importar CSV'), csv));
}

function sitesList(app) {
  const ul = el('ul', { class: 'site-list' });
  if (!app.state.sites.length) {
    ul.append(el('li', { class: 'empty' }, 'Todavía no hay sitios. Agregalos con coordenadas o marcándolos en el mapa.'));
    return ul;
  }
  for (const s of app.state.sites) {
    const open = app.ui.expandedSites.has(s.id);
    const selected = app.selection && app.selection.kind === 'site' && app.selection.id === s.id;
    const dots = el('span', { class: 'dots' }, ...(s.cats || []).map((cid) => {
      const c = app.state.categories.find((k) => k.id === cid);
      return c ? el('span', { class: 'dot', style: { background: c.color }, title: c.name }) : null;
    }));
    const head = el('button', { type: 'button', class: 'site-head', 'aria-expanded': String(open) },
      dots, el('span', { class: 'site-name' }, s.name), el('span', { class: 'site-coord' }, `${formatDMS(s.lat, true, { seconds: false })} ${formatDMS(s.lon, false, { seconds: false })}`));
    head.addEventListener('click', () => {
      if (open) app.ui.expandedSites.delete(s.id); else app.ui.expandedSites.add(s.id);
      app.select({ kind: 'site', id: s.id });
      app.renderLeft();
    });
    const li = el('li', { class: `site-item${selected ? ' selected' : ''}` }, head);
    if (open) li.append(siteBody(app, s));
    ul.append(li);
  }
  return ul;
}

export function siteBody(app, s) {
  const ch = () => app.commit('sites');
  if (!s.label) s.label = { show: true };
  const coordObj = { lat: s.lat, lon: s.lon };
  const cats = el('div', { class: 'chips' });
  for (const c of app.state.categories) {
    const id = `sc-${s.id}-${c.id}`;
    const cb = el('input', { type: 'checkbox', id, checked: (s.cats || []).includes(c.id) });
    cb.addEventListener('change', () => {
      s.cats = s.cats || [];
      if (cb.checked) s.cats.push(c.id); else s.cats = s.cats.filter((x) => x !== c.id);
      ch(); app.renderLeft();
    });
    cats.append(el('label', { class: 'chip', for: id }, cb, el('span', { class: 'dot', style: { background: c.color } }), c.name));
  }
  return el('div', { class: 'site-body' },
    field('Nombre', text(s, 'name', { onChange: () => { ch(); app.renderLeft(); } })),
    inlineFields(
      field('Latitud', num(coordObj, 'lat', { min: -90, max: 90, step: 0.0001, unit: '°', onChange: (v) => { s.lat = v; ch(); } })),
      field('Longitud', num(coordObj, 'lon', { min: -180, max: 180, step: 0.0001, unit: '°', onChange: (v) => { s.lon = v; ch(); } }))),
    el('p', { class: 'note' }, `${formatDMS(s.lat, true)}  ${formatDMS(s.lon, false)}`),
    app.state.categories.length ? field('Categorías (varias = símbolo dividido)', cats) : null,
    !(s.cats || []).length ? field('Color propio', color(s, 'color', { onChange: ch })) : null,
    el('div', { class: 'check-row' }, check(s.label, 'show', 'Rótulo', { onChange: ch })),
    inlineFields(field('Desplaz. X', num(s.label, 'dx', { min: -80, max: 80, step: 0.5, unit: 'pt', onChange: ch })), field('Desplaz. Y', num(s.label, 'dy', { min: -80, max: 80, step: 0.5, unit: 'pt', onChange: ch }))),
    field('Alineación del rótulo', select(s.label, 'align', [['center', 'Centrado'], ['left', 'A la derecha del punto'], ['right', 'A la izquierda del punto']], { onChange: ch })),
    field('Nota (aparece en el epígrafe si la activás)', text(s, 'note', { multiline: true, rows: 2, onChange: () => app.commit('overlay') })),
    el('div', { class: 'btn-row' },
      button('Centrar el mapa aquí', () => { app.state.view.center = [s.lon, s.lat]; app.commit('view'); }, { kind: 'small' }),
      button('Eliminar sitio', () => { app.state.sites = app.state.sites.filter((x) => x !== s); app.select(null); app.commit('sites'); app.renderLeft(); }, { kind: 'small danger' })),
  );
}

function categoriesView(app) {
  const st = app.state;
  const wrap = el('div', { class: 'categories' });
  const list = el('ul', { class: 'cat-list' });
  st.categories.forEach((c, i) => {
    const used = st.sites.filter((s) => (s.cats || []).includes(c.id)).length;
    list.append(el('li', { class: 'cat-item' },
      color(c, 'color', { onChange: () => { app.commit('sites'); app.renderLeft(); }, onInput: () => app.commit('sites', { history: false }) }),
      text(c, 'name', { onChange: () => { app.commit('overlay'); app.renderLeft(); } }),
      el('span', { class: 'badge', title: 'Sitios con esta categoría' }, String(used)),
      el('button', { type: 'button', class: 'icon ghost', title: 'Subir', 'aria-label': 'Subir', onclick: () => { if (i > 0) { [st.categories[i - 1], st.categories[i]] = [st.categories[i], st.categories[i - 1]]; app.commit('overlay'); app.renderLeft(); } } }, '↑'),
      el('button', { type: 'button', class: 'icon ghost', title: 'Eliminar categoría', 'aria-label': `Eliminar ${c.name}`, onclick: () => {
        st.categories = st.categories.filter((x) => x !== c);
        st.sites.forEach((s) => { s.cats = (s.cats || []).filter((x) => x !== c.id); });
        app.commit('sites'); app.renderLeft();
      } }, '×')));
  });
  const palSel = select(st, 'paletteId', PALETTES.filter((p) => !p.hidden || p.id === st.paletteId).map((p) => [p.id, p.name]), {
    onChange: () => {
      const p = getPalette(st.paletteId);
      const cols = paletteColors(p, st.categories.length);
      st.categories.forEach((c, i) => { c.color = cols[i]; });
      app.commit('sites'); app.renderLeft();
    },
  });
  const swatch = el('div', { class: 'swatches' }, ...paletteColors(getPalette(st.paletteId), Math.max(3, st.categories.length)).map((c) => el('span', { class: 'sw', style: { background: c }, title: c })));
  wrap.append(
    field('Paleta', palSel, 'Al elegir una paleta se recolorean las categorías en orden.'),
    swatch,
    list,
    el('div', { class: 'btn-row' }, button('Agregar categoría', () => {
      const p = getPalette(st.paletteId) || PALETTES[0];
      const col = paletteColors(p, st.categories.length + 1)[st.categories.length];
      const lab = p.labels && p.labels[st.categories.length];
      st.categories.push({ id: uid('C'), name: lab || `Categoría ${st.categories.length + 1}`, color: col });
      app.commit('sites'); app.renderLeft();
    }, { kind: 'small' })),
    diagnosticsView(st.categories.map((c) => c.color)) || '',
  );
  return wrap;
}

function diagnosticsView(colors) {
  if (colors.length < 2) return null;
  const diag = paletteDiagnostics(colors);
  const rows = diag.map((d) => {
    const ok = d.minDeltaE == null || d.minDeltaE >= 20;
    const warn = d.minDeltaE != null && d.minDeltaE < 12;
    return el('div', { class: `diag-row ${warn ? 'bad' : ok ? 'ok' : 'meh'}` },
      el('span', { class: 'diag-label' }, d.label),
      el('span', { class: 'sim' }, ...d.simulated.map((c) => el('span', { class: 'sw', style: { background: c } }))),
      el('span', { class: 'diag-val', title: 'Diferencia mínima entre dos colores (ΔE CIE76). Menos de 12: se confunden.' }, `ΔE ${d.minDeltaE.toFixed(0)}`));
  });
  const worst = diag.reduce((a, b) => (a.minDeltaE < b.minDeltaE ? a : b));
  const msg = worst.minDeltaE < 12
    ? `Con ${worst.label.toLowerCase()} dos categorías se confunden. Considerá cambiar un color o diferenciar también por forma del símbolo.`
    : 'Los colores se distinguen entre sí también con las formas comunes de daltonismo.';
  return details('¿Se distinguen los colores?', worst.minDeltaE < 12, el('div', { class: 'diag' }, ...rows, el('p', { class: 'note' }, msg)));
}

function paletteTool(app) {
  const st = app.state;
  const out = el('div', { class: 'extract-out' });
  const inp = el('input', { type: 'file', accept: 'image/*', class: 'file-input', id: 'palette-img' });
  const preview = el('img', { class: 'extract-img', alt: 'Gráfico cargado' });
  const run = async (file) => {
    clear(out);
    const url = await readFileAs(file, 'dataurl');
    preview.src = url;
    out.append(el('p', { class: 'note' }, 'Analizando colores…'));
    const groups = await extractPaletteFromImage(url);
    clear(out);
    if (!groups.length) { out.append(el('p', { class: 'note' }, 'No encontré colores saturados en la imagen.')); return; }
    const chosen = groups.map(() => true);
    const sw = el('div', { class: 'extract-swatches' });
    groups.forEach((g, i) => {
      const cb = el('input', { type: 'checkbox', checked: true, id: `ex-${i}` });
      cb.addEventListener('change', () => { chosen[i] = cb.checked; });
      sw.append(el('label', { class: 'ex-sw', for: `ex-${i}` }, cb, el('span', { class: 'sw big', style: { background: g.color } }), el('code', {}, g.color), el('span', { class: 'pct' }, `${Math.round(g.share * 100)}%`)));
    });
    const apply = button('Aplicar a las categorías', () => {
      const cols = groups.filter((_, i) => chosen[i]).map((g) => g.color);
      cols.forEach((c, i) => {
        if (st.categories[i]) st.categories[i].color = c;
        else st.categories.push({ id: uid('C'), name: `Categoría ${i + 1}`, color: c });
      });
      PALETTES.splice(PALETTES.findIndex((p) => p.id === 'extraida') >= 0 ? PALETTES.findIndex((p) => p.id === 'extraida') : PALETTES.length, 1, { id: 'extraida', name: 'Extraída de mi gráfico', colors: cols });
      st.paletteId = 'extraida';
      app.commit('sites'); app.renderLeft();
      app.toast('Colores aplicados en el orden de las barras (de izquierda a derecha).');
    }, { kind: 'primary small' });
    out.append(el('p', { class: 'note' }, 'Ordenados según su posición horizontal en el gráfico, como las barras de izquierda a derecha.'), sw, apply);
  };
  inp.addEventListener('change', () => { if (inp.files[0]) run(inp.files[0]); inp.value = ''; });
  const drop = el('label', { class: 'drop', for: 'palette-img' }, el('strong', {}, 'Colores desde un gráfico'), el('span', {}, 'Subí la imagen de tu diagrama (barras, tortas, boxplots) y uso sus colores para las categorías.'));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) run(f); });
  return el('div', { class: 'palette-tool' }, drop, inp, preview, out);
}

function siteSymbolEditor(app) {
  const ss = app.state.siteStyle;
  const ch = () => app.commit('sites');
  return el('div', { class: 'site-style' },
    inlineFields(field('Forma', select(ss, 'shape', SHAPES.filter(([k]) => k !== 'none'), { onChange: ch })), field('Tamaño', num(ss, 'size', { min: 0, max: 40, step: 0.5, unit: 'pt', onChange: ch }))),
    inlineFields(field('Borde', color(ss, 'stroke', { onChange: ch })), field('Grosor', num(ss, 'strokeWidth', { min: 0, max: 5, step: 0.1, unit: 'pt', onChange: ch }))),
    inlineFields(field('Opacidad', range(ss, 'fillOpacity', { onChange: ch, format: (v) => `${Math.round(v * 100)}%` })),
      field('Varias categorías', select(ss, 'multi', [['pie', 'Sectores (torta)'], ['halves-v', 'Franjas verticales'], ['rings', 'Anillos']], { onChange: ch }))),
    details('Círculo de área (como el modelo 2)', !!ss.halo.show,
      check(ss.halo, 'show', 'Dibujar círculo translúcido alrededor del sitio', { onChange: ch }),
      inlineFields(field('Medida', select(ss.halo, 'unit', [['pt', 'Tamaño fijo (pt)'], ['km', 'Radio en el terreno (km)']], { onChange: ch })),
        ss.halo.unit === 'km' ? field('Radio', num(ss.halo, 'km', { min: 0.1, max: 500, step: 0.5, unit: 'km', onChange: ch })) : field('Diámetro', num(ss.halo, 'size', { min: 2, max: 120, step: 1, unit: 'pt', onChange: ch }))),
      inlineFields(field('Opacidad del relleno', range(ss.halo, 'fillOpacity', { onChange: ch, format: (v) => `${Math.round(v * 100)}%` })), field('Grosor del aro', num(ss.halo, 'strokeWidth', { min: 0, max: 10, step: 0.2, unit: 'pt', onChange: ch }))),
    ),
    details('Rótulos de sitios', !!ss.label.show,
      check(ss.label, 'show', 'Mostrar nombres', { onChange: ch }),
      inlineFields(field('Tipografía', select(ss.label, 'font', FONTS, { onChange: ch })), field('Tamaño', num(ss.label, 'size', { min: 3, max: 30, step: 0.5, unit: 'pt', onChange: ch }))),
      inlineFields(field('Color', color(ss.label, 'color', { onChange: ch })), field('Halo', color(ss.label, 'halo', { onChange: ch }))),
      inlineFields(field('Grosor halo', num(ss.label, 'haloWidth', { min: 0, max: 4, step: 0.1, unit: 'pt', onChange: ch })),
        el('div', { class: 'field' }, el('span', { class: 'label-spacer' }), el('div', { class: 'check-row' }, check(ss.label, 'bold', 'Negrita', { onChange: ch }), check(ss.label, 'italic', 'Cursiva', { onChange: ch })))),
    ),
  );
}
