// Panel de capas: pila ordenable, ajustes por capa y catálogo de fuentes
import { el, clear, uid } from '../util.js';
import { field, inlineFields, num, color, select, check, range, button, details, text } from './forms.js';
import { styleEditor, geomOf } from './styleEditor.js';
import { CATALOG, GROUPS, getDef, defOf, RAMPS, baseStyle, FONTS } from '../catalog.js';
import { DASH_OPTIONS } from '../styles.js';
import { newLayerState } from '../state.js';
import { fileToGeoJSON } from './importers.js';
import { projInfo } from '../projections.js';
import { openServicesDialog } from './servicesDialog.js';
import { openImageryDialog } from './imageryDialog.js';
import { SENSORS, LANDCOVER, LC_PALETTES } from '../imagery.js';
import { downloadBlob } from '../util.js';
import GeoJSONFormat from 'ol/format/GeoJSON.js';

const BLENDS = [['normal', 'Normal'], ['multiply', 'Multiplicar (sombreado sobre imagen)'], ['screen', 'Trama (aclarar)'], ['overlay', 'Superponer'], ['soft-light', 'Luz suave'], ['darken', 'Oscurecer'], ['lighten', 'Aclarar']];
const CLIPS = [['none', 'Sin recorte'], ['land', 'Solo sobre tierra y hielo (según la costa SCAR ADD)'], ['inside', 'Solo dentro del Sector Antártico Argentino'], ['outside', 'Solo fuera del Sector Antártico Argentino']];

function typeBadge(def, ls) {
  if (ls.def === 'user') return 'Propia';
  if (def.type === 'svc-wfs') return def.provider ? def.provider.short.slice(0, 9) : 'WFS';
  if (def.type === 'svc-arcgis') return def.provider ? def.provider.short.slice(0, 9) : 'ArcGIS';
  if (ls.def === 'svc' && def.noCors) return 'Solo ver';
  if (def.type === 'georef') return 'Plano';
  if (def.type === 'interp') return ls.params && ls.params.ghost ? 'Compara' : 'Interpr.';
  if (def.type === 'wfs-view') return 'IGN';
  if (def.type === 'wfs') return 'WFS';
  if (def.type === 'wms') return 'WMS';
  if (def.type === 'esri-feature') return 'Vector';
  if (def.kind === 'vector') return 'Vector';
  if (def.type === 'graticule') return 'Grilla';
  if (def.projection === 'EPSG:3031') return 'Polar';
  return 'Teselas';
}

export function insertIndexFor(state, def) {
  const layers = state.layers;
  if (def.kind === 'raster') {
    // las bases ráster van debajo de los planos georreferenciados
    const gi = def.type === 'georef' ? -1 : layers.findIndex((l) => l.def === 'georef');
    let idx = 0;
    layers.forEach((l, i) => { const d = defOf(l); if (d && d.kind === 'raster' && (gi < 0 || i < gi)) idx = i + 1; });
    return idx;
  }
  const g = layers.findIndex((l) => l.def === 'graticule');
  return g >= 0 ? g : layers.length;
}

export function renderLayersPanel(app, root) {
  clear(root);
  const st = app.state;
  const stack = el('ol', { class: 'layer-stack', 'aria-label': 'Capas del mapa, de arriba hacia abajo' });
  const ordered = [...st.layers].reverse();
  for (const ls of ordered) stack.append(layerRow(app, ls));
  enableReorder(app, stack);
  const sitesRow = el('li', { class: 'layer-row fixed' },
    el('div', { class: 'layer-head' },
      el('span', { class: 'drag ghost', 'aria-hidden': 'true' }),
      check(st, 'sitesVisible', '', { onChange: () => app.commit('layers') }),
      el('span', { class: 'layer-name static' }, 'Sitios de estudio'),
      el('span', { class: 'badge' }, `${st.sites.length}`)));
  if (st.sitesVisible === undefined) st.sitesVisible = true;
  sitesRow.querySelector('input').checked = st.sitesVisible !== false;
  stack.prepend(sitesRow);

  root.append(
    el('div', { class: 'panel-intro' },
      el('p', {}, 'Arrastrá para cambiar el orden: la capa de arriba se dibuja encima. Abrí una capa para ajustar su estilo, opacidad, recorte o visibilidad en los zooms.')),
    stack,
    el('h2', { class: 'panel-h' }, 'Agregar capas'),
    el('button', { type: 'button', class: 'svc-open', onclick: () => openServicesDialog(app) },
      el('strong', {}, 'Servicios oficiales'),
      el('span', {}, 'IGN, INA, INDEC, INTA, Ambiente, SEGEMAR, ARBA, Estadística bonaerense y el catálogo completo de IDERA. Capas vectoriales que se pueden restilizar, filtrar y exportar.')),
    el('button', { type: 'button', class: 'svc-open img', onclick: () => openImageryDialog(app) },
      el('strong', {}, 'Imágenes y coberturas'),
      el('span', {}, 'Sentinel-2 y Landsat por fecha (desde 1972), mosaicos anuales, cobertura del suelo 2017–2025 con superficies y cambios, y clasificación propia.')),
    catalogView(app),
    el('h2', { class: 'panel-h' }, 'Datos propios'),
    importView(app),
  );
}

function layerRow(app, ls) {
  const def = ls.def === 'user' ? { name: ls.name, kind: 'vector', type: 'user' } : defOf(ls);
  const open = app.ui.expanded.has(ls.uid);
  const li = el('li', { class: `layer-row${open ? ' open' : ''}${ls.visible ? '' : ' hidden-layer'}`, dataset: { uid: ls.uid } });
  const vis = el('input', { type: 'checkbox', checked: ls.visible, 'aria-label': `Mostrar ${ls.name}` });
  vis.addEventListener('change', () => { ls.visible = vis.checked; li.classList.toggle('hidden-layer', !ls.visible); app.commit('layers'); });
  const nameBtn = el('button', { type: 'button', class: 'layer-name', 'aria-expanded': String(open) }, ls.name);
  nameBtn.addEventListener('click', () => {
    if (app.ui.expanded.has(ls.uid)) app.ui.expanded.delete(ls.uid); else app.ui.expanded.add(ls.uid);
    app.renderLeft();
  });
  const op = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: ls.opacity, class: 'mini-range', 'aria-label': 'Opacidad', title: `Opacidad ${Math.round(ls.opacity * 100)}%` });
  op.addEventListener('input', () => { ls.opacity = parseFloat(op.value); op.title = `Opacidad ${Math.round(ls.opacity * 100)}%`; app.applyOpacity(ls); });
  op.addEventListener('change', () => app.commit('layers'));
  const rm = el('button', { type: 'button', class: 'icon ghost', title: 'Quitar capa', 'aria-label': `Quitar ${ls.name}` }, '×');
  rm.addEventListener('click', () => { app.state.layers = app.state.layers.filter((l) => l !== ls); app.commit('layers'); app.renderLeft(); });
  const status = app.layerStatus(ls.uid);
  li.append(el('div', { class: 'layer-head' },
    el('span', { class: 'drag', title: 'Arrastrar para reordenar', 'aria-hidden': 'true', draggable: 'true' }),
    vis, nameBtn,
    status ? el('span', { class: `badge ${status.kind}`, title: status.text }, status.kind === 'error' ? '!' : status.kind === 'far' ? 'acercá' : '…') : el('span', { class: 'badge' }, typeBadge(def, ls)),
    op, rm));
  if (open) li.append(layerBody(app, ls, def));
  return li;
}

function layerBody(app, ls, def) {
  const body = el('div', { class: 'layer-body' });
  if (def.note) body.append(el('p', { class: 'note' }, def.note));
  if (def.attribution) body.append(el('p', { class: 'source' }, `Fuente: ${def.attribution}`));
  body.append(field('Nombre', text(ls, 'name', { onChange: () => { if (ls.legend) ls.legend.label = ls.legend.label || ls.name; app.renderLeft(); app.commit('overlay'); } })));
  body.append(inlineFields(field('Opacidad', range(ls, 'opacity', { onInput: () => app.applyOpacity(ls), onChange: () => app.commit('layers'), format: (v) => `${Math.round(v * 100)}%` }))));

  if (def.type === 'georef' || def.type === 'interp') {
    body.append(el('p', { class: 'note' }, def.type === 'georef' ? 'Plano histórico o ajeno georreferenciado. Sus puntos de control, el recorte y el tratamiento de la imagen se editan en la pestaña Interpretación.' : 'Trazos de la versión de interpretación. Se dibujan y se editan en la pestaña Interpretación.'),
      el('div', { class: 'btn-row' }, button('Ir a Interpretación', () => app.showTab('interp'), { kind: 'small' })));
    if (def.type === 'georef') body.append(field('Modo de fusión', select(ls, 'blend', BLENDS, { onChange: () => app.commit('layers') })));
    return body;
  }
  if (ls.def === 'svc') body.append(serviceEditor(app, ls, def));
  if (def.type === 'wfs-view' || def.type === 'svc-wfs') {
    const ol = app.mainCtx && app.mainCtx.olLayers.get(ls.uid);
    const vs = ol && ol._viewSource;
    if (vs && vs._cachedAt && Number.isFinite(vs._cachedAt)) body.append(el('p', { class: 'note' }, `Parte de esta capa se muestra con los datos guardados en esta computadora el ${new Date(vs._cachedAt).toLocaleDateString('es-AR')}: si el servidor no responde, el mapa se sigue viendo y exportando. Se renuevan solos cada semana.`));
  }
  if (def.type === 'wfs-view') {
    body.append(el('p', { class: 'note' }, `Se pide al IGN solo lo que entra en la vista, a escalas mayores que 1:${(def.maxMpm * 1000).toLocaleString('es-AR')}. ${ls.params && ls.params.force ? 'Carga forzada a escala menor (puede tardar).' : ''}`));
    body.append(check(ls.params, 'force', 'Cargar también a escala menor (más lento)', { onChange: () => { ls.rev += 1; app.commit('layers'); } }));
  }
  if (def.type === 'graticule') body.append(graticuleEditor(app, ls));
  else if (def.kind === 'vector') {
    if (ls.style) body.append(styleEditor(app, ls));
    if (ls.legend) {
      body.append(details('Leyenda', !!ls.legend.show,
        check(ls.legend, 'show', 'Incluir en la leyenda', { onChange: () => app.commit('overlay') }),
        field('Texto en la leyenda', text(ls.legend, 'label', { onChange: () => app.commit('overlay') })),
      ));
    }
  } else {
    if (def.type === 'gibs-date') {
      const inp = el('input', { type: 'date', value: ls.params.date, max: new Date().toISOString().slice(0, 10), min: '2000-03-01' });
      inp.addEventListener('change', () => { ls.params.date = inp.value; ls.rev += 1; app.commit('layers'); });
      body.append(field('Fecha de la imagen', inp, 'Verano austral (diciembre a febrero) para iluminación completa del continente.'));
    }
    if (def.type === 'terrarium') body.append(demEditor(app, ls));
    if (def.type === 'arcgis-image' && def.functions) {
      if (!ls.params.fn) ls.params.fn = def.functions[0][0];
      body.append(field('Representación', select(ls.params, 'fn', def.functions, { onChange: () => { ls.rev += 1; app.commit('layers'); } })));
    }
    body.append(details('Fusión y ajustes de imagen', ls.blend !== 'normal',
      field('Modo de fusión', select(ls, 'blend', BLENDS, { onChange: () => app.commit('layers') })),
      inlineFields(field('Brillo', range(ls.adjust, 'brightness', { min: 40, max: 160, step: 1, onInput: () => app.commit('layers', { history: false }), onChange: () => app.commit('layers'), format: (v) => `${v}%` })),
        field('Contraste', range(ls.adjust, 'contrast', { min: 40, max: 180, step: 1, onInput: () => app.commit('layers', { history: false }), onChange: () => app.commit('layers'), format: (v) => `${v}%` }))),
      inlineFields(field('Saturación', range(ls.adjust, 'saturate', { min: 0, max: 200, step: 1, onInput: () => app.commit('layers', { history: false }), onChange: () => app.commit('layers'), format: (v) => `${v}%` })),
        field('Escala de grises', range(ls.adjust, 'grayscale', { min: 0, max: 100, step: 1, onInput: () => app.commit('layers', { history: false }), onChange: () => app.commit('layers'), format: (v) => `${v}%` }))),
    ));
  }
  body.append(field('Recorte geográfico', select(ls, 'clip', CLIPS, { onChange: () => app.commit('layers') })));
  if (app.state.insets.length) {
    const box = el('div', { class: 'inset-vis' });
    for (const z of app.state.insets) {
      const obj = { v: z.layers[ls.uid] === true ? 'show' : z.layers[ls.uid] === false ? 'hide' : 'inherit' };
      box.append(field(`En «${z.name}»`, select(obj, 'v', [['inherit', def.type === 'graticule' ? 'Según el zoom' : 'Igual que el mapa'], ['show', 'Mostrar'], ['hide', 'Ocultar']], {
        onChange: (v) => { if (v === 'inherit') delete z.layers[ls.uid]; else z.layers[ls.uid] = v === 'show'; app.commit('layers'); },
      })));
    }
    body.append(details('Visibilidad en los zooms', false, box));
  }
  return body;
}

// Capas de servicios oficiales: origen, modo de carga, filtros y descarga
const OPS = [['=', 'es igual a'], ['≠', 'no es'], ['contiene', 'contiene'], ['>', 'mayor que'], ['<', 'menor que'], ['≥', 'desde'], ['≤', 'hasta'], ['vacío', 'está vacío'], ['no vacío', 'no está vacío']];
function serviceEditor(app, ls, def) {
  const box = el('div', { class: 'svc-editor' });
  const reload = () => { ls.rev += 1; app.commit('layers'); app.renderLeft(); };
  const src = def.provider ? def.provider.name : '';
  box.append(el('p', { class: 'note' }, `${src}${def.typeName ? ` · ${def.typeName}` : def.layers ? ` · ${def.layers}` : ''}`));
  if (def.noCors) box.append(el('p', { class: 'warn-note' }, 'Solo para ver: el servidor no habilita CORS, así que la capa no se puede restilizar ni entra en la exportación.'));
  if (def.kind === 'raster') {
    if (def.legendUrl) box.append(el('div', { class: 'svc-legend' }, el('span', { class: 'note' }, 'Leyenda del servidor:'), el('img', { src: def.legendUrl, alt: `Leyenda de ${ls.name}`, loading: 'lazy' })));
    if (def.type === 'svc-image') {
      const sen = SENSORS[def.sensor];
      if (def.date) box.append(el('p', { class: 'note' }, `Fecha: ${def.date.split('-').reverse().join('/')}${def.cloud != null ? `, nubes ${Math.round(def.cloud * 100)} %` : ''}.`));
      if (sen) box.append(field('Representación', select(ls.svc, 'render', sen.renders, { onChange: (v) => {
        const rn = (sen.renders.find((r) => r[0] === v) || [v, v])[1];
        ls.svc.cite = ls.svc.cite.replace(/representación «[^»]*»/, `representación «${rn}»`);
        reload();
      } })));
    }
    if (def.type === 'svc-landcover') {
      box.append(field('Año', select(ls.svc, 'year', LANDCOVER.years.map((y) => [y, String(y)]), { numeric: true, onChange: (v) => {
        ls.svc.cite = ls.svc.cite.replace(/Año \d{4}/, `Año ${v}`);
        if (/Cobertura del suelo \d{4}/.test(ls.name)) ls.name = `Cobertura del suelo ${v}`;
        if (ls.legend && /Cobertura del suelo \d{4}/.test(ls.legend.label || '')) ls.legend.label = ls.name;
        reload(); app.commit('overlay');
      } })));
      box.append(el('div', { class: 'btn-row wrap' }, el('span', { class: 'note' }, 'Paleta:'), ...Object.entries(LC_PALETTES).map(([k, p]) => button(p.name, () => {
        ls.svc.classes.forEach((c) => { if (p.colors[c.v]) c.color = p.colors[c.v]; });
        reload(); app.commit('overlay');
      }, { kind: 'small ghost' }))));
    }
    if (def.classes) box.append(classEditor(app, ls, reload));
    box.append(swipeEditor(app, ls));
    return box;
  }
  // modo de carga
  const mode = { v: def.whole ? 'whole' : 'view' };
  box.append(field('Qué se carga', select(mode, 'v', [['view', 'Lo que entra en la vista (a escala de detalle)'], ['whole', 'Toda la capa de una vez']], {
    onChange: (v) => { ls.svc.whole = v === 'whole'; reload(); },
  }), def.hits != null ? `La capa tiene ${def.hits.toLocaleString('es-AR')} objetos.` : ''));
  if (!def.whole) {
    box.append(field('Escala máxima para cargar', select({ v: String(def.maxMpm) }, 'v', [['600', '1:600.000'], ['1500', '1:1.500.000'], ['2500', '1:2.500.000'], ['6000', '1:6.000.000'], ['15000', '1:15.000.000']], {
      onChange: (v) => { ls.svc.maxMpm = Number(v); reload(); },
    })));
  }
  const layer = app.mainCtx && app.mainCtx.olLayers.get(ls.uid);
  const s = layer && layer.getSource && layer.getSource();
  if (s && s._truncated) box.append(el('p', { class: 'warn-note' }, 'El servidor devolvió el máximo de objetos que permite: acercá la vista o filtrá para ver todo.'));
  // filtro del servidor (CQL en GeoServer, where en ArcGIS)
  const fld = def.type === 'svc-arcgis' ? 'where' : 'cql';
  const srvIn = el('input', { type: 'text', value: def[fld] || '', placeholder: def.type === 'svc-arcgis' ? "PARTIDO = 'San Andrés de Giles'" : "nam = 'San Andrés de Giles'" });
  box.append(details('Filtro en el servidor', !!def[fld],
    el('p', { class: 'note' }, def.type === 'svc-arcgis' ? 'Expresión SQL del servidor ArcGIS: solo llegan los objetos que la cumplen.' : 'Expresión CQL (GeoServer): solo llegan los objetos que la cumplen. Los textos van entre comillas simples.'),
    el('div', { class: 'btn-row' }, srvIn, button('Aplicar', () => { ls.svc[fld] = srvIn.value.trim(); reload(); }, { kind: 'small' }))));
  // filtro en el navegador por atributos
  const fields = def.fields && def.fields.length ? def.fields : [];
  if (!ls.params.filter) ls.params.filter = [];
  const rules = el('div', { class: 'flt-rules' });
  const paintRules = () => {
    clear(rules);
    ls.params.filter.forEach((r, i) => {
      const fSel = el('select', { 'aria-label': 'Campo' }, ...fields.map((f) => el('option', { value: f, selected: r.field === f }, f)));
      const oSel = el('select', { 'aria-label': 'Condición' }, ...OPS.map(([v, t]) => el('option', { value: v, selected: r.op === v }, t)));
      const vIn = el('input', { type: 'text', value: r.value || '', 'aria-label': 'Valor', list: `vals-${ls.uid}-${i}` });
      const dl = el('datalist', { id: `vals-${ls.uid}-${i}` });
      const fillVals = () => {
        clear(dl);
        const vals = new Set();
        (s && s.getFeatures ? s.getFeatures() : []).slice(0, 3000).forEach((f) => { const v = f.get(r.field); if (v != null && vals.size < 60) vals.add(String(v)); });
        [...vals].sort((a, b) => a.localeCompare(b, 'es')).forEach((v) => dl.append(el('option', { value: v })));
      };
      fillVals();
      const ch = () => { r.field = fSel.value; r.op = oSel.value; r.value = vIn.value; app.styleChanged(ls); };
      fSel.addEventListener('change', () => { ch(); fillVals(); });
      oSel.addEventListener('change', ch);
      vIn.addEventListener('change', ch);
      rules.append(el('div', { class: 'flt-rule' }, fSel, oSel, vIn, dl, el('button', { type: 'button', class: 'icon ghost', 'aria-label': 'Quitar condición', onclick: () => { ls.params.filter.splice(i, 1); app.styleChanged(ls); paintRules(); } }, '×')));
    });
  };
  paintRules();
  box.append(details('Mostrar solo algunos objetos', ls.params.filter.length > 0,
    fields.length ? null : el('p', { class: 'note' }, 'Los campos aparecen cuando la capa termina de cargar.'),
    rules,
    ls.params.filter.length > 1 ? field('Combinar condiciones', select(ls.params, 'filterMode', [['all', 'Que se cumplan todas'], ['any', 'Que se cumpla alguna']], { onChange: () => { app.styleChanged(ls); } })) : null,
    fields.length ? el('div', { class: 'btn-row' }, button('Agregar condición', () => { ls.params.filter.push({ field: fields[0], op: '=', value: '' }); paintRules(); app.renderLeft(); }, { kind: 'small' })) : null));
  // descarga
  box.append(el('div', { class: 'btn-row' }, button('Descargar GeoJSON (lo cargado)', () => {
    const feats = s && s.getFeatures ? s.getFeatures() : [];
    if (!feats.length) { app.toast('Todavía no hay objetos cargados en la vista.'); return; }
    const fmt = new GeoJSONFormat();
    const obj = fmt.writeFeaturesObject(feats, { featureProjection: app.mainCtx.projection, dataProjection: 'EPSG:4326', decimals: 7 });
    obj.features.forEach((f) => { delete f.properties.geometry; });
    downloadBlob(new Blob([JSON.stringify(obj)], { type: 'application/geo+json' }), `${(ls.name || 'capa').replace(/[^\wáéíóúñ-]+/gi, '-').slice(0, 50)}.geojson`);
  }, { kind: 'small ghost' })));
  return box;
}

// Clases de una cobertura o de una clasificación propia: nombre, color y visibilidad
function classEditor(app, ls, reload) {
  const wrap = el('div', { class: 'class-list' });
  const total = ls.svc.classes.reduce((a, c) => a + (c.area || 0), 0);
  for (const c of ls.svc.classes) {
    const vis = el('input', { type: 'checkbox', checked: c.show !== false, 'aria-label': `Mostrar ${c.name}` });
    vis.addEventListener('change', () => { c.show = vis.checked; reload(); app.commit('overlay'); });
    const col = el('input', { type: 'color', value: c.color, 'aria-label': `Color de ${c.name}` });
    col.addEventListener('change', () => { c.color = col.value; reload(); app.commit('overlay'); });
    const nm = el('input', { type: 'text', value: c.name, 'aria-label': 'Nombre de la clase' });
    nm.addEventListener('change', () => { c.name = nm.value.trim() || c.name; app.commit('overlay'); });
    wrap.append(el('div', { class: 'class-row' }, vis, col, nm, c.area ? el('span', { class: 'class-area', title: c.ndvi != null ? `NDVI medio ${c.ndvi}` : '' }, `${total ? Math.round((c.area / total) * 100) : 0} %`) : el('span')));
  }
  return details('Clases', true, wrap, el('p', { class: 'note' }, 'Ocultar una clase la deja transparente en el mapa y la saca de la leyenda.'));
}

// Cortina para comparar dos imágenes (o una imagen y la base): la capa se ve solo a un lado
function swipeEditor(app, ls) {
  const p = ls.params;
  const on = p.swipe != null && p.swipe !== '' && Number(p.swipe) < 100;
  const val = el('input', { type: 'range', min: 0, max: 100, step: 1, value: on ? p.swipe : 50, disabled: !on });
  const out = el('output', {}, on ? `${p.swipe} %` : '');
  const chk = el('input', { type: 'checkbox', checked: on });
  chk.addEventListener('change', () => { p.swipe = chk.checked ? Number(val.value) : null; val.disabled = !chk.checked; out.textContent = chk.checked ? `${p.swipe} %` : ''; app.commit('layers'); });
  val.addEventListener('input', () => { p.swipe = Number(val.value); out.textContent = `${p.swipe} %`; app.commit('layers', { history: false }); });
  val.addEventListener('change', () => app.commit('layers'));
  return details('Cortina para comparar', on,
    el('label', { class: 'check' }, chk, el('span', {}, 'Mostrar esta capa solo a un lado de una línea vertical')),
    el('div', { class: 'range-row' }, val, out),
    field('Lado visible', select(p, 'swipeSide', [['left', 'Izquierda'], ['right', 'Derecha']], { onChange: () => app.commit('layers') })),
    el('p', { class: 'note' }, 'Con dos imágenes de distinta fecha, la de arriba con cortina deja ver la de abajo del otro lado. La exportación respeta el corte.'));
}

function demEditor(app, ls) {
  const p = ls.params;
  const ch = () => app.commit('layers');
  return el('div', { class: 'dem-editor' },
    field('Rampa de color', select(p, 'ramp', Object.entries(RAMPS).map(([k, r]) => [k, r.name]), { onChange: ch })),
    inlineFields(field('Cota mínima', num(p, 'min', { step: 100, unit: 'm', onChange: ch })), field('Cota máxima', num(p, 'max', { step: 100, unit: 'm', onChange: ch }))),
    check(p, 'shade', 'Sombreado del relieve', { onChange: ch }),
    inlineFields(field('Azimut del sol', num(p, 'azimuth', { min: 0, max: 360, step: 5, unit: '°', onChange: ch })), field('Altura del sol', num(p, 'altitude', { min: 5, max: 85, step: 5, unit: '°', onChange: ch }))),
    inlineFields(field('Exageración vertical', num(p, 'zFactor', { min: 0.5, max: 20, step: 0.5, unit: '×', onChange: ch })), field('Intensidad', range(p, 'shadeStrength', { min: 0, max: 1, step: 0.05, onChange: ch, format: (v) => `${Math.round(v * 100)}%` }))),
    check(p, 'transparentSea', 'Mar transparente (solo tierra)', { onChange: ch }),
  );
}

function graticuleEditor(app, ls) {
  const st = ls.style;
  if (!st.intervalLon) st.intervalLon = 'auto';
  if (!st.label.edges || st.label.edges === 'all') st.label.edges = st.label.edges || 'classic';
  const ch = () => app.commit('layers');
  const intervals = [['auto', 'Automático'], ['45', '45°'], ['30', '30°'], ['20', '20°'], ['15', '15°'], ['10', '10°'], ['5', '5°'], ['2', '2°'], ['1', '1°'], ['0.5', '30′'], ['0.25', '15′'], [String(1 / 6), '10′'], [String(1 / 12), '5′'], [String(1 / 60), '1′']];
  return el('div', {},
    el('p', { class: 'note' }, 'La grilla se dibuja como vector por encima de las capas del mapa (queda editable en la exportación SVG).'),
    inlineFields(field('Paralelos cada', select(st, 'interval', intervals, { onChange: ch })), field('Meridianos cada', select(st, 'intervalLon', intervals, { onChange: ch }))),
    inlineFields(field('Color', color(st.line, 'color', { onChange: ch })), field('Grosor', num(st.line, 'width', { min: 0.05, max: 3, step: 0.05, unit: 'pt', onChange: ch }))),
    inlineFields(field('Tipo de línea', select(st.line, 'dash', DASH_OPTIONS, { onChange: ch })), field('Opacidad', range(st.line, 'opacity', { onChange: ch, format: (v) => `${Math.round(v * 100)}%` }))),
    check(st.label, 'show', 'Rótulos de coordenadas', { onChange: ch }),
    field('Ubicación de rótulos', select(st.label, 'mode', [['frame', 'Fuera del marco, con marcas'], ['inside', 'Dentro del marco']], { onChange: ch }),
      'Fuera del marco: dejá márgenes en Figura › Página para que entren.'),
    field('Qué se rotula', select(st.label, 'edges', [['classic', 'Meridianos arriba y abajo, paralelos a los lados'], ['all', 'Todos los cruces en los cuatro bordes'], ['left-bottom', 'Todos los cruces, solo bordes izquierdo e inferior']], { onChange: ch })),
    inlineFields(field('Tamaño', num(st.label, 'size', { min: 3, max: 16, step: 0.5, unit: 'pt', onChange: ch })), field('Color', color(st.label, 'color', { onChange: ch }))),
    field('Tipografía', select(st.label, 'font', FONTS, { onChange: ch })),
    check(st.label, 'vertical', 'Rótulos verticales en los bordes laterales', { onChange: ch }),
  );
}

function enableReorder(app, list) {
  let dragEl = null;
  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.layer-row');
    if (!row || row.classList.contains('fixed')) return;
    dragEl = row;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', row.dataset.uid); } catch (err) { /* noop */ }
  });
  list.addEventListener('dragover', (e) => {
    if (!dragEl) return;
    e.preventDefault();
    const after = [...list.querySelectorAll('.layer-row:not(.dragging):not(.fixed)')].find((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    if (after) list.insertBefore(dragEl, after); else list.appendChild(dragEl);
  });
  list.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    dragEl = null;
    const uids = [...list.querySelectorAll('.layer-row:not(.fixed)')].map((r) => r.dataset.uid).reverse();
    const byUid = new Map(app.state.layers.map((l) => [l.uid, l]));
    app.state.layers = uids.map((u) => byUid.get(u)).filter(Boolean);
    app.commit('layers');
  });
}

function catalogView(app) {
  const wrap = el('div', { class: 'catalog' });
  const present = new Set(app.state.layers.map((l) => l.def));
  const proj = projInfo(app.state.projection);
  for (const g of GROUPS) {
    if (g.hidden) continue;
    const items = CATALOG.filter((d) => d.group === g.id);
    const list = el('ul', { class: 'catalog-list' });
    for (const d of items) {
      const inMap = present.has(d.id);
      const warn = d.projection === 'EPSG:3857' && proj.polar && app.state.view.center[1] < -60 ? 'Teselas Mercator: sin datos al sur de 85°S.' : '';
      const add = el('button', { type: 'button', class: `btn small${inMap ? ' ghost' : ''}`, 'aria-label': `Agregar ${d.name}` }, inMap ? 'En el mapa' : 'Agregar');
      add.addEventListener('click', () => {
        const ls = newLayerState(d.id);
        app.state.layers.splice(insertIndexFor(app.state, d), 0, ls);
        app.ui.expanded.add(ls.uid);
        app.commit('layers');
        app.renderLeft();
        app.toast(`Capa agregada: ${d.name}`);
      });
      list.append(el('li', { class: 'catalog-item' },
        el('div', { class: 'catalog-text' }, el('span', { class: 'catalog-name' }, d.name), d.note || warn ? el('span', { class: 'catalog-note' }, warn || d.note) : null),
        add));
    }
    wrap.append(details(g.title, g.id === 'ign-arg', list));
  }
  return wrap;
}

function importView(app) {
  const inp = el('input', { type: 'file', accept: '.geojson,.json,.kml,.gpx,.csv,.tsv,.txt,.zip', multiple: true, class: 'file-input', id: 'import-layer-file' });
  inp.addEventListener('change', async () => {
    for (const file of inp.files) {
      try {
        const results = await fileToGeoJSON(file);
        for (const r of results) {
          const n = (r.geojson.features || []).length;
          if (!n) { app.toast(`«${r.name}» no tiene elementos con geometría.`, 'warn'); continue; }
          const ls = {
            uid: uid('L'), def: 'user', name: r.name.replace(/\.(geojson|json|kml|gpx|csv|tsv|txt)$/i, ''), visible: true, opacity: 1, blend: 'normal',
            adjust: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0 }, clip: 'none',
            style: baseStyle({ point: { fill: '#7a3fb0' }, line: { color: '#7a3fb0', width: 0.8 }, polygon: { fill: '#7a3fb0', fillOpacity: 0.25, stroke: '#7a3fb0', strokeWidth: 0.6 }, label: { field: '' } }),
            params: {}, legend: { show: true, label: r.name.replace(/\.[^.]+$/, '') }, insets: {}, rev: 0, _styleVersion: 0, data: r.geojson,
          };
          const props = (r.geojson.features.find((f) => f.properties) || {}).properties || {};
          ls.style.label.field = Object.keys(props).find((k) => /nombre|name|sitio|site/i.test(k)) || Object.keys(props)[0] || '';
          app.state.layers.splice(app.state.layers.findIndex((l) => l.def === 'graticule') >= 0 ? app.state.layers.findIndex((l) => l.def === 'graticule') : app.state.layers.length, 0, ls);
          app.ui.expanded.add(ls.uid);
          app.toast(`Importado: ${ls.name} (${n} elementos, ${geomOf(ls) === 'point' ? 'puntos' : geomOf(ls) === 'line' ? 'líneas' : 'polígonos'})`);
        }
      } catch (err) {
        app.toast(`No se pudo importar «${file.name}»: ${err.message}`, 'error');
      }
    }
    inp.value = '';
    app.commit('layers');
    app.renderLeft();
  });
  return el('div', { class: 'import-box' },
    el('label', { class: 'drop', for: 'import-layer-file' },
      el('strong', {}, 'Elegir archivos'),
      el('span', {}, 'GeoJSON, KML, GPX, CSV con latitud/longitud o Shapefile comprimido (.zip). Coordenadas WGS 84.')),
    inp);
}
