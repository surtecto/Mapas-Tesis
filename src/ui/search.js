// Búsqueda de lugares: coordenadas, Georef (Argentina, datos oficiales) y Nominatim (OpenStreetMap)
import { el, clear, parseCoordPair, formatDMS } from '../util.js';

const GEOREF = 'https://apis.datos.gob.ar/georef/api';

async function getJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function searchPlaces(q) {
  const out = [];
  const c = parseCoordPair(q);
  if (c && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180) {
    out.push({ name: `${formatDMS(c.lat, true)} ${formatDMS(c.lon, false)}`, detail: 'Coordenadas', lon: c.lon, lat: c.lat, kind: 'coord', src: '' });
    return out;
  }
  const enc = encodeURIComponent(q);
  const jobs = [
    getJSON(`${GEOREF}/departamentos?nombre=${enc}&max=3&campos=completo`).then((j) => (j.departamentos || []).map((d) => ({
      name: d.nombre, detail: `Partido o departamento · ${d.provincia ? d.provincia.nombre : ''}`, lon: d.centroide.lon, lat: d.centroide.lat, kind: 'departamento', src: 'Georef', km: 45,
    }))).catch(() => []),
    getJSON(`${GEOREF}/localidades?nombre=${enc}&max=6&campos=completo`).then((j) => (j.localidades || []).map((d) => ({
      name: d.nombre, detail: `Localidad · ${[d.departamento && d.departamento.nombre, d.provincia && d.provincia.nombre].filter(Boolean).join(', ')}`, lon: d.centroide.lon, lat: d.centroide.lat, kind: 'localidad', src: 'Georef', km: 8,
    }))).catch(() => []),
    getJSON(`${GEOREF}/provincias?nombre=${enc}&max=2&campos=completo`).then((j) => (j.provincias || []).map((d) => ({
      name: d.nombre, detail: 'Provincia', lon: d.centroide.lon, lat: d.centroide.lat, kind: 'provincia', src: 'Georef', km: 650,
    }))).catch(() => []),
    getJSON(`https://nominatim.openstreetmap.org/search?q=${enc}&format=jsonv2&limit=6&accept-language=es`).then((arr) => (arr || []).map((d) => {
      const bb = (d.boundingbox || []).map(Number);
      return { name: d.name || d.display_name.split(',')[0], detail: d.display_name, lon: Number(d.lon), lat: Number(d.lat), kind: d.type, src: 'OpenStreetMap', bbox: bb.length === 4 ? [bb[2], bb[0], bb[3], bb[1]] : null };
    })).catch(() => []),
  ];
  const res = await Promise.all(jobs);
  const seen = [];
  for (const r of res.flat()) {
    if (!Number.isFinite(r.lon) || !Number.isFinite(r.lat)) continue;
    if (seen.some((s) => Math.abs(s.lon - r.lon) < 0.02 && Math.abs(s.lat - r.lat) < 0.02 && s.name.toLowerCase() === r.name.toLowerCase())) continue;
    seen.push(r);
  }
  return seen.slice(0, 12);
}

export function setupSearch(app) {
  const inp = document.getElementById('place-search');
  const list = document.getElementById('place-results');
  if (!inp || !list) return;
  let seq = 0;
  const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
  const run = async () => {
    const q = inp.value.trim();
    if (q.length < 2) { close(); return; }
    const my = ++seq;
    clear(list);
    list.append(el('li', { class: 'pr-wait' }, 'Buscando…'));
    list.hidden = false; inp.setAttribute('aria-expanded', 'true');
    const res = await searchPlaces(q);
    if (my !== seq) return;
    clear(list);
    if (!res.length) { list.append(el('li', { class: 'pr-wait' }, 'Sin resultados (probá con otro nombre o con coordenadas «lat, lon»).')); return; }
    for (const r of res) {
      const li = el('li', { role: 'option', tabindex: '-1' },
        el('button', { type: 'button', class: 'pr-go', onclick: () => { goTo(app, r); close(); } }, el('strong', {}, r.name), el('span', {}, `${r.detail}${r.src ? ` · ${r.src}` : ''}`)),
        el('button', { type: 'button', class: 'pr-add', title: 'Agregar como sitio de estudio', 'aria-label': `Agregar ${r.name} como sitio`, onclick: () => { app.addSiteAt(r.name, r.lon, r.lat); close(); } }, '+ sitio'));
      list.append(li);
    }
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') { const b = list.querySelector('button'); if (b) { e.preventDefault(); b.focus(); } }
  });
  document.getElementById('place-go').addEventListener('click', run);
  document.addEventListener('click', (e) => { if (!list.contains(e.target) && e.target !== inp) close(); });
}

export function goTo(app, r) {
  let km = r.km || 15;
  if (r.bbox) {
    const [w, s, e, n] = r.bbox;
    km = Math.max(0.6, Math.max((e - w) * 111.32 * Math.cos((r.lat * Math.PI) / 180), (n - s) * 110.6));
  }
  const f = app.frameSize();
  const mpm = (km * 1000 * 1.25) / Math.max(20, Math.min(f.w, f.h));
  app.flyTo([r.lon, r.lat], mpm);
  app.lastPlace = r;
  app.toast(`${r.name}: ${r.detail}`);
}
