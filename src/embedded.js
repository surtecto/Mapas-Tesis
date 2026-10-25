// Datos estáticos incluidos en el paquete: la aplicación funciona también abriendo index.html sin servidor
import paises from '../data/paises_ne_vista_arg.geojson';
import bases from '../data/bases_antarticas_ign.geojson';
import hitos from '../data/hitos_antarticos.geojson';
// Copia de las capas publicadas en el Atlas de Mensuras de Giles (J. P. Addesso, 2026)
import atlasPartido from '../data/atlas_partido_contorno.geojson';
import atlasMensuras from '../data/atlas_mensuras_ahg.geojson';
import atlasR1874 from '../data/atlas_registro_grafico_1874.geojson';
import atlasUrbanas from '../data/atlas_parcelas_urbanas_1884.geojson';
import atlasCaminos from '../data/atlas_caminos.geojson';
import atlasEstancias from '../data/atlas_estancias_puestos_1884.geojson';
import atlasPoblamiento from '../data/atlas_poblamiento_mensuras.geojson';

export const EMBEDDED = {
  'data/paises_ne_vista_arg.geojson': paises,
  'data/bases_antarticas_ign.geojson': bases,
  'data/hitos_antarticos.geojson': hitos,
  'data/atlas_partido_contorno.geojson': atlasPartido,
  'data/atlas_mensuras_ahg.geojson': atlasMensuras,
  'data/atlas_registro_grafico_1874.geojson': atlasR1874,
  'data/atlas_parcelas_urbanas_1884.geojson': atlasUrbanas,
  'data/atlas_caminos.geojson': atlasCaminos,
  'data/atlas_estancias_puestos_1884.geojson': atlasEstancias,
  'data/atlas_poblamiento_mensuras.geojson': atlasPoblamiento,
};
