// Pestaña Interpretación: planos históricos o ajenos, georreferenciación por versión, dibujo con grados de certeza y versiones.
import { el, clear, uid, downloadBlob } from '../util.js';
import { field, inlineFields, num, color, select, check, range, button, details, text } from './forms.js';
import { CERTAINTY, newVersion } from '../state.js';
import { SHAPES, PATTERNS, DECOS } from '../styles.js';
import { thumbnail } from '../imagestore.js';
import { georefModel } from '../layers.js';
import { modelSummary, methodInfo } from '../georef.js';
import { sourceCitation } from '../caption.js';
import {
  activeVersion, isLocked, georefOf, ensureInterpLayer, interpLayer, bumpInterp, ensureGeorefLayer, georefLayer,
  addSourceFromFile, removeSource, addExampleSource, duplicateVersion, setGhost, deleteVersion,
  findFeature, removeFeature, exportVersionGeoJSON, methodSheet,
} from '../interp.js';
import { openGeorefDialog } from './georefDialog.js';

export function renderInterpPanel(app, root) {
  clear(root);
  const st = app.state;
  const it = st.interp;
  root.append(
    el('div', { class: 'panel-intro' }, el('p', {}, 'Mapas de interpretación: se dibujan sobre planos históricos o realizados por otros. Cada versión guarda su propia georreferenciación y sus trazos, para poder comparar lecturas y declarar el método.')),
    versionBar(app),
    el('h2', { class: 'panel-h' }, `Planos fuente (${it.sources.length})`),
    sourcesView(app),
    el('h2', { class: 'panel-h' }, 'Dibujar la interpretación'),
    drawTools(app),
    featuresList(app),
    details('Categorías y simbología', false, categoriesEditor(app)),
    details('Exportar y documentar', false, exportTools(app)),
  );
}

// ---------- versiones ----------
function versionBar(app) {
  const st = app.state;
  const it = st.interp;
  const v = activeVersion(st);
  const box = el('div', { class: 'version-bar' });
  const sel = select(it, 'active', it.versions.map((x) => [x.id, `${x.locked ? '🔒 ' : ''}${x.name} · ${(x.features.features || []).length} el.`]), {
    onChange: () => { app.stopDraw(); bumpInterp(app); for (const l of st.layers) if (l.def === 'georef') l.rev += 1; app.commit('layers'); app.renderLeft(); app.toast(`Versión activa: ${activeVersion(st).name}`); },
  });
  const ghostObj = { v: it.ghost || '' };
  const ghostSel = select(ghostObj, 'v', [['', 'No comparar'], ...it.versions.filter((x) => x.id !== it.active).map((x) => [x.id, `Comparar con «${x.name}»`])], {
    onChange: (val) => { setGhost(app, val || null); app.commit('layers'); app.renderLeft(); },
  });
  const d = new Date(v.created);
  box.append(
    el('div', { class: 'vb-row' }, el('label', { class: 'vb-label' }, 'Versión activa'), sel),
    el('div', { class: 'btn-row wrap' },
      button('Duplicar', () => { const nv = duplicateVersion(app, { withFeatures: true }); bumpInterp(app); app.renderLeft(); app.toast(`Nueva versión «${nv.name}»: copia de la anterior, lista para corregir.`); }, { kind: 'small', title: 'Copia trazos y georreferenciación en una versión nueva' }),
      button('Nueva vacía', () => { const nv = duplicateVersion(app, { withFeatures: false }); bumpInterp(app); app.renderLeft(); app.toast(`Versión «${nv.name}»: conserva la georreferenciación, sin trazos.`); }, { kind: 'small' }),
      button(v.locked ? 'Desfijar' : 'Fijar', () => { v.locked = !v.locked; app.stopDraw(); app.commit('overlay'); app.renderLeft(); app.toast(v.locked ? 'Versión fijada: queda como registro y no se puede editar.' : 'La versión vuelve a ser editable.'); }, { kind: 'small', title: 'Una versión fijada no se puede modificar: sirve como registro de una lectura' }),
      it.versions.length > 1 ? button('Eliminar', () => { if (v.locked) { app.toast('No se puede eliminar una versión fijada. Desfijala primero.', 'warn'); return; } deleteVersion(app, v.id); bumpInterp(app); app.renderLeft(); }, { kind: 'small danger' }) : null),
    el('div', { class: 'vb-row' }, ghostSel),
    details('Datos de la versión', false,
      field('Nombre', text(v, 'name', { onChange: () => { app.commit('overlay'); app.renderLeft(); } })),
      inlineFields(field('Autoría', text(v, 'author', { placeholder: 'Quién interpreta', onChange: () => app.commit('overlay') })), field('Creada', el('input', { type: 'text', value: Number.isFinite(d.getTime()) ? d.toLocaleString('es-AR') : '', disabled: true }))),
      field('Criterio o hipótesis de esta lectura', text(v, 'note', { multiline: true, rows: 3, placeholder: 'Qué cambia respecto de la versión anterior y por qué', onChange: () => app.commit('overlay') })),
    ),
  );
  if (v.locked) box.append(el('p', { class: 'note' }, '🔒 Versión fijada: se puede ver, comparar y exportar, pero no editar. Duplicala para seguir trabajando.'));
  return box;
}

// ---------- fuentes ----------
function sourcesView(app) {
  const st = app.state;
  const wrap = el('div', { class: 'sources' });
  for (const src of st.interp.sources) wrap.append(sourceCard(app, src));
  const inp = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'file-input', id: 'interp-source-file' });
  inp.addEventListener('change', async () => {
    for (const f of inp.files) {
      try { const s = await addSourceFromFile(app, f); app.toast(`Plano cargado: ${s.title} (${s.w} × ${s.h} px). Completá sus datos y georreferencialo.`); }
      catch (err) { app.toast(`No se pudo cargar «${f.name}»: ${err.message}`, 'error'); }
    }
    inp.value = '';
    app.commit('overlay'); app.renderLeft();
  });
  wrap.append(
    el('label', { class: 'drop', for: 'interp-source-file' }, el('strong', {}, 'Agregar plano o mapa (imagen)'),
      el('span', {}, 'JPG, PNG o WebP: escaneo, fotografía en el archivo o captura de un mapa ajeno. Queda guardado en este navegador y viaja dentro del proyecto al guardarlo.')),
    inp,
    el('div', { class: 'btn-row' }, button('Cargar el ejemplo: mensura de Lescano (1866)', async () => {
      try {
        await addExampleSource(app);
        app.commit('layers'); app.renderLeft();
        app.flyTo([-59.402, -34.503], 95);
        app.toast('Ejemplo cargado: plano fotografiado en el archivo, con 4 puntos y transformación proyectiva. Abrí «Georreferenciar» para ver los puntos.');
      } catch (err) { app.toast(`No se pudo cargar el ejemplo: ${err.message}`, 'error'); }
    }, { kind: 'small ghost' })),
  );
  return wrap;
}

function sourceCard(app, src) {
  const st = app.state;
  const { model } = georefModel(st, src.id);
  const gr = georefOf(st, src.id);
  const ls = georefLayer(st, src.id);
  const img = el('img', { class: 'src-thumb', alt: '' });
  thumbnail(src.key).then((u) => { if (u) img.src = u; }).catch(() => null);
  const ok = model && model.ok;
  const status = ok ? `Georreferenciado: ${modelSummary(model)}` : gr && gr.gcps && gr.gcps.length ? `En proceso: ${model ? model.msg : ''}` : 'Sin georreferenciar en esta versión';
  const vis = el('input', { type: 'checkbox', checked: !!(ls && ls.visible), disabled: !ok, 'aria-label': 'Ver sobre el mapa' });
  vis.addEventListener('change', () => { const l = ensureGeorefLayer(app, src); l.visible = vis.checked; app.commit('layers'); });
  const card = el('div', { class: 'src-card' },
    el('div', { class: 'src-head' }, img,
      el('div', { class: 'src-meta' },
        el('strong', {}, src.title || 'Plano sin título'),
        el('span', { class: 'src-cite' }, [src.author, src.year].filter(Boolean).join(', ') || 'Completá autor y año'),
        el('span', { class: `src-status${ok ? ' ok' : ''}` }, status))),
    el('div', { class: 'btn-row wrap' },
      button('Georreferenciar', () => openGeorefDialog(app, src), { kind: 'small primary' }),
      el('label', { class: 'check' }, vis, el('span', {}, 'Ver en el mapa')),
      ok ? button('Encuadrar', () => {
        const c = model.center;
        const out = model.outline || [];
        const w = Math.min(...out.map((p) => p[0])), e = Math.max(...out.map((p) => p[0]));
        const kmW = (e - w) * 111.32 * Math.cos((c[1] * Math.PI) / 180) * 1000;
        app.flyTo(c, Math.max(5, (kmW / 140) * 1.2));
      }, { kind: 'small ghost' }) : null),
  );
  const meta = details('Datos de la fuente (para citar)', !src.title || !src.author,
    field('Título', text(src, 'title', { onChange: () => { if (ls) ls.name = src.title; app.commit('overlay'); } })),
    inlineFields(field('Autor o agrimensor', text(src, 'author', { onChange: () => app.commit('overlay') })), field('Año', text(src, 'year', { placeholder: 'c. 1874', onChange: () => app.commit('overlay') }))),
    field('Archivo o repositorio', text(src, 'archive', { placeholder: 'AGN, AHG, Biblioteca Nacional…', onChange: () => app.commit('overlay') })),
    inlineFields(field('Signatura o referencia', text(src, 'ref', { onChange: () => app.commit('overlay') })), field('Enlace', text(src, 'url', { placeholder: 'https://…', onChange: () => app.commit('overlay') }))),
    field('Notas (cómo se obtuvo, estado, orientación)', text(src, 'notes', { multiline: true, rows: 3, onChange: () => app.commit('overlay') })),
    el('p', { class: 'hint' }, `Cita: ${sourceCitation(src)}.`),
  );
  const proc = src.proc;
  const pch = () => { const l = georefLayer(app.state, src.id); if (l) l.rev += 1; app.commit('layers'); };
  const look = details('Cómo se ve sobre el mapa', false,
    ls ? field('Opacidad', range(ls, 'opacity', { onInput: () => app.applyOpacity(ls), onChange: () => app.commit('layers'), format: (v) => `${Math.round(v * 100)}%` })) : null,
    ls ? field('Fusión', select(ls, 'blend', [['normal', 'Normal'], ['multiply', 'Multiplicar (el papel desaparece)'], ['darken', 'Oscurecer'], ['luminosity', 'Luminosidad']], { onChange: () => app.commit('layers') })) : null,
    check(proc, 'paper', 'Quitar el papel (deja solo la tinta)', { onChange: pch }),
    proc.paper ? field('Umbral de papel', range(proc, 'threshold', { min: 0.3, max: 0.95, step: 0.01, onChange: pch, format: (v) => `${Math.round(v * 100)}%` })) : null,
    inlineFields(field('Teñir la tinta', el('span', { class: 'inline-pair' }, check({ on: !!proc.tint }, 'on', '', { onChange: (v) => { proc.tint = v ? '#8c2f1b' : ''; pch(); app.renderLeft(); } }), proc.tint ? color(proc, 'tint', { onChange: pch }) : null)),
      el('div', { class: 'field' }, el('span', { class: 'label-spacer' }), check(proc, 'gray', 'En grises', { onChange: pch }))),
    el('p', { class: 'hint' }, 'Recorte (para quitar márgenes, rótulos o la regla del fotógrafo):'),
    inlineFields(field('Izquierda', range(proc.crop, 'x', { min: 0, max: 0.45, step: 0.01, onChange: () => { proc.crop.w = Math.min(proc.crop.w, 1 - proc.crop.x); pch(); }, format: (v) => `${Math.round(v * 100)}%` })),
      field('Arriba', range(proc.crop, 'y', { min: 0, max: 0.45, step: 0.01, onChange: () => { proc.crop.h = Math.min(proc.crop.h, 1 - proc.crop.y); pch(); }, format: (v) => `${Math.round(v * 100)}%` }))),
    inlineFields(field('Ancho', range(proc.crop, 'w', { min: 0.1, max: 1, step: 0.01, onChange: () => { proc.crop.w = Math.min(proc.crop.w, 1 - proc.crop.x); pch(); }, format: (v) => `${Math.round(v * 100)}%` })),
      field('Alto', range(proc.crop, 'h', { min: 0.1, max: 1, step: 0.01, onChange: () => { proc.crop.h = Math.min(proc.crop.h, 1 - proc.crop.y); pch(); }, format: (v) => `${Math.round(v * 100)}%` }))),
  );
  card.append(meta, look, el('div', { class: 'btn-row end' }, button('Quitar plano', async () => { await removeSource(app, src); app.commit('layers'); app.renderLeft(); }, { kind: 'small danger' })));
  return card;
}

// ---------- dibujo ----------
function drawTools(app) {
  const st = app.state;
  const it = st.interp;
  const locked = isLocked(st);
  const box = el('div', { class: 'draw-tools' });
  if (locked) { box.append(el('p', { class: 'note' }, 'La versión activa está fijada. Duplicala para dibujar.')); return box; }
  const cat = it.categories.find((c) => c.id === it.drawCat) || it.categories[0];
  const catSel = select(it, 'drawCat', it.categories.map((c) => [c.id, `${c.geom === 'point' ? '●' : c.geom === 'line' ? '━' : '▰'} ${c.name}`]), { onChange: () => { if (app.mode && app.mode.startsWith('draw')) app.startDraw(); app.renderLeft(); } });
  const certBox = el('div', { class: 'cert-chips', role: 'radiogroup', 'aria-label': 'Grado de certeza' });
  for (const c of CERTAINTY) {
    const id = `cert-${c.id}`;
    const r = el('input', { type: 'radio', name: 'cert', id, checked: it.drawCert === c.id });
    r.addEventListener('change', () => { it.drawCert = c.id; });
    certBox.append(el('label', { class: 'cert-chip', for: id, title: c.hint }, r, el('span', { class: `cert-sample ${c.id}` }), c.name));
  }
  const drawing = app.mode === 'draw';
  const modifying = app.mode === 'modify';
  box.append(
    field('Qué se dibuja', catSel),
    field('Grado de certeza', certBox),
    el('div', { class: 'btn-row wrap' },
      button(drawing ? 'Terminar de dibujar' : `Dibujar ${cat.geom === 'point' ? 'punto' : cat.geom === 'line' ? 'línea' : 'área'}`, () => { if (drawing) app.stopDraw(); else app.startDraw(); app.renderLeft(); }, { kind: `small ${drawing ? 'active' : 'primary'}` }),
      button(modifying ? 'Terminar edición' : 'Mover vértices', () => { if (modifying) app.stopDraw(); else app.startModify(); app.renderLeft(); }, { kind: `small${modifying ? ' active' : ''}` })),
    el('p', { class: 'hint' }, drawing ? (cat.geom === 'point' ? 'Tocá el mapa para ubicar cada punto. Esc termina.' : 'Tocá para agregar vértices; doble toque cierra. Esc cancela.')
      : 'Tocá un elemento dibujado en el mapa para editar su nombre, período, fuente y certeza.'),
  );
  return box;
}

function featuresList(app) {
  const st = app.state;
  const v = activeVersion(st);
  const feats = v.features.features || [];
  const ul = el('ul', { class: 'feat-list' });
  if (!feats.length) ul.append(el('li', { class: 'empty' }, 'Esta versión todavía no tiene trazos.'));
  for (const f of feats) {
    const c = st.interp.categories.find((x) => x.id === f.properties.cat);
    const ce = CERTAINTY.find((x) => x.id === f.properties.cert) || CERTAINTY[0];
    const sel = app.selection && app.selection.kind === 'interp' && app.selection.id === f.id;
    ul.append(el('li', {}, el('button', { type: 'button', class: `mini-item${sel ? ' sel' : ''}`, onclick: () => app.select({ kind: 'interp', id: f.id }) },
      el('span', { class: 'dot', style: { background: c ? c.color : '#777' } }), ' ', f.properties.name || (c ? c.name : 'Elemento'), el('span', { class: 'feat-cert' }, ` · ${ce.name.toLowerCase()}`))));
  }
  return el('div', {}, el('p', { class: 'hint' }, `Elementos de «${v.name}»: ${feats.length}`), ul);
}

// Editor de atributos de un elemento (se muestra en el panel derecho)
export function featureEditor(app, id) {
  const st = app.state;
  const f = findFeature(st, id);
  if (!f) return el('p', { class: 'insp-empty' }, 'El elemento no está en la versión activa.');
  const locked = isLocked(st);
  const p = f.properties;
  const ch = () => { bumpInterp(app); app.renderLeft(); };
  const srcOpts = [['', 'Sin fuente asociada'], ...st.interp.sources.map((s) => [s.id, `${s.title || 'Plano'}${s.year ? ` (${s.year})` : ''}`])];
  const box = el('div', {},
    field('Nombre o rótulo', text(p, 'name', { onChange: ch })),
    field('Categoría', select(p, 'cat', st.interp.categories.filter((c) => geomOk(c, f)).map((c) => [c.id, c.name]), { onChange: ch })),
    field('Grado de certeza', select(p, 'cert', CERTAINTY.map((c) => [c.id, `${c.name}: ${c.hint}`]), { onChange: ch })),
    inlineFields(field('Período o fecha', text(p, 'period', { placeholder: '1866, c. 1820–1850…', onChange: ch })), field('Fuente', select(p, 'src', srcOpts, { onChange: ch }))),
    field('Nota (qué se ve, qué se infiere)', text(p, 'note', { multiline: true, rows: 4, onChange: () => app.commit('overlay') })),
    el('div', { class: 'btn-row' }, button('Eliminar elemento', () => { removeFeature(st, f.id); app.select(null); bumpInterp(app); app.renderLeft(); }, { kind: 'small danger' })),
  );
  if (locked) box.querySelectorAll('input, select, textarea, button').forEach((x) => { x.disabled = true; });
  return box;
}
function geomOk(c, f) {
  const t = f.geometry ? f.geometry.type : '';
  return (c.geom === 'point' && /Point/.test(t)) || (c.geom === 'line' && /Line/.test(t)) || (c.geom === 'polygon' && /Polygon/.test(t));
}

// ---------- categorías ----------
function categoriesEditor(app) {
  const st = app.state;
  const list = el('div', { class: 'interp-cats' });
  const ch = () => { bumpInterp(app); };
  for (const c of st.interp.categories) {
    const row = el('div', { class: 'icat' },
      el('div', { class: 'icat-head' }, color(c, 'color', { onChange: ch }), text(c, 'name', { onChange: () => { ch(); app.renderLeft(); } }),
        el('span', { class: 'badge' }, c.geom === 'point' ? 'punto' : c.geom === 'line' ? 'línea' : 'área'),
        button('', () => {
          const used = st.interp.versions.some((v) => v.features.features.some((f) => f.properties.cat === c.id));
          if (used) { app.toast('Esa categoría se usa en alguna versión: no se puede quitar.', 'warn'); return; }
          st.interp.categories = st.interp.categories.filter((x) => x !== c); ch(); app.renderLeft();
        }, { kind: 'icon ghost', title: 'Quitar categoría', icon: '×' })),
      c.geom === 'line' ? inlineFields(field('Grosor', num(c, 'width', { min: 0.1, max: 6, step: 0.1, unit: 'pt', onChange: ch })), field('Decoración', select(c, 'deco', DECOS, { onChange: ch })))
        : c.geom === 'polygon' ? inlineFields(field('Contorno', num(c, 'width', { min: 0, max: 6, step: 0.1, unit: 'pt', onChange: ch })), field('Trama', select(c, 'pattern', PATTERNS, { onChange: ch })))
          : inlineFields(field('Símbolo', select(c, 'shape', SHAPES, { onChange: ch })), field('Tamaño', num(c, 'size', { min: 1, max: 20, step: 0.5, unit: 'pt', onChange: ch }))),
    );
    list.append(row);
  }
  const newObj = { name: '', geom: 'line' };
  return el('div', {},
    el('p', { class: 'hint' }, 'El color y la forma dicen qué es; el trazo (lleno, guiones, puntos) dice cuánto se sabe. Así la figura no afirma más de lo que el archivo permite.'),
    list,
    inlineFields(field('Nueva categoría', text(newObj, 'name', { placeholder: 'Ej.: Rastrillada' })), field('Tipo', select(newObj, 'geom', [['line', 'Línea'], ['polygon', 'Área'], ['point', 'Punto']]))),
    el('div', { class: 'btn-row' }, button('Agregar categoría', () => {
      if (!newObj.name.trim()) return;
      st.interp.categories.push({ id: uid('K'), name: newObj.name.trim(), geom: newObj.geom, color: '#6b4a2b', width: newObj.geom === 'polygon' ? 0.6 : 0.9, size: 5, shape: 'circle', pattern: 'none', deco: 'none' });
      ch(); app.renderLeft();
    }, { kind: 'small' })),
  );
}

// ---------- exportación ----------
function exportTools(app) {
  const st = app.state;
  const v = activeVersion(st);
  const il = interpLayer(st, false);
  return el('div', {},
    il ? el('div', { class: 'check-row' },
      check(il, 'visible', 'Mostrar la interpretación en la figura', { onChange: () => app.commit('layers') }),
      check(il.params, 'labels', 'Rótulos de los elementos', { onChange: () => { il.rev += 1; app.commit('layers'); } }),
      check(il.legend, 'show', 'En la leyenda', { onChange: () => app.commit('overlay') })) : null,
    el('div', { class: 'btn-row wrap' },
      button('Descargar versión (GeoJSON)', () => exportVersionGeoJSON(st, v), { kind: 'small' }),
      button('Copiar ficha metodológica', async () => {
        const t = methodSheet(st);
        try { await navigator.clipboard.writeText(t); app.toast('Ficha metodológica copiada: fuentes, puntos de control, errores y versiones.'); }
        catch (e) { downloadBlob(new Blob([t], { type: 'text/plain;charset=utf-8' }), 'ficha-metodologica.txt'); }
      }, { kind: 'small' }),
      button('Descargar ficha (.txt)', () => downloadBlob(new Blob([methodSheet(st)], { type: 'text/plain;charset=utf-8' }), 'ficha-metodologica.txt'), { kind: 'small ghost' })),
    el('p', { class: 'hint' }, 'La figura se exporta desde «Exportar figura»; el epígrafe ya incluye la versión, las fuentes citadas y el método de georreferenciación.'),
  );
}

export { methodInfo };
