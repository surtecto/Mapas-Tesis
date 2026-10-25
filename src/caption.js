// Epígrafe científico: proyección, datum, sitios y fuentes de las capas visibles
import { getDef } from './catalog.js';
import { projInfo } from './projections.js';
import { formatDMS } from './util.js';
import { georefModel } from './layers.js';
import { modelSummary } from './georef.js';

const PROJ_SHORT = {
  'EPSG:3031': 'WGS 84 / estereográfica polar antártica (EPSG:3031)',
  'CONI:BICONT': 'Lambert acimutal equivalente centrada en 40°S 60°O (bicontinental IGN), WGS 84',
  'EPSG:6932': 'WGS 84 / Lambert acimutal equivalente polar sur (EPSG:6932)',
  'EPSG:32721': 'WGS 84 / UTM zona 21S (EPSG:32721)',
  'EPSG:32720': 'WGS 84 / UTM zona 20S (EPSG:32720)',
  'EPSG:3857': 'WGS 84 / Pseudo-Mercator (EPSG:3857)',
  'EPSG:4326': 'coordenadas geográficas WGS 84 (EPSG:4326)',
};
for (let i = 1; i <= 7; i++) {
  PROJ_SHORT[`EPSG:${5342 + i}`] = `POSGAR 2007 / Argentina faja ${i}, Gauss-Krüger (EPSG:${5342 + i})`;
  PROJ_SHORT[`EPSG:${22190 + i}`] = `Campo Inchauspe / Argentina faja ${i}, Gauss-Krüger (EPSG:${22190 + i})`;
}

export function sourceCitation(src) {
  const who = src.author ? src.author.trim() : 'Autor no identificado';
  const yr = src.year ? ` (${String(src.year).trim()})` : ' (s. f.)';
  const parts = [`${who}${yr}. ${src.title || 'Plano sin título'}`];
  const where = [src.archive, src.ref].filter(Boolean).join(', ');
  if (where) parts.push(where);
  if (src.url) parts.push(src.url);
  return parts.join('. ').replace(/\.\./g, '.');
}

export function visibleDefs(state) {
  const seen = new Set();
  const defs = [];
  const insetOverrides = state.insets.flatMap((z) => Object.entries(z.layers || {}).filter(([, v]) => v === true).map(([k]) => k));
  for (const ls of state.layers) {
    if (!ls.visible && !insetOverrides.includes(ls.uid)) continue;
    const d = ls.def === 'user' ? { cite: `${ls.name} (datos propios)`, attribution: ls.name } : getDef(ls.def);
    if (!d || !d.cite) continue;
    if (seen.has(d.cite)) continue;
    seen.add(d.cite);
    defs.push(d);
  }
  return defs;
}

export function sourcesShort(state) {
  const set = new Set(visibleDefs(state).map((d) => d.attribution).filter(Boolean));
  return Array.from(set).join('; ');
}

export function buildCaption(state) {
  const parts = [];
  const c = state.caption || {};
  if (c.figure) parts.push(`${c.figure}.`);
  if (c.lead) parts.push(c.lead.trim().replace(/\.?$/, '.'));
  if (c.withSites !== false && state.sites.length) {
    const s = state.sites.map((x) => {
      const note = c.withNotes && x.note ? `, ${x.note}` : '';
      return `${x.name} (${formatDMS(x.lat, true, { seconds: false })}, ${formatDMS(x.lon, false, { seconds: false })}${note})`;
    });
    parts.push(`Sitios: ${s.join('; ')}.`);
  }
  const usedProj = new Set([state.projection, ...state.insets.filter((z) => z.projection && z.projection !== 'same').map((z) => z.projection)]);
  const projTxt = Array.from(usedProj).map((p) => PROJ_SHORT[p] || projInfo(p).name).join('; recuadro: ');
  parts.push(`Proyección: ${projTxt}.`);
  const cites = visibleDefs(state).map((d) => d.cite.replace(/\.$/, ''));
  if (cites.length) parts.push(`Fuentes: ${cites.join('; ')}.`);
  const interp = interpCaption(state);
  if (interp) parts.push(interp);
  const dem = state.layers.find((l) => l.visible && l.def === 'dem-analitico' && l.params && l.params.shade && Number(l.params.zFactor) > 1.5);
  if (dem) parts.push(`Relieve sombreado con exageración vertical ×${dem.params.zFactor}.`);
  const cr = creditsLine(state);
  if (cr) parts.push(cr);
  return parts.join(' ');
}

// Autoría de la figura (desde los datos del proyecto)
export function creditsLine(state) {
  const c = state.caption || {};
  const k = state.credits || {};
  if (c.withAuthor === false || !k.author) return '';
  const who = [k.author.trim(), k.year ? `(${String(k.year).trim()})` : ''].filter(Boolean).join(' ');
  const inst = k.institution ? `, ${k.institution.trim()}` : '';
  const lic = k.license ? ` Licencia ${k.license}.` : '';
  return `Elaboración: ${who}${inst}.${lic}`.replace(/\.\./g, '.');
}

// Mapas de interpretación: versión, fuentes históricas y método de georreferenciación
export function interpCaption(state) {
  const it = state.interp;
  const shown = state.layers.filter((l) => l.visible && (l.def === 'interp' || l.def === 'georef'));
  if (!shown.length) return '';
  const out = [];
  const iv = shown.find((l) => l.def === 'interp' && !(l.params && l.params.ghost));
  const ver = it.versions.find((v) => v.id === it.active);
  const srcIds = new Set(shown.filter((l) => l.def === 'georef').map((l) => l.params.sourceId));
  if (ver) for (const f of ver.features.features || []) if (f.properties && f.properties.src) srcIds.add(f.properties.src);
  const srcs = it.sources.filter((x) => srcIds.has(x.id));
  if (iv && ver) {
    const d = new Date(ver.created);
    const fecha = Number.isFinite(d.getTime()) ? d.toLocaleDateString('es-AR') : '';
    out.push(`Mapa de interpretación «${ver.name}»${fecha ? ` (${fecha})` : ''}${ver.author ? `, ${ver.author}` : ''}: elaboración propia${srcs.length ? ' sobre' : ''}`);
  } else if (srcs.length) out.push('Plano histórico superpuesto');
  if (srcs.length) out[out.length - 1] += ` ${srcs.map(sourceCitation).join('; ')}`;
  if (out.length) out[out.length - 1] += '.';
  const geos = srcs.map((x) => { const { model } = georefModel(state, x.id); return model && model.ok ? `${x.title || 'plano'}: ${modelSummary(model)}` : null; }).filter(Boolean);
  if (geos.length) out.push(`Georreferenciación: ${geos.join('; ')}.`);
  if (iv && ver) {
    const certs = new Set((ver.features.features || []).map((f) => (f.properties && f.properties.cert) || 'cierta'));
    if (certs.size > 1 || !certs.has('cierta')) out.push('Trazo lleno: documentado en la fuente; guiones: inferido; puntos: conjetural.');
  }
  const ghost = shown.find((l) => l.def === 'interp' && l.params && l.params.ghost);
  if (ghost) { const gv = it.versions.find((v) => v.id === ghost.params.version); if (gv) out.push(`En gris, la versión «${gv.name}» para comparar.`); }
  return out.join(' ');
}
