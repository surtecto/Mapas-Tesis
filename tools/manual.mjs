// Arma docs/manual-mapas-tesis.pdf con el mismo contenido que muestra la ayuda (src/manual.js).
// Uso: node tools/manual.mjs   (necesita Playwright con Chromium; las tipografías se toman de node_modules si están)
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { QUICK, FAQ, MANUAL, MANUAL_VERSION } = await import(pathToFileURL(path.resolve('src/manual.js')).href);
const FONTS = process.env.MANUAL_FONTS || 'node_modules';
const ff = (p) => pathToFileURL(path.resolve(FONTS, p)).href;
const icon = `data:image/svg+xml;base64,${readFileSync('assets/icon.svg').toString('base64')}`;
const img = (f) => pathToFileURL(path.resolve('docs/manual/img', `${f}.jpg`)).href;
let fig = 0;
const figure = ([f, cap, kind]) => (existsSync(`docs/manual/img/${f}.jpg`) ? `<figure class="fig ${kind}"><img src="${img(f)}"><figcaption><b>Figura ${++fig}.</b> ${cap}</figcaption></figure>` : '');
const section = (s) => {
  const floats = s.figs.filter((x) => x[2] === 'panel' || x[2] === 'media'), rest = s.figs.filter((x) => x[2] === 'ancha'), pair = s.figs.filter((x) => x[2] === 'par');
  return `<section id="${s.id}"><h3>${s.t}</h3>${floats.map(figure).join('')}${s.h}${pair.length ? `<div class="pair">${pair.map(figure).join('')}</div>` : ''}${rest.map(figure).join('')}<div class="clear"></div></section>`;
};
const chapters = MANUAL.map((c, i) => `<article class="chapter${[10].includes(i) ? ' np' : ''}" id="cap-${i + 1}"><h2><span>${i + 2}</span>${c.t}</h2>${c.intro ? `<p class="intro">${c.intro}</p>` : ''}${c.s.map(section).join('')}</article>`).join('');
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Mapas-Tesis ${MANUAL_VERSION} · Manual de uso</title><style>
@font-face{font-family:Archivo;src:url(${ff('@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2')}) format('woff2');font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:Sans3;src:url(${ff('@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2')}) format('woff2');font-weight:400}
@font-face{font-family:Sans3;src:url(${ff('@fontsource/source-sans-3/files/source-sans-3-latin-400-italic.woff2')}) format('woff2');font-weight:400;font-style:italic}
@font-face{font-family:Sans3;src:url(${ff('@fontsource/source-sans-3/files/source-sans-3-latin-700-normal.woff2')}) format('woff2');font-weight:700}
@page{size:A4;margin:20mm 18mm 20mm 20mm}
*{box-sizing:border-box} html{font-family:Sans3,'Source Sans 3',system-ui,sans-serif;font-size:10.4pt;line-height:1.46;color:#14263a}
body{margin:0} p{margin:0 0 2.6mm;orphans:3;widows:3} ul,ol{margin:0 0 3mm;padding-left:5.5mm} li{margin-bottom:1.1mm}
h1,h2,h3{font-family:Archivo,sans-serif;font-stretch:110%;line-height:1.05;margin:0}
.cover{height:255mm;display:flex;flex-direction:column;break-after:page}
.cover .top{display:flex;align-items:center;gap:5mm;font-family:Archivo;font-weight:800;font-stretch:110%;font-size:17pt}
.cover .top img{width:17mm;height:17mm}
.cover .tag{font-weight:700;font-size:9pt;letter-spacing:.14em;background:#e8501c;color:#fff;padding:1.4mm 3.4mm;border-radius:99px;margin-left:auto}
.cover h1{font-weight:830;font-size:50pt;letter-spacing:-.012em;margin-top:30mm}
.cover h1 span{color:#e8501c}
.cover .sub{font-size:15pt;line-height:1.3;margin-top:7mm;max-width:140mm;color:#2c3e50}
.cover .maps{display:flex;gap:7mm;margin-top:14mm} .cover .maps img{width:62mm;box-shadow:0 0 0 .3mm rgba(20,38,58,.25),0 6mm 12mm -6mm rgba(20,38,58,.5)}
.cover .maps img:first-child{transform:rotate(-2.5deg)} .cover .maps img:last-child{transform:rotate(2deg);margin-top:5mm}
.cover .foot{margin-top:auto;font-size:10pt;color:#3c4f61;border-top:.3mm solid #14263a;padding-top:3mm;display:flex;justify-content:space-between;gap:10mm}
.toc{break-after:page} .toc h2,.chapter>h2{font-weight:820;font-size:23pt;margin-bottom:4mm;display:flex;gap:4mm;align-items:baseline}
.chapter>h2 span{color:#e8501c;font-size:16pt} .toc ol{list-style:none;padding:0;columns:2;column-gap:10mm} .toc li{break-inside:avoid;margin-bottom:3.2mm}
.toc a{color:inherit;text-decoration:none} .toc b{font-family:Archivo;font-size:11.5pt} .toc small{display:block;color:#5a6875;font-size:9pt;line-height:1.3}
.chapter{margin-top:11mm;padding-top:6mm;border-top:.5mm solid #14263a} .chapter.np{break-before:page;margin-top:0;padding-top:0;border-top:0} .chapter>h2{break-after:avoid} .fig.ancha{width:86%;margin-left:auto;margin-right:auto} .intro{font-size:12pt;line-height:1.35;color:#2c3e50;margin-bottom:5mm;max-width:150mm}
section{margin-bottom:5mm} h3{font-weight:760;font-size:13.5pt;margin:5mm 0 2mm;break-after:avoid;color:#14263a}
h3::before{content:'';display:inline-block;width:2.2mm;height:2.2mm;background:#e8501c;margin-right:2.4mm;transform:translateY(-.6mm)}
.fig{margin:3mm 0 4mm;break-inside:avoid} .fig img{display:block;width:100%;border:.25mm solid #b9c2c9;border-radius:1mm}
.fig figcaption{font-size:8.6pt;color:#4a5a67;margin-top:1.4mm;line-height:1.3}
.fig.panel{float:right;width:60mm;margin:1mm 0 3mm 6mm} .fig.media{float:right;width:78mm;margin:1mm 0 3mm 6mm}
.fig.panel+.fig.panel{clear:right} .pair{display:flex;gap:6mm;margin-top:3mm} .pair .fig{flex:1;margin:0} .clear{clear:both}
.quick{counter-reset:p;list-style:none;padding:0} .quick li{counter-increment:p;display:grid;grid-template-columns:10mm 1fr;margin-bottom:3.4mm;break-inside:avoid}
.quick li::before{content:counter(p);width:7.5mm;height:7.5mm;border-radius:50%;background:#e8501c;color:#fff;display:grid;place-items:center;font-weight:700;grid-row:1/3}
.quick b{font-size:11.5pt} .faq dt{font-weight:700;margin-top:3.4mm;break-after:avoid} .faq dd{margin:0.8mm 0 0 0} .faq div{break-inside:avoid}
</style></head><body>
<div class="cover"><div class="top"><img src="${icon}">Mapas-Tesis<span class="tag">VERSIÓN ${MANUAL_VERSION}</span></div>
<h1>Manual <span>de uso</span></h1><p class="sub">Cómo hacer las figuras cartográficas de una tesis, una investigación o una publicación: de los datos a la figura exportada, con los fundamentos para defenderla.</p>
<div class="maps"><img src="${img('mapa1')}"><img src="${img('clasif')}"></div>
<div class="foot"><span>Arq. Juan Patricio Addesso, doctorando en Geografía (Universidad del Salvador)<br>surtecto.github.io/Mapas-Tesis · Instagram @surtectura.s</span><span>Noviembre de 2026<br>Licencia CC BY 4.0</span></div></div>
<div class="toc"><h2>Contenido</h2><ol><li><a href="#cap-0"><b>1. Guía rápida</b><small>De un proyecto vacío a la figura exportada, en siete pasos.</small></a></li>
${MANUAL.map((c, i) => `<li><a href="#cap-${i + 1}"><b>${i + 2}. ${c.t}</b><small>${c.s.map((s) => s.t).join(' · ')}</small></a></li>`).join('')}
<li><a href="#cap-faq"><b>${MANUAL.length + 2}. Preguntas comunes</b><small>${FAQ.length} respuestas breves.</small></a></li></ol></div>
<article class="chapter np" id="cap-0" style="break-before:auto"><h2><span>1</span>Guía rápida</h2><p class="intro">De un proyecto vacío a la figura exportada, en siete pasos. Cada uno está desarrollado en los capítulos que siguen.</p>
<ol class="quick">${QUICK.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>
<p>Dentro de la aplicación, el botón <b>Ayuda</b> (en el inicio y en la barra superior del editor) muestra esta guía, las preguntas comunes y este manual, con un buscador para preguntar.</p></article>
${chapters}
<article class="chapter np" id="cap-faq"><h2><span>${MANUAL.length + 2}</span>Preguntas comunes</h2><dl class="faq">${FAQ.map(([q, a]) => `<div><dt>${q}</dt><dd>${a}</dd></div>`).join('')}</dl></article>
</body></html>`;
writeFileSync('docs/manual/manual.html', html);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(pathToFileURL(path.resolve('docs/manual/manual.html')).href); await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: 'docs/manual-mapas-tesis.pdf', format: 'A4', printBackground: true, displayHeaderFooter: true, margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '18mm' },
  headerTemplate: '<span></span>', footerTemplate: `<div style="width:100%;font-family:sans-serif;font-size:7.5pt;color:#6b7783;padding:0 20mm;display:flex;justify-content:space-between"><span>Mapas-Tesis ${MANUAL_VERSION} · Manual de uso</span><span class="pageNumber"></span></div>` });
await b.close(); console.log('manual listo, figuras:', fig);
