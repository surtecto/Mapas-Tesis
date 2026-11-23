// Ayuda: guía rápida, preguntas comunes, manual para leer y buscador sobre ese mismo contenido.
import { el, clear } from '../util.js';
import { QUICK, FAQ, MANUAL, MANUAL_PDF, MANUAL_VERSION, searchHelp } from '../manual.js';

let dlg = null;
const ui = { tab: 'guia', q: '', chapter: 0 };

function ensure() {
  if (dlg) return dlg;
  dlg = el('dialog', { class: 'help-dialog', 'aria-labelledby': 'help-title' });
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  return dlg;
}

const pdfLink = (cls, label) => el('a', { class: cls, href: MANUAL_PDF, download: 'manual-mapas-tesis.pdf', target: '_blank', rel: 'noopener' }, label);

function quickView() {
  return el('div', { class: 'help-pane' },
    el('p', { class: 'help-lead' }, 'De un proyecto vacío a la figura exportada, en siete pasos.'),
    el('ol', { class: 'help-steps' }, ...QUICK.map(([t, d]) => el('li', {}, el('strong', {}, t), el('span', {}, d)))),
    el('p', { class: 'help-note' }, 'Cada paso está explicado en detalle en el manual, con capturas de pantalla y los fundamentos cartográficos: qué proyección usar, cuándo va la flecha de norte, cómo elegir colores y clases. ', pdfLink('', 'Descargar el manual (PDF)'), '.'));
}

function faqView() {
  return el('div', { class: 'help-pane' }, ...FAQ.map(([q, a]) => el('details', { class: 'help-faq' }, el('summary', {}, q), el('p', {}, a))));
}

function manualView(render, focusId) {
  const ch = MANUAL[ui.chapter] || MANUAL[0];
  const nav = el('nav', { class: 'help-toc', 'aria-label': 'Capítulos del manual' }, ...MANUAL.map((c, i) => el('button', { type: 'button', class: i === ui.chapter ? 'on' : '', onclick: () => { ui.chapter = i; render(); } }, `${i + 1}. ${c.t}`)));
  const body = el('div', { class: 'help-chapter' },
    el('h3', {}, `${ui.chapter + 1}. ${ch.t}`), ch.intro ? el('p', { class: 'help-lead' }, ch.intro) : null,
    ...ch.s.map((s) => el('section', { id: `help-${s.id}`, class: s.id === focusId ? 'focus' : '' }, el('h4', {}, s.t), el('div', { html: s.h }),
      s.figs.length ? el('p', { class: 'help-fig' }, `En el PDF: ${s.figs.length === 1 ? 'una captura de pantalla' : `${s.figs.length} capturas de pantalla`} de esta parte.`) : null)));
  if (focusId) setTimeout(() => { const t = body.querySelector(`#help-${CSS.escape(focusId)}`); if (t) t.scrollIntoView({ block: 'start' }); }, 30);
  return el('div', { class: 'help-pane help-manual' }, nav, body);
}

function resultsView(render) {
  const res = searchHelp(ui.q);
  if (!res.length) {
    return el('div', { class: 'help-pane' }, el('p', { class: 'help-lead' }, 'No encontré eso en el manual.'),
      el('p', {}, 'Probá con otras palabras (por ejemplo: «shapefile», «proyección», «exportar», «carpeta», «plano histórico») o recorré los capítulos en la solapa «Manual». Si es algo que la aplicación no hace o que falla, escribile al autor por Instagram: @surtectura.s.'));
  }
  return el('div', { class: 'help-pane' },
    el('p', { class: 'help-found' }, `Lo que dice el manual sobre «${ui.q}»:`),
    ...res.map((r, i) => el('article', { class: `help-hit${i === 0 ? ' first' : ''}` },
      el('span', { class: 'help-where' }, r.where), el('h4', {}, r.title),
      i === 0 ? el('div', { html: r.html }) : el('p', {}, r.text),
      r.kind === 'manual' ? el('button', { type: 'button', class: 'btn small ghost', onclick: () => { ui.q = ''; ui.tab = 'manual'; ui.chapter = MANUAL.findIndex((c) => c.s.some((s) => s.id === r.id)); render(r.id); } }, 'Ver en el manual') : null)));
}

export function openHelp(tab) {
  const d = ensure();
  if (tab) { ui.tab = tab; ui.q = ''; }
  const render = (focusId) => {
    clear(d);
    const input = el('input', { type: 'search', class: 'help-q', placeholder: 'Preguntá algo: ¿cómo cargo un shapefile?, ¿qué proyección uso?, ¿dónde se guardan mis mapas?', 'aria-label': 'Preguntar o buscar en la ayuda', value: ui.q, autocomplete: 'off', spellcheck: 'false' });
    const ask = () => { ui.q = input.value.trim(); render(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
    input.addEventListener('search', () => { if (!input.value && ui.q) { ui.q = ''; render(); } });
    const tabs = [['guia', 'Guía rápida'], ['faq', 'Preguntas comunes'], ['manual', 'Manual']];
    d.append(el('div', { class: 'help' },
      el('header', { class: 'help-head' },
        el('div', {}, el('h2', { id: 'help-title' }, 'Ayuda'), el('p', {}, `Mapas-Tesis ${MANUAL_VERSION}`)),
        pdfLink('btn primary', 'Descargar el manual (PDF)'),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => d.close() }, 'Cerrar')),
      el('div', { class: 'help-ask' }, input, el('button', { type: 'button', class: 'btn', onclick: ask }, 'Buscar la respuesta'),
        el('small', {}, 'Responde con lo que dice el manual. Es un buscador sobre ese contenido, no un asistente de inteligencia artificial: no inventa ni sale a internet.')),
      ui.q ? el('div', { class: 'help-back' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => { ui.q = ''; render(); } }, '← Volver a la ayuda')) :
        el('nav', { class: 'tabs help-tabs', role: 'tablist' }, ...tabs.map(([id, label]) => el('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(ui.tab === id), onclick: () => { ui.tab = id; render(); } }, label))),
      ui.q ? resultsView(render) : ui.tab === 'faq' ? faqView() : ui.tab === 'manual' ? manualView(render, focusId) : quickView()));
    if (ui.q) setTimeout(() => input.focus(), 0);
  };
  render();
  if (!d.open) d.showModal();
}
