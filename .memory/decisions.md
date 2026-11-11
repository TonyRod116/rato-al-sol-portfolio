# Decisiones — Rato al Sol

## 2026-11-03 — app con el mapa como pantalla principal

- Tony pidió que iPhone y Android se usen como una app y no como una página larga. Se conserva React Native/Expo, con mapa nativo, búsqueda en una pantalla propia y ficha inferior ampliable para la luz y el detalle del punto.
- La búsqueda de sol cercano tiene su propia pestaña y controles táctiles. La identidad, el cálculo solar compartido y los avisos sobre datos insuficientes se mantienen; la web de producto sigue su propio recorrido.
- La implementación y la vista web de desarrollo no demuestran el comportamiento en iPhone o Android: faltan dispositivos, mapas y accesibilidad nativa, además de preparar firma y distribución cuando se autoricen.

## 2026-10-30 — identidad y ubicación

- Confirmado por Tony: nombre **Rato al Sol**, carpeta `rato-al-sol` bajo `Cool_Projects` en WSL.
- Alcance de aquel encargo: preparar archivos base, especialmente a partir de BuildApp. La implementación comenzó después, el 2026-11-02.

## 2026-10-30 — reglas y continuidad

- Se adopta el patrón BuildApp: `AI_SHARED_INSTRUCTIONS.md` canónico y cinco copias para agentes, con sincronización y comprobación automáticas.
- Se reutiliza su memoria `.memory`, lectura selectiva, cambios pequeños, revisión por riesgo y QA visual. MTM aporta solo disciplina general de evidencia y conservación de negativos.
- Auto Review sigue la preferencia global de Tony; la configuración del repo no amplía permisos ni fija un modelo.
- Lista inicial de tareas en `todo.md`. No se presupone Beads ni se instala un tracker. Si se configura, se migra el trabajo activo y se conserva una sola fuente de estado.
- No se añaden frameworks, dependencias, credenciales, infraestructura, remotos ni workflows de release de los proyectos de referencia.

## Decisiones abiertas

Posición real de terrazas, dataset de geometría/alturas, tolerancia del modelo y hosting del mapa pendientes de comprobación.

Documentar el motivo y la evidencia al resolverlas. No convertir una propuesta en decisión aprobada por copiarla desde una conversación o desde otro repo.

## 2026-10-30 — despliegue documentado y frontera de BuildApp

- Petición explícita de Tony: orientar a cualquier IA desde CLI sobre el producto, frontend, backend y publicación, sin implementar ni tocar infraestructura en este encargo.
- BuildApp es un proyecto profesional activo: no modificar ni utilizar sus servicios, repositorios, bases, credenciales, almacenamiento, web roots, DNS o despliegues para Cool Projects.
- Permitido: un backend NUEVO común exclusivamente para Hora de Salir, Rato al Sol y TiendeYa. Carpeta propuesta `Cool_Projects/cool-projects-api/`, todavía inexistente; no es una cuarta app ya creada.
- Referencia de publicación: IONOS + Cloudflare para cada frontend y Render para un servicio de API nuevo. No hay dominios, servicios, claves o recursos nuevos provisionados.
- Rutas de código, puertos y endpoints en la guía son propuestas, no despliegues reales. Stack y destinos reales se comprobarán y registrarán durante el encargo que los implemente.
- Canon de orientación: [PROYECTO_Y_DESPLIEGUE.md](../PROYECTO_Y_DESPLIEGUE.md). No copiar comandos operativos o secretos de BuildApp.

## 2026-11-02 — primer recorrido local

- Tony pidió empezar a construir la app. Se elige un frontend estático, sin dependencias ni servicios, para probar fecha, hora, filtro, mapa, lista y selección compartida.
- Los intervalos y los cuatro lugares son inventados y están marcados como ejemplo. No se implementa ni valida un motor solar, ni se infiere sombra real de la entrada de un local.
- El censo municipal de Madrid es un candidato útil, pero sus coordenadas describen aproximadamente la puerta del negocio. El municipio también publica datos de edificios y alturas estimadas; falta verificar la posición de las mesas y la cobertura y precisión de esos datos antes de presentar resultados reales. Ver [fuentes](../docs/DATA_SOURCES.md).

## 2026-11-03 — primera consulta de Madrid y escenario solar

- Tony eligió Madrid para probar terrazas reales. Se seleccionó Ayala/Recoletos como muestra pequeña y reversible: el navegador consulta el censo municipal solo al pulsar un botón, sin claves ni ubicación personal. Se atribuye la fuente y no se infiere la posición de las mesas ni la apertura real.
- Se incluye SunCalc 2.0.2 con licencia y una comprobación frente a un caso independiente; el motor geométrico se aplica únicamente a edificios y lugares inventados. Se separan noche, horizonte bajo y ausencia de geometría. No se ha validado la precisión sobre terrazas reales.

## 2026-11-03 — mapa real con respaldo

- Tony pidió utilizar Google Maps como en Hora de Salir y mejorar el recorrido. El mapa real muestra el censo de Ayala/Recoletos y sus entradas aproximadas; la simulación de sol permanece separada. La consulta municipal se inicia ahora al abrir la página y se puede actualizar.
- Se integró la clave de navegador autorizada del proyecto hermano sin copiar claves de servidor; el origen local 5182 no está permitido por Google. Tony autorizó después añadirlo, pero falta acceso a la cuenta para hacer el cambio y probarlo. Leaflet y OpenStreetMap proporcionan un mapa alternativo con atribución. No se afirma que las sombras o mesas sean reales.

## 2026-11-03 — perspectiva real con volúmenes orientativos

- Tony prefiere la estética de la simulación. La vista inicial usa MapLibre y OpenFreeMap para mostrar edificios en perspectiva con una paleta próxima al ejemplo; permite girar la vista y alternar entre 2D y 3D. Google queda como opción y Leaflet como respaldo 2D si el 3D falla.
- Los volúmenes se emplean solo para visualización: pueden incluir alturas estimadas o valores por defecto y no identifican dónde están las mesas. No se usan para inferir sombra, intervalos de sol ni precisión de una terraza real.

## 2026-11-03 — unificar mapa y sombras de Ayala

- Tony pidió reunir el mapa de Madrid con el selector y las sombras. Se consultan las alturas estimadas municipales en un rectángulo fijo de Ayala; en la prueba inicial devolvió 1.324 polígonos. El mapa usa esa misma geometría para volúmenes y sombras, con respaldo en 2D.
- Las sombras son una orientación, no una validación ni una clasificación de luz en las mesas. No se conocen sus posiciones ni se incluyen nubes, árboles o toldos. Fuera del área de consulta no hay cobertura; el sol bajo se muestra sin sombra calculada.
- Google se mantiene fuera del selector visual hasta que el origen autorizado se pueda habilitar y se haya comprobado la integración de sombras. La clave y la cuenta siguen sin cambios.

## 2026-11-03 — prioridad nativa y búsqueda solar

- Tony pidió priorizar una app nativa iOS/Android, además de web, con búsqueda por nombre o por hora y distancia. Se elige React Native/Expo para compartir interfaz y motor solar sin incrustar la web; la web anterior se conserva.
- Se calcula para puntos exteriores elegidos y para una muestra acotada de espacios públicos, nunca para mesas inferidas de la entrada de un local. Madrid proporciona alturas estimadas; OpenStreetMap es candidato para cobertura más amplia, pero el servicio público de consultas no respondió en las pruebas locales y no está validado para producción.
- Expo SDK 57 permite la ruta de prueba con Expo Go durante la transición a SDK 58. La auditoría de npm identifica avisos en Expo CLI que deben revisarse antes de distribuir. Las pruebas de empaquetado no equivalen a probar iOS o Android en un dispositivo.

## 2026-11-03 — destinos de publicación elegidos

- Tony quiere publicar más adelante en Android, iPhone y `https://tony-r.com/rato-al-sol/`. La ruta web elegida reemplaza la antigua propuesta de un dominio distinto; el alojamiento concreto aún no se ha identificado ni modificado. La prohibición de utilizar recursos de BuildApp sigue vigente.
- Se preparan perfiles EAS, iconos y pantalla de arranque con la identidad existente, y un paquete estático para esa subruta. Android necesitará una clave de Maps propia y restringida a las firmas utilizadas; Apple Maps es el proveedor actual en iPhone. La configuración local no crea cuentas, claves, binarios firmados ni publicaciones. Ver [publicación](../docs/RELEASE.md).
