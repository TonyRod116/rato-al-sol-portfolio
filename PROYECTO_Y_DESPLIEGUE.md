# Rato al Sol — qué construir y cómo se publicaría

Actualizado: 2026-11-03. **Guía de orientación y rutas. No es un despliegue ni autoriza ejecutar uno ahora.**

## 1. Qué queremos hacer

Un mapa y una lista de terrazas que permiten elegir dónde sentarse con sol o con sombra a una hora determinada, mostrando cuánto podría durar esa situación.

**Frontend:** App nativa para iOS/Android prioritaria y versión web; búsqueda por lugar o por distancia y hora, mapa, lista y ficha. Las mesas, no solo la puerta del negocio, definen el punto que hay que calcular.

**Backend:** Servir terrazas y geometría propias o con licencia, calcular intervalos solares con un motor único y distinguir geometría, nubosidad y ausencia de cobertura. Empezar por una zona pequeña y comprobada.

**Regla específica:** Sin alturas o posición fiable de las mesas no se prometen minutos exactos. El sol geométrico no garantiza cielo despejado ni que la terraza esté abierta.

El detalle del MVP y sus límites está en [producto](docs/PRODUCT.md), los datos en [fuentes](docs/DATA_SOURCES.md) y las comprobaciones en [calidad](docs/QUALITY.md).

## 2. Estado real y primera lectura de cualquier IA

Hay una web que comienza en la Puerta del Sol con sombras orientativas y un prototipo React Native/Expo que permite elegir un punto y estimar su luz usando edificios disponibles. Madrid aporta alturas municipales; la búsqueda general usa una fuente pública no garantizada. El censo aporta entradas aproximadas, no la posición de las mesas. Tony ha elegido una ruta de su dominio personal para la futura web. **No hay estimaciones contrastadas sobre el terreno ni servicios de esta app publicados.**

Al entrar desde CLI: leer `AGENTS.md` (o su copia de la herramienta), este archivo, `NOTES.md` y la tarea pertinente de `.memory/todo.md`. Revisar la evidencia actual antes de decidir qué implementar; no repetir trabajo terminado ni interpretar una ruta propuesta como un servicio existente.

Los nombres y las carpetas de las tres apps están confirmados. La web usa HTML/CSS/JavaScript estático y un empaquetado local; `mobile/` usa React Native y Expo y comparte el motor solar. La ruta web elegida todavía no está publicada y no hay API propia instalada.

## 3. Mapa de carpetas y conexiones

| Elemento | Ruta / dirección | Estado y significado |
|---|---|---|
| Proyecto actual | `/home/tonirod/code/Cool_Projects/rato-al-sol/` | Existe; entrar aquí para las instrucciones y la documentación |
| Código frontend propio | `/home/tonirod/code/Cool_Projects/rato-al-sol/frontend/` | Web estática y motor solar compartido |
| App nativa | `/home/tonirod/code/Cool_Projects/rato-al-sol/mobile/` | React Native/Expo; prototipo local, sin publicación ni prueba en dispositivo todavía |
| Build frontend | Web: `dist/web/rato-al-sol/`; app: Expo | El paquete web se genera localmente; no hay binarios nativos distribuidos |
| Frontend local | `http://127.0.0.1:5182/` | Puerto usado en las pruebas locales; requiere arrancar el servidor indicado en el README |
| Repo nuevo de API común | `/home/tonirod/code/Cool_Projects/cool-projects-api/` | Propuesto y NO creado; separado de los tres frontends y de BuildApp |
| Backend local común | `http://127.0.0.1:8091/` | Puerto propuesto; no hay backend arrancado |
| Contrato de esta app en API común | `/api/v1/rato-al-sol/terraces` y `/api/v1/rato-al-sol/sun-windows` | Endpoints de diseño, NO implementados |
| Salud de API común | `/health` | Endpoint propuesto para comprobar disponibilidad e identidad de la versión propia |
| Web futura de esta app | `https://tony-r.com/rato-al-sol/` | Ruta elegida por Tony; hoy devuelve su web personal, no Rato al Sol |
| API pública común | `https://<HOST_NUEVO_COOL_PROJECTS_API>/` | Marcador, no URL real ni servicio creado |

Antes de usar puertos locales, comprobar que estén libres. No detener procesos de BuildApp u otros trabajos para liberar un puerto; elegir otro y registrarlo. Un valor propuesto no sustituye esa comprobación.

### Las tres apps y el backend permitido

```text
Cool_Projects/
  hora-de-salir/        frontend independiente
  rato-al-sol/          frontend independiente
  tiende-ya/            frontend independiente
  cool-projects-api/   backend NUEVO común, propuesto y aún inexistente

Tres frontends -> API nueva de Cool Projects -> proveedores/datos propios

BuildApp -> su frontend, su backend y sus datos (fuera de este sistema)
```

Puede haber una sola API de Cool Projects con módulos/rutas separados para las tres apps. No obliga a crear tres servidores ni una gran plataforma. Compartir consultas meteorológicas y utilidades con consumidores reales es posible; un fallo o cambio de una app no debe mezclar resultados, preferencias o límites de otra.

## 4. Frontera que no se cruza: BuildApp

**BuildApp es un producto profesional activo. Estas apps no se implementan, prueban ni despliegan dentro de sus recursos.**

- No escribir en `/home/tonirod/code/BuildApp/`, sus worktrees ni repositorios remotos por un encargo de Cool Projects.
- No meter rutas de estas apps en `BuildApp_monorepo/apps/api/`, ni usar su servidor como proxy, aunque parezca ahorrar trabajo.
- No usar ni copiar su `.env`, secretos, credenciales de proveedores, claves de firma, sesiones, usuarios, deploy hooks, cuentas de servicio o archivos de configuración operativa.
- No compartir su base de datos, esquema, rama de producción, usuario de base, pool de conexiones, caché, cola, almacenamiento ni datos de clientes. No clonar datos de producción para pruebas.
- No arrancar su API local ni ejecutar sus builds, migraciones, workflows o pruebas de red: algunos procesos pueden tocar recursos reales.
- No subir archivos a su web root, `apps/web/public/`, `/pro`, `/client`, dominios, subdominios o rutas públicas; no purgar su caché ni modificar su DNS, redirects o `.htaccess`.
- Mismo proveedor comercial no significa mismo recurso. Si se usa IONOS, Cloudflare, Render o una cuenta de proveedor ya disponible, se requieren destinos nuevos y dedicados, identificados expresamente para Cool Projects.
- Si para avanzar parece necesario modificar BuildApp, la decisión correcta en este encargo es diseñar/usar un recurso propio de Cool Projects. Cualquier trabajo de BuildApp sería un encargo independiente y explícito.

## 5. Cómo se publicaría el FRONTEND

**Destino elegido por Tony: `https://tony-r.com/rato-al-sol/`.** El alojamiento y la forma de aislar esa ruta todavía no están identificados; no se ha modificado el sitio existente. El patrón de referencia de BuildApp no autoriza a utilizar sus recursos. La preparación y los requisitos están en [publicación](docs/RELEASE.md).

Rutas que debe conocer la IA:

- Trabajar en el frontend de **este** proyecto: `/home/tonirod/code/Cool_Projects/rato-al-sol/frontend/`.
- Paquete local: `node scripts/build-web.mjs`, con salida `dist/web/rato-al-sol/`. Incluye solo archivos públicos necesarios; no usar la salida `apps/web/public/` de BuildApp.
- Destino remoto: `<WEB_ROOT_IONOS_NUEVO_Y_EXCLUSIVO_DE_ESTA_APP>`, aún sin asignar. La IA debe recuperar el valor real registrado aquí antes de subir nada; nunca adivinarlo por la cuenta SFTP ni usar la raíz de BuildApp.
- URL: `https://tony-r.com/rato-al-sol/`, elegida pero aún no desplegada. Identificar el alojamiento real y confirmar que el destino no es un recurso protegido de BuildApp antes de operar sobre él; no asumir que utiliza ningún proveedor concreto.
- Configuración pública del cliente: URL de la API **nueva** de Cool Projects. Si se elige Vite, una variable pública como `VITE_API_BASE_URL` podría contener esa URL, jamás claves EMT/AEMET o contraseñas.

Cuando haya autorización para publicar, el recorrido será: comprobar el artefacto y la interfaz de esta app; identificar y confirmar un destino aislado para la subruta elegida; subir solo los archivos de cliente necesarios; conservar las reglas y el resto del sitio; invalidar únicamente su caché si procede; verificar sus URLs y, si existe, una consulta a la API nueva. No subir `.env`, código privado de servidor, `node_modules` ni credenciales.

Si se automatiza, el workflow pertenecerá al repo de esta app, por ejemplo `.github/workflows/frontend-deploy.yml`, con secretos y destino nuevos. **Ese archivo no se crea ni se activa ahora.** No copiar el workflow de BuildApp junto con sus secretos ni sus destinos.

## 6. Cómo se publicaría el BACKEND

**Toda necesidad de backend de estas apps se resuelve en un backend NUEVO de Cool Projects. Las tres pueden compartirlo; BuildApp conserva el suyo completamente aparte.**

Rutas y destino previstos:

- Código: `/home/tonirod/code/Cool_Projects/cool-projects-api/`, repo propio por crear, con sus propios `AGENTS.md`, memoria, dependencias y pruebas.
- Servicio nuevo: `<SERVICIO_RENDER_NUEVO_COOL_PROJECTS_API>`, aún inexistente. Referencia de panel: [Render](https://dashboard.render.com/).
- Raíz del servicio: la raíz del repo dedicado de API (o la que declare su implementación). No `BuildApp_monorepo/apps/api`, no el repo antiguo de backend de BuildApp y no un worktree suyo.
- Despliegue: workflow del repo nuevo, por ejemplo `.github/workflows/backend-deploy.yml`, hacia un deploy hook **nuevo y exclusivo** de ese servicio. Archivo, secreto y hook pendientes; no se crean ni se ejecutan ahora.
- Dominio/URL: `<HOST_NUEVO_COOL_PROJECTS_API>`, por asignar. Las tres webs consumirían esta misma base y sus namespaces respectivos.
- Si hiciera falta persistencia, crear un recurso de datos nuevo para Cool Projects, con usuario, credenciales y pruebas propios. No añadir una base o tabla al recurso de BuildApp «porque ya existe»; tampoco crear una rama a partir de su producción. Si no hace falta base de datos, no añadirla por defecto.
- Si se necesita caché/cola/bucket, crear un recurso dedicado a Cool Projects y separar claves/datos por app. No usar recursos de BuildApp. También los backups y credenciales de proveedor son propios.

El procedimiento de referencia es: checks del backend nuevo -> commit exacto comprobado -> despliegue solo a su servicio -> comprobar `/health` y contrato de las apps afectadas. No copiar el comando de BuildApp que arranca migraciones; el backend nuevo tendrá su propio arranque y, solo si hay una base nueva, su propia estrategia de migración.

Antes del primer arranque/despliegue hay que comprobar que cada variable apunte a Cool Projects, no a BuildApp; revisar conexiones, CORS, almacenamiento y destinatario del hook. Las plantillas `.env.example` actuales son propuestas sin consumidores: al implementar, las variables privadas deben vivir en la API nueva, nunca en un build público ni copiarse desde BuildApp.

Configurar CORS solo para los orígenes de estas apps que realmente se publiquen y los locales que se utilicen. No incorporar los dominios o cookies de BuildApp. Un namespace no sustituye aislamiento de datos, cuotas y secretos.

## 7. Ficha que se completará cuando existan recursos reales

| Dato que debe quedar registrado | Valor actual |
|---|---|
| Repo remoto frontend y rama de publicación | [TonyRod116/rato-al-sol](https://github.com/TonyRod116/rato-al-sol), privado; rama de publicación pendiente |
| Comando real y carpeta real de build frontend | `node scripts/build-web.mjs` → `dist/web/rato-al-sol/`; publicación pendiente |
| Sitio/destino SFTP y web root propios | PENDIENTE; no usar el de BuildApp |
| URL de esta app y enrutado | `https://tony-r.com/rato-al-sol/`, elegido; alojamiento y publicación PENDIENTES |
| Repo remoto y raíz de código de API común | PENDIENTE; carpeta propuesta `cool-projects-api/` |
| ID/nombre y URL del servicio Render nuevo | PENDIENTE; no usar servicios de BuildApp |
| Workflow/commit de despliegue propio | PENDIENTE |
| Ubicación/nombre del secreto del deploy hook propio | PENDIENTE; nunca pegar su valor aquí |
| Recursos de datos/caché/almacenamiento propios, si hacen falta | PENDIENTE; ninguno creado |
| Orígenes permitidos y URL pública de la API | PENDIENTE |
| Health check y última comprobación propia | PENDIENTE; sin servicio ejecutado |

Registrar identificadores no secretos y enlaces de consola verificados cuando se creen. Las credenciales van en el gestor de secretos del recurso nuevo, no en este archivo. **Un PENDIENTE impide ejecutar esa publicación; no impide trabajar en documentación o código local ya autorizado.**

## 8. Qué se puede hacer ahora

La implementación y preparación locales continúan según [tareas](.memory/todo.md). La web y las apps aún requieren las comprobaciones y decisiones de [publicación](docs/RELEASE.md); preparar archivos no equivale a autorizar ni efectuar despliegues. Si se incluye backend, usar únicamente recursos propios de Cool Projects dentro del alcance autorizado.

## 9. Referencias de BuildApp consultadas SOLO para aprender

Raíz de referencia, protegida: `/home/tonirod/code/BuildApp/BuildApp_monorepo/`.

- `docs/deploy/ionos-cloudflare.md`: patrón de frontend IONOS + Cloudflare.
- `apps/web/package.json` y `apps/web/buildapp-spa/vite.config.ts`: separación entre código y artefacto generado; sus rutas no son las de esta app.
- `.github/workflows/backend-deploy.yml`: comprobaciones antes de desplegar y selección del commit comprobado.
- `apps/api/render.yaml`: referencia de configuración; **no copiar destinos, secretos, planes o comandos de arranque/migración**.
- `apps/api/docs/adr/002-backend-deploy-from-monorepo.md`: historial de riesgos de drift y recursos compartidos. Es histórico y tiene estados propuestos/actualizados; no asumir que refleja la configuración online actual.

Estos archivos y recursos no se han modificado. La guía documenta prácticas y rutas nuevas; no convierte las referencias en una autorización para ejecutar sus comandos.
