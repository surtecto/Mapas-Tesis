# Servicios verificados desde surtecto.github.io (25/10/2026)

Prueba hecha desde el navegador, con el mismo origen que la web publicada: `fetch` de GetCapabilities (o `?f=json` en ArcGIS). «CORS» = se puede leer y exportar; «sin CORS» = el servidor responde pero no habilita lectura desde otra web (sirve solo para ver, no para exportar ni restilizar).

## Catálogo IDERA
- Planilla publicada (CSV, con CORS): `https://docs.google.com/spreadsheets/d/e/2PACX-1vTC_6dXWs9MCP2cxCJquyvJzW_tXO4g2hcbEfyOyQ5BlbKSX7iKxdKBjuUwlEqJJELIJgLERDp5ZUir/pub?gid=0&single=true&output=csv`
- Columnas: NIVEL JURISDICCIONAL, JURISDICCION, DEPENDENCIA, INSTITUCIÓN/ ORGANISMO, TIPO DE GEOSERVICIO, URL, FECHA DE MODIFICACIÓN. 348 registros, 311 WMS/WFS.
- Resultado de la prueba: 191 con CORS, 49 sin CORS, 53 caídos, 18 sin respuesta en 15 s.

## Nacionales con CORS
- IGN: `https://wms.ign.gob.ar/geoserver/ows` (WFS 192 capas, WMS 193); riesgo: `https://wms.ign.gob.ar/geoserver/ign_riesgo/ows`; BAHRA: `https://wms.ign.gob.ar/geoserver/idera/bahra/ows`.
- INA: `https://alerta.ina.gob.ar/geoserver/ows` (WFS 115: estaciones, cuencas y áreas de agregación, límite Cuenca del Plata, escenas Landsat de agua, alturas y caudales).
- INDEC: WFS `https://geonode.indec.gob.ar/geoserver/geonode/wfs`, WMS `https://geonode.indec.gob.ar/geoserver/wms` (aglomerados, departamentos, fracciones y radios censales, localidades censales, gobiernos locales, vías de circulación).
- INTA: `https://geo-backend.inta.gob.ar/geoserver/ows` (WMS 117, WFS 32) y nodos regionales `https://geo-nodo01…12.inta.gob.ar/geoserver/{wfs,wms}` (Región Buenos Aires = nodo07; Centro de Investigación de Recursos Naturales = nodo05).
- Ambiente: `https://geo.ambiente.gob.ar/geoserver/ows` (422 capas).
- Transporte: `https://ide.transporte.gob.ar/geoserver/idera/{wfs,wms}`.
- SENASA: `https://geonode.senasa.gob.ar/geoserver/{wfs,ows}`.
- CONAE: `https://geoservicios.conae.gov.ar/geoserver/{HAPN,GeoServiciosCONAE}/{wfs,wms}`, mosaico de alta resolución `https://geotematico01.conae.gov.ar/geoserver/{wfs,wms}` (WMS 1026).
- SHN: `https://wms.shn.gob.ar/geoserver/{wms,wfs}`.
- Energía: WMS `https://sig.energia.gob.ar/wmsenergia`, WFS `http://sig.energia.gob.ar/wfsenergia` (pasar a https).
- Mapa Educativo Nacional: `http://mapa.educacion.gob.ar/geoserver/ows` (pasar a https).
- Forestal (SAGyP): `https://geoforestal.magyp.gob.ar/geoserver/ows` (WMS).

## Nacionales sin CORS (solo visualización)
- SEGEMAR: `https://sigam.segemar.gov.ar/geoserver217/ows` (98 capas: Unidades Geológicas 2.5M/250K/5M, Estructuras, Peligrosidad, Suelos 250K, Unidad hidrogeológica 250K, etc.). Capacidades leídas abriendo la URL en una pestaña.
- Vialidad Nacional `https://sigvial.vialidad.gob.ar/geoserver/dnv/ows`; Obras Públicas `https://geoportal.obraspublicas.gob.ar/geoserver/ows`; Población (RENAPER) `https://poblacion.idear.gov.ar/geoserver/{wms,wfs}`.

## Provincia de Buenos Aires
- ARBA WFS con CORS: `https://geo.arba.gov.ar/geoserver/idera/wfs` (Parcela, Subparcela, Manzana, Quinta, Chacra, Fraccion, Seccion_Catastral, Circunscripcion, Departamento, Lado_Catastral, Otro_edificio_gubernamental); GeoJSON con `srsName=EPSG:4326` en orden lon/lat.
- Estadística PBA (ArcGIS 10.91, CORS): REST `https://mapas.estadistica.ec.gba.gov.ar/server/rest/services` (carpetas Censo2022, Anuario2025, ManchaUrbana…); `ServiciosWeb/ServiciosWeb/MapServer` tiene 951 capas (Partidos, Fracciones y Radios 2022 y, por partido, ejes, manzanas, hitos, fracciones y radios). Consultas `f=geojson`, maxRecordCount 1000, **sin paginación**: no mandar resultOffset.
- Mapa escolar `https://mapaescolar.abc.gob.ar/me/{wfs,wms}`; IDEBA nodos `https://geoserver-nodo1.ideba.gba.gob.ar/geoserver/{workspace}/{wfs,wms}` y `geoserver-nodo2` (municipios); OPISU; GeoInfra (WMS 683). IDEBA central (`geoserver.ideba.gba.gob.ar`) y SATA: sin CORS.

## Otras jurisdicciones con CORS (selección)
- CABA Estadística `https://ideec.estadisticaciudad.gob.ar/geoserver/ows` (535); IDECABA WMS `https://geoserver.buenosaires.gob.ar/geoserver/catalogo_og_130/wms`.
- Córdoba IDECOR `https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/{wfs,wms}` (515/696).
- La Pampa, Catamarca, Corrientes, Jujuy, Salta, Tierra del Fuego, Mendoza (ArcGIS WMSServer), Neuquén, Tucumán, Misiones.

## Imágenes satelitales (ArcGIS ImageServer, CORS)
- Sentinel-2 `https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer`: 13 bandas, 10 m; campos `acquisitiondate`, `cloudcover` (0–1), `category`; archivo móvil (escenas recientes, aprox. 14 meses). Funciones: Natural Color, Agriculture, Color Infrared, Short-wave Infrared, Geology, Bathymetric (con y sin DRA), NDVI Colormap, NDMI Colorized, Normalized Burn Ratio, NDBI, NDVI/NDWI Raw.
- Landsat `https://landsat2.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer`: 1972-07-25 → actual; campos `AcquisitionDate`, `CloudCover`, `SensorName` (MSS 1–5, TM, ETM+, OLI). Funciones análogas + temperatura de superficie (bandas 10/11). Sobre Giles hay escenas desde 1976.
- Landsat GLS `https://landsat2.arcgis.com/arcgis/rest/services/LandsatGLS/MS/ImageServer` (épocas 1975, 1990, 2000, 2005, 2010).
- Cobertura del suelo 10 m (Impact Observatory/Esri) `https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer`: 2017–2025, campo `Year`/`StartDate`; valores 1 agua, 2 árboles, 4 vegetación inundada, 5 cultivos, 7 construido, 8 suelo desnudo, 9 nieve/hielo, 10 nubes, 11 pastizal. **La función Colormap con paleta propia funciona en `renderingRule`** (paleta a medida del lado del servidor).
- EOX Sentinel-2 sin nubes por año: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-{año}_3857/default/g/{z}/{y}/{x}.jpg` (2016–2024).
- Sin CORS: Terrascope (ESA WorldCover), MapBiomas en Google Cloud Storage.
