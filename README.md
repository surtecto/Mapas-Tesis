# Mapas-Tesis

Generador web de **mapas para tesis e investigación**. Lee el tema de la tesis y la geografía del lugar, propone un lenguaje gráfico (estilo, proyección, capas), prepara la figura según dónde se va a ver (impresión, proyector, videollamada o web) y permite construir **mapas de interpretación** sobre planos históricos o realizados por otros, con versiones comparables y método documentado.

Deriva de [Coni-Mapas](https://github.com/surtecto/Coni-Mapas) y conserva todas sus funciones (capas del IGN, relieve, imágenes satelitales, zooms en lupa, paletas tomadas de gráficos, exportación para revistas).

**Usar en línea:** https://surtecto.github.io/Mapas-Tesis/

**Usar en la computadora:** abrir `index.html` con Chrome, Edge o Firefox. Las capas se descargan de sus servidores, así que hace falta conexión. El proyecto se guarda solo en el navegador y también se puede descargar como archivo `.tesis.json`, que incluye las imágenes de los planos.

## Pestañas

### Tesis: interpretar el tema y el lugar
- Se escribe el tema (título, resumen o palabras clave), la disciplina y el período.
- **Lectura del tema:** reconoce rasgos (histórico y de archivo, paisaje y percepción, agua, soporte físico, urbano y normativo, rural, población, etnohistoria, ecología, Antártida, patrimonio, caminos y circulación) y muestra las palabras que los activaron.
- **Lectura del lugar:** región (Pampa ondulada, deprimida, austral, arenosa, Delta, Patagonia, Andes, Antártida…), faja POSGAR correspondiente y **relieve medido en la vista** (teselas de elevación): si la amplitud es chica, propone estirar la rampa al rango local y exagerar el sombreado, y lo declara en el epígrafe.
- **Propuesta:** un estilo de tesis aplicable con un clic, proyección sugerida, ajuste del relieve y capas sugeridas.
- **Preguntas a la figura:** cada lectura viene con preguntas críticas (qué mirada reproduce el mapa, qué deja afuera la fuente, qué certeza tiene cada trazo).
- **14 estilos de tesis:** tinta y papel (histórico), paisaje pampeano, hídrico, físico, urbano-normativo, rural, temático, etnohistórico y conjetural, ecológico, polar, patrimonio, redes, blanco y negro para imprimir, y proyección en sala oscura. Cada estilo restiliza todas las capas según lo que representan (aguas, límites, caminos, ferrocarril, parcelas históricas…).
- **Modelos de ejemplo:** Pago Gilense (localización, mensuras y caminos 1825–1925, interpretación de una mensura de 1866, versión para proyector) y los modelos antárticos de Coni-Mapas.
- **Modelo propio:** una figura de referencia (de un artículo, otra tesis o un mapa antiguo) se superpone como calco a la hoja y se pueden tomar sus colores.

### Interpretación: planos históricos y versiones
- **Planos fuente:** imágenes JPG, PNG o WebP (escaneos o fotografías tomadas en el archivo) con sus datos para citar: autor, año, archivo, signatura, enlace y notas.
- **Georreferenciador:** el plano y el terreno lado a lado; puntos de control tocando ambos, escribiendo latitud y longitud o coordenadas **POSGAR 2007** o **Campo Inchauspe** (Gauss-Krüger, para cartas antiguas). Imanta a los vértices de las mensuras del Atlas. Transformaciones: Helmert, afín, **proyectiva** (para fotos de planos tomadas en ángulo), polinomial de 2.º y 3.er orden y **lámina delgada**. Muestra residuos en metros, error medio cuadrático o validación cruzada, y los vectores de error sobre el plano.
- **Sobre el mapa:** opacidad, fusión, quitar el papel (deja solo la tinta), teñir, grises y recorte de márgenes.
- **Dibujo con grados de certeza:** cada trazo tiene categoría (camino, deslinde, curso de agua, frontera, suerte, bañado, población, posta, toldería, hito…) y certeza: **documentada** (trazo lleno), **inferida** (guiones) o **conjetural** (puntos). Cada elemento guarda nombre, período, fuente y nota.
- **Versiones:** cada versión guarda su propia georreferenciación y sus trazos. Se pueden duplicar, fijar como registro, comparar (la otra versión se ve en gris) y exportar en GeoJSON. La **ficha metodológica** reúne fuentes, puntos de control, errores y criterios para el capítulo de métodos.

### Capas
- **IGN, Argentina continental** (se piden solo para la vista, a escalas de detalle): partidos, localidades, plantas urbanas, ríos y arroyos, cañadas, canales, lagunas, bajos anegables, bañados, curvas de nivel, puntos acotados, rutas, caminos rurales, huellas, ferrocarril y estaciones, escuelas, cementerios, edificios religiosos, taperas, ruinas, establecimientos agropecuarios e **índices de cartas topográficas 1:50.000 y 1:100.000** (con año de levantamiento y marco).
- **ARBA:** parcelas, manzanas, quintas, chacras, secciones, circunscripciones y partidos.
- **Atlas de Mensuras de Giles:** mensuras del Archivo Histórico de Geodesia (1825–1925) coloreadas por período, registro gráfico de c. 1874, planta urbana de 1884, caminos, ferrocarril, tranvía y telégrafo, estancias y puestos de 1884 y el poblamiento dibujado en las mensuras.
- Las de Coni-Mapas: Argenmap, Antártida e IGN marítimo, REMA, GEBCO, NPI, DEM analítico (ahora con rampas «llanura», «sepia» y «bajos húmedos»), imágenes satelitales y referencias.
- Simbología: tipos de línea, **decoraciones** (borde, doble línea, ferrocarril, durmientes, peine, dientes de frontera, flechas de recorrido, postes de telégrafo), **tramas** (bañado, ondas, rayas de agua, pastizal, surcos, punteado de médanos, ladrillo, monte) y clasificación por **rangos** (períodos, cantidades) además de valores únicos.

### Figura: destino, legibilidad y color
- **Destinos:** tesis A4 (página completa o media página), artículo de una o dos columnas, lámina A3, póster A1, proyector 16:9 y 4:3, pantalla compartida en videollamada, monitor, web y redes. Cada uno fija tamaño, resolución y formato de exportación, con calidades (borrador, estándar, alta, dibujo lineal o 2× para pantallas densas).
- **Control de legibilidad:** compara textos, líneas, símbolos, tramas y contraste con los mínimos del destino (por ejemplo, 7 pt en la tesis impresa, 30 px en el proyector, 34 px y líneas de 4 px en videollamada) y los ajusta conservando la jerarquía.
- **Color o escala de grises** en la exportación (TIFF en grises de un canal) y **simulación** de la vista: impresión en grises, fotocopia, proyector en sala iluminada, videollamada comprimida y tres tipos de daltonismo.
- Al cambiar de destino, la composición se reubica y se conserva el terreno visible.

### Buscador
Arriba: nombres de localidades, partidos y provincias (Georef, datos oficiales) y lugares de OpenStreetMap, o coordenadas. Cada resultado se puede agregar como sitio.

## Proyecciones
POSGAR 2007 fajas 1 a 7 (marco oficial argentino), Campo Inchauspe fajas 4 a 6 (cartas históricas), estereográfica polar antártica, bicontinental IGN, Lambert polar, UTM 20S y 21S, Mercator web y geográficas.

## Fuentes y atribuciones
| Fuente | Servicio | Cita |
|---|---|---|
| Instituto Geográfico Nacional (IGN) | WMS/WFS `wms.ign.gob.ar` y teselas Argenmap | «Instituto Geográfico Nacional de la República Argentina» |
| ARBA (Provincia de Buenos Aires) | WMS `geo.arba.gov.ar` | Catastro territorial, IDERA |
| Atlas de Mensuras de Giles | Copia local de los datos publicados (`data/atlas_*.geojson`) | Addesso, J. P. (2026) |
| Georef (Secretaría de Innovación) | API `apis.datos.gob.ar/georef` | Búsqueda de lugares |
| OpenStreetMap / Nominatim | Búsqueda de lugares | © colaboradores de OpenStreetMap |
| Terrain Tiles (Mapzen / AWS) | Teselas Terrarium | SRTM, GMTED2010, ETOPO1 |
| Esri, SCAR ADD, REMA, COMNAP, NPI, GEBCO, NASA GIBS, EOX, Natural Earth | ver Coni-Mapas | cada capa conserva su licencia |

El plano de ejemplo (`data/ejemplos/mensura-045-lescano-1866.jpg`) es la fotografía del duplicado de mensura 45 (Pedro Saubidet, 1866, Archivo Histórico de Geodesia) publicada en el Atlas de Mensuras de Giles. Sus cuatro puntos de control son las esquinas del rectángulo interior según el polígono de la carpeta 45 del Atlas; el plano está orientado con el sudoeste hacia arriba.

## Desarrollo
```bash
npm install
npm run build     # genera assets/app.js, assets/app.css y assets/ol.css
python3 -m http.server 8000
```
El código está en `src/` (OpenLayers 10, proj4, fflate y shpjs, empaquetados con esbuild). Módulos nuevos respecto de Coni-Mapas: `interpret.js` (lectura del tema y del lugar), `themes.js` (estilos de tesis), `media.js` (destinos, legibilidad y simulación), `georef.js` (transformaciones y residuos), `interp.js` (fuentes, versiones y ficha metodológica), `imagestore.js` (imágenes en IndexedDB) y las pestañas en `src/ui/`. `node tests/georef.test.mjs` prueba las transformaciones contra una homografía conocida.

## Licencia
Código bajo licencia MIT. Cada capa conserva la licencia y las condiciones de uso de su proveedor.
