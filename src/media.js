// Destinos de la figura: tamaños, resoluciones y mínimos de legibilidad según dónde se va a ver.
// Impresión (mm, puntos tipográficos, ppp), proyector y videollamada (píxeles, compresión), web (píxeles, pantallas densas).
import { getDef, defOf } from './catalog.js';
import { contrastRatio } from './util.js';
import { grayDiagnostics } from './palette.js';
import { legendItems } from './overlay.js';

const MM_PER_IN = 25.4;
export const MEDIA = [
  { id: 'tesis-a4', group: 'Impresión', name: 'Tesis impresa A4: página completa', page: { w: 160, h: 230 }, dpi: 300, format: 'pdf', kind: 'print',
    min: { textPt: 7, linePt: 0.25, symbolPt: 4 },
    notes: 'Caja de texto de una A4 con márgenes de encuadernación. Texto de al menos 7 pt (el cuerpo de la tesis suele ir en 11–12 pt), líneas de 0,25 pt o más: las más finas desaparecen al imprimir.' },
  { id: 'tesis-a4-media', group: 'Impresión', name: 'Tesis impresa A4: media página', page: { w: 160, h: 110 }, dpi: 300, format: 'pdf', kind: 'print',
    min: { textPt: 7, linePt: 0.25, symbolPt: 4 }, notes: 'Para una figura con su epígrafe debajo en la misma página.' },
  { id: 'revista-1col', group: 'Impresión', name: 'Artículo: una columna (85 mm)', page: { w: 85, h: 85 }, dpi: 600, format: 'tiff', kind: 'print',
    min: { textPt: 6, linePt: 0.25, symbolPt: 3.5 }, notes: 'Las revistas suelen pedir TIFF o PDF a 300–600 ppp y texto de 6–8 pt a tamaño final.' },
  { id: 'revista-2col', group: 'Impresión', name: 'Artículo: dos columnas (180 mm)', page: { w: 180, h: 180 }, dpi: 600, format: 'tiff', kind: 'print',
    min: { textPt: 6, linePt: 0.25, symbolPt: 3.5 } },
  { id: 'lamina-a3', group: 'Impresión', name: 'Lámina A3 apaisada (anexo, plano desplegable)', page: { w: 420, h: 297 }, dpi: 300, format: 'pdf', kind: 'print',
    min: { textPt: 7, linePt: 0.3, symbolPt: 4 } },
  { id: 'poster-a1', group: 'Impresión', name: 'Póster A1 (congreso, defensa)', page: { w: 594, h: 841 }, dpi: 200, format: 'pdf', kind: 'print',
    min: { textPt: 16, linePt: 0.75, symbolPt: 10 }, notes: 'Se lee a 1–2 m: rótulos de 16 pt o más y líneas gruesas.' },
  { id: 'proyector-169', group: 'Presentación', name: 'Proyector 16:9 (1920 × 1080)', page: { w: 338.667, h: 190.5 }, dpi: 144, format: 'png', kind: 'screen', px: [1920, 1080],
    min: { textPx: 30, linePx: 3, symbolPx: 20, patternPx: 10, contrast: 4.5 },
    notes: 'Visto desde el fondo del aula: rótulos de 30 px o más (≈ 2,8 % de la altura), líneas de 3 px, sin pasteles ni tramas finas. Los proyectores lavan el color en salas iluminadas.' },
  { id: 'proyector-43', group: 'Presentación', name: 'Proyector 4:3 de aula (1024 × 768)', page: { w: 254, h: 190.5 }, dpi: 102.4, format: 'png', kind: 'screen', px: [1024, 768],
    min: { textPx: 22, linePx: 2, symbolPx: 14, patternPx: 8, contrast: 4.5 }, notes: 'Muchos proyectores de aula todavía son XGA: preparar la figura a su resolución evita reescalados borrosos.' },
  { id: 'videollamada', group: 'Pantalla', name: 'Pantalla compartida en videollamada', page: { w: 338.667, h: 190.5 }, dpi: 144, format: 'png', kind: 'screen', px: [1920, 1080], stream: 720,
    min: { textPx: 34, linePx: 4, symbolPx: 24, patternPx: 14, contrast: 4.5 },
    notes: 'Zoom, Meet o Teams transmiten a 720p o menos y comprimen: las líneas finas y las tramas se empastan, y el rojo fino se corre (submuestreo de color). Todo más grueso que en el proyector.' },
  { id: 'monitor', group: 'Pantalla', name: 'Monitor: lectura en pantalla completa (1920 × 1080)', page: { w: 338.667, h: 190.5 }, dpi: 144, format: 'png', kind: 'screen', px: [1920, 1080],
    min: { textPx: 16, linePx: 1.5, symbolPx: 12, patternPx: 6, contrast: 4.5 } },
  { id: 'web-1600', group: 'Web', name: 'Web o PDF digital (1600 px de ancho)', page: { w: 203.2, h: 135.5 }, dpi: 200, format: 'png', kind: 'screen', px: [1600, 1067],
    min: { textPx: 24, linePx: 2, symbolPx: 16, patternPx: 8, contrast: 4.5 }, notes: 'Se ve a unos 800 px en un celular: el doble de densidad mantiene la nitidez en pantallas Retina.' },
  { id: 'web-redes', group: 'Web', name: 'Redes sociales (1080 × 1350, vertical)', page: { w: 182.88, h: 228.6 }, dpi: 150, format: 'png', kind: 'screen', px: [1080, 1350],
    min: { textPx: 28, linePx: 3, symbolPx: 20, patternPx: 10, contrast: 4.5 }, notes: 'Se mira en el celular, de pasada: pocos elementos, rótulos grandes.' },
];

export const QUALITIES = {
  print: [['borrador', 'Borrador (150 ppp)', 150], ['estandar', 'Estándar (perfil)', null], ['alta', 'Alta (600 ppp)', 600], ['lineal', 'Dibujo lineal (1200 ppp)', 1200]],
  screen: [['estandar', 'Tamaño del perfil (1×)', 1], ['alta', 'Pantallas densas (2×, Retina/4K)', 2], ['liviana', 'Liviana (0,75×)', 0.75]],
};

export function getMedia(id) { return MEDIA.find((m) => m.id === id) || MEDIA[0]; }

export function exportDpi(state) {
  const m = getMedia(state.media.profileId);
  const q = (QUALITIES[m.kind] || []).find((x) => x[0] === state.media.quality);
  if (m.kind === 'print') return q && q[2] ? q[2] : m.dpi;
  return Math.round(m.dpi * (q && q[2] ? q[2] : 1) * 100) / 100;
}

export function applyMediaPage(state, m, { relayout = false } = {}) {
  const old = { w: state.page.widthMM, h: state.page.heightMM };
  state.page.widthMM = m.page.w;
  state.page.heightMM = m.page.h;
  state.page.preset = 'custom';
  if (relayout) relayoutForPage(state, old.w, old.h);
}

// Reubica la composición cuando cambia el tamaño de la hoja: posiciones relativas al marco,
// zooms escalados y el mismo terreno visible (se ajusta la escala para que entre todo lo que se veía).
export function relayoutForPage(state, oldW, oldH) {
  const m = state.page.margins || { top: 0, right: 0, bottom: 0, left: 0 };
  const f0 = { x: m.left, y: m.top, w: oldW - m.left - m.right, h: oldH - m.top - m.bottom };
  const f1 = { x: m.left, y: m.top, w: state.page.widthMM - m.left - m.right, h: state.page.heightMM - m.top - m.bottom };
  if (!(f0.w > 0 && f0.h > 0 && f1.w > 0 && f1.h > 0)) return;
  const k = Math.min(f1.w / f0.w, f1.h / f0.h);
  const mapPt = (o, wMM = 0, hMM = 0) => {
    const rx = (o.x - f0.x) / f0.w, ry = (o.y - f0.y) / f0.h;
    o.x = Math.round((f1.x + rx * f1.w) * 10) / 10;
    o.y = Math.round((f1.y + ry * f1.h) * 10) / 10;
    if (wMM) o.x = Math.min(o.x, f1.x + f1.w - wMM - 1);
    if (hMM) o.y = Math.min(o.y, f1.y + f1.h - hMM - 1);
    o.x = Math.max(f1.x + 1, o.x); o.y = Math.max(f1.y + 1, o.y);
  };
  mapPt(state.legend, 40, 30);
  mapPt(state.north, state.north.size, state.north.size);
  mapPt(state.scalebar, state.scalebar.lengthMM + 6, 8);
  for (const z of state.insets) {
    z.w = Math.round(z.w * k * 10) / 10; z.h = Math.round(z.h * k * 10) / 10;
    if (z.mode === 'context') z.mpm = z.mpm / k;
    mapPt(z, z.w, z.h);
  }
  for (const t of state.texts) if (t.anchor === 'page') mapPt(t);
  state.view.mpm = state.view.mpm * Math.max(f0.w / f1.w, f0.h / f1.h);
}

// ---------- control de legibilidad ----------
function collect(state) {
  const texts = [], lines = [], symbols = [], patterns = [];
  for (const t of state.texts) texts.push({ name: `Texto «${(t.text || '').split('\n')[0].slice(0, 28)}»`, size: t.size, set: (v) => { t.size = v; } });
  if (state.legend.show) {
    texts.push({ name: 'Leyenda', size: state.legend.size, set: (v) => { state.legend.size = v; } });
    if (state.legend.title) texts.push({ name: 'Título de la leyenda', size: state.legend.titleSize, set: (v) => { state.legend.titleSize = v; } });
    symbols.push({ name: 'Símbolos de la leyenda', size: state.legend.symbolSize, set: (v) => { state.legend.symbolSize = v; } });
  }
  if (state.scalebar.show) texts.push({ name: 'Escala gráfica', size: state.scalebar.size, set: (v) => { state.scalebar.size = v; } });
  if (state.sites.length && state.siteStyle.label.show !== false && state.sites.some((s) => !s.label || s.label.show !== false)) {
    texts.push({ name: 'Rótulos de los sitios', size: state.siteStyle.label.size, set: (v) => { state.siteStyle.label.size = v; } });
  }
  if (state.sites.length && state.siteStyle.size > 0) symbols.push({ name: 'Símbolo de los sitios', size: state.siteStyle.size, set: (v) => { state.siteStyle.size = v; } });
  if (state.page.frame && state.page.frame.show) lines.push({ name: 'Marco', size: state.page.frame.width, set: (v) => { state.page.frame.width = v; } });
  for (const z of state.insets) {
    lines.push({ name: `Borde de «${z.name}»`, size: z.border.width, set: (v) => { z.border.width = v; } });
    if (z.connector.type !== 'none') lines.push({ name: `Conectores de «${z.name}»`, size: z.connector.width, set: (v) => { z.connector.width = v; } });
  }
  for (const ls of state.layers) {
    if (!ls.visible || !ls.style) continue;
    const def = ls.def === 'user' ? { kind: 'vector' } : defOf(ls);
    if (!def) continue;
    const st = ls.style;
    if (def.type === 'graticule') {
      lines.push({ name: 'Grilla de coordenadas', size: st.line.width, set: (v) => { st.line.width = v; }, ls });
      if (st.label && st.label.show) texts.push({ name: 'Rótulos de coordenadas', size: st.label.size, set: (v) => { st.label.size = v; }, ls });
      continue;
    }
    if (def.kind !== 'vector') continue;
    const g = def.geom;
    if (st.label && st.label.show) texts.push({ name: `Rótulos de «${ls.name}»`, size: st.label.size, set: (v) => { st.label.size = v; }, ls });
    if ((g === 'line' || g === 'mixed') && st.line) lines.push({ name: `Líneas de «${ls.name}»`, size: st.line.width, set: (v) => { st.line.width = v; }, ls });
    if (g === 'polygon' && st.polygon && st.polygon.strokeWidth > 0) lines.push({ name: `Contorno de «${ls.name}»`, size: st.polygon.strokeWidth, set: (v) => { st.polygon.strokeWidth = v; }, ls });
    if (g === 'polygon' && st.polygon && st.polygon.pattern && st.polygon.pattern !== 'none') patterns.push({ name: `Trama de «${ls.name}»`, mm: st.polygon.patternSpacing, set: (v) => { st.polygon.patternSpacing = v; }, ls });
    if (g === 'point' && st.point && st.point.shape !== 'none' && st.point.size > 0) symbols.push({ name: `Símbolos de «${ls.name}»`, size: st.point.size, set: (v) => { st.point.size = v; }, ls });
  }
  return { texts, lines, symbols, patterns };
}

export function checkLegibility(state, profileId) {
  const m = getMedia(profileId || state.media.profileId);
  const dpi = m.dpi;
  const ptToPx = (pt) => (pt * dpi) / 72;
  const issues = [];
  const { texts, lines, symbols, patterns } = collect(state);
  const minText = m.kind === 'print' ? m.min.textPt : (m.min.textPx * 72) / dpi;
  const minLine = m.kind === 'print' ? m.min.linePt : (m.min.linePx * 72) / dpi;
  const minSym = m.kind === 'print' ? m.min.symbolPt : (m.min.symbolPx * 72) / dpi;
  const unit = (pt) => (m.kind === 'print' ? `${fmt(pt)} pt` : `${Math.round(ptToPx(pt))} px`);
  for (const t of texts) if (t.size < minText - 1e-6) issues.push({ level: t.size < minText * 0.75 ? 'error' : 'warn', what: t.name, msg: `${unit(t.size)}; mínimo ${unit(minText)}` });
  for (const l of lines) if (l.size > 0 && l.size < minLine - 1e-6) issues.push({ level: l.size < minLine * 0.6 ? 'error' : 'warn', what: l.name, msg: `${unit(l.size)}; mínimo ${unit(minLine)}` });
  for (const s of symbols) if (s.size > 0 && s.size < minSym - 1e-6) issues.push({ level: 'warn', what: s.name, msg: `${unit(s.size)}; mínimo ${unit(minSym)}` });
  if (m.min.patternPx) {
    for (const p of patterns) {
      const px = (p.mm * dpi) / MM_PER_IN;
      if (px < m.min.patternPx) issues.push({ level: 'warn', what: p.name, msg: `separación de ${Math.round(px)} px: en pantalla produce muaré o se empasta (mínimo ${m.min.patternPx} px)` });
    }
  }
  // contraste del texto con el fondo
  if (m.min.contrast) {
    for (const t of state.texts) {
      if (t.haloWidth > 0 || (t.bg && t.bg.show)) continue;
      const cr = contrastRatio(t.color || '#000000', state.page.background || '#ffffff');
      if (cr < m.min.contrast) issues.push({ level: 'warn', what: `Texto «${(t.text || '').slice(0, 24)}»`, msg: `contraste ${cr.toFixed(1)}:1 con el fondo (mínimo ${m.min.contrast}:1); agregá halo o cambiá el color` });
    }
  }
  // grises
  if (state.render.colorMode === 'grises' || state.thesis.themeId === 'grises') {
    const cols = legendItems(state).filter((i) => !i.hidden).map((i) => (i.sym && (i.sym.cfg ? i.sym.cfg.fill : i.sym.line ? i.sym.line.color : i.sym.pg ? i.sym.pg.fill : i.sym.color))).filter(Boolean);
    if (cols.length > 1) {
      const d = grayDiagnostics(cols);
      if (d.minDeltaL !== null && d.minDeltaL < 15) issues.push({ level: 'warn', what: 'Leyenda en grises', msg: `dos elementos difieren solo ${Math.round(d.minDeltaL)} % en luminosidad: en blanco y negro se confunden (conviene ≥ 15 %); diferencialos con tramas, formas o tipos de línea` });
    }
  }
  if (m.id === 'videollamada') {
    for (const ls of state.layers) {
      if (!ls.visible || !ls.style || !ls.style.line) continue;
      const c = ls.style.line.color || '';
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      if (r > 170 && g < 90 && b < 90 && ls.style.line.width < 1.5) issues.push({ level: 'warn', what: `Líneas de «${ls.name}»`, msg: 'rojo fino: la compresión de video lo desdibuja; engrosalo o cambiá el tono' });
    }
  }
  return { media: m, issues, minText, minLine, minSym };
}

// Escala proporcionalmente textos, líneas y símbolos hasta los mínimos del destino (conserva la jerarquía)
export function fitToMedia(state, profileId) {
  const r = checkLegibility(state, profileId);
  const { texts, lines, symbols, patterns } = collect(state);
  const m = r.media;
  const factor = (items, min) => {
    const sizes = items.map((i) => i.size).filter((v) => v > 0);
    if (!sizes.length) return 1;
    return Math.min(4, Math.max(1, min / Math.min(...sizes)));
  };
  const ft = factor(texts, r.minText), fl = factor(lines, r.minLine), fs = factor(symbols, r.minSym);
  const touched = new Set();
  const round = (v) => Math.round(v * 100) / 100;
  // el más chico llega al mínimo y las diferencias se amplían con la raíz del factor:
  // se conserva el orden y algo de jerarquía sin que lo grande se vuelva enorme
  const lift = (items, f, min) => {
    const sizes = items.map((i) => i.size).filter((v) => v > 0);
    if (!sizes.length || f <= 1.001) return;
    const small = Math.min(...sizes);
    const g = Math.sqrt(f);
    items.forEach((it) => { if (it.size > 0) { it.set(round(Math.max(min, min + (it.size - small) * g))); if (it.ls) touched.add(it.ls); } });
  };
  lift(texts, ft, r.minText);
  lift(lines, fl, r.minLine);
  lift(symbols, fs, r.minSym);
  if (m.min.patternPx) patterns.forEach((p) => { const minMM = (m.min.patternPx * MM_PER_IN) / m.dpi; if (p.mm < minMM) { p.set(round(minMM)); touched.add(p.ls); } });
  touched.forEach((ls) => { ls._styleVersion = (ls._styleVersion || 0) + 1; });
  return { ft, fl, fs };
}

function fmt(v) { return (Math.round(v * 100) / 100).toString().replace('.', ','); }

// ---------- simulación de la vista ----------
export const SIMULATIONS = [
  ['none', 'Sin simular'],
  ['grises', 'Impresión en escala de grises'],
  ['fotocopia', 'Fotocopia en blanco y negro'],
  ['proyector', 'Proyector en sala iluminada'],
  ['videollamada', 'Videollamada (720p comprimido)'],
  ['deutan', 'Daltonismo: deuteranopía'],
  ['protan', 'Daltonismo: protanopía'],
  ['tritan', 'Daltonismo: tritanopía'],
];

export function simulationFilter(state, pxPerMm) {
  const parts = [];
  if (state.render.colorMode === 'grises') parts.push('grayscale(1)');
  const sim = state.render.simulate;
  const m = getMedia(state.media.profileId);
  if (sim === 'grises') parts.push('grayscale(1)');
  else if (sim === 'fotocopia') parts.push('grayscale(1) contrast(1.9) brightness(1.08)');
  else if (sim === 'proyector') parts.push('contrast(0.78) brightness(1.08) saturate(0.82)');
  else if (sim === 'videollamada') {
    const outPxMM = (m.kind === 'screen' ? m.dpi : 144) * (720 / 1080) / MM_PER_IN;
    const r = Math.max(0.3, (pxPerMm / outPxMM) * 0.55);
    parts.push(`blur(${r.toFixed(2)}px) saturate(0.88) contrast(0.95)`);
  } else if (sim === 'deutan' || sim === 'protan' || sim === 'tritan') parts.push(`url(#cvd-${sim})`);
  return parts.join(' ');
}
