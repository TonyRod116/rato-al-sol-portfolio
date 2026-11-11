# Calidad — Rato al Sol

## Comprobación disponible hoy

```bash
node tests/demo.test.mjs
node tests/solar.test.mjs
node tests/madrid.test.mjs
node tests/map-shadows.test.mjs
node tests/map-atmosphere.test.mjs
node tests/mobile.test.mjs
node tests/release.test.mjs
node --check frontend/app.mjs
node --check frontend/explore-search.mjs
node --check frontend/demo-data.mjs
node --check frontend/solar.mjs
node --check frontend/madrid.mjs
node --check frontend/madrid-buildings.mjs
node --check frontend/map-shadows.mjs
node --check frontend/shadow-mask.mjs
node --check frontend/map-basemap.mjs
node --check frontend/google-map.mjs
node --check frontend/open-map.mjs
node --check frontend/city-map.mjs
python3 scripts/repo_check.py
bash scripts/check-ai-instructions.sh
```

Los tests de Node comprueban una posición solar de referencia con tolerancia de 0,1°, cambios de horario de Madrid, geometría analítica simple y dirección de sombra dibujada, intervalos, noche, datos ausentes, filtros, privacidad de consultas y contratos municipales. La prueba solar cubre solo ese caso, no su precisión global ni la sombra real en terrazas. Los dos últimos comandos comprueban solo documentación/configuración. La web anterior es estática; el prototipo nativo usa Expo.

La prueba visual ejecutable `tests/shadow-mask.browser.html`, servida desde la raíz del repositorio en localhost, comprueba en un navegador real que una sombra sola y dos superpuestas tienen los mismos píxeles, que se respetan los huecos y que la máscara se limpia cuando no hay sombras.

El 2026-11-03 se revisaron la web y la vista 3D de desarrollo de la app, orientadas al norte con inclinación inicial de 20°, y se comprobaron en Chromium los gestos de dos dedos para girar e inclinar. `tests/mobile-shadows.browser.js` distribuye 180 edificios sintéticos por la consulta y comprueba píxeles de sombra en los cuatro tramos de la pantalla y recarga al mover el mapa. Una consulta real de la zona inicial de Madrid devolvió 1.341 edificios; se inspeccionó el mapa y se comprobó el límite de coste con pruebas unitarias. Se revisaron capturas de 320 y 390 px, el respaldo 2D y la búsqueda inmediata tras cambiar de ciudad. En Barcelona se vio el mapa con sombras de la nueva fuente real y el aviso de alturas incompletas, además de probar el catálogo municipal. Una muestra del mapa contenía 646 edificios, 373 con altura o plantas; una consulta independiente a 400 m contenía 462, de los que 279 tenían altura o plantas. Un punto real mostró tramos calculados y otros desconocidos. No se ha medido la fluidez ni se han probado los gestos nativos en iPhone o Android; faltan otras zonas de Barcelona y el contraste de sombras sobre el terreno.

En el rediseño móvil del 2026-11-03 se inspeccionó la vista web de desarrollo a 320, 390 y 1440 px y se probaron la búsqueda y selección, el despliegue de la ficha, la barra de sol, hora y fecha, el radio y franja, el cambio de idioma, el permiso de ubicación denegado y errores de proveedores. Una consulta a alturas municipales de Madrid detectó un punto dentro de un edificio y ofreció puntos exteriores aproximados; no verifica la ubicación de las mesas ni la precisión de la sombra sobre el terreno. `tests/mobile-app.browser.js` permite repetir con Playwright los casos de fallo de búsqueda, selección y cambio de idioma usando respuestas sintéticas. El código JavaScript se empaquetó para iOS y Android y se generaron proyectos nativos temporales, revisando los permisos de ubicación en primer plano. **No se han ejecutado estos recorridos en un dispositivo ni emulador nativo**, y faltan las pruebas de mapas, gestos, permisos, accesibilidad y rendimiento en ambos sistemas.

En el ajuste horario del 2026-11-03 se comprobó que la web y la vista web del prototipo móvil limitan el inicio a 06:00–23:00, con hora inicial acotada fuera de ese intervalo, teclado, sincronización de la búsqueda y franja final válida. En la web se comprobó que la reproducción para a las 23:00 y vuelve a las 06:00. Se revisaron capturas a 320, 390 y 1440 px; iOS y Android se empaquetaron sin ejecutar en dispositivos. La barra de resultados conserva el día completo porque el sol depende de la fecha y el lugar.

En la traducción del 2026-11-03 se comprobaron en web y vista web móvil el selector, la persistencia tras recargar, los avisos de carga y error, y que un parque simulado conserva su punto y la hora al cambiar de idioma. Se probaron búsquedas por categorías en inglés y se inspeccionaron capturas a 320, 390 y 1440 px; el paquete web cargó también bajo `/rato-al-sol/`. El JavaScript se empaquetó para iOS y Android y una generación temporal de iOS contiene el permiso de ubicación en castellano e inglés. No se ha ejecutado la app ni el diálogo del sistema en dispositivos o emuladores.

En la simplificación del mapa del 2026-11-03 se revisaron capturas de 320, 390 y 1440 px: el inicio 3D muestra la Puerta del Sol sin marcadores precargados y con sombras calculadas a partir de alturas municipales. Se comprobó la selección del centro y sus intervalos con edificios reales, la búsqueda y selección de tres lugares simulados, giro y cambio de 2D/3D. También se forzó el respaldo 2D y se probó la vista web del prototipo móvil, ambos sin marcadores al inicio y con selección al tocar. El JavaScript de iOS y Android se empaquetó; quedan pendientes las pruebas en teléfonos o emuladores y el contraste de las sombras sobre el terreno.

En el repaso de UX/UI del 2026-11-03 se inspeccionaron capturas web y de la vista web del prototipo móvil a 320 y 390 px, además de escritorio y el mapa 3D. Se probaron con cinco lugares simulados la búsqueda, el desplegado de resultados, la selección, la vuelta al mapa y el selector de hora con teclado. A 390 px el buscador web pasó de 1.675 a 288 px desde el inicio y los resultados del prototipo pasaron de estar fuera de la primera pantalla a comenzar a 551 px en esa prueba; no son métricas de uso. Se generaron en una copia temporal los proyectos e iconos de iOS y Android y se empaquetó el JavaScript para ambas plataformas. Falta comprobar el aspecto y la interacción nativos en teléfonos o emuladores.

El 2026-11-03 se prepararon icono, arranque, permisos y perfiles de compilación nativos. `expo prebuild` generó proyectos de Android e iOS en una copia temporal: el manifiesto de Android incorporó una clave sintética y marcó para eliminar permisos de almacenamiento, superposición y vibración; iOS conservó el permiso de ubicación en uso con texto en castellano, sin entradas de ubicación permanente ni movimiento. Se generaron los iconos y las pantallas de arranque, y el JavaScript se empaquetó para ambas plataformas. No se compilaron ni instalaron APK, AAB o IPA. El paquete web se sirvió en `/rato-al-sol/` y se revisó en Chromium a 390 y 1440 px: punto, barra y selector funcionaron con datos municipales y mapas 3D y 2D; en una primera carga lenta se utilizó el respaldo y la segunda cargó 3D. Se comprobó que los módulos locales no fallaran y la configuración local no estuviera disponible. La auditoría npm mostró 14 avisos, dos altos relacionados con herramientas de Expo; revisión pendiente antes de distribuir.

El 2026-11-03 se revisaron los controles adyacentes y el cálculo de sombras con cobertura parcial en Chromium, con capturas de 320, 390 y 1440 px, teclado y cambio a 2D. En Soho New York se eligió un punto exterior aproximado tanto desde el resultado del local como desde el centro del mapa. En ese punto y fecha, la corrección redujo de 14 a 3 las muestras desconocidas de 30 minutos; no es una medida general de cobertura ni de precisión. Una comparación local en Node de tres puntos y 1.603 edificios dio medianas de 165 ms antes y 327 ms después para calcular el día, sin incluir red ni dibujar el mapa; no mide la fluidez en un teléfono. La vista web del prototipo móvil mostró el mismo resultado y respondió al teclado; iOS y Android se empaquetaron sin probarse en teléfonos. Las pruebas incluyen edificios con altura desconocida, punto interior, noche y sol próximo al horizonte. Overpass devolvió 502 y la búsqueda municipal encontró el local. No se han contrastado sombras ni mesas sobre el terreno.

En la búsqueda por punto y franja del 2026-11-03 se comprobó un punto real con alturas municipales y una consulta cercana que analizó cuatro puntos de parques. En Chromium se revisaron el mapa 3D y el respaldo 2D, fotografía, marcador, horas, rango, radio, ubicación simulada y denegada, fallo de edificios, respuesta tardía, texto externo no confiable y cambio horario. Se inspeccionaron imágenes a 320, 390, 768 y 1440 px y se corrigió un desbordamiento de 5 px. El respaldo 2D aplicó opacidad 0,82 a las sombras de la fotografía y 0,44 en el plano; no son medidas de contraste perceptivo. La vista web de desarrollo del prototipo nativo se probó con lugares sintéticos y edificios municipales; iOS y Android se empaquetaron, sin ejecución en teléfonos. La búsqueda general respondió 502 y fuera de Madrid sigue sin validarse; tampoco se ha contrastado la luz sobre el terreno.

En la revisión de sombras y foto aérea del 2026-11-03 se inspeccionaron en Chromium capturas de 320, 390 y 1440 px con fotografía y geometría reales. Se comprobaron teclado, visibilidad de atribución y dirección, zoom máximo en 3D, alejamiento adicional y vuelta desde 2D, noche y fallo/recuperación de la fotografía tanto en 3D como en el respaldo 2D. La composición se contrastó por píxeles con polígonos ficticios. Un dibujo de 16.178 polígonos en un lienzo de hasta 700 px tardó 27,9 ms de mediana en 12 iteraciones locales; no incluye toda la representación del mapa ni mide FPS. No se han probado estas mejoras en la app nativa ni en dispositivos reales.

Para comprobar el empaquetado nativo, desde `mobile/`: `npx expo export --platform android --output-dir /tmp/rato-android-export` y equivalente con `--platform ios`. Esto verifica el empaquetado JavaScript, no instala ni prueba una app en un dispositivo.

En la revisión de luz y rendimiento del 2026-11-03 se inspeccionaron en Chromium las vistas de noche, amanecer y atardecer, el modo ligero, el respaldo 2D y capturas a 320, 390 y 1440 px. Se comprobaron el selector con teclado, movimiento reducido y la hora inexistente del cambio de horario. La vista web móvil también cambió entre día y noche y su selector respondió al teclado. Una muestra local con 1.324 edificios de Ayala y sol a 35° pasó de 16.178 polígonos y 3,78 MB a 4.665 y 1,09 MB al limitar el dibujo a una vista cercana con margen; la mediana de cálculo pasó de 9,54 a 2,17 ms en 20 iteraciones. Es una comparación local de geometría, no una medición de la fluidez real en el ordenador de Tony. Hay una prueba que conserva sombras que entran en pantalla desde edificios exteriores. Se empaquetaron iOS, Android y web, pero la apariencia y fluidez nativas siguen pendientes de dispositivo.

El 2026-11-03 se probó en Chromium la vista web del prototipo: selección de un punto real en Madrid y respuesta de alturas municipales, cambio de hora con teclado, búsqueda municipal real tras fallo simulado de Overpass y filtro de sol con lugares y edificios ficticios. Con Overpass simulado como caído se consultaron el catálogo real de parques y alturas municipales para dos puntos; se verificó también la validación de un radio personalizado. Se inspeccionaron capturas de móvil y escritorio; falta QA de dispositivo iOS/Android, comprobación de accesibilidad nativa y contraste sobre el terreno. La búsqueda general no pudo validarse con datos reales por 406/timeout. El análisis npm señaló 13 avisos, dos altos en dependencias de Expo CLI; la corrección automática propone cambiar de versión mayor de Expo y queda pendiente de revisión antes de publicar.

En la unificación del 2026-11-03 se consultaron 1.324 polígonos municipales y se inspeccionaron en Chromium capturas reales del mapa 3D por la mañana y la tarde y de móvil; se midieron 320, 390, 768 y 1440 px sin desbordamiento horizontal y zoom CSS del 200 %. La flecha, la iluminación y las sombras cambian con la hora, y la flecha responde al giro. Se comprobaron selección, reproducción/pausa, teclado, movimiento reducido, noche, enlace antiguo, aviso al salir de la zona y fallo/recuperación de alturas. Al bloquear MapLibre, Leaflet mostró la misma capa de sombras en 2D. No hubo errores JavaScript; no se probó en dispositivos reales ni se ha contrastado la precisión con observaciones sobre el terreno. Los tests geométricos comprueban un edificio de 10 m con sol a 45°, direcciones norte y oeste, patios y el umbral del horizonte; validan también alturas inválidas y respuestas incompletas o excesivas.

En la revisión del mapa 3D del 2026-11-03 se inspeccionaron capturas en Chromium a 320, 390, 768 y 1440 px y ampliación CSS al 200 %, con WebGL por software: se cargaron edificios de OpenFreeMap y tres entradas del censo real, se verificaron giro, cambio 2D/3D, selección sincronizada, teclado y movimiento reducido. La prueba solar ficticia movió la sombra al cambiar la hora. Se bloqueó la biblioteca 3D para comprobar el respaldo 2D y sus puntos, y ambas bibliotecas para comprobar que la lista y el ejemplo seguían disponibles. Google rechazó de nuevo el origen y devolvió la interfaz al mapa 3D; el cambio de proveedor y sus controles se probaron también con Google simulado. No se probó una cuenta de Google autorizada ni dispositivos reales; la geometría visual no valida alturas ni sombras reales.

En la mejora anterior del mapa del 2026-11-03 se revisaron capturas de 320, 390, 768 y 1440 px y zoom al 200 %. El censo real devolvió tres entradas y se vio el mapa real de OpenStreetMap; se comprobó selección de lista y puntos, selector solar, sombras, reproducción, teclado y movimiento reducido. Se simularon Google disponible, errores de autenticación y de ambos mapas, texto no confiable, fallo de actualización conservando la fecha anterior y enlace compartido. La clave real de Google rechazó el puerto 5182, por lo que Google y sus edificios vectoriales quedan pendientes de prueba real. El motor de conversión se contrastó con una referencia pública aproximada y límites de zona; no acredita precisión de mesas ni validación sobre el terreno. No sustituye pruebas en dispositivos reales.

En la revisión anterior de la escena en perspectiva del 2026-11-03 se inspeccionaron capturas en Chromium de 320, 390, 768 y 1440 px y con ampliación CSS al 200 %. Se comprobaron la selección, movimiento de las sombras y de la dirección del sol, intervalos, reproducción y pausa, teclado, noche, falta de mesas, filtro vacío, enlace y movimiento reducido. En esa revisión anterior, la respuesta municipal se simuló para comprobar el texto no confiable y que entonces la petición solo se hacía al pulsar. No se observaron errores de JavaScript. No sustituye pruebas en dispositivos ni la validación de una escena real.

El 2026-11-03 se probó en Chromium a 320, 390, 768 y 1440 px: cambio de fecha y hora, noche, filtros, mapa/lista/detalle, enlace y teclado. La consulta municipal se probó con una respuesta real (tres registros) y con respuestas sintéticas válidas, vacías, fallidas y con texto malicioso; entonces no consultaba antes de pulsar ni enviaba el plan; ahora consulta también al abrir la página. Se inspeccionaron capturas de cada tamaño. Falta prueba en dispositivos reales, validación geométrica con datos reales y contraste sobre el terreno.

El 2026-11-02 se probaron con Chromium y datos inventados las anchuras 320, 390, 768 y 1440 px: filtros, lista y mapa sincronizados, caso vacío, enlace compartido, teclado, movimiento reducido y consola/red. Se inspeccionaron capturas y se corrigió la distribución en pantalla intermedia y con ampliación CSS al 200 %. Sin JavaScript se comprobó el aviso. No sustituye una auditoría completa de accesibilidad ni la prueba en dispositivos reales.

En la mejora de búsqueda y barra solar del 2026-11-03 se buscó el Soho New York de Jorge Juan con el censo real y se consultaron alturas municipales: su referencia cae dentro de un edificio y se comprobaron tres puntos exteriores aproximados. La errata «reiaurante» mostró terrazas municipales con tipo sin confirmar. En Chromium se inspeccionaron la barra con horas y los controles a 320, 390 y 1440 px, el mapa 3D, el respaldo 2D, selección directa, arrastre y teclado. Se simularon una respuesta tardía y un fallo de alturas para comprobar que prevalece la última zona y aparece el reintento. En la vista web del prototipo móvil se simularon 12 segundos de espera de Overpass y se comprobaron los resultados municipales reales, las opciones exteriores y los controles. iOS y Android se empaquetaron; esto no prueba un dispositivo ni la precisión de las sombras sobre el terreno. Fuera de Madrid la cobertura de alturas y búsqueda sigue sin validarse.

Las pruebas `node tests/web-search.test.mjs` y `node tests/first-results.test.mjs` comprueban el respaldo municipal de Barcelona y los avisos de fuentes fallidas con respuestas simuladas, incluida una caída que llega después del primer resultado móvil. No comprueban disponibilidad real ni ejecución nativa.

## Casos del producto

- Noche, horizonte bajo, amanecer y atardecer; no emitir minutos de sol cuando el sol está bajo el horizonte.
- Misma entrada => mismo resultado en mapa, lista y tarjeta; reloj fijo para reproducirlo.
- Edificio simple con altura conocida y coordenadas métricas; resultado contrastado con una referencia independiente apropiada.
- Altura ausente, terraza sin posición de mesas o geometría insuficiente => `unknown`, nunca sol garantizado.
- Acera opuesta, cambio de zona horaria, fecha cercana al cambio de hora y selección de fecha futura.
- Nubosidad alta no reescribe el estado geométrico. Toldos y vegetación no modelados no se esconden como precisión falsa.
- Lista usable sin mapa, con teclado y lector de pantalla; no depender solo de amarillo/azul.
- Piloto: anotar observación real, hora, ubicación de mesas y condiciones; conservar errores del modelo, no solo aciertos.

## Revisión heredada de BuildApp

1. Comportamiento correcto y regresiones del recorrido real.
2. Secretos, permisos, privacidad y validación de entradas externas.
3. Compatibilidad entre proveedor, normalización, cálculo y presentación.
4. Pruebas pertinentes y limitaciones no cubiertas.
5. Rendimiento: cadencia de red, coste de cálculo y tamaño del cliente donde importen.
6. Sencillez: eliminar complejidad del cambio sin reescribir trabajo vecino.

## QA de interfaz

Móvil y escritorio, teclado/tacto, zoom 200%, foco visible, contraste, texto sin recortes, movimiento reducido, consola/red y carga/vacío/error/dato antiguo. Verificar la experiencia del usuario, no solo una captura aislada.

Actualizar aquí los comandos reales de tipos, lint, tests y build si cambia el stack. Usar reloj fijo y entradas reproducibles para cálculos; fuentes reales para comprobar el adaptador. Si una comprobación no pudo ejecutarse, indicarlo con su impacto.

## Evidencia y cierre

Registrar qué entrada, fuente, fecha/modelo y resultado se comprobaron, sin datos privados. Una prueba verde demuestra su alcance, no garantiza utilidad, precisión global o disponibilidad futura. Registrar también fallos y la condición concreta para reabrir un enfoque descartado.
