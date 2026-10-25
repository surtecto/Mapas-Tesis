// Pestaña Tesis: lectura del tema y del lugar, estilo propuesto, modelos de ejemplo y modelo propio de referencia.
import { el, clear, readFileAs, hexToRgb, rgbToHex } from '../util.js';
import { field, inlineFields, select, check, range, button, details, text } from './forms.js';
import { readTheme, readPlace, sampleRelief, synthesize, TRAITS } from '../interpret.js';
import { THEMES, getTheme, applyTheme } from '../themes.js';
import { TEMPLATES, THESIS_EXAMPLE } from '../templates.js';
import { getDef } from '../catalog.js';
import { newLayerState } from '../state.js';
import { insertIndexFor } from './layersPanel.js';
import { projInfo, rotationForMeridian } from '../projections.js';
import { getPalette, paletteColors, extractPaletteFromImage } from '../palette.js';
import { putImage, getImage } from '../imagestore.js';

const DISCIPLINES = [['geografia', 'Geografía'], ['arquitectura', 'Arquitectura y urbanismo'], ['historia', 'Historia'], ['antropologia', 'Antropología y arqueología'], ['ecologia', 'Ecología y ciencias naturales'], ['otra', 'Otra']];

export function renderThesisPanel(app, root) {
  clear(root);
  const st = app.state;
  const th = st.thesis;
  root.append(
    projectCard(app),
    el('div', { class: 'panel-intro' }, el('p', {}, 'El tema y el lugar de este mapa (por defecto, los del proyecto): la aplicación los lee y propone un lenguaje gráfico (estilo, proyección, capas), junto con preguntas para que la figura no afirme más de lo que la investigación sostiene.')),
    themeForm(app),
    readingView(app),
    el('h2', { class: 'panel-h' }, 'Estilos de tesis'),
    themesGallery(app),
    el('h2', { class: 'panel-h' }, 'Modelos de ejemplo'),
    modelsGallery(app),
    el('h2', { class: 'panel-h' }, 'Modelo propio de referencia'),
    modelRefView(app),
  );
}

function projectCard(app) {
  const cur = app.current;
  if (!cur) return null;
  const m = cur.project.meta || {};
  const line = m.author ? `${m.author}${m.year ? ` (${m.year})` : ''}${m.institution ? `, ${m.institution}` : ''}` : '';
  return el('section', { class: 'proj-card' },
    el('div', { class: 'proj-card-head' }, el('span', { class: 'pc-kind' }, 'Proyecto'), el('button', { type: 'button', class: 'btn small ghost', onclick: () => app.editProjectMeta() }, 'Editar datos')),
    el('strong', { class: 'proj-card-name' }, m.name || 'Proyecto'),
    m.title ? el('span', { class: 'proj-card-title' }, m.title) : null,
    line ? el('span', { class: 'proj-card-meta' }, line) : el('span', { class: 'proj-card-meta warn' }, 'Sin autoría: el epígrafe no puede firmar la figura.'),
    el('span', { class: 'proj-card-meta' }, `${cur.maps.length === 1 ? 'Un mapa' : `${cur.maps.length} mapas`}${m.area && m.area.name ? `, área de trabajo: ${m.area.name}` : ''}.`));
}

function themeForm(app) {
  const th = app.state.thesis;
  const titleTa = text(th, 'title', { multiline: true, rows: 4, placeholder: 'Título o tema de la tesis (también sirve un resumen)', onChange: () => app.scheduleSave() });
  const box = el('div', { class: 'thesis-form' },
    field('Tema de este mapa', titleTa),
    field('Palabras clave', text(th, 'keywords', { placeholder: 'separadas por punto y coma', onChange: () => app.scheduleSave() })),
    inlineFields(field('Disciplina', select(th, 'discipline', DISCIPLINES)), field('Período', text(th, 'period', { placeholder: 'siglo XIX, 1850–1930…' }))),
    field('Lugar (se ubica con la vista del mapa o con el buscador de arriba)', text(th, 'place', { placeholder: 'Partido, localidad o región' })),
    el('div', { class: 'btn-row wrap' },
      button('Interpretar tema y lugar', () => interpretNow(app), { kind: 'primary' }),
      !th.title ? button('Usar mi tema de ejemplo', () => { Object.assign(th, THESIS_EXAMPLE); app.renderLeft(); }, { kind: 'small ghost' }) : null),
  );
  return box;
}

async function interpretNow(app) {
  const st = app.state;
  const th = st.thesis;
  const traits = readTheme(`${th.title} ${th.keywords} ${th.period} ${th.place}`);
  const c = st.sites.length ? [st.sites.reduce((a, s) => a + s.lon, 0) / st.sites.length, st.sites.reduce((a, s) => a + s.lat, 0) / st.sites.length] : st.view.center;
  const place = readPlace(c[0], c[1]);
  const info = app.currentScaleInfo();
  const reading = {
    at: new Date().toISOString(),
    traits: traits.map((t) => ({ id: t.id, score: t.score, words: t.words })),
    place: { lon: place.lon, lat: place.lat, country: place.country, macro: place.macro, region: place.region ? { id: place.region.id, name: place.region.name, relief: place.region.relief, style: place.region.style } : null, notes: place.notes, faja: place.faja, posgar: place.posgar },
    relief: null,
    scaleRF: info ? info.rf : null,
  };
  th.reading = reading;
  app.renderLeft();
  // relieve: se mide en segundo plano (teselas de elevación)
  try {
    const bbox = app.viewBBoxLL();
    reading.relief = await sampleRelief(bbox);
  } catch (err) {
    reading.reliefError = err.message;
  }
  app.scheduleSave();
  if (app.ui.tab === 'tesis') app.renderLeft();
}

function readingView(app) {
  const st = app.state;
  const r = st.thesis.reading;
  if (!r) return el('div');
  const traits = r.traits.map((t) => ({ ...TRAITS.find((x) => x.id === t.id), ...t })).filter((t) => t.label);
  const syn = synthesize({ traits, place: r.place, relief: r.relief, scaleRF: r.scaleRF });
  const theme = getTheme(syn.themeId);
  const box = el('div', { class: 'reading' });
  // tema
  box.append(el('h3', {}, 'Lectura del tema'));
  if (!traits.length) box.append(el('p', { class: 'note' }, 'No reconocí rasgos temáticos en el texto. Agregá palabras clave (por ejemplo: paisaje, mensuras, cañadas, caminos, población, patrimonio).'));
  const chips = el('div', { class: 'trait-chips' });
  traits.slice(0, 6).forEach((t, i) => chips.append(el('span', { class: `trait${i === 0 ? ' main' : ''}`, title: `Palabras: ${t.words.join(', ')}` }, t.label, el('small', {}, ` ${t.words.slice(0, 3).join(' · ')}`))));
  box.append(chips);
  // lugar
  box.append(el('h3', {}, 'Lectura del lugar'));
  const p = r.place;
  const placeLines = [];
  placeLines.push(el('p', {}, el('strong', {}, p.region ? p.region.name : p.macro || 'Sin región reconocida'), p.region && p.macro ? ` · ${p.macro}` : '', p.country ? ` · ${p.country}` : ''));
  if (p.region && p.region.relief) placeLines.push(el('p', { class: 'note' }, p.region.relief));
  if (p.region && p.region.style) placeLines.push(el('p', { class: 'note' }, `Criterio gráfico: ${p.region.style}`));
  (p.notes || []).forEach((n) => placeLines.push(el('p', { class: 'note' }, n)));
  if (r.relief) {
    const rl = r.relief;
    placeLines.push(el('p', {}, `Relieve de la vista: ${Math.round(rl.p02)} a ${Math.round(rl.p98)} m (amplitud ${Math.round(rl.amp)} m): `, el('strong', {}, rl.kind), '.'));
  } else if (r.reliefError) placeLines.push(el('p', { class: 'note' }, `No se pudo medir el relieve: ${r.reliefError}`));
  else placeLines.push(el('p', { class: 'note' }, 'Midiendo el relieve de la vista…'));
  box.append(...placeLines);
  // propuesta
  box.append(el('h3', {}, 'Propuesta'));
  if (theme) {
    box.append(el('div', { class: 'theme-card proposal' },
      swatches(theme),
      el('div', { class: 'tc-text' }, el('strong', {}, theme.name), el('span', {}, theme.desc)),
      el('div', { class: 'btn-row' }, button('Aplicar este estilo', () => doApplyTheme(app, theme), { kind: 'small primary' }))));
  }
  const alt = traits.slice(1, 4).map((t) => getTheme(t.theme)).filter((t, i, a) => t && t.id !== syn.themeId && a.indexOf(t) === i);
  if (alt.length) box.append(el('div', { class: 'btn-row wrap' }, el('span', { class: 'hint' }, 'También:'), ...alt.map((t) => button(t.name.split(' (')[0], () => doApplyTheme(app, t), { kind: 'small ghost' }))));
  if (syn.primary && syn.primary.symb) box.append(el('p', { class: 'note' }, `Simbología: ${syn.primary.symb}`));
  if (syn.projection && syn.projection.code !== st.projection) {
    box.append(el('div', { class: 'prop-row' }, el('span', {}, `Proyección: ${projInfo(syn.projection.code).name}. ${syn.projection.why}`),
      button('Usar', () => { app.setProjection(syn.projection.code); app.renderLeft(); }, { kind: 'small' })));
  }
  const dem = st.layers.find((l) => l.def === 'dem-analitico');
  if (r.relief && r.relief.amp < 700) {
    box.append(el('div', { class: 'prop-row' }, el('span', {}, `Relieve: rampa estirada a ${Math.round(r.relief.p02)}–${Math.round(r.relief.p98)} m y exageración ×${r.relief.zFactor}, para que se lea sin dramatizar.`),
      button(dem ? 'Ajustar' : 'Agregar', () => {
        let l = dem;
        if (!l) { l = newLayerState('dem-analitico'); st.layers.splice(insertIndexFor(st, getDef('dem-analitico')), 0, l); }
        Object.assign(l.params, { ramp: theme && theme.relief ? theme.relief.ramp : 'pampa', min: Math.floor(r.relief.p02), max: Math.ceil(r.relief.p98), shade: true, zFactor: r.relief.zFactor, altitude: 35, shadeStrength: 0.6 });
        l.blend = 'multiply'; l.opacity = 0.6; l.visible = true; l.rev += 1;
        app.commit('layers'); app.renderLeft(); app.toast('Relieve ajustado al rango local de alturas.');
      }, { kind: 'small' })));
  }
  const missing = syn.layers.filter((id) => getDef(id) && !st.layers.some((l) => l.def === id));
  if (missing.length) {
    const list = el('ul', { class: 'sug-layers' });
    for (const id of missing.slice(0, 10)) {
      const d = getDef(id);
      list.append(el('li', {}, el('span', {}, d.name), button('Agregar', (e) => { addLayer(app, id); e.target.disabled = true; e.target.textContent = 'Agregada'; }, { kind: 'small ghost' })));
    }
    box.append(el('p', { class: 'hint' }, 'Capas sugeridas por el tema y el lugar:'), list,
      el('div', { class: 'btn-row' }, button('Agregar todas', () => { missing.slice(0, 10).forEach((id) => addLayer(app, id, false)); app.commit('layers'); app.renderLeft(); }, { kind: 'small' })));
  }
  // preguntas
  box.append(el('h3', {}, 'Preguntas a la figura'));
  const ul = el('ol', { class: 'questions' });
  syn.questions.slice(0, 7).forEach((q) => ul.append(el('li', {}, q.q, el('small', {}, ` (${q.from})`))));
  box.append(ul);
  return box;
}

function addLayer(app, id, commit = true) {
  const st = app.state;
  if (st.layers.some((l) => l.def === id)) return;
  const d = getDef(id);
  const ls = newLayerState(id);
  st.layers.splice(insertIndexFor(st, d), 0, ls);
  if (commit) { app.commit('layers'); app.toast(`Capa agregada: ${d.name}`); }
}

function swatches(t) {
  const cols = [t.paper, t.ink, t.water, t.accent, ...paletteColors(getPalette(t.palette), 4)];
  return el('div', { class: 'tc-sw' }, ...cols.map((c) => el('span', { class: 'sw', style: { background: c }, title: c })),
    el('span', { class: 'tc-font', style: { fontFamily: `"${t.fontLabel}", serif` } }, 'Aa'));
}

function doApplyTheme(app, theme) {
  const changes = applyTheme(app.state, theme);
  app.applyState({ keepView: true });
  app.history.push(JSON.stringify(app.state, (k, v) => (k.startsWith('_') ? undefined : v)));
  app.scheduleSave();
  app.toast(`Estilo «${theme.name}» aplicado: ${changes.join('; ')}. Ctrl+Z lo deshace.`);
}

function themesGallery(app) {
  const box = el('div', { class: 'themes' });
  for (const t of THEMES) {
    const cur = app.state.thesis.themeId === t.id;
    box.append(el('div', { class: `theme-card${cur ? ' current' : ''}` }, swatches(t),
      el('div', { class: 'tc-text' }, el('strong', {}, t.name), el('span', {}, t.desc)),
      button(cur ? 'Reaplicar' : 'Aplicar', () => doApplyTheme(app, t), { kind: 'small' })));
  }
  return details('Ver todos los estilos', false, box);
}

function modelsGallery(app) {
  const box = el('div', { class: 'templates' });
  let grp = '';
  for (const t of TEMPLATES) {
    if (t.group !== grp) { grp = t.group; box.append(el('p', { class: 'menu-label' }, grp === 'Tesis' ? 'Tesis: Pago Gilense' : 'Antártida (Coni-Mapas)')); }
    box.append(el('div', { class: 'tpl' }, el('div', { class: 'tpl-text' }, el('strong', {}, t.name), t.desc ? el('span', {}, t.desc) : null), button('Nuevo mapa', () => app.loadTemplate(t.id), { kind: 'small' })));
  }
  box.append(el('p', { class: 'hint' }, 'Cada modelo se agrega como un mapa nuevo de este proyecto; el mapa abierto queda como está.'));
  return box;
}

// ---------- modelo propio: imagen de referencia (calco) ----------
function modelRefView(app) {
  const st = app.state;
  const mr = st.modelRef;
  const inp = el('input', { type: 'file', accept: 'image/*', class: 'file-input', id: 'model-ref-file' });
  const sw = el('div', { class: 'extract-swatches' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      await putImage('modelo-referencia', f, bmp.width, bmp.height);
      mr.key = 'modelo-referencia'; mr.name = f.name; mr.show = true; mr.w = bmp.width; mr.h = bmp.height;
      app.updateModelRef();
      app.scheduleSave();
      app.renderLeft();
      app.toast('Modelo cargado como calco sobre la hoja: usalo de guía para la composición y extraé sus colores.');
    } catch (err) { app.toast(`No se pudo leer la imagen: ${err.message}`, 'error'); }
    inp.value = '';
  });
  const box = el('div', { class: 'model-ref' },
    el('p', { class: 'hint' }, 'Una figura que te guste (de un artículo, de otra tesis, un mapa antiguo): se superpone como calco a la hoja y se pueden tomar sus colores.'),
    el('label', { class: 'drop', for: 'model-ref-file' }, el('strong', {}, mr.key ? `Cambiar modelo (${mr.name || 'imagen'})` : 'Elegir imagen del modelo'), el('span', {}, 'JPG o PNG. Queda solo en este navegador.')),
    inp);
  if (mr.key) {
    box.append(
      el('div', { class: 'check-row' }, check(mr, 'show', 'Ver el calco sobre la hoja', { onChange: () => app.updateModelRef() })),
      field('Opacidad del calco', range(mr, 'opacity', { min: 0.05, max: 1, step: 0.05, onInput: () => app.updateModelRef(), onChange: () => app.scheduleSave(), format: (v) => `${Math.round(v * 100)}%` })),
      el('div', { class: 'btn-row wrap' },
        button('Tomar sus colores', async () => {
          const v = await getImage(mr.key);
          if (!v) return;
          const res = await extractPaletteFromImage(v.url, { k: 9 });
          clear(sw);
          if (!res.length) { sw.append(el('p', { class: 'note' }, 'No encontré colores saturados en la imagen.')); return; }
          const cats = st.categories;
          res.forEach((r) => sw.append(el('span', { class: 'sw big', style: { background: r.color }, title: `${r.color} (${Math.round(r.share * 100)} %)` })));
          sw.append(el('div', { class: 'btn-row wrap' },
            cats.length ? button(`Aplicar a las ${cats.length} categorías`, () => { cats.forEach((c, i) => { c.color = res[i % res.length].color; }); app.commit('sites'); app.renderLeft(); }, { kind: 'small' }) : null,
            button('Usar el más claro como fondo', async () => {
              const bg = await dominantLight(v.url);
              st.page.background = bg; app.commit('page'); app.toast(`Fondo ${bg}`);
            }, { kind: 'small ghost' })));
        }, { kind: 'small' }),
        button('Quitar modelo', () => { mr.key = null; mr.show = false; app.updateModelRef(); app.renderLeft(); }, { kind: 'small ghost' })),
      sw);
  }
  return box;
}

async function dominantLight(url) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  const bins = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (L < 200) continue;
    const k = `${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`;
    bins.set(k, (bins.get(k) || 0) + 1);
  }
  let best = null, bn = 0;
  for (const [k, n] of bins) if (n > bn) { bn = n; best = k; }
  if (!best) return '#ffffff';
  return rgbToHex(best.split(',').map((v) => Number(v) * 8 + 4));
}
