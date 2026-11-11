import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'frontend');

// Keep this list aligned with the imports in frontend/index.html and app.mjs.
// Local configuration and inactive experiments must not enter the package.
const publicFiles = [
  'index.html', 'styles.css', 'favicon.svg', 'app.mjs', 'i18n.mjs', 'solar.mjs',
  'madrid.mjs', 'madrid-buildings.mjs', 'map-shadows.mjs', 'viewport-buildings.mjs',
  'open-map.mjs', 'city-map.mjs', 'explore-search.mjs', 'map-atmosphere.mjs',
  'shadow-mask.mjs', 'map-basemap.mjs',
  'shared/places.mjs', 'shared/barcelona-terraces.mjs', 'shared/ayala-fallback.mjs', 'shared/madrid-scene.mjs', 'shared/default-location.mjs', 'shared/time-selection.mjs', 'shared/i18n.mjs',
  'shared/scene-provider.mjs', 'shared/estimate.mjs',
  'vendor/suncalc-2.0.2.mjs', 'vendor/SUNCALC-LICENSE.txt',
];

export function buildWeb(output) {
  const destination = resolve(output);
  mkdirSync(dirname(destination), { recursive: true });
  mkdirSync(destination); // Never overwrite a previous package or user files.
  for (const file of publicFiles) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, file), target);
  }
  return destination;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--output')) {
    console.error('Uso: node scripts/build-web.mjs [--output CARPETA_NUEVA]');
    process.exitCode = 1;
  } else {
    try {
      const destination = buildWeb(args[1] ?? join(root, 'dist/web/rato-al-sol'));
      console.log(`Paquete web creado en ${destination}`);
    } catch (error) {
      console.error(`No se pudo crear el paquete web: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
