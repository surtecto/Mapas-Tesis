// Contexto "tipo Canvas 2D" que escribe SVG: permite reutilizar el mismo código de dibujo
// de la composición (textos, leyenda, norte, escala, conectores) y obtener vectores editables.
import { escapeXml } from './util.js';

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const f = (v) => (Math.round(v * 1000) / 1000).toString();

let measureCanvas = null;
function measurer() {
  if (!measureCanvas) measureCanvas = document.createElement('canvas').getContext('2d');
  return measureCanvas;
}

function parseFont(font) {
  const m = /^(italic\s+)?(\d+)\s+([\d.]+)px\s+(.*)$/.exec(font || '');
  if (!m) return { italic: false, weight: 400, size: 10, family: 'sans-serif' };
  return { italic: !!m[1], weight: Number(m[2]), size: Number(m[3]), family: m[4] };
}

export class SvgCtx {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.parts = [];
    this.defs = [];
    this.idc = 0;
    this.st = this._fresh();
    this.stack = [];
    this.d = '';
    this.cur = null;
    this.canvas = { width, height };
  }

  _fresh() {
    return { m: [1, 0, 0, 1, 0, 0], fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', dash: [], font: '400 10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1, letterSpacing: '0px', groups: 0, filter: 'none', globalCompositeOperation: 'source-over' };
  }

  // propiedades estilo canvas
  get fillStyle() { return this.st.fillStyle; } set fillStyle(v) { this.st.fillStyle = v; }
  get strokeStyle() { return this.st.strokeStyle; } set strokeStyle(v) { this.st.strokeStyle = v; }
  get lineWidth() { return this.st.lineWidth; } set lineWidth(v) { this.st.lineWidth = v; }
  get lineCap() { return this.st.lineCap; } set lineCap(v) { this.st.lineCap = v; }
  get lineJoin() { return this.st.lineJoin; } set lineJoin(v) { this.st.lineJoin = v; }
  get font() { return this.st.font; } set font(v) { this.st.font = v; }
  get textAlign() { return this.st.textAlign; } set textAlign(v) { this.st.textAlign = v; }
  get textBaseline() { return this.st.textBaseline; } set textBaseline(v) { this.st.textBaseline = v; }
  get globalAlpha() { return this.st.globalAlpha; } set globalAlpha(v) { this.st.globalAlpha = v; }
  get letterSpacing() { return this.st.letterSpacing; } set letterSpacing(v) { this.st.letterSpacing = v; }
  get filter() { return this.st.filter; } set filter(v) { this.st.filter = v; }
  get globalCompositeOperation() { return this.st.globalCompositeOperation; } set globalCompositeOperation(v) { this.st.globalCompositeOperation = v; }

  save() { const saved = this.st; this.stack.push(saved); this.st = { ...saved, m: saved.m.slice(), dash: saved.dash.slice(), groups: 0 }; }
  restore() {
    for (let i = 0; i < this.st.groups; i++) this.parts.push('</g>');
    const prev = this.stack.pop();
    if (prev) this.st = prev;
  }
  setLineDash(a) { this.st.dash = (a || []).slice(); }
  getLineDash() { return this.st.dash.slice(); }
  translate(x, y) { this.st.m = mul(this.st.m, [1, 0, 0, 1, x, y]); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.st.m = mul(this.st.m, [c, s, -s, c, 0, 0]); }
  scale(x, y) { this.st.m = mul(this.st.m, [x, 0, 0, y, 0, 0]); }
  setTransform(a, b, c, d, e, g) { this.st.m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, g]; }
  transform(a, b, c, d, e, g) { this.st.m = mul(this.st.m, [a, b, c, d, e, g]); }
  _pt(x, y) { const m = this.st.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  _scale() { const m = this.st.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); }

  beginPath() { this.d = ''; this.cur = null; }
  moveTo(x, y) { const p = this._pt(x, y); this.d += `M${f(p[0])} ${f(p[1])}`; this.cur = p; this.start = p; }
  lineTo(x, y) { const p = this._pt(x, y); this.d += (this.cur ? 'L' : 'M') + `${f(p[0])} ${f(p[1])}`; if (!this.cur) this.start = p; this.cur = p; }
  closePath() { if (this.d) this.d += 'Z'; this.cur = this.start; }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  roundRect(x, y, w, h, r) {
    const rr = Math.min(Number(Array.isArray(r) ? r[0] : r) || 0, w / 2, h / 2);
    this.moveTo(x + rr, y); this.lineTo(x + w - rr, y); this.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
    this.lineTo(x + w, y + h - rr); this.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
    this.lineTo(x + rr, y + h); this.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
    this.lineTo(x, y + rr); this.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5); this.closePath();
  }
  arc(cx, cy, r, a0, a1, ccw = false) {
    let sweep = ccw ? a0 - a1 : a1 - a0;
    const full = Math.abs(sweep) >= Math.PI * 2 - 1e-6;
    const sp = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
    const P = this._pt(sp[0], sp[1]);
    this.d += (this.cur ? 'L' : 'M') + `${f(P[0])} ${f(P[1])}`;
    if (!this.cur) this.start = P;
    const R = r * this._scale();
    const sf = ccw ? 0 : 1;
    if (full) {
      const mid = [cx + Math.cos(a0 + Math.PI) * r, cy + Math.sin(a0 + Math.PI) * r];
      const M = this._pt(mid[0], mid[1]);
      this.d += `A${f(R)} ${f(R)} 0 0 ${sf} ${f(M[0])} ${f(M[1])}A${f(R)} ${f(R)} 0 0 ${sf} ${f(P[0])} ${f(P[1])}`;
      this.cur = P;
      return;
    }
    if (sweep < 0) sweep += Math.PI * 2;
    const ep = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    const E = this._pt(ep[0], ep[1]);
    this.d += `A${f(R)} ${f(R)} 0 ${sweep > Math.PI ? 1 : 0} ${sf} ${f(E[0])} ${f(E[1])}`;
    this.cur = E;
  }
  ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) { this.arc(cx, cy, rx, a0, a1, ccw); }

  _paint(style) {
    if (typeof style === 'string') return style;
    return 'none';
  }
  _alphaAttr(name) { return this.st.globalAlpha < 1 ? ` ${name}="${f(this.st.globalAlpha)}"` : ''; }

  fill(rule) {
    if (!this.d) return;
    const paint = this._paint(this.st.fillStyle);
    if (paint === 'none') return;
    this.parts.push(`<path d="${this.d}" fill="${paint}"${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${this._alphaAttr('opacity')}/>`);
  }
  stroke() {
    if (!this.d) return;
    const w = this.st.lineWidth * this._scale();
    const dash = this.st.dash.length ? ` stroke-dasharray="${this.st.dash.map((v) => f(v * this._scale())).join(' ')}"` : '';
    this.parts.push(`<path d="${this.d}" fill="none" stroke="${this._paint(this.st.strokeStyle)}" stroke-width="${f(w)}" stroke-linecap="${this.st.lineCap}" stroke-linejoin="${this.st.lineJoin}"${dash}${this._alphaAttr('opacity')}/>`);
  }
  fillRect(x, y, w, h) { const d = this.d, c = this.cur; this.beginPath(); this.rect(x, y, w, h); this.fill(); this.d = d; this.cur = c; }
  strokeRect(x, y, w, h) { const d = this.d, c = this.cur; this.beginPath(); this.rect(x, y, w, h); this.stroke(); this.d = d; this.cur = c; }
  clearRect() { /* sin efecto en SVG */ }
  clip(rule) {
    if (!this.d) return;
    const id = `clip${++this.idc}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.d}"${rule === 'evenodd' ? ' clip-rule="evenodd"' : ''}/></clipPath>`);
    this.parts.push(`<g clip-path="url(#${id})">`);
    this.st.groups += 1;
  }

  _textAttrs() {
    const fo = parseFont(this.st.font);
    const anchor = { center: 'middle', right: 'end', end: 'end' }[this.st.textAlign] || 'start';
    const base = { middle: 'central', top: 'hanging', hanging: 'hanging', bottom: 'text-after-edge' }[this.st.textBaseline] || 'auto';
    const ls = parseFloat(this.st.letterSpacing) || 0;
    const m = this.st.m;
    return `font-family="${escapeXml(fo.family.replace(/"/g, "'"))}" font-size="${f(fo.size)}" font-weight="${fo.weight}"${fo.italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" dominant-baseline="${base}"${ls ? ` letter-spacing="${f(ls)}"` : ''} transform="matrix(${m.map(f).join(' ')})"`;
  }
  fillText(text, x, y) {
    const paint = this._paint(this.st.fillStyle);
    this.parts.push(`<text x="${f(x)}" y="${f(y)}" ${this._textAttrs()} fill="${paint}"${this._alphaAttr('opacity')}>${escapeXml(text)}</text>`);
  }
  strokeText(text, x, y) {
    this.parts.push(`<text x="${f(x)}" y="${f(y)}" ${this._textAttrs()} fill="none" stroke="${this._paint(this.st.strokeStyle)}" stroke-width="${f(this.st.lineWidth)}" stroke-linejoin="round">${escapeXml(text)}</text>`);
  }
  measureText(text) {
    const fo = parseFont(this.st.font);
    const k = 100 / Math.max(fo.size, 0.01);
    const mc = measurer();
    mc.font = `${fo.italic ? 'italic ' : ''}${fo.weight} ${(fo.size * k).toFixed(2)}px ${fo.family}`;
    if ('letterSpacing' in mc) mc.letterSpacing = `${(parseFloat(this.st.letterSpacing) || 0) * k}px`;
    const w = mc.measureText(text).width / k;
    if ('letterSpacing' in mc) mc.letterSpacing = '0px';
    return { width: w };
  }
  createPattern() { return null; }
  drawImage(img, x, y, w, h) {
    const src = img.toDataURL ? img.toDataURL('image/png') : img.src;
    const ww = w == null ? img.width : w, hh = h == null ? img.height : h;
    const m = this.st.m;
    this.parts.push(`<image x="${f(x)}" y="${f(y)}" width="${f(ww)}" height="${f(hh)}" transform="matrix(${m.map(f).join(' ')})" preserveAspectRatio="none" href="${src}"${this._alphaAttr('opacity')}/>`);
  }
  beginGroup(id, label) {
    this.parts.push(`<g id="${escapeXml(id)}" inkscape:groupmode="layer" inkscape:label="${escapeXml(label || id)}">`);
  }
  endGroup() { this.parts.push('</g>'); }

  toString(widthMM, heightMM, title = '', { gray = false } = {}) {
    const defs = this.defs.join('') + (gray ? '<filter id="escala-de-grises"><feColorMatrix type="saturate" values="0"/></filter>' : '');
    const body = gray ? `<g id="figura" filter="url(#escala-de-grises)">\n${this.parts.join('\n')}\n</g>` : this.parts.join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(widthMM)}mm" height="${f(heightMM)}mm" viewBox="0 0 ${f(this.width)} ${f(this.height)}">\n<title>${escapeXml(title)}</title>\n<defs>${defs}</defs>\n${body}\n</svg>`;
  }
}
