# Trabajo — Rato al Sol

Esta lista es la fuente inicial del trabajo. Beads no está configurado. No mantener una segunda lista equivalente en NOTES o en otro servicio.

## Sombras de edificios en Barcelona y Madrid · 2026-11-11

- Sigue en curso la preparación para la siguiente versión de iOS y Android.
- La corrección recupera las sombras de edificios sin altura en Calàbria y cubre el mismo caso en ambas ciudades. La vista, la selección de un punto y la búsqueda de sol comparten los datos de edificios.
- Las huellas de Calàbria 245, 247 y 246–248 carecían de altura y plantas en OpenStreetMap. El extracto de Catastro aporta plantas en esas fachadas. La capa de Madrid combina las alturas municipales con partes catastrales que amplían su cobertura. Los archivos se leen por zona en el móvil.
- Hay [pruebas de cobertura](../tests/shadow-coverage.test.mjs) y de [cálculo de franjas sin bloquear la interfaz](../tests/light-at-task.test.mjs). La rama de partida ya reproduce desde la hora elegida y vuelve al inicio al acabar el día.
- Falta verificar la capa incluida y el tiempo de carga en un iPhone y un Android con la compilación firmada. Contrastar Calàbria y Sol sobre el terreno antes de dar por comprobada la precisión.

## BASE-001 — Preparar fundamentos específicos

- Estado: `done` — verificado el 2026-10-30 en la carpeta definitiva.
- Encargo: crear instrucciones y archivos base inspirados principalmente en BuildApp.
- Propietario: sesión de preparación inicial.
- Alcance de archivos: canon y copias IA, documentación, memoria, configuración de Auto Review y herramientas de comprobación de esta base.
- Aceptación: nombres correctos, reglas adaptadas al dominio, copias idénticas, enlaces locales válidos, comandos existentes y ningún proveedor conectado por accidente.
- Evidencia: `python3 scripts/repo_check.py`, sincronización, `bash -n` de los tres scripts y resumen de sesión pasaron en la carpeta definitiva. Antes de copiar se comprobaron controles negativos de drift, configuración, enlaces, LF, symlinks y secretos ignorados, y repetición de sincronización sin cambios de bytes.
- Límites: esto no acredita funcionamiento, precisión ni despliegue de la aplicación.

## APP-001 — Primera fase del producto

- Estado: `in_progress` — iniciado por petición de Tony el 2026-11-02.
- Resultado: empezar la aplicación con un recorrido interactivo y preparar la elección de una zona real a partir de cobertura y derechos.
- Aceptación de esta entrega inicial: mapa y lista accesibles, selección de fecha y hora, filtro y enlace compartible; datos ficticios y límites visibles, sin presentar resultados como predicciones. Pruebas de comportamiento y revisión de navegador en móvil y escritorio.
- Entrega inicial: ejemplo local implementado con cuatro lugares ficticios, mapa y lista sincronizados, fecha, hora, filtro, selección y enlace compartible. Los estados no se presentan como predicciones.
- Comprobación: cuatro pruebas de comportamiento en Node y revisión en Chromium con anchos de 320, 390, 768 y 1440 píxeles, teclado, movimiento reducido, ampliación CSS al 200 %, enlace compartido y ausencia de JavaScript. La comprobación no sustituye una prueba en dispositivos ni valida predicciones solares.
- Fuentes candidatas: el censo municipal de Madrid identifica aproximadamente la puerta del local, no la posición de sus mesas; el municipio publica alturas estimadas y modelos de edificios que aún requieren revisión de cobertura y precisión.
- Mandato: implementación y pruebas locales en este repositorio; sin publicación ni recursos de BuildApp. La existencia de un futuro backend común no autoriza crearlo en este encargo.
- Continuación 2026-11-03: Tony pidió arrancar la app y eligió Madrid. El ejemplo calcula posición solar y sombras sintéticas; se comprobó una referencia independiente, noche, geometría simple, cambios de hora y navegador. La consulta real del censo municipal de Ayala/Recoletos devolvió tres registros y muestra su falta de datos solares; también se probaron fallo, vacío y texto no confiable.
- Continuación 2026-11-03: Tony pidió una experiencia visual más potente. Se añadió una escena ilustrada en perspectiva con sombras variables, reproducción del día y tramos de sol aproximados cada 10 minutos. Escena, estados y tramos comparten el cálculo solar; el barrio sigue siendo ficticio y la consulta real carece de posición de mesas. Se probaron geometría analítica, límites de reproducción y casos sin datos, y se inspeccionó Chromium en móvil, escritorio y zoom al 200 %. Pendiente validar datos y sombras reales, no cerrado por la mejora visual.
- Continuación 2026-11-03: mapa interactivo con tres entradas reales del censo y vista solar ficticia separada; sincronización de lista y marcadores, revisión móvil/escritorio y fallos simulados. La clave de navegador autorizada del proyecto hermano rechaza el origen local 5182; Google queda implementado pero pendiente de permitir ese origen y comprobarlo de verdad. En su ausencia se probó el mapa de respaldo OpenStreetMap; las claves permanecen fuera de Git. No se infiere sol de la posición de una entrada.
- Continuación 2026-11-03: barrio real con edificios 3D orientativos, colores de la simulación, giro, cambio 2D/3D y alternativa 2D comprobada. El censo real devolvió tres entradas; ninguna se usa para calcular sol. Tony autorizó expresamente añadir el origen local 5182 a la restricción de la clave de Google compartida, pero el almacén de credenciales de Google Cloud no contiene ninguna cuenta y no se pudo identificar el proyecto ni efectuar el cambio. Falta una sesión con acceso a esa clave; conservar las restricciones existentes, no habilitar facturación ni modificar BuildApp. Después, comprobar Google y sus edificios en el navegador de verdad.
- Continuación 2026-11-03: mapa 3D unificado con sombras orientativas y selector. La consulta acotada municipal devolvió 1.324 polígonos con alturas estimadas; edificios, sombras y dirección utilizan la misma geometría y motor solar. Comprobados casos analíticos, dirección mañana/tarde, giro, noche, fallo/recuperación, aviso fuera de zona, mapa 2D alternativo y Chromium móvil/escritorio. No se infiere la luz de mesas desconocidas ni se ha contrastado sobre el terreno. Google sigue pendiente de acceso a la cuenta y de validar sombras en ese proveedor.
- Siguiente acción: comprobar vigencia, cobertura y precisión de alturas en Ayala; conseguir posiciones verificables de mesas y contrastar las sombras con observaciones antes de dar horas de sol por terraza. Revisar cuota y caché antes de aumentar tráfico.
- Contexto: [fuentes](../docs/DATA_SOURCES.md), [producto](../docs/PRODUCT.md) y [roadmap](../docs/ROADMAP.md).

Al cambiar de etapa: resultado, evidencia, bloqueo y siguiente acción concreta. Cerrar una tarea solo si se cumple su aceptación, no por haber agotado una sesión.

## APP-002 — App nativa y búsqueda solar por lugar o cercanía

- Estado: `in_progress` — encargo de Tony del 2026-11-03; prioridad iOS/Android nativo con versión web posterior.
- Objetivo: buscar un restaurante, terraza, plaza u otro lugar y explorar sus intervalos de luz estimados; también elegir hora y distancia para encontrar lugares cercanos con sol. La ubicación es opcional y se solicita en contexto.
- Aceptación: aplicación móvil nativa ejecutable y verificable, búsqueda y selección de puntos, mapa y selector, cálculo solar compartido con la web, exploración cercana con radio y resultados identificados como estimaciones o desconocidos. No atribuir luz a mesas no localizadas ni confundir sol geométrico con cielo despejado. La extensión geográfica queda condicionada a datos de edificios, alturas y cobertura disponibles y derechos válidos.
- Avance: prototipo React Native/Expo con búsqueda por nombre o proximidad, radio personalizado de 100 m a 5 km, hora, selección manual, mapa nativo y motor solar compartido. Un punto de Madrid se probó con alturas municipales reales; la búsqueda por nombre del censo funcionó al simular fallo del proveedor general. El filtro cercano se comprobó con datos sintéticos, sin tratar las entradas como mesas. La alternativa de proximidad consultó parques y alturas municipales reales para dos puntos; el punto del parque es orientativo y no se modelan árboles.
- Hitos: (1) contrato y motor de posición/intervalos con incertidumbre y pruebas; (2) fuente de lugares y geometría acotada, sin publicar ubicación en URLs ni inferir mesas; (3) app nativa y prueba real si el dispositivo lo permite; (4) versión web conectada y comprobación visual; (5) cotejar lo conseguido contra el objetivo completo. No cerrar por entregar solo una maqueta.
- Permisos: implementación y pruebas locales en este repositorio, consultas públicas acotadas, y actualización de la rama privada ya autorizada; sin contratar APIs, crear infraestructura o desplegar.
- Evidencia y límites: empaquetado JavaScript de iOS/Android y vista web comprobados; falta ejecución en un dispositivo real. Overpass devolvió 406 y la alternativa agotó el plazo desde este entorno, por lo que la búsqueda general real y la cobertura fuera de Madrid no están verificadas. Las estimaciones no se han contrastado sobre el terreno; hay dos avisos altos de npm en dependencias de Expo CLI.
- Siguiente acción: probar en iOS y Android, obtener una fuente de búsqueda fiable con derechos/capacidad adecuados, validar alturas y sombras y localizar mesas reales. Tras un rechazo inicial, Tony autorizó expresamente Expo en la red local y el servidor del puerto 8082 quedó accesible; falta la prueba desde su dispositivo. Mantener la tarea abierta.

## APP-003 — Luz de la ciudad y fluidez del mapa

- Estado: `in_progress` — petición de Tony del 2026-11-03.
- Objetivo: ofrecer Expo al móvil en la red local autorizada, adaptar la apariencia del mapa a noche y luz baja y reducir el coste de los edificios y sombras al explorar y cambiar la hora.
- Aceptación: colores ligados al mismo sol del selector, transición visible de noche/amanecer/atardecer, control razonable de detalle, sombras coherentes con la escena y comprobación visual y de rendimiento antes/después. Comprobar las horas de cambio de horario y no alterar la precisión del cálculo para mesas.
- Estado inicial: el servidor Expo LAN escucha en el puerto 8082 tras la autorización expresa de Tony; pendiente prueba desde su móvil. Un cálculo previo con 1.324 edificios produjo 16.178 polígonos de sombra y unos 3,8 MB de geometría por cambio de hora en la muestra de Ayala.
- Avance: apariencia solar para la web y el prototipo móvil, ciclo completo de 24 horas, detalle ligero 2D opcional y recorte de sombras a la zona visible con margen; se conservan las sombras de edificios exteriores que pueden entrar en pantalla. Pruebas de fecha, sombras y aspecto; capturas 3D, 2D y web móvil revisadas, incluidos teclado y error de horario inexistente. Para una vista cercana de prueba, 4.665 polígonos y 1,09 MB frente a 16.178 y 3,78 MB; la mediana local de cálculo bajó de 9,54 a 2,17 ms en 20 iteraciones. No es una medición de FPS ni demuestra el rendimiento en el ordenador de Tony.
- Siguiente acción: abrir Expo Go en un iPhone y un Android reales, comprobar mapa, colores y respuesta al deslizar; confirmar con Tony si el modo ligero resuelve la saturación de su equipo. Mantener abierta la tarea hasta tener esa evidencia.
- Permisos: exponer el servidor de desarrollo en la red local, implementar y verificar localmente y actualizar la rama privada ya autorizada. No publicar ni crear infraestructura.

## APP-004 — Sombras uniformes y fondo aéreo

- Estado: `done` — petición de Tony del 2026-11-03; entrega web local comprobada.
- Objetivo: evitar el oscurecimiento por sombras superpuestas, mantener edificios parcialmente transparentes en 3D a cualquier escala y permitir alternar plano e imagen aérea.
- Aceptación: misma intensidad de sombra en los solapes, edificios 3D visibles también al alejar, modo 2D coherente, fotografía atribuida con recuperación ante fallo, y comprobación funcional y visual en navegador.
- Alcance: mapa web local y respaldo 2D; no se cambian cálculos de sol ni se atribuye la luz a mesas desconocidas.
- Evidencia: composición de sombras comparada por píxeles, limpieza nocturna, datos y fotografía reales, vista 3D al máximo alejamiento permitido, paso a 2D y vuelta, teclado, pantallas de 320/390/1440 px y caídas/reintentos simulados del proveedor en 3D y en el respaldo 2D. En una muestra local de 16.178 polígonos el dibujo tuvo una mediana de 27,9 ms en 12 iteraciones; no es una medición de FPS ni de la máquina de Tony.
- Límites y continuación: el proveedor deja de ofrecer detalle 3D suficiente por debajo del nivel 14, por lo que para alejar más se usa 2D. La foto de España puede ser antigua y conserva sus propias sombras. Falta probar la fluidez en equipos y dispositivos reales e incorporar estas mejoras a la app nativa, que continúa en APP-002/APP-003.

## APP-005 — Buscar luz por punto y franja

- Estado: `in_progress` — petición de Tony del 2026-11-03.
- Objetivo: mejorar la legibilidad de las sombras sobre la fotografía aérea y permitir elegir un lugar o un punto del mapa, consultar sus tramos estimados y buscar sitios cercanos para una hora o una franja.
- Aceptación: los dos mapas dibujan sombras más visibles en foto aérea; marcador y cálculo responden al punto elegido; las búsquedas distinguen luz estimada de datos desconocidos y no atribuyen sol a mesas no localizadas; reloj, cobertura, árboles y nubosidad son explícitos. Comprobar fuentes reales y escenarios de fallo, pruebas de cálculo y navegador móvil/escritorio.
- Alcance: mapa web local y reutilización de cálculo y proveedores con el prototipo nativo; sin alta de servicios ni publicación. Horas en Madrid mientras no haya datos de zona horaria por lugar; cobertura real sujeta al proveedor disponible.
- Avance: web con sombras más contrastadas en fotografía aérea, selección en el mapa o por nombre, horarios de sol/sombra, búsqueda por hora o franja y distancia, y ubicación opcional. El prototipo nativo comparte el cálculo por franja y también muestra los estados del día. Los locales sin posición de mesas figuran sin confirmar en la búsqueda cercana.
- Evidencia: consulta y punto reales de Madrid, cuatro puntos exteriores analizados en una búsqueda de ejemplo, 3D y respaldo 2D, franja, errores, cambio de hora y casos con proveedores simulados; diseño inspeccionado en 320/390/768/1440 px. Se empaquetó JavaScript para iOS y Android y se probó la vista web de desarrollo del prototipo, pero no dispositivos nativos. La instancia pública de Overpass respondió 502; los resultados municipales no son un catálogo completo.
- Límites al terminar APP-005: las sombras dibujadas cubrían Ayala. APP-006 amplía la consulta al área visible, sujeta a cobertura. La web usa hora de Madrid y el móvil la del teléfono; falta la zona horaria local del destino. No se han contrastado predicciones sobre el terreno ni localizado las mesas; parques no incluyen árboles y la nubosidad es independiente. Cobertura y búsqueda fuera de Madrid siguen sin validarse.
- Siguiente acción: probar en teléfonos reales, mejorar y validar las fuentes geográficas y temporales fuera de Madrid y contrastar las estimaciones con observaciones. Mantener abierta la tarea hasta demostrar el alcance geográfico y nativo solicitado.

## APP-006 — Búsqueda comprensiva y mapa que sigue al usuario

- Estado: `in_progress` — petición de Tony del 2026-11-03.
- Objetivo: entender categorías y erratas en la búsqueda, cargar edificios y sombras al desplazarse, facilitar hora y distancia con controles táctiles, y mostrar bajo el mapa una barra con los intervalos aproximados de sol y sombra del punto elegido.
- Aceptación: buscar «reiaurante» devuelve lugares según la fuente; al cambiar de zona se consultan las alturas disponibles sin conservar sombras antiguas; hora y radio se ajustan con controles en web y móvil; un local dentro de un edificio ofrece opciones exteriores identificadas sin inventar dónde están las mesas. Verificar proveedores, regresiones y experiencia en navegador; no afirmar pruebas nativas no realizadas.
- Avance: búsqueda por categoría o nombre con tolerancia a erratas, controles de hora/franja y radio de 500 m a 5 km y barra con colores y horas escritas. El mapa web consulta edificios para la zona visible con margen; la app actualiza el entorno del centro. El cálculo conserva huellas sin altura como obstáculos desconocidos. El censo no identifica el tipo exacto del negocio, por lo que sus resultados se marcan como no confirmados.
- Evidencia: Soho New York de Jorge Juan, Madrid: la referencia municipal cae en un edificio y se ofrecen tres puntos exteriores aproximados con resultados distintos, sin atribuirlos a las mesas. La cartografía real devolvió 925 polígonos en otra zona que la caja inicial de Ayala. Pruebas de categorías con errata, huellas sin altura, subdivisión y deduplicación; navegador 3D y respaldo 2D, selección directa en mapa, teclado, 320/390/1440 px y respuestas tardías/fallo simulados. Vista web del prototipo móvil con catálogos municipales reales y Overpass deliberadamente lento; empaquetado iOS y Android sin ejecución en teléfonos.
- Límites: no se conocen las mesas ni se ha contrastado la sombra sobre el terreno; no se modelan árboles, toldos ni nubes y los tramos se muestrean cada 30 minutos. Si una vista es demasiado amplia hay que acercar el mapa; fuera de Madrid las alturas dependen de un servicio público de OpenStreetMap que falló en las pruebas de este entorno. El prototipo móvil limita el dibujo a 45 edificios/300 polígonos y la búsqueda municipal a dos puntos exteriores analizados; la web analiza cuatro.
- Siguiente acción: probar iPhone y Android reales, contrastar ubicaciones y sombras sobre el terreno y validar cobertura y zona horaria fuera de Madrid. Mantener abierta la tarea hasta obtener esa evidencia.

## APP-007 — Acercar controles y reducir horas desconocidas

- Estado: `done` — petición de Tony del 2026-11-03.
- Objetivo: retirar el selector de fondo, juntar la barra diaria y el selector de hora, y recuperar tramos de luz cuando la geometría disponible permita estimarlos sin inventar datos.
- Aceptación: controles adyacentes en web y móvil, sombra conocida reconocida incluso con cobertura incompleta sin afirmar sol ni luz dentro de un edificio, opciones exteriores para puntos afectados, y comprobación de interfaz, cálculo compartido y caso real de Madrid.
- Evidencia inicial: en un punto exterior aproximado junto a Soho New York, la regla de cobertura marca 14 de 48 muestras como desconocidas; reconocer primero sombras ya detectadas reduce esa cifra a 3 en esta muestra. Ampliar la consulta hasta 500 m solo recupera otra muestra y aumenta la consulta de 1.603 a 5.494 edificios, así que se conserva el radio actual.
- Evidencia: se corrigió el cálculo compartido conservando como desconocidos el sol sin cobertura suficiente, los puntos dentro de edificios y la cercanía al horizonte. Soho ofrece puntos exteriores también al marcar el centro del mapa; se comprobó el punto este y sus horas en la web y la vista web del prototipo móvil, controles táctiles/teclado, 2D, y capturas de 320, 390 y 1440 px. Las pruebas de dominio y el empaquetado JavaScript de iOS y Android pasan. Se corrigió además la caché de módulos que mantenía el cálculo anterior tras recargar.
- Límites y continuación: los intervalos son aproximados, no se han contrastado en la calle ni se conocen las mesas. Pueden seguir apareciendo tramos sin datos; Overpass respondió 502 y el resultado de Soho llegó del censo municipal. Falta probar en teléfonos reales y continuar APP-002 y APP-006.

## APP-008 — Preparar Android, iPhone y web en la ruta elegida

- Estado: `done` para la preparación local — petición de Tony del 2026-11-03; distribución y publicación siguen pendientes.
- Objetivo: preparar la app nativa para futuras distribuciones de Android e iPhone y la web para `https://tony-r.com/rato-al-sol/`.
- Aceptación: configuración reproducible para ambos sistemas, iconos propios y mapa de Android configurado sin guardar claves; paquete web limitado a archivos públicos y comprobado bajo la subruta real; guía de publicación y pendientes verificables. Diferenciar preparación, compilación nativa, pruebas en dispositivos y publicación.
- Evidencia inicial: la URL elegida devuelve actualmente la web personal de Tony; no se conoce su configuración de alojamiento ni se ha desplegado allí. El prototipo comparte código con la web y todavía no tiene pruebas en teléfonos ni catálogo general fiable. No hay herramientas nativas de Android/iOS en este entorno.
- Permisos: implementación y pruebas locales y actualización de la rama privada ya autorizada. La petición expresa que quiere publicar más adelante; no autoriza por sí sola desplegar, presentar en tiendas, crear cuentas, activar pagos ni usar recursos protegidos de BuildApp.
- Evidencia: configuración, iconos, arranque y permisos generados para ambas plataformas en una copia temporal; clave sintética de Android presente en el manifiesto y falta de clave rechazada para esa compilación; JavaScript empaquetado para iOS y Android. La web se sirvió desde `/rato-al-sol/` con 22 archivos explícitos y se probaron marcador, selector y barra solar en 3D/2D a 390/1440 px; no se publicó su configuración local. Pruebas de producto, empaquetado, documentación e instrucciones superadas.
- Límites: no hay APK, AAB, IPA, firma ni proyecto EAS verificado y no se han probado teléfonos. Android requiere una clave de mapas propia con restricciones. La auditoría npm encontró 14 avisos, dos altos en herramientas de Expo; falta evaluar la solución antes de distribuir. La fuente general, las sombras y las mesas continúan pendientes de validación según APP-002 y APP-006. El alojamiento de la URL elegida sigue sin identificar y sin modificar.
- Siguiente acción: continuar las tareas de producto, probar Android/iPhone reales y, cuando se autorice la distribución, completar las cuentas, firma, clave de mapas, privacidad, revisión de dependencias y destino aislado descritos en [publicación](../docs/RELEASE.md).

## APP-009 — Icono y repaso final de UX/UI

- Estado: `in_progress` — petición de Tony del 2026-11-03.
- Objetivo: proponer cinco variantes del icono y, con su visto bueno, mejorar la experiencia y la interfaz existente con `redesign-existing-projects` mediante el flujo `frontend-ui-engineering`.
- Aceptación: cinco propuestas visuales comparables y reconocibles en pequeño, conservando el icono actual hasta que se elija uno; después del visto bueno, revisar y mejorar los recorridos reales y comprobar el resultado en navegador y, para cambios nativos, en un dispositivo o emulador.
- Alcance: Tony eligió la propuesta 1 y autorizó expresamente el repaso con `redesign-existing-projects`. Conservar el nombre «Rato al Sol» y la identidad existente; aplicar el icono a las superficies web y nativas, y mejorar los problemas de uso constatados sin cambiar el alcance de las estimaciones solares.
- Avance: aplicado el icono 1 a la web y a los recursos de iPhone y Android; el nombre sigue siendo «Rato al Sol». En la web móvil la búsqueda aparece antes del mapa y al elegir un resultado el foco vuelve al mapa. En el prototipo de app los resultados aparecen junto al buscador, se muestran cuatro inicialmente y la selección deja espacio al mapa; se han mejorado la legibilidad y los controles táctiles.
- Evidencia: cinco propuestas revisadas, recursos nativos generados en una copia temporal y JavaScript empaquetado para iOS y Android. En Chromium se revisaron capturas de web y vista web del prototipo a 320, 390 y escritorio; se probó con cinco lugares simulados buscar, ampliar resultados, seleccionar, cambiar de lugar y ajustar la hora. Las pruebas del proyecto pasan. La aplicación nativa y su icono no se han probado en teléfonos ni emuladores.
- Siguiente acción: comprobar el aspecto, el icono y la navegación en iPhone y Android reales o emuladores como parte de APP-002; mantener la tarea abierta hasta disponer de esa evidencia.

## APP-010 — Inicio limpio en un lugar reconocible

- Estado: `done` para la implementación local — petición de Tony del 2026-11-03.
- Objetivo: retirar los tres marcadores antiguos que aparecen al iniciar, comenzar el mapa en un lugar más característico y reducir los elementos superpuestos que lo recargan.
- Aceptación: web 3D, respaldo 2D y prototipo móvil centrados en la Puerta del Sol, sin marcadores precargados ni etiquetas redundantes sobre el mapa; las búsquedas y la selección de un punto siguen funcionando, se conservan los controles útiles y las alturas corresponden a la zona visible.
- Alcance: cambios y verificaciones locales y actualización de la rama privada ya autorizada; sin publicación ni recursos externos nuevos.
- Evidencia: la vista inicial sin marcadores y las alturas municipales de la Puerta del Sol se comprobaron en 3D, en el respaldo 2D y en la vista web del prototipo móvil. Se probaron selección y cálculo de un punto con edificios reales, búsqueda de tres lugares simulados, giro y cambio 2D/3D. Se inspeccionaron capturas a 320, 390 y 1440 px; los controles de giro y vista quedan debajo del mapa y el inicio 3D carga sombras. El JavaScript se empaquetó para iOS y Android.
- Límites y siguiente acción: la app nativa todavía no se ha probado en un teléfono o emulador; seguir con la verificación de APP-002. Los horarios son estimaciones sin contraste sobre el terreno.

## APP-011 — Selector de hora más útil

- Estado: `done` para la implementación local — petición de Tony del 2026-11-03.
- Objetivo: limitar el selector de hora del mapa y el inicio de búsqueda a las 06:00–23:00 en la web y el prototipo móvil.
- Aceptación: extremos, marcas, hora inicial, reproducción y control por teclado coherentes; la barra diaria conserva los resultados de las 24 horas sin asumir que fuera de este rango siempre es de noche.
- Alcance: implementación y pruebas locales y actualización de la rama privada ya autorizada; no publicar.
- Evidencia: pruebas de los extremos, apertura de madrugada y a las 23:50, sincronización con la búsqueda, franja opcional, teclado, reproducción y capturas de 320, 390 y 1440 px en web y vista web móvil. La hora final opcional de una franja conserva la posibilidad de llegar a medianoche. Las pruebas de Node y el empaquetado JavaScript iOS/Android pasan.
- Límite: falta verificar los controles en teléfonos o emuladores; continúa en APP-002.

## APP-012 — Idiomas castellano e inglés

- Estado: `done` para la implementación local — petición de Tony del 2026-11-03.
- Objetivo: traducir la web y el prototipo móvil al inglés, conservando el castellano y un selector de idioma discreto.
- Aceptación: textos de navegación, controles, estados, resultados y accesibilidad coherentes en ambos idiomas; cambio funcional sin perder la selección de sitio u hora; comprobación en navegador y empaquetado móvil.
- Alcance: cambios y verificaciones locales y actualización de la rama privada ya autorizada; sin publicación.
- Evidencia: selector y preferencia local en web y prototipo móvil; búsquedas por categorías en inglés con pruebas de `park`, `restaurants` y `terraces`. En Chromium se comprobaron cambios durante cargas, resultados, lugar y hora conservados, persistencia, fallos simulados y accesibilidad del selector. Se revisaron capturas a 320, 390 y 1440 px y la web empaquetada bajo `/rato-al-sol/`. El JavaScript se empaquetó para iOS y Android; una generación temporal del proyecto iOS incluye el texto de permiso de ubicación en ambos idiomas.
- Límite: no se ha probado en teléfonos ni emuladores; los avisos nativos del sistema siguen el idioma configurado en el dispositivo, no el selector de la app. Continúa la comprobación nativa en APP-002.

## APP-013 — Una experiencia móvil nativa centrada en el mapa

- Estado: `in_progress` — petición de Tony del 2026-11-03.
- Objetivo: convertir el prototipo de React Native en una app cómoda para iPhone y Android, manteniendo la web existente como recorrido independiente.
- Aceptación: mapa interactivo como pantalla principal; búsqueda de lugares y zonas; selección de un punto y horas de sol y sombra; controles de hora, fecha y búsqueda por distancia o franja; estados claros de carga, error y datos insuficientes; castellano e inglés y controles accesibles. Sin inventar datos ni ocultar los límites del cálculo.
- Evidencia: la pantalla de React Native se ha reorganizado alrededor del mapa, con ficha ampliable, búsqueda independiente, filtro de distancia/franja y el cálculo compartido. En la vista web de desarrollo se han revisado las interacciones y capturas a 320, 390 y 1440 px, el error de proveedores, el permiso denegado y una consulta real a alturas de Madrid. Las pruebas del motor pasan; Expo empaqueta JavaScript y genera proyectos temporales para iOS y Android, con permisos de ubicación en primer plano.
- Alcance: implementación y verificaciones locales y actualización del repositorio privado ya autorizado; no publicación, cuentas, pagos ni infraestructura nueva.
- Límite y siguiente acción: probar la app en iPhone y Android reales o emuladores, incluido mapa, gestos, accesibilidad y ubicación; este equipo Linux no dispone de las herramientas nativas. Preparar la firma y distribución solo dentro de una autorización específica. No se han contrastado las sombras sobre el terreno.

## APP-014 — Vista 3D desde arriba y Barcelona

- Estado: `in_progress` — petición de Tony del 2026-11-03.
- Objetivo: ofrecer edificios en 3D casi desde arriba, con el norte arriba, sombras para toda la pantalla y gestos para inclinar, girar y desplazar, e incorporar Barcelona para uso personal.
- Aceptación: vista móvil de desarrollo con edificios y sombras que se actualizan por zona visible; controles que conservan la selección y la hora, acceso directo a Barcelona y Madrid y comprobación honesta de datos solares disponibles en Barcelona. Verificar errores de mapas y dispositivos en la medida que permita este equipo.
- Alcance: implementación y pruebas locales y sincronización del repositorio privado ya autorizado; sin publicación ni alta de servicios.
- Evidencia: en la vista web de desarrollo se comprobó la cámara inicial al norte, inclinación de 20°, giro e inclinación con dos dedos; un caso con 180 edificios sintéticos mostró sombras en los cuatro tramos del mapa y recargó al desplazarse. La consulta real de Madrid devolvió 1.341 edificios en la zona inicial. Se conectó el catálogo municipal de Barcelona (6.942 registros en la prueba del primer semestre de 2026), etiquetado como ubicación aproximada y sin tipo confirmado; se comprobó la selección de ciudad. En el navegador se vieron sombras reales de Barcelona, con aviso de alturas faltantes: la muestra abarcó 646 edificios, 373 con altura o plantas. La búsqueda local de edificios abarca la vista con margen y pide acercar el mapa si la app nativa necesita más de 4.000 polígonos.
- Siguiente acción: probar la cobertura de alturas en más zonas de Barcelona y el mapa, gestos y rendimiento en iPhone y Android; no se ha contrastado la precisión sobre el terreno.

## REPO-001 — Guardar el proyecto en GitHub

- Estado: `done` — completado y comprobado el 2026-11-02.
- Resultado: crear un repositorio privado en su cuenta y subir la copia completa del proyecto, con Git local enlazado.
- Aceptación: comprobar cuenta, privacidad, archivos y sincronización entre el repositorio local y GitHub; excluir credenciales y archivos temporales según `.gitignore`.
- Evidencia: cuenta `TonyRod116` autenticada; Git local enlazado al [repositorio privado](https://github.com/TonyRod116/rato-al-sol) y rama `main` subida. GitHub y la copia local coinciden en 34 archivos, incluidos permisos y contenido; las comprobaciones del proyecto y las cuatro pruebas de comportamiento pasan.
- Siguiente acción: continuar la fase de datos y cálculo real descrita en APP-001.

## DOCS-002 — Orientación de producto, publicación y backend independiente

- Estado: `done` — documentación comprobada el 2026-10-30.
- Encargo: documentar propósito y rutas de frontend/backend, siguiendo las prácticas de BuildApp sin tocar su sistema profesional activo.
- Decisión: puede existir una API nueva común para las tres apps; sin compartir recursos ni credenciales con BuildApp.
- Alcance: guía raíz, canon y copias IA, README e índices de memoria. Solo Markdown; no código de producto, configuración operativa, creación de servicios ni despliegues.
- Aceptación: guía obligatoria visible al entrar desde CLI, rutas propuestas diferenciadas de destinos reales y prohibición explícita de usar BuildApp.
- Evidencia: sincronización IA, `python3 scripts/repo_check.py`, enlaces de la guía y revisión del alcance Markdown superados. Sin operaciones de infraestructura.


## PUBLICACION — Búsqueda y fuentes antes de publicar

- Estado: `in_progress`. Web incorpora el catálogo municipal de Barcelona, identifica la atribución y avisa cuando faltan fuentes; móvil avisa de fallos parciales por nombre y proximidad. Los registros municipales son direcciones aproximadas, sin nombres de negocios ni ubicación de mesas.
- Evidencia: pruebas sintéticas de fallo de proveedor, resultados y consulta vacía; 50 pruebas Node pasan en nueve suites. No se ha verificado visualmente ni en teléfonos la modificación.
- Pendiente: validar proveedores en red y su capacidad/condiciones para tráfico real, probar las búsquedas y avisos en dispositivos, contrastar las sombras y decidir fuente fiable si continúa el fallo. Los cambios de esta sesión están en copia de trabajo, no aplicados al repositorio original.

## APP-015 — Publicación y preparación de pruebas

- Estado: `in_progress` — petición de Tony del 2026-11-03.
- iOS: Tony autorizó usar la cuenta de Apple de BuildApp para esta app, con identificador y firma propios. Registrado `com.ratoalsol.app`; ficha Rato al Sol creada en App Store Connect (Apple ID 6830366652), versión 1.0 en preparación, sin binario ni envío. Nombre de vendedor de la cuenta: BUILDAPP CONNECTING SOLUTIONS S.L. El acuerdo del programa y el anexo de apps de pago figuran activos. La ficha se configuró para revisión sin inicio de sesión y publicación manual.
- Android: cuenta personal Tony Rodriguez; `com.ratoalsol.app` disponible y formulario preparado como app gratuita en español. No se creó: faltan declaraciones de política y exportación que requieren revisión antes de certificarlas.
- Web: tony-r.com registrado en Hostinger; DNS y destino del portfolio en IONOS, espacio `/www/tony-r`. La carpeta vecina `BuildApp_landing` comparte el alojamiento; no se publicó ni modificó el servidor por la separación solicitada. Alternativa independiente requiere enrutado/DNS revisados para no afectar web y correo.
- Pendiente: cuenta Expo propia y proyecto EAS, firma propia, clave y facturación de Google Maps para Android con autorización expresa, inspección del archivo a subir, compilaciones instalables, pruebas en teléfonos, privacidad y fichas, pruebas reales de fuentes y contraste de sombras. No se ha publicado ni enviado a tiendas.
