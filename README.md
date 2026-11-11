# Rato al Sol · Sun Time

Consulta cuándo habrá sol o sombra en un punto del mapa y encuentra un lugar al aire libre cerca de ti. Puedes mover el selector de hora o reproducir el día desde la hora que tengas seleccionada.

[Probar en la web](https://tony-r.com/rato-al-sol/) · [Descargar para iPhone](https://apps.apple.com/es/app/rato-al-sol/id6830366652)

Android está en prueba interna. La cobertura de edificios de esta rama está preparada para la siguiente versión de iOS y Android.

## Cómo funciona

- `frontend/solar.mjs` y `frontend/shared/estimate.mjs` calculan la posición del sol y la obstrucción de los edificios. La web y las apps comparten estos cálculos.
- `mobile/` usa React Native y Expo con Apple Maps en iOS y Google Maps en Android. La vista de sombras y las franjas de luz procesan la geometría en tandas para que el mapa siga respondiendo.
- `mobile/assets/shadow-data/` incluye la geometría de Madrid y Barcelona indexada por zonas. Madrid combina las alturas municipales con huellas de Catastro que amplían la cobertura. Barcelona usa el número de plantas de Catastro para estimar alturas. La app lee solo las zonas que necesita. [Fuentes, licencias y regeneración](docs/DATA_SOURCES.md#geometría-de-sombras-incluida-en-ios-y-android--2026-11-11).
- `web-release/` conserva una versión de la web y su empaquetador. `frontend/` contiene la web original y los módulos compartidos.

La estimación representa la sombra de edificios. Los árboles, toldos y nubes también pueden cambiar la luz real. Para evaluar una terraza, elige en el mapa el punto donde estarían las mesas.

## Ejecutar en local

La web se puede servir con Python 3.11 o posterior.

```bash
python3 -m http.server 5182 --bind 127.0.0.1 --directory web-release/frontend
```

Abre [localhost:5182](http://127.0.0.1:5182/). El mapa y la búsqueda de lugares necesitan conexión.

Para desarrollar la app móvil, usa Node.js 22 o posterior y una instalación de Expo compatible con el SDK del proyecto.

```bash
cd mobile
npm ci
npx expo start --host localhost
```

## Pruebas

Desde la raíz, después de instalar las dependencias de la app:

```bash
node --test tests/*.test.mjs tests/*.test.cjs
PYTHONUTF8=1 python3 scripts/repo_check.py
```

Las pruebas incluyen regresiones con datos reales de Calàbria y de varios barrios de Madrid, proyecciones geométricas y reproducción desde la hora seleccionada. La [guía de calidad](docs/QUALITY.md) recoge el alcance de las comprobaciones.
