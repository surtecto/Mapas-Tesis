// Interpretación del tema de tesis y de la geografía del sitio.
// No es un oráculo: lee palabras del tema, la ubicación y el relieve, propone un lenguaje gráfico
// y devuelve preguntas para que la figura no afirme más (ni menos) de lo que la investigación sostiene.
import { EMBEDDED } from './embedded.js';
import { pointInPolygon } from './util.js';
import { posgarCode, gkFaja } from './projections.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const TRAITS = [
  { id: 'historico', label: 'Histórico y de archivo', theme: 'tinta-historica',
    re: [/histor/, /siglo (xvi|xvii|xviii|xix)/, /colonial/, /virrein/, /archivo/, /mensura/, /duplicado/, /agrimens/, /\b1[5-8]\d\d\b/, /\b19[0-4]\d\b/, /enfiteusis/, /\bpagos?\b/, /genealog/, /fortin/, /cabildo/, /suertes? de estancia/, /planos? (antiguo|historic)/, /cartografia historica/, /catastro historico/, /registro grafico/, /poblamiento/],
    layers: ['atlas-mensuras', 'atlas-caminos', 'atlas-estancias1884', 'ign-cartas50'],
    symb: 'Trazo fino de tinta, aguas en azul grisáceo, rótulos en serif de grabado; los períodos se colorean con una escala secuencial (más oscuro, más antiguo).',
    questions: [
      '¿El mapa nuevo reproduce la mirada del agrimensor (el campo como parcela medida) o la discute?',
      '¿Qué quedó fuera de los planos que usás como fuente: puestos, ranchos, sendas, habitantes sin título?',
      'Si la fecha es parte del argumento, ¿se lee en la figura (leyenda por períodos, fecha de cada fuente) o solo en el texto?',
    ] },
  { id: 'paisaje', label: 'Paisaje, percepción y habitar', theme: 'paisaje-pampeano',
    re: [/paisaje/, /percep/, /fenomenolog/, /habitar/, /\blugar(es)?\b/, /identidad/, /experienc/, /llanura/, /horizonte/, /sensib/, /autoetnog/, /geopoetic/, /mirada/, /vivencia/, /situad/, /geocultura/, /estar\b/],
    layers: ['dem-analitico', 'ign-rios', 'ign-rios-int', 'ign-banados', 'ign-caminos'],
    symb: 'Relieve sutil exagerado (la llanura no es plana), aguas y bajos protagonistas, caminos rurales finos; la ciudad como un punto más del paisaje, no como su centro.',
    questions: [
      '¿Desde dónde mira este mapa? La vista cenital es la del poder que mide; ¿hace falta acompañarla con un corte, un recorrido o un horizonte?',
      '¿Qué escala corresponde a la experiencia que describís: la del caminante, la del jinete o la del satélite?',
      'Lo que no se ve (el viento, el barro, la distancia vivida) ¿tiene algún signo en la figura o queda deliberadamente afuera?',
    ] },
  { id: 'hidrico', label: 'Agua: cuencas, cañadas y bajos', theme: 'hidrico',
    re: [/hidric/, /hidrograf/, /cuenca/, /\brios?\b/, /arroyo/, /canada/, /humedal/, /banado/, /laguna/, /inunda/, /anega/, /\baguas?\b/, /escurrimiento/, /drenaje/, /napa/],
    layers: ['ign-rios', 'ign-rios-int', 'ign-espejos', 'ign-espejos-int', 'ign-banados', 'ign-canales'],
    symb: 'Permanentes en línea continua, intermitentes en guiones, bajos anegables con rayas cortas y bañados con matas: la jerarquía hídrica se lee sin leyenda.',
    questions: [
      'La línea azul es una abstracción: en la llanura el agua es más una mancha que una línea. ¿Conviene mostrar bajos y anegamientos además de cauces?',
      '¿El año de la fuente hidrográfica coincide con el período que estudiás? Las cañadas se canalizaron, se rectificaron o desaparecieron.',
    ] },
  { id: 'fisico', label: 'Soporte físico: relieve, suelos, geomorfología', theme: 'relieve',
    re: [/geomorf/, /relieve/, /\bsuelos?\b/, /edafolog/, /pendiente/, /geolog/, /loess/, /erosion/, /topograf/, /altimetr/, /\bcotas?\b/, /terraza/, /barranca/, /lomada/],
    layers: ['dem-analitico', 'ign-curvas', 'ign-cotas', 'ign-rios'],
    symb: 'Rampa hipsométrica estirada al rango local de alturas y sombreado del noroeste; curvas en sepia; el agua encima de todo.',
    questions: [
      'Una exageración vertical ×10 hace legible la llanura ondulada, pero también la dramatiza: ¿lo aclarás en el epígrafe?',
      '¿Las curvas de nivel tienen la resolución que el argumento necesita? (en la pampa, las del IGN suelen venir del atlas 1:500.000).',
    ] },
  { id: 'urbano', label: 'Urbano, catastral y normativo', theme: 'normativo',
    re: [/urban/, /ciudad/, /planeamiento/, /ordenamiento/, /zonific/, /catastr/, /parcel/, /\bejido/, /barrio/, /periurban/, /loteo/, /normativ/, /codigo de ordenamiento/, /\bcou\b/, /uso del suelo/],
    layers: ['arba-parcela', 'arba-circunscripcion', 'ign-planta-urbana', 'ign-departamentos'],
    symb: 'Base gris, parcelario fino, zonas en colores categóricos claros; trazos nítidos de documento técnico.',
    questions: [
      '¿El mapa muestra la norma (lo que debería ser) o el territorio (lo que es)? Si muestra ambos, que se distingan gráficamente.',
      'El catastro vigente ¿coincide con los deslindes históricos? La superposición puede ser el hallazgo.',
    ] },
  { id: 'rural', label: 'Rural y productivo', theme: 'rural',
    re: [/rural/, /agricol/, /\bagro/, /ganad/, /estancias?\b/, /chacras?\b/, /\bcampos?\b/, /cultiv/, /tambo/, /produccion/, /puestos?\b/, /alambr/, /tranquera/],
    layers: ['ign-caminos', 'ign-agro', 'ign-escuelas', 'ign-localidades'],
    symb: 'Caminos vecinales visibles (heredan los deslindes de las mensuras), escuelas y parajes como nodos de la vida rural.',
    questions: [
      '¿Quién habita lo rural en el mapa? Los establecimientos tienen nombre; los trabajadores, casi nunca.',
    ] },
  { id: 'socio', label: 'Población y datos censales', theme: 'tematico',
    re: [/poblacion/, /demograf/, /\bcensos?\b/, /migra/, /\bsocial/, /pobreza/, /vivienda/, /densidad/, /hogares?/, /indicador/],
    layers: ['ign-departamentos', 'ign-localidades'],
    symb: 'Base neutra; una sola variable coloreada con paleta secuencial apta para daltonismo; clases explícitas en la leyenda.',
    questions: [
      '¿Las unidades censales (radios, partidos) son las del fenómeno o solo las de la estadística? El límite administrativo puede ocultar el patrón.',
    ] },
  { id: 'etno', label: 'Etnohistoria y territorialidades indígenas', theme: 'conjetural',
    re: [/indigena/, /pueblos originarios/, /tolderia/, /cacique/, /mapuche/, /ranquel/, /tehuelche/, /\bindio/, /malon/, /etnohistor/, /cazadores/, /recolector/, /arqueolog/, /rastrillada/, /frontera/, /coliqueo/, /catriel/, /parlamento/],
    layers: ['atlas-caminos'],
    symb: 'Gramática de certeza: documentado (trazo lleno), inferido (guiones), conjetural (puntos y signo de pregunta). Lo indígena no como «vacío» sino como presencia con otra forma de registro.',
    questions: [
      'Las fuentes coloniales nombran «desierto» a territorios habitados: ¿el mapa hereda ese vacío o lo vuelve visible como silencio de la fuente?',
      '¿Un límite lineal (frontera, línea de fortines) representa bien una zona de contacto, intercambio y movilidad?',
      '¿Qué certeza tiene cada trazo? Si todo va en línea continua, la figura afirma más de lo que el archivo permite.',
    ] },
  { id: 'ecologico', label: 'Ecología y muestreo', theme: 'ecologico',
    re: [/ecolog/, /biodivers/, /especies?\b/, /fauna/, /flora/, /habitat/, /muestreo/, /\baves\b/, /vegetacion/, /pastizal/, /conservacion/, /colonia de/],
    layers: ['ign-banados', 'ign-espejos'],
    symb: 'Sitios de muestreo con paleta Okabe–Ito (la misma de los gráficos del trabajo), base clara y escala bien visible.',
    questions: ['¿Los colores de los sitios son los mismos que los de los gráficos estadísticos? (podés extraerlos de una imagen del gráfico en Sitios y colores).'] },
  { id: 'polar', label: 'Antártida y ambientes polares', theme: 'polar',
    re: [/antart/, /glaciar/, /\bhielos?\b/, /pinguin/, /\bpolar/, /oceano austral/, /shetland/],
    layers: ['add-costa', 'rema-relieve', 'ign-bases', 'ref-sector'],
    symb: 'Hielo blanco azulado, mar gris celeste, proyección estereográfica polar o bicontinental.',
    questions: ['¿La proyección polar está orientada con el meridiano del área de estudio hacia arriba?'] },
  { id: 'patrimonio', label: 'Patrimonio y memoria', theme: 'patrimonio',
    re: [/patrimon/, /arquitect/, /edificio/, /escuelas? rural/, /capilla/, /iglesia/, /monumento/, /bienes? cultural/, /memoria/, /sitios? historic/, /casco/, /pulperia/, /posta/],
    layers: ['ign-escuelas', 'ign-religiosos', 'ign-cementerios', 'ign-taperas', 'atlas-estancias1884'],
    symb: 'Puntos jerarquizados con rótulos propios; la base acompaña sin competir.',
    questions: ['¿Qué hace que un punto sea «patrimonio» en el mapa: la declaratoria oficial o la memoria de quienes habitan el lugar?'] },
  { id: 'redes', label: 'Caminos, circulación y conectividad', theme: 'redes',
    re: [/caminos?\b/, /ferrocarril/, /vias? ferrea/, /\brutas?\b/, /transporte/, /vialidad/, /circulacion/, /tropas/, /carretas/, /postas?\b/, /conectividad/, /red vial/, /itinerario/, /recorrido/],
    layers: ['ign-ruta-nac', 'ign-ruta-prov', 'ign-caminos', 'ign-ferrocarril', 'ign-estaciones', 'atlas-caminos'],
    symb: 'Ferrocarril con durmientes, rutas con borde, caminos finos, recorridos con flechas de sentido.',
    questions: ['¿El trazado actual de un camino es el histórico? Las rectificaciones del siglo XX borraron curvas que eran vados, postas o deslindes.'] },
];

// ---------- lectura del tema ----------
export function readTheme(text) {
  const t = norm(text);
  if (!t.trim()) return [];
  const out = [];
  for (const tr of TRAITS) {
    const hits = new Set();
    for (const re of tr.re) {
      const m = t.match(new RegExp(re.source, 'g'));
      if (m) m.forEach((w) => hits.add(w.trim()));
    }
    if (hits.size) out.push({ ...tr, score: hits.size, words: Array.from(hits).slice(0, 6) });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------- lectura geográfica ----------
const REGIONS = [
  { id: 'delta', name: 'Delta e islas del Paraná', parent: 'Litoral',
    poly: [[-60.9, -32.55], [-60.2, -32.8], [-59.0, -33.4], [-58.35, -33.95], [-58.45, -34.35], [-58.9, -34.05], [-60.3, -33.3]],
    relief: 'Islas bajas, albardones y riachos; el nivel del río manda.',
    style: 'Agua como fondo y tierra como figura: invertir la lógica habitual de la base.' },
  { id: 'pampa-ondulada', name: 'Pampa ondulada', parent: 'Llanura pampeana',
    poly: [[-61.0, -32.6], [-60.2, -33.1], [-59.0, -33.7], [-58.55, -34.25], [-58.95, -34.85], [-60.4, -35.25], [-61.6, -34.5], [-62.3, -33.2]],
    relief: 'Lomas suaves y valles de arroyos encajados (10 a 30 m de desnivel), con cañadas y bajos en las cabeceras.',
    style: 'Conviene exagerar el relieve (×8 a ×15) y estirar la rampa al rango local; los arroyos y cañadas organizan el paisaje.' },
  { id: 'pampa-deprimida', name: 'Pampa deprimida (cuenca del Salado)', parent: 'Llanura pampeana',
    poly: [[-60.4, -35.25], [-58.95, -34.85], [-57.3, -35.2], [-56.7, -36.4], [-57.5, -37.3], [-59.3, -37.0], [-61.0, -36.3]],
    relief: 'Planicie casi sin pendiente, con lagunas encadenadas, bajos salinos y anegamientos frecuentes.',
    style: 'El agua es superficie más que línea: priorizar espejos, bajos anegables y bañados sobre los cauces.' },
  { id: 'pampa-austral', name: 'Pampa austral e interserrana', parent: 'Llanura pampeana',
    poly: [[-61.0, -36.3], [-57.5, -37.3], [-57.4, -38.3], [-60.0, -39.0], [-62.4, -39.0], [-62.9, -37.6]],
    relief: 'Llanura alta entre los sistemas de Tandilia y Ventania, con sierras que rompen el horizonte.',
    style: 'El sombreado de las sierras es la referencia: buen lugar para hipsometría completa.' },
  { id: 'pampa-arenosa', name: 'Pampa arenosa (occidental)', parent: 'Llanura pampeana',
    poly: [[-62.3, -33.2], [-61.6, -34.5], [-60.4, -35.25], [-61.0, -36.3], [-62.9, -37.6], [-64.6, -37.5], [-64.6, -33.8], [-63.5, -32.8]],
    relief: 'Médanos, cubetas y lagunas sin drenaje organizado.',
    style: 'Punteado irregular para médanos y espejos intermitentes; la red hídrica es escasa.' },
];
const AMBA = { center: [-58.45, -34.62], km: 38 };

function haversineKm(a, b) {
  const R = 6371, dLat = ((b[1] - a[1]) * Math.PI) / 180, dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function countryAt(lon, lat) {
  const fc = EMBEDDED['data/paises_ne_vista_arg.geojson'];
  for (const f of fc.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) if (pointInPolygon([lon, lat], p[0])) return f.properties;
  }
  return null;
}

export function readPlace(lon, lat) {
  const r = { lon, lat, country: null, region: null, macro: '', notes: [] };
  if (lat < -60) { r.macro = 'Antártida'; r.region = { id: 'antartida', name: 'Antártida', relief: 'Hielo continental, barreras y costas rocosas.', style: 'Proyección polar estereográfica; costa SCAR y relieve REMA.' }; return r; }
  const c = countryAt(lon, lat);
  r.country = c ? c.nombre || c.name : null;
  if (!c) r.macro = 'Mar o zona sin país en la base';
  for (const reg of REGIONS) if (pointInPolygon([lon, lat], reg.poly)) { r.region = reg; r.macro = reg.parent; break; }
  if (!r.region && c && /arg/i.test(c.iso || c.nombre || '')) {
    if (lat < -39.5) r.macro = 'Patagonia';
    else if (lon < -67.5) r.macro = lat > -28.5 ? 'Noroeste andino' : 'Cuyo y Andes centrales';
    else if (lat > -28.5 && lon < -64) r.macro = 'Noroeste (Yungas y valles)';
    else if (lat > -30.5 && lon > -59.6) r.macro = 'Nordeste (Mesopotamia)';
    else if (lat > -30.5) r.macro = 'Chaco';
    else r.macro = 'Centro (Espinal y sierras)';
  }
  if (haversineKm([lon, lat], AMBA.center) < AMBA.km) r.notes.push('Dentro de la Región Metropolitana de Buenos Aires: la trama urbana densa pide escalas grandes o generalizar.');
  if (lon > -74 && lon < -53 && lat > -56 && lat < -21) {
    r.faja = gkFaja(lon);
    r.posgar = posgarCode(lon);
  }
  return r;
}

// ---------- relieve local desde teselas Terrarium (AWS) ----------
function lon2tile(lon, z) { return ((lon + 180) / 360) * 2 ** z; }
function lat2tile(lat, z) { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; }

export async function sampleRelief(bboxLL, { maxTiles = 9 } = {}) {
  const [w, s, e, n] = bboxLL;
  let z = 13;
  for (; z > 3; z--) {
    const nx = Math.floor(lon2tile(e, z)) - Math.floor(lon2tile(w, z)) + 1;
    const ny = Math.floor(lat2tile(s, z)) - Math.floor(lat2tile(n, z)) + 1;
    if (nx * ny <= maxTiles) break;
  }
  const x0 = Math.floor(lon2tile(w, z)), x1 = Math.floor(lon2tile(e, z));
  const y0 = Math.floor(lat2tile(n, z)), y1 = Math.floor(lat2tile(s, z));
  const vals = [];
  const jobs = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push((async () => {
        const img = await new Promise((resolve, reject) => {
          const im = new Image(); im.crossOrigin = 'anonymous';
          im.onload = () => resolve(im); im.onerror = () => reject(new Error('teselas de elevación no disponibles'));
          im.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
        });
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, 256, 256).data;
        for (let py = 0; py < 256; py += 4) {
          for (let px = 0; px < 256; px += 4) {
            // solo dentro de la caja pedida
            const lon = ((x + px / 256) / 2 ** z) * 360 - 180;
            const nn = Math.PI - (2 * Math.PI * (y + py / 256)) / 2 ** z;
            const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nn) - Math.exp(-nn)));
            if (lon < w || lon > e || lat < s || lat > n) continue;
            const i = (py * 256 + px) * 4;
            vals.push(d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768);
          }
        }
      })());
    }
  }
  await Promise.all(jobs);
  if (vals.length < 10) throw new Error('No hay datos de elevación para esta vista.');
  vals.sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))];
  const land = vals.filter((v) => v > 0.5);
  const res = { min: q(0), p02: q(0.02), p50: q(0.5), p98: q(0.98), max: q(1), n: vals.length, zoom: z, seaShare: 1 - land.length / vals.length };
  res.amp = res.p98 - res.p02;
  res.kind = res.amp < 15 ? 'llanura muy plana' : res.amp < 150 ? 'llanura ondulada' : res.amp < 700 ? 'relieve serrano' : 'relieve montañoso';
  res.zFactor = res.amp < 15 ? 20 : res.amp < 60 ? 12 : res.amp < 150 ? 8 : res.amp < 700 ? 3 : 1.5;
  return res;
}

// ---------- síntesis ----------
export function synthesize({ traits, place, relief, scaleRF }) {
  const primary = traits[0] || null;
  const themeId = primary ? primary.theme : place && place.region && place.region.parent === 'Llanura pampeana' ? 'paisaje-pampeano' : place && place.macro === 'Antártida' ? 'polar' : 'relieve';
  const layers = new Set();
  traits.slice(0, 3).forEach((t) => t.layers.forEach((l) => layers.add(l)));
  if (place && place.region && place.region.parent === 'Llanura pampeana') ['ign-rios', 'ign-rios-int', 'ign-localidades', 'ign-departamentos'].forEach((l) => layers.add(l));
  if (place && place.macro === 'Antártida') ['add-costa', 'ign-bases'].forEach((l) => layers.add(l));
  const scaleKind = !scaleRF ? '' : scaleRF < 60000 ? 'local' : scaleRF < 400000 ? 'partido o comarca' : scaleRF < 4000000 ? 'regional' : 'nacional o continental';
  let projection = null;
  if (place && place.macro === 'Antártida') projection = { code: 'EPSG:3031', why: 'Estereográfica polar: estándar SCAR para la Antártida.' };
  else if (place && place.posgar && scaleRF && scaleRF < 4000000) projection = { code: place.posgar, why: `POSGAR 2007 faja ${place.faja}: marco oficial argentino; conforme y con poca deformación a escala ${scaleKind}.` };
  else if (scaleRF && scaleRF >= 4000000) projection = { code: 'CONI:BICONT', why: 'A escala nacional, la Lambert acimutal equivalente bicontinental del IGN conserva superficies y muestra el sector antártico.' };
  const questions = [];
  traits.slice(0, 3).forEach((t) => t.questions.forEach((q) => questions.push({ q, from: t.label })));
  if (relief && relief.amp < 150) questions.push({ q: `El relieve visible varía apenas ${Math.round(relief.amp)} m: para que se lea hay que exagerarlo (×${relief.zFactor}). ¿Lo declarás en el epígrafe para no dramatizar la llanura?`, from: 'Relieve' });
  if (scaleKind === 'local' && traits.some((t) => t.id === 'historico')) questions.push({ q: 'A escala de detalle, los errores de georreferenciación de los planos históricos (decenas de metros) se vuelven visibles. ¿Informás el error medio de cada plano?', from: 'Escala' });
  questions.push({ q: 'Toda figura elige qué dejar afuera. ¿Qué omisión de este mapa es deliberada y cuál es solo heredada de las capas disponibles?', from: 'Encuadre' });
  return { themeId, layers: Array.from(layers), projection, scaleKind, questions, primary };
}
