# Preparación de publicación — Rato al Sol

Actualizado: 2026-11-03. Preparación local; **no hay apps distribuidas ni web publicada en la ruta elegida**. No se han creado cuentas, activado pagos ni enviado la app a revisión.

## Android y iPhone

La app de `mobile/` es React Native con mapas nativos. Comparte su motor solar con `frontend/`, por lo que las compilaciones deben incluir ambas carpetas. El icono y los perfiles de compilación están en el repositorio; los identificadores actuales son `com.ratoalsol.app` para ambas plataformas y la versión inicial es `1.0.0` (compilación `1`). **Son provisionales: comprobar disponibilidad y titularidad antes de registrarlos.** Aumentar el número de compilación de cada plataforma antes de subir una nueva versión.

`mobile/eas.json` prepara dos perfiles para [Expo Application Services](https://docs.expo.dev/build/setup/): `preview` para pruebas internas (APK en Android, distribución interna en iPhone) y `production` para generar los paquetes destinados a las tiendas. Exige un commit limpio y no envía la app a ninguna tienda. En iPhone, la distribución interna necesita la firma y los dispositivos autorizados que correspondan; TestFlight tiene su propio proceso. Los perfiles y la configuración se han preparado localmente, pero **aún no se ha creado ni probado un proyecto EAS real ni se han generado APK, AAB o IPA**.

Para preparar una compilación real, cuando esté autorizada:

1. Contar con las cuentas de desarrollador de Apple y Google Play, la cuenta/proyecto de Expo y las credenciales de firma de esta app. Revisar sus condiciones y posibles costes antes de activarlos; no reutilizar recursos de BuildApp. Registrar los identificadores solo tras comprobarlos.
2. Preparar para Android una clave propia de [Maps SDK for Android](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) y revisar la facturación. Restringirla al paquete de la app, a las API necesarias y a las huellas SHA-1 de las firmas que vayan a usarse: la firma de pruebas y la firma con la que Google Play distribuya la app pueden ser distintas. iPhone usa Apple Maps y no necesita una clave de Google para el mapa actual.
3. Proporcionar `RATO_ANDROID_MAPS_API_KEY` al resolver la configuración y durante la compilación. Si se usa EAS, configurar la variable en los entornos `preview` y `production` con visibilidad adecuada para que la configuración dinámica pueda leerla; las variables de tipo *secret* no están disponibles para resolverla localmente. La configuración falla para compilaciones Android de EAS sin clave. No guardar su valor en Git ni en la web. Una clave de mapas incluida en una app cliente **puede extraerse del paquete**: la protección real son sus restricciones y la vigilancia del uso, no ocultar el nombre de la variable. Consultar [variables de EAS](https://docs.expo.dev/eas/environment-variables/usage/).
4. Desde `mobile/`, después de configurar el proyecto EAS, comprobar primero el contenido que se subiría con `eas build:inspect --platform android --stage archive --output /tmp/rato-eas-archive`. Debe incluir `mobile/`, `frontend/solar.mjs`, `frontend/shared/` y `frontend/vendor/`, y excluir credenciales y archivos locales. Esa inspección requiere iniciar sesión; **aún no se ha realizado**. Consultar la [guía de proyectos con varias carpetas](https://docs.expo.dev/build-reference/build-with-monorepos/).
5. Cuando las credenciales y la prueba anterior estén listas, los comandos de preparación son `eas build --platform android --profile preview` y `eas build --platform ios --profile preview`. Probar en teléfonos reales antes de generar `production`. Una compilación JavaScript o un `expo prebuild` no demuestran que un APK o IPA se pueda instalar ni que el mapa funcione con una clave real.
6. Revisar antes de enviar: ficha y capturas reales, versiones y SDK exigidos en ese momento por [Google Play](https://developer.android.com/google/play/requirements/target-sdk) y [Apple](https://developer.apple.com/app-store/submitting/), permisos finales del paquete firmado, accesibilidad, política de privacidad pública y formularios de privacidad y seguridad de datos de ambas tiendas. La política debe reflejar quién publica la app y los proveedores realmente utilizados; todavía no se han decidido ni verificado todos esos datos.

El código pide la ubicación solo cuando la persona pulsa el control correspondiente; las búsquedas envían el punto o texto necesario al proveedor y los mapas reciben la zona visualizada. No se solicita ubicación en segundo plano. Revisar proveedores, transmisión y retención reales y sus condiciones antes de completar las declaraciones de las tiendas. Consultar [fuentes](DATA_SOURCES.md).

## Web en `tony-r.com/rato-al-sol/`

Tony ha elegido esa URL como destino futuro. La consulta pública del 2026-11-03 devolvió la web personal existente, no una instalación de Rato al Sol; no se conoce todavía la configuración del servidor ni se ha modificado. **No usar recursos ni web roots de BuildApp.** Antes de publicar hay que identificar un destino autorizado y aislado y comprobar que el enrutado de la web personal no intercepte la subruta.

Desde la raíz del repositorio se puede crear un paquete estático nuevo:

```bash
node scripts/build-web.mjs
```

El resultado queda en `dist/web/rato-al-sol/`. El comando no sobrescribe carpetas existentes; para otra compilación elegir una ruta nueva con `node scripts/build-web.mjs --output /tmp/rato-web-otra`. Copia una lista explícita de archivos públicos y la licencia de la biblioteca incluida; no copia `maps-config.local.json`, `.env`, dependencias ni claves. Al añadir módulos o recursos a la web hay que actualizar la lista y volver a probar el paquete. Revisar el contenido antes de subirlo.

Para probar una compilación local bajo la misma subruta, servir la carpeta **que contiene** `rato-al-sol/`, por ejemplo:

```bash
python3 -m http.server 5195 --bind 127.0.0.1 --directory dist/web
```

Abrir `http://127.0.0.1:5195/rato-al-sol/` con el puerto libre. En el servidor definitivo hay que comprobar que `/rato-al-sol` redirija a `/rato-al-sol/`, que los `.mjs` tengan un tipo JavaScript válido y que HTTPS, las rutas relativas, las políticas del sitio y las fuentes externas funcionen sin alterar el resto de la web. Configurar la caché para que HTML, CSS y módulos puedan actualizarse juntos; no asumir que un archivo recién subido invalida los demás. Verificar también el mapa, el buscador, la barra de horas, el respaldo 2D y la atribución en la URL real tras cualquier publicación autorizada.

## Bloqueos de producto que continúan abiertos

La fuente pública de búsqueda general ha fallado en este entorno; hay que resolver disponibilidad, derechos y capacidad antes de tener tráfico real. La sombra se calcula con geometría incompleta, no se han localizado las mesas ni contrastado las estimaciones sobre el terreno, y fuera de Madrid faltan validación de cobertura y zona horaria. También faltan pruebas en Android e iPhone, incluyendo mapa, ubicación permitida y denegada, rendimiento, accesibilidad y funcionamiento sin red. Estas tareas siguen en [trabajo](../.memory/todo.md).

La auditoría de npm del 2026-11-03 mostró 14 avisos, dos altos en `zod` y su dependiente `@expo/cli`; el árbol instalado sitúa `zod` bajo la herramienta de Expo. La corrección propuesta automáticamente implica pasar de Expo 57 a 58: evaluar esa migración y sus efectos antes de distribuir, sin asumir que una actualización mayor sea segura ni que estos avisos describan por sí solos el riesgo de la app instalada.
