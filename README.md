# Mapas-Tesis

Generador web de **mapas para tesis e investigación**. Cada computadora guarda su propia **biblioteca de proyectos** (uno o varios mapas por proyecto); un proyecto nuevo empieza por sus datos fundamentales y por el lugar, ubicado **sobre la imagen satelital o en una hoja en blanco**. Las capas oficiales (IGN, INA, INDEC, INTA, Ambiente, ARBA, Estadística bonaerense y todo el catálogo de IDERA) se cargan **como vectores que se pueden restilizar, filtrar y exportar**; las imágenes satelitales se consultan **por fecha** (Sentinel-2 y Landsat desde 1972) junto con la **cobertura del suelo 2017–2025**, sus superficies y sus cambios. La pestaña Análisis suma clases, densidades, áreas de influencia, patrones de puntos, mediciones y **perfiles topográficos**. Todo se compone en milímetros de papel para el destino de la figura (impresión, proyector, videollamada o web) y convive con los **mapas de interpretación** sobre planos históricos.

Deriva de [Coni-Mapas](https://github.com/surtecto/Coni-Mapas) y conserva todas sus funciones (capas del IGN, relieve, imágenes satelitales, zooms en lupa, paletas tomadas de gráficos, exportación para revistas).

**Usar en línea:** https://surtecto.github.io/Mapas-Tesis/

**Usar en la computadora:** abrir `index.html` con Chrome, Edge o Firefox. Las capas se descargan de sus servidores, así que hace falta conexión. Los proyectos se guardan en el navegador de cada computadora (dos computadoras nunca se pisan); para llevar un proyecto a otra, se exporta como `.tesis.json` (con todos sus mapas y planos) y se importa allá.

## Inicio y proyectos
- **Planoteca de la computadora:** cada proyecto es una lámina con su vista previa y su rótulo (tipo de trabajo, cantidad de mapas, autoría, últimos cambios). Abrir, duplicar, exportar o eliminar (con confirmación); importar proyectos o mapas sueltos de versiones anteriores; pedido al navegador para que no borre los datos.
- **Proyecto nuevo en tres pasos:** 1) datos fundamentales (nombre, tipo de trabajo, título, autoría, institución, dirección, año, palabras clave, resumen, período, licencia de las figuras); 2) el lugar, sobre imagen satelital u hoja en blanco: buscar, **elegir un partido del IGN tocando el mapa**, marcar un punto, dibujar un rectángulo o un polígono; 3) el primer mapa: destino, estilo propuesto por el tema, proyección (automática según el área), capas de partida y mapa de ubicación.
- **Varios mapas por proyecto:** nuevo mapa desde el área del proyecto, con la misma vista y estilo (para series comparables), copia del actual o desde un modelo; renombrar, duplicar, eliminar y **volver a como estaba al abrirlo** (resguardo automático).
- Guardado continuo por mapa, aviso si el mismo mapa está abierto en otra pestaña, y epígrafe con **autoría y licencia** del proyecto.
- **Carpeta de proyectos (Chrome y Edge):** desde el inicio se elige una carpeta de la computadora, por ejemplo dentro de OneDrive, Google Drive o Dropbox para escritorio. Cada proyecto se guarda ahí como `nombre__id.json`, con los planos en `imagenes/`; otra computadora que elige la misma carpeta sincronizada encuentra los mismos proyectos, y al volver a la ventana trae lo que cambió en la otra. Si las dos cambiaron el mismo proyecto, se conservan las dos versiones (la de la otra computadora queda como proyecto aparte, con su nombre y la hora). Eliminar un proyecto lo pasa a `papelera/` y las demás computadoras lo ven como «quitado». Cada proyecto se puede dejar solo en una computadora, y los `.json` sueltos que aparezcan en la carpeta (exportados o copias de conflicto de OneDrive) se importan desde el inicio. El navegador pide permiso para usar la carpeta: con «Permitir en cada visita» no vuelve a preguntar.

## Servicios oficiales
- **Destacados verificados:** IGN (y gestión del riesgo), INA, INDEC (radios y fracciones censales), INTA (nacional y regionales), Ambiente, Transporte, SENASA, CONAE, SHN, Energía, Mapa Educativo, Forestal, **ARBA en WFS** (parcelas, manzanas, quintas, chacras…), **Estadística de la Provincia de Buenos Aires** (servidor ArcGIS con carpetas: censo 2022 por partido), Mapa escolar, GeoInfra, OPISU, Estadística CABA e IDECOR.
- **Catálogo completo de IDERA** leído en vivo (167 organismos), con filtros por nivel y jurisdicción; búsqueda de una capa **en todos los destacados** a la vez.
- **WFS y ArcGIS como vectores editables:** se cargan según la vista o completas, con filtro en el servidor (CQL o SQL) y filtro por atributos en el navegador; estilo, rótulos, clasificación, leyenda, cita en el epígrafe y descarga en GeoJSON.
- **WMS como imagen** con los estilos del servidor y su leyenda. Los servidores sin CORS (por ejemplo, SEGEMAR) se pueden ver pero quedan fuera de la exportación, con aviso.
- La verificación de cada servicio está en [`docs/servicios-verificados.md`](docs/servicios-verificados.md).

## Imágenes y coberturas
- **Imagen por fecha:** Sentinel-2 (10 m, último año) y **Landsat desde 1972** (MSS, TM, ETM+, OLI): búsqueda de fechas en la vista con nubosidad máxima, rango y estación; representaciones de color natural, agricultura, infrarrojo, SWIR, NDVI, NDMI, NBR, NDBI o temperatura de superficie. Opción de completar los huecos con las fechas cercanas.
- **Comparar fechas con cortina:** la capa de arriba se ve solo a un lado de una línea; rótulos con las fechas y línea divisoria que también salen en la exportación.
- **Mosaicos anuales sin nubes** (EOX, 2016–2024).
- **Cobertura del suelo 10 m 2017–2025** con paleta propia (aplicada en el servidor), clases que se ocultan o recolorean, **superficie por clase en la vista**, **matriz de cambios** entre dos años y **mapa de cambios** (CSV descargable).
- **Clasificación propia** no supervisada (k-means) de la vista sobre seis bandas de reflectancia, NDVI y NDWI, con nombres sugeridos, superficies y NDVI medio por clase, renombrable y recoloreable.

## Análisis
- **Clasificar una capa** por un campo numérico: cortes naturales (Jenks), cuantiles, intervalos iguales o desvío estándar, con rampas secuenciales; para puntos, **símbolos proporcionales** (área proporcional al valor) con leyenda de tamaños reales.
- **Áreas de influencia** a varias distancias, **densidad** por hexágonos o por núcleo (bandas), **polígonos de Thiessen**, **conteo de puntos en polígonos** con densidad por km².
- **Patrón de puntos:** índice de vecino más próximo de Clark y Evans (con puntaje z) y **centro medio con elipse de desvío estándar**.
- **Medición geodésica** de distancias y superficies.
- **Perfil topográfico:** se dibuja el corte sobre el mapa y el perfil se agrega a la figura como elemento propio, con la **exageración vertical calculada y rotulada**.
- **Llamadas:** textos con línea de referencia a un punto del mapa.

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
- **Dibujo con grados de certeza:** cada trazo tiene categoría (camino, deslinde, curso de agua, frontera, suerte, bañado, población, posta, toldería, hito, **flujo o recorrido**, **zona de transición o borde incierto**, **lugar percibido o nombrado**…) y certeza: **documentada** (trazo lleno), **inferida** (guiones) o **conjetural** (puntos). Cada elemento guarda nombre, período, fuente y nota.
- **Versiones:** cada versión guarda su propia georreferenciación y sus trazos. Se pueden duplicar, fijar como registro, comparar (la otra versión se ve en gris) y exportar en GeoJSON. La **ficha metodológica** reúne fuentes, puntos de control, errores y criterios para el capítulo de métodos.

### Capas
- **IGN, Argentina continental** (se piden solo para la vista, a escalas de detalle): partidos, localidades, plantas urbanas, ríos y arroyos, cañadas, canales, lagunas, bajos anegables, bañados, curvas de nivel, puntos acotados, rutas, caminos rurales, huellas, ferrocarril y estaciones, escuelas, cementerios, edificios religiosos, taperas, ruinas, establecimientos agropecuarios e **índices de cartas topográficas 1:50.000 y 1:100.000** (con año de levantamiento y marco).
- **ARBA:** parcelas, manzanas, quintas, chacras, secciones, circunscripciones y partidos.
- **Atlas de Mensuras de Giles:** mensuras del Archivo Histórico de Geodesia (1825–1925) coloreadas por período, registro gráfico de c. 1874, planta urbana de 1884, caminos, ferrocarril, tranvía y telégrafo, estancias y puestos de 1884 y el poblamiento dibujado en las mensuras.
- Las de Coni-Mapas: Argenmap, Antártida e IGN marítimo, REMA, GEBCO, NPI, DEM analítico (ahora con rampas «llanura», «sepia» y «bajos húmedos»), imágenes satelitales y referencias.
- Simbología: tipos de línea, **decoraciones** (borde, doble línea, ferrocarril, durmientes, peine, dientes de frontera, flechas de recorrido, postes de telégrafo), **tramas** (bañado, ondas, rayas de agua, pastizal, surcos, punteado de médanos, ladrillo, monte) y clasificación por **rangos** (períodos, cantidades; cortes naturales, cuantiles, intervalos iguales o desvío estándar) además de valores únicos. La paleta elegida es la que se usa al generar, y la app avisa cuando el campo parece un código identificador en vez de una medida.
- **Objetos elegidos en el mapa:** un clic sobre un polígono, línea o punto de cualquier capa vectorial (propia, IGN, servicios WFS o ArcGIS) lo elige; Mayús + clic suma o quita objetos. El inspector muestra sus atributos y su superficie o longitud, y permite darle a la selección **color, trama, contorno y tipo de línea propios**: pasa a ser una *característica propia* con nombre y entrada en la leyenda, mientras el resto de la capa conserva su estilo y su clasificación. También se pueden elegir los objetos con el mismo valor de un atributo, sumar objetos a una característica existente, separarlos u ocultarlos. El resaltado de la selección no entra en la exportación.

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
| ARBA (Provincia de Buenos Aires) | WMS y WFS `geo.arba.gov.ar` | Catastro territorial, IDERA |
| IDERA y organismos del catálogo (INA, INDEC, INTA, Ambiente, SEGEMAR, Estadística PBA…) | WFS, WMS y ArcGIS REST de cada organismo | cada capa agregada guarda su cita con la fecha de consulta |
| Sentinel-2 (Copernicus, ESA) | Esri Sentinel-2 Views (`sentinel.arcgis.com`) | fecha y representación en el epígrafe |
| Landsat (USGS, NASA) | Esri Landsat Multispectral (`landsat2.arcgis.com`) | fecha y representación en el epígrafe |
| Cobertura del suelo 10 m | Impact Observatory, Microsoft y Esri | Karra et al. (2021) |
| Sentinel-2 cloudless | EOX IT Services | por año, con datos Copernicus |
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
El código está en `src/` (OpenLayers 10, proj4, fflate, shpjs, geotiff.js y módulos de Turf, empaquetados con esbuild). En la versión 3: `db.js` y `library.js` (proyectos y mapas en IndexedDB), `starter.js` (primer mapa de un proyecto), `services.js` (catálogos y capacidades de servicios), `imagery.js` (imágenes por fecha, coberturas, cambios y k-means), `analysis.js` (clases y geoprocesos) y las pantallas `ui/home.js`, `ui/servicesDialog.js`, `ui/imageryDialog.js`, `ui/analysisPanel.js` y `ui/dialogs.js`. Módulos nuevos respecto de Coni-Mapas: `interpret.js` (lectura del tema y del lugar), `themes.js` (estilos de tesis), `media.js` (destinos, legibilidad y simulación), `georef.js` (transformaciones y residuos), `interp.js` (fuentes, versiones y ficha metodológica), `imagestore.js` (imágenes en IndexedDB) y las pestañas en `src/ui/`. `node tests/georef.test.mjs` prueba las transformaciones contra una homografía conocida.

## Próximo paso: participación
La planoteca y las capas propias ya separan el mapa base de lo que se le suma. El paso siguiente es abrir un mapa publicado a **aportes situados** (señales, opiniones geolocalizadas, audios, fotos y videos, con una mirada situacionista y perceptual), que necesita un servidor compartido para recibir y moderar los aportes; el modelo de datos de las capas propias (GeoJSON con atributos libres y cita) es el punto de partida.

## Licencia
Código bajo licencia MIT. Cada capa conserva la licencia y las condiciones de uso de su proveedor.
