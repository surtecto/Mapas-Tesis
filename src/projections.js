// Proyecciones cartográficas disponibles (polares antárticas, bicontinental, POSGAR 2007, Campo Inchauspe, UTM, Mercator y geográficas)
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import { get as getProjection, getPointResolution, fromLonLat, toLonLat, transform } from 'ol/proj.js';

export const PROJECTIONS = [
  {
    code: 'EPSG:3031', group: 'Antártida y bicontinental',
    name: 'Estereográfica polar antártica',
    detail: 'WGS 84 / Antarctic Polar Stereographic (EPSG:3031). Conforme, paralelo estándar 71°S. Estándar SCAR para cartografía antártica.',
    def: '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
    extent: [-12400000, -12400000, 12400000, 12400000],
    worldExtent: [-180, -90, 180, -5],
    polar: true,
  },
  {
    code: 'CONI:BICONT', group: 'Antártida y bicontinental',
    name: 'Bicontinental IGN (Lambert acimutal equivalente)',
    detail: 'Lambert acimutal equivalente con punto de tangencia 40°S 60°O, WGS 84. Proyección indicada por el IGN para el mapa bicontinental (sectores continental, insular y antártico).',
    def: '+proj=laea +lat_0=-40 +lon_0=-60 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
    extent: [-11000000, -11000000, 11000000, 11000000],
    worldExtent: [-150, -90, 30, 20],
    polar: true,
  },
  {
    code: 'EPSG:6932', group: 'Antártida y bicontinental',
    name: 'Lambert acimutal equivalente polar sur',
    detail: 'WGS 84 / NSIDC EASE-Grid 2.0 South (EPSG:6932). Equivalente (conserva áreas); útil para comparar superficies.',
    def: '+proj=laea +lat_0=-90 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
    extent: [-9100000, -9100000, 9100000, 9100000],
    worldExtent: [-180, -90, 180, 0],
    polar: true,
  },
  {
    code: 'EPSG:32721', group: 'UTM',
    name: 'UTM zona 21 Sur',
    detail: 'WGS 84 / UTM zona 21S (EPSG:32721). Meridiano central 57°O: adecuada para mapas de detalle de la península Antártica norte (Potter, Esperanza, Marambio, Cerro Nevado).',
    def: '+proj=utm +zone=21 +south +datum=WGS84 +units=m +no_defs',
    extent: [-1500000, 0, 2500000, 10000000],
    worldExtent: [-75, -85, -39, 0],
  },
  {
    code: 'EPSG:32720', group: 'UTM',
    name: 'UTM zona 20 Sur',
    detail: 'WGS 84 / UTM zona 20S (EPSG:32720). Meridiano central 63°O: Shetland del Sur occidentales, Decepción, Brown, Primavera.',
    def: '+proj=utm +zone=20 +south +datum=WGS84 +units=m +no_defs',
    extent: [-1500000, 0, 2500000, 10000000],
    worldExtent: [-81, -85, -45, 0],
  },
  {
    code: 'EPSG:5343', group: 'Argentina (POSGAR 2007)',
    name: 'POSGAR 2007 faja 1 (Gauss-Krüger, MC 72°O)',
    detail: 'POSGAR 2007 / Argentina 1 (EPSG:5343). Gauss-Krüger, meridiano central 72°O: marco geodésico oficial de la República Argentina (IGN). Conforme: ángulos y formas locales verdaderos dentro de la faja.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-72 +k=1 +x_0=1500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    extent: [1500000 - 1600000, 0, 1500000 + 1600000, 9500000],
    worldExtent: [-86, -90, -58, -15],
  },
  {
    code: 'EPSG:5344', group: 'Argentina (POSGAR 2007)',
    name: 'POSGAR 2007 faja 2 (Gauss-Krüger, MC 69°O)',
    detail: 'POSGAR 2007 / Argentina 2 (EPSG:5344). Gauss-Krüger, meridiano central 69°O: marco geodésico oficial de la República Argentina (IGN). Conforme: ángulos y formas locales verdaderos dentro de la faja.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-69 +k=1 +x_0=2500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    extent: [2500000 - 1600000, 0, 2500000 + 1600000, 9500000],
    worldExtent: [-83, -90, -55, -15],
  },
  {
    code: 'EPSG:5345', group: 'Argentina (POSGAR 2007)',
    name: 'POSGAR 2007 faja 3 (Gauss-Krüger, MC 66°O)',
    detail: 'POSGAR 2007 / Argentina 3 (EPSG:5345). Gauss-Krüger, meridiano central 66°O: marco geodésico oficial de la República Argentina (IGN). Conforme: ángulos y formas locales verdaderos dentro de la faja.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-66 +k=1 +x_0=3500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    extent: [3500000 - 1600000, 0, 3500000 + 1600000, 9500000],
    worldExtent: [-80, -90, -52, -15],
  },
  {
    code: 'EPSG:5346', group: 'Argentina (POSGAR 2007)',
    name: 'POSGAR 2007 faja 4 (Gauss-Krüger, MC 63°O)',
    detail: 'POSGAR 2007 / Argentina 4 (EPSG:5346). Gauss-Krüger, meridiano central 63°O: marco geodésico oficial de la República Argentina (IGN). Conforme: ángulos y formas locales verdaderos dentro de la faja.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-63 +k=1 +x_0=4500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    extent: [4500000 - 1600000, 0, 4500000 + 1600000, 9500000],
    worldExtent: [-77, -90, -49, -15],
  },
  {
    code: 'EPSG:5347', group: 'Argentina (POSGAR 2007)',
    name: 'POSGAR 2007 faja 5 (Gauss-Krüger, MC 60°O)',
    detail: 'POSGAR 2007 / Argentina 5 (EPSG:5347). Gauss-Krüger, meridiano central 60°O: marco geodésico oficial de la República Argentina (IGN). Conforme: ángulos y formas locales verdaderos dentro de la faja.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-60 +k=1 +x_0=5500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    extent: [5500000 - 1600000, 0, 5500000 + 1600000, 9500000],
    worldExtent: [-74, -90, -46, -15],
  },
  {
    code: 'EPSG:5348', group: 'Argentina (POSGAR 2007)',
    name: 'POSGAR 2007 faja 6 (Gauss-Krüger, MC 57°O)',
    detail: 'POSGAR 2007 / Argentina 6 (EPSG:5348). Gauss-Krüger, meridiano central 57°O: marco geodésico oficial de la República Argentina (IGN). Conforme: ángulos y formas locales verdaderos dentro de la faja.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-57 +k=1 +x_0=6500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    extent: [6500000 - 1600000, 0, 6500000 + 1600000, 9500000],
    worldExtent: [-71, -90, -43, -15],
  },
  {
    code: 'EPSG:5349', group: 'Argentina (POSGAR 2007)',
    name: 'POSGAR 2007 faja 7 (Gauss-Krüger, MC 54°O)',
    detail: 'POSGAR 2007 / Argentina 7 (EPSG:5349). Gauss-Krüger, meridiano central 54°O: marco geodésico oficial de la República Argentina (IGN). Conforme: ángulos y formas locales verdaderos dentro de la faja.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-54 +k=1 +x_0=7500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    extent: [7500000 - 1600000, 0, 7500000 + 1600000, 9500000],
    worldExtent: [-68, -90, -40, -15],
  },
  {
    code: 'EPSG:22191', group: 'Históricas', list: false,
    name: 'Campo Inchauspe faja 1 (Gauss-Krüger histórico)',
    detail: 'Campo Inchauspe / Argentina 1 (EPSG:22191). Marco de las cartas topográficas del IGM/IGN del siglo XX (elipsoide Internacional de Hayford). Útil para leer coordenadas de cartas antiguas al georreferenciar.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-72 +k=1 +x_0=1500000 +y_0=0 +ellps=intl +towgs84=-148,136,90,0,0,0,0 +units=m +no_defs',
    extent: [1500000 - 1600000, 0, 1500000 + 1600000, 9500000],
    worldExtent: [-86, -90, -58, -15],
  },
  {
    code: 'EPSG:22192', group: 'Históricas', list: false,
    name: 'Campo Inchauspe faja 2 (Gauss-Krüger histórico)',
    detail: 'Campo Inchauspe / Argentina 2 (EPSG:22192). Marco de las cartas topográficas del IGM/IGN del siglo XX (elipsoide Internacional de Hayford). Útil para leer coordenadas de cartas antiguas al georreferenciar.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-69 +k=1 +x_0=2500000 +y_0=0 +ellps=intl +towgs84=-148,136,90,0,0,0,0 +units=m +no_defs',
    extent: [2500000 - 1600000, 0, 2500000 + 1600000, 9500000],
    worldExtent: [-83, -90, -55, -15],
  },
  {
    code: 'EPSG:22193', group: 'Históricas', list: false,
    name: 'Campo Inchauspe faja 3 (Gauss-Krüger histórico)',
    detail: 'Campo Inchauspe / Argentina 3 (EPSG:22193). Marco de las cartas topográficas del IGM/IGN del siglo XX (elipsoide Internacional de Hayford). Útil para leer coordenadas de cartas antiguas al georreferenciar.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-66 +k=1 +x_0=3500000 +y_0=0 +ellps=intl +towgs84=-148,136,90,0,0,0,0 +units=m +no_defs',
    extent: [3500000 - 1600000, 0, 3500000 + 1600000, 9500000],
    worldExtent: [-80, -90, -52, -15],
  },
  {
    code: 'EPSG:22194', group: 'Históricas', list: true,
    name: 'Campo Inchauspe faja 4 (Gauss-Krüger histórico)',
    detail: 'Campo Inchauspe / Argentina 4 (EPSG:22194). Marco de las cartas topográficas del IGM/IGN del siglo XX (elipsoide Internacional de Hayford). Útil para leer coordenadas de cartas antiguas al georreferenciar.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-63 +k=1 +x_0=4500000 +y_0=0 +ellps=intl +towgs84=-148,136,90,0,0,0,0 +units=m +no_defs',
    extent: [4500000 - 1600000, 0, 4500000 + 1600000, 9500000],
    worldExtent: [-77, -90, -49, -15],
  },
  {
    code: 'EPSG:22195', group: 'Históricas', list: true,
    name: 'Campo Inchauspe faja 5 (Gauss-Krüger histórico)',
    detail: 'Campo Inchauspe / Argentina 5 (EPSG:22195). Marco de las cartas topográficas del IGM/IGN del siglo XX (elipsoide Internacional de Hayford). Útil para leer coordenadas de cartas antiguas al georreferenciar.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-60 +k=1 +x_0=5500000 +y_0=0 +ellps=intl +towgs84=-148,136,90,0,0,0,0 +units=m +no_defs',
    extent: [5500000 - 1600000, 0, 5500000 + 1600000, 9500000],
    worldExtent: [-74, -90, -46, -15],
  },
  {
    code: 'EPSG:22196', group: 'Históricas', list: true,
    name: 'Campo Inchauspe faja 6 (Gauss-Krüger histórico)',
    detail: 'Campo Inchauspe / Argentina 6 (EPSG:22196). Marco de las cartas topográficas del IGM/IGN del siglo XX (elipsoide Internacional de Hayford). Útil para leer coordenadas de cartas antiguas al georreferenciar.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-57 +k=1 +x_0=6500000 +y_0=0 +ellps=intl +towgs84=-148,136,90,0,0,0,0 +units=m +no_defs',
    extent: [6500000 - 1600000, 0, 6500000 + 1600000, 9500000],
    worldExtent: [-71, -90, -43, -15],
  },
  {
    code: 'EPSG:22197', group: 'Históricas', list: false,
    name: 'Campo Inchauspe faja 7 (Gauss-Krüger histórico)',
    detail: 'Campo Inchauspe / Argentina 7 (EPSG:22197). Marco de las cartas topográficas del IGM/IGN del siglo XX (elipsoide Internacional de Hayford). Útil para leer coordenadas de cartas antiguas al georreferenciar.',
    def: '+proj=tmerc +lat_0=-90 +lon_0=-54 +k=1 +x_0=7500000 +y_0=0 +ellps=intl +towgs84=-148,136,90,0,0,0,0 +units=m +no_defs',
    extent: [7500000 - 1600000, 0, 7500000 + 1600000, 9500000],
    worldExtent: [-68, -90, -40, -15],
  },
  {
    code: 'EPSG:3857', group: 'Mundiales',
    name: 'Mercator web',
    detail: 'WGS 84 / Pseudo-Mercator (EPSG:3857). Proyección nativa de las teselas Argenmap; no representa latitudes al sur de 85°S y exagera las áreas polares.',
    builtin: true,
  },
  {
    code: 'EPSG:4326', group: 'Mundiales',
    name: 'Geográficas (latitud/longitud)',
    detail: 'WGS 84, coordenadas geográficas en grados (EPSG:4326), representación equirrectangular.',
    builtin: true,
  },
];

const byCode = new Map(PROJECTIONS.map((p) => [p.code, p]));

export function projInfo(code) {
  if (byCode.has(code)) return byCode.get(code);
  const m = /^CONI:LAEA_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/.exec(code || '');
  if (m) {
    return {
      code,
      name: `Lambert acimutal equivalente (${m[1]}°, ${m[2]}°)`,
      detail: `Lambert acimutal equivalente centrada en lat ${m[1]}°, lon ${m[2]}°, WGS 84.`,
      custom: true,
      polar: true,
    };
  }
  return byCode.get('EPSG:3031');
}

let registered = false;
export function registerProjections() {
  if (registered) return;
  for (const p of PROJECTIONS) if (p.def) proj4.defs(p.code, p.def);
  register(proj4);
  for (const p of PROJECTIONS) {
    if (!p.def) continue;
    const proj = getProjection(p.code);
    proj.setExtent(p.extent);
    proj.setWorldExtent(p.worldExtent);
    proj.setGlobal(false);
  }
  registered = true;
}

// Define (si hace falta) una LAEA personalizada y devuelve su código
export function ensureCustomLaea(lat, lon) {
  const la = Number(lat).toFixed(2).replace(/\.?0+$/, '');
  const lo = Number(lon).toFixed(2).replace(/\.?0+$/, '');
  const code = `CONI:LAEA_${la}_${lo}`;
  if (!getProjection(code)) {
    proj4.defs(code, `+proj=laea +lat_0=${la} +lon_0=${lo} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`);
    register(proj4);
    const proj = getProjection(code);
    proj.setExtent([-11000000, -11000000, 11000000, 11000000]);
    proj.setWorldExtent([-180, -90, 180, 90]);
    proj.setGlobal(false);
  }
  return code;
}

export function ensureProjection(code) {
  registerProjections();
  if (getProjection(code)) return code;
  const m = /^CONI:LAEA_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/.exec(code || '');
  if (m) return ensureCustomLaea(m[1], m[2]);
  return 'EPSG:3031';
}

export function lonLatTo(code, lonlat) {
  if (code === 'EPSG:4326') return [lonlat[0], lonlat[1]];
  if (code === 'EPSG:3857') {
    return fromLonLat([lonlat[0], Math.max(-85.0, Math.min(85.0, lonlat[1]))], code);
  }
  return transform(lonlat, 'EPSG:4326', code);
}
export function toLonLatFrom(code, coord) {
  if (code === 'EPSG:4326') return [coord[0], coord[1]];
  return toLonLat(coord, code);
}

// Metros terrestres por unidad de proyección en un punto
export function metersPerUnit(code, coord) {
  const proj = getProjection(code);
  const units = proj.getUnits();
  const eps = units === 'degrees' ? 1e-4 : 1;
  const r = getPointResolution(proj, eps, coord, 'm');
  return r / eps;
}

// Resolución de vista (unidades/px) para mantener "metros de terreno por mm de papel"
export function resolutionFromMpm(code, centerLonLat, mpm, cssPxPerMm) {
  const c = lonLatTo(code, centerLonLat);
  const mPerPx = mpm / cssPxPerMm;
  return mPerPx / metersPerUnit(code, c);
}
export function mpmFromResolution(code, centerCoord, resolution, cssPxPerMm) {
  return resolution * metersPerUnit(code, centerCoord) * cssPxPerMm;
}

// Rotación que orienta un meridiano hacia arriba en vistas polares
// (rotación OL positiva = giro horario del contenido)
export function rotationForMeridian(code, lon, lat = -65) {
  const p1 = lonLatTo(code, [lon, lat]);
  const p2 = lonLatTo(code, [lon, lat + 0.1]);
  const a = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
  return -a;
}

// Faja POSGAR / Gauss-Krüger argentina que corresponde a una longitud (1 a 7)
export function gkFaja(lon) {
  return Math.max(1, Math.min(7, Math.round((lon + 72) / 3) + 1));
}
export function posgarCode(lon) { return `EPSG:${5342 + gkFaja(lon)}`; }
export function inchauspeCode(lon) { return `EPSG:${22190 + gkFaja(lon)}`; }
export function isGK(code) { return /^EPSG:(534[3-9]|2219[1-7])$/.test(code || ''); }
