import { civilTimeToUtc, sunPosition } from './solar.mjs';
import { DEFAULT_LOCATION } from './shared/default-location.mjs';
import { initialSelectedTime, nextPlaybackTime, TIME_END, TIME_START } from './shared/time-selection.mjs';
import { shadowDirection } from './map-shadows.mjs';
import { getViewportBuildings, viewportBounds } from './viewport-buildings.mjs';
import { createViewportLoader, expandedMadridViewport } from './shared/viewport.mjs';
import { startShadowGeometry } from './shared/shadow-geometry-task.mjs';
import { boundsCover, canReuseWebShadow } from './shared/web-shadow-retention.mjs';
import { createOpenMap } from './open-map.mjs?v=20261106-proto1';
import { createCityMap } from './city-map.mjs?v=20261106-proto1';
import { createExplorer } from './explore-search.mjs?v=20261103-18';
import { createLocationControl } from './shared/location-control.mjs';
import { inMadridArea } from './shared/madrid-scene.mjs';
import { inBarcelonaArea } from './shared/barcelona-terraces.mjs';
import { direction, message, savedLanguage, setLanguage, t } from './i18n.mjs';

const $ = (selector) => document.querySelector(selector);
const today = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const state = { date: `${today.year}-${today.month}-${today.day}`, minutes: initialSelectedTime(Number(today.hour) * 60 + Number(today.minute), 10) };
const empty = { type: 'FeatureCollection', features: [] };
let buildings, activeMap;
let mapStarted = false, mapLoading = false, is3D = true, playback, pendingFrame;
let view = { bearing: 0, pitch: 0, center: { lat: DEFAULT_LOCATION.latitude, lng: DEFAULT_LOCATION.longitude } };
let currentDirection = null;
let buildingsLoading = false, buildingsError = '', buildingRequest = 0, buildingKey = '', buildingTimer;
let shadowPending = false, shadowError = '', stopShadow = () => {}, shadowEpoch = 0, lastShadowFrame = null;
const viewportLoader = createViewportLoader(getViewportBuildings, Date.now, expandedMadridViewport);
let searchPins;
let searchTimeEdited = false;
const explorer = createExplorer({
  getCenter: () => ({ latitude: view.center.lat, longitude: view.center.lng }),
  getDate: () => state.date,
  getTime: () => state.minutes,
  onPlaces: (places, onSelect) => { searchPins = { places, onSelect }; activeMap?.showPlaces(places, onSelect); },
  onPoint: (point, focus) => {
    activeMap?.setSelectedPoint(point);
    if (focus) activeMap?.focus({ lat: point.latitude, lng: point.longitude });
  },
});
const locationControl = createLocationControl({
  button: $('#use-location'), status: $('#location-status'),
  geolocation: () => typeof navigator === 'undefined' ? null : navigator.geolocation,
  onFound: (position) => {
    moveToDestination(position);
    const point = { latitude: position.lat, longitude: position.lng };
    return inMadridArea(point) || inBarcelonaArea(point);
  },
  showMessage: message,
});

function formattedTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function updateMapLabels() {
  for (const [selector, spanish, english] of [
    ['.maplibregl-ctrl-zoom-in, .leaflet-control-zoom-in', 'Acercar mapa', 'Zoom in'],
    ['.maplibregl-ctrl-zoom-out, .leaflet-control-zoom-out', 'Alejar mapa', 'Zoom out'],
  ]) for (const control of document.querySelectorAll(selector)) {
    control.setAttribute('aria-label', t(spanish, english));
    control.setAttribute('title', t(spanish, english));
  }
}

function updateNearbyControls() {
  const start = $('#nearby-start'), end = $('#nearby-end'), radius = $('#nearby-radius');
  const from = start.valueAsNumber;
  end.min = String(from + 10);
  if (end.valueAsNumber <= from) end.value = String(Math.min(1440, from + 60));
  $('#nearby-start-value').value = formattedTime(from);
  $('#nearby-end-value').value = formattedTime(end.valueAsNumber);
  $('#nearby-radius-value').value = radius.valueAsNumber < 1000 ? `${radius.valueAsNumber} m` : `${(radius.valueAsNumber / 1000).toFixed(1).replace(/\.0$/, '').replace('.', t(',', '.'))} km`;
  $('#nearby-end-control').hidden = !$('#nearby-end-enabled').checked;
  for (const input of [start, end, radius]) {
    input.style.setProperty('--progress', `${(input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min) || 1) * 100}%`);
    input.setAttribute('aria-valuetext', input === radius ? $('#nearby-radius-value').value : formattedTime(input.valueAsNumber));
  }
}

function updateShadowStatus() {
  const status = $('#shadow-status');
  $('#shadows-retry').hidden = !buildingsError;
  if (buildingsLoading) message(status, 'Cargando alturas de edificios…', 'Loading building heights…');
  else if (buildingsError) message(status, buildingsError, buildingsError.startsWith('Acerca el mapa') ? 'Zoom in to load buildings in this area.' : 'Could not load building heights in this area. Please try again.');
  else if (shadowError) message(status, 'No se han podido calcular las sombras de esta zona. Acerca el mapa.', 'Could not calculate shadows here. Zoom in to try again.');
  else if (shadowPending) message(status, 'Calculando sombras de la zona.', 'Calculating shadows for this area.');
  else if (!buildings) message(status, 'Las sombras aún no están disponibles.', 'Shadows are not yet available.');
  else if (buildings.source === 'osm') message(status, 'Sombras orientativas · OpenStreetMap. Pueden faltar edificios y alturas.', 'Approximate shadows · OpenStreetMap. Some buildings or heights may be missing.');
  else if (buildings.omitted) message(status, 'Sombras orientativas · alturas municipales. Faltan algunas alturas.', 'Approximate shadows · municipal heights. Some heights are missing.');
  else message(status, 'Sombras orientativas · alturas municipales de la zona visible.', 'Approximate shadows · municipal heights in the visible area.');
}

function updateSolar() {
  const instant = civilTimeToUtc(state.date, state.minutes);
  const sun = sunPosition(instant, view.center.lat, view.center.lng);
  currentDirection = shadowDirection(sun);
  const clock = formattedTime(state.minutes);
  if (!searchTimeEdited) $('#nearby-start').value = String(state.minutes);
  updateNearbyControls();
  $('#date').value = state.date;
  $('#time').value = state.minutes;
  $('#time-value').value = clock;
  $('#time').setAttribute('aria-valuetext', t(`${clock}, hora local peninsular`, `${clock}, mainland Spain time`));
  $('#time').style.setProperty('--progress', `${(state.minutes - TIME_START) / (TIME_END - TIME_START) * 100}%`);
  $('#direction-text').textContent = !instant
    ? t('Esta hora no existe en la España peninsular por el cambio al horario de verano. Elige otra hora.', 'This time does not exist in mainland Spain due to the daylight saving time change. Choose another time.')
    : currentDirection
    ? t(`A las ${clock}, las sombras apuntan hacia el ${currentDirection.label}.`, `At ${clock}, shadows point ${direction(currentDirection.label)}.`)
    : sun && sun.altitude < -1 ? t(`A las ${clock} es de noche; no hay sombra solar.`, `At ${clock} it is night; there are no sun shadows.`)
      : t(`A las ${clock} el sol está muy bajo; no mostramos sombras fiables.`, `At ${clock} the sun is very low; reliable shadows are unavailable.`);
  $('#direction-symbol').textContent = currentDirection ? '↑' : sun && sun.altitude < -1 ? '☾' : '☼';
  $('#direction-symbol').style.transform = currentDirection ? `rotate(${currentDirection.bearing}deg)` : '';
  explorer.updateTime();
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  stopShadow();
  const epoch = ++shadowEpoch;
  const timeKey = `${state.date}/${state.minutes}`;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    if (activeMap) {
      activeMap.setSun?.(sun);
      const map = activeMap, bounds = viewportBounds(view.shadowBounds);
      const keepPrevious = lastShadowFrame && lastShadowFrame.map === map && lastShadowFrame.timeKey === timeKey;
      if (canReuseWebShadow(lastShadowFrame, { map, timeKey, buildings, visibleBounds: view.bounds, daylight: currentDirection })) {
        shadowPending = false; shadowError = ''; updateShadowStatus(); return;
      }
      if (!keepPrevious) { map.setShadows(empty, bounds || view.shadowBounds); lastShadowFrame = null; }
      if (!buildings || !currentDirection || !bounds || !boundsCover(buildings.bounds, bounds)) {
        shadowPending = false;
        if (!currentDirection && keepPrevious) { map.setShadows(empty, bounds || view.shadowBounds); lastShadowFrame = null; }
        updateShadowStatus();
        return;
      }
      shadowPending = true; shadowError = ''; updateShadowStatus();
      stopShadow = startShadowGeometry(buildings, sun, bounds, (result) => {
        if (epoch !== shadowEpoch || map !== activeMap) return;
        shadowPending = false;
        if (result.limitExceeded) {
          shadowError = 'limit'; map.setShadows(empty, bounds); lastShadowFrame = null;
        } else {
          shadowError = ''; map.setShadows(result, bounds); lastShadowFrame = { map, bounds, timeKey, buildings };
        }
        updateShadowStatus();
      }, () => {
        if (epoch !== shadowEpoch || map !== activeMap) return;
        shadowPending = false; shadowError = 'failed'; map.setShadows(empty, bounds); lastShadowFrame = null; updateShadowStatus();
      });
    }
  });
}

function stopPlayback() {
  clearInterval(playback); playback = null;
  $('#play-day').setAttribute('aria-pressed', 'false');
  message($('#play-day'), '▶ Ver pasar el día', '▶ Play the day');
}

function loadBuildings(force = false) {
  const bounds = viewportBounds(view.shadowBounds);
  if (!activeMap || !bounds) return;
  const key = bounds.join(',');
  if (!force && key === buildingKey) return;
  buildingKey = key;
  const request = ++buildingRequest;
  clearTimeout(buildingTimer);
  const cached = viewportLoader.find(bounds);
  if (cached && !force) {
    buildings = cached; buildingsLoading = false; buildingsError = '';
    activeMap.setBuildings(cached); updateSolar(); updateShadowStatus(); return;
  }
  buildingsLoading = true; buildingsError = '';
  updateShadowStatus();
  buildingTimer = setTimeout(async () => {
    try {
      const result = await viewportLoader.get(bounds);
      if (request !== buildingRequest) return;
      buildings = result;
      activeMap?.setBuildings(buildings);
      updateSolar();
    } catch (error) {
      if (request !== buildingRequest) return;
      buildings = null;
      buildingsError = error?.message?.startsWith('Acerca el mapa') ? error.message : 'No hemos podido cargar las alturas de esta zona. Prueba de nuevo.';
      if (!lastShadowFrame || lastShadowFrame.timeKey !== `${state.date}/${state.minutes}`) activeMap?.setShadows(empty, bounds);
    } finally {
      if (request === buildingRequest) { buildingsLoading = false; updateShadowStatus(); }
    }
  }, 350);
}

function onViewChange(next) {
  view = next;
  updateShadowStatus();
  if (next.settled && activeMap) { loadBuildings(); updateSolar(); }
}

function activateMap(map, isCity) {
  activeMap = map;
  updateMapLabels();
  $('#city-map').hidden = !isCity;
  $('#open-map').hidden = isCity;
  $('#city-controls').hidden = !isCity;
  $('#map-message').hidden = true;
  $('#select-map-center').disabled = false;
  $('#use-location').disabled = false;
  $('#city-select').disabled = false;
  if (searchPins) activeMap.showPlaces(searchPins.places, searchPins.onSelect);
  activeMap.setSelectedPoint(explorer.getSelected());
  if (buildings) activeMap.setBuildings(buildings);
  updateSolar();
  activeMap.invalidate();
  loadBuildings();
}

async function loadOpenMap() {
  $('#city-map').hidden = true; $('#open-map').hidden = false;
  try {
    let tilesAvailable = false;
    const map = await createOpenMap($('#open-map'), (available) => {
      tilesAvailable = available;
      $('#map-message').hidden = available;
      $('#map-retry').hidden = available;
      if (!available) message($('#map-message-text'), 'No hemos podido cargar el mapa. Puedes buscar lugares o volver a intentarlo.', 'Could not load the map. You can search for places or try again.');
    }, onViewChange, () => {}, (point) => explorer.selectPoint(point));
    activateMap(map, false);
    $('#map-message').hidden = tilesAvailable;
    $('#map-provider-status').hidden = false;
    message($('#map-provider-status'), 'La vista 3D no está disponible en este navegador; mostramos el mapa en 2D.', '3D view is unavailable in this browser; showing the 2D map.');
  } catch {
    $('#map-message').hidden = false;
    message($('#map-message-text'), 'No hemos podido cargar el mapa. Puedes buscar lugares o volver a intentarlo.', 'Could not load the map. You can search for places or try again.');
    $('#map-retry').hidden = false;
  }
}

async function loadMap() {
  if (mapStarted || mapLoading) return;
  mapStarted = true; mapLoading = true;
  try { activateMap(await createCityMap($('#city-map'), onViewChange, () => {}, (point) => explorer.selectPoint(point)), true); }
  catch { await loadOpenMap(); }
  finally { mapLoading = false; }
}

$('#time').addEventListener('input', (event) => { stopPlayback(); state.minutes = Number(event.target.value); updateSolar(); });
$('#nearby-start').addEventListener('input', () => { searchTimeEdited = true; updateNearbyControls(); });
for (const id of ['nearby-end', 'nearby-radius']) $(`#${id}`).addEventListener('input', updateNearbyControls);
$('#nearby-end-enabled').addEventListener('change', updateNearbyControls);
$('#nearby-form').addEventListener('submit', () => { searchTimeEdited = true; });
$('#select-map-center').addEventListener('click', () => explorer.selectPoint({ latitude: view.center.lat, longitude: view.center.lng }));
function moveToDestination(destination) {
  if (!activeMap) return;
  stopPlayback();
  explorer.reset();
  ++buildingRequest;
  clearTimeout(buildingTimer);
  buildingKey = ''; buildings = null; buildingsLoading = false; buildingsError = '';
  stopShadow(); ++shadowEpoch;
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = null; shadowPending = false; shadowError = ''; lastShadowFrame = null;
  activeMap.setBuildings(null);
  activeMap.setShadows(empty, viewportBounds(view.shadowBounds));
  // Change the camera synchronously so a search made immediately afterwards
  // uses the chosen city instead of the centre of an in-progress animation.
  activeMap.jumpTo(destination);
  updateShadowStatus();
}
$('#city-select').addEventListener('change', (event) => {
  const cities = { madrid: { lat: 40.4168, lng: -3.7038 }, barcelona: { lat: 41.3851, lng: 2.1734 } };
  const destination = cities[event.target.value];
  if (!destination || !activeMap) return;
  event.target.value = '';
  locationControl.cancel();
  moveToDestination(destination);
});
$('#use-location').addEventListener('click', locationControl.start);
$('#date').addEventListener('change', (event) => {
  stopPlayback();
  if (!event.target.validity.valid || !civilTimeToUtc(event.target.value, 720)) { event.target.value = state.date; return; }
  state.date = event.target.value; updateSolar(); explorer.updateDate();
});
$('#play-day').addEventListener('click', () => {
  if (playback) return stopPlayback();
  if (state.minutes >= TIME_END) state.minutes = TIME_START;
  updateSolar();
  $('#play-day').setAttribute('aria-pressed', 'true');
  message($('#play-day'), '❚❚ Pausar', '❚❚ Pause');
  playback = setInterval(() => {
    // Do not advance into another time while this frame is still loading.
    if (buildingsLoading || shadowPending || pendingFrame) return;
    if (shadowError || buildingsError) { stopPlayback(); return; }
    state.minutes = nextPlaybackTime(state.minutes, 10); updateSolar();
  }, 450);
});
$('#shadows-retry').addEventListener('click', () => loadBuildings(true));
$('#map-retry').addEventListener('click', () => window.location.reload());
$('#map-rotate').addEventListener('click', () => activeMap?.rotate?.());
function setView3D(enabled) {
  is3D = enabled;
  message($('#map-pitch'), is3D ? 'Ver en 2D' : 'Ver en 3D', is3D ? 'View in 2D' : 'View in 3D');
  activeMap?.set3D?.(is3D);
}
$('#map-pitch').addEventListener('click', () => setView3D(!is3D));
setLanguage(savedLanguage());
$('#language').addEventListener('change', (event) => {
  setLanguage(event.target.value, true);
  updateSolar();
  updateShadowStatus();
  explorer.refreshLanguage();
  updateMapLabels();
});
const oldParams = new URLSearchParams(window.location.search);
if (['fecha', 'hora', 'filtro', 'terraza'].some((key) => oldParams.has(key))) $('#old-link-note').hidden = false;
updateSolar();
loadMap();
