import { searchNearby, searchPlaces, validCoordinate } from './shared/places.mjs';
import { searchMadridFallback, searchMadridParks } from './shared/ayala-fallback.mjs';
import { inMadridArea } from './shared/madrid-scene.mjs';
import { inBarcelonaArea, searchBarcelonaTerraces } from './shared/barcelona-terraces.mjs';
import { getScenes } from './shared/scene-provider.mjs';
import { lightAt, lightForInterval, nearbyOutdoorScenes, prepareScene, sceneInsideBuilding, solarWindows } from './shared/estimate.mjs?v=20261103-10';
import { civilTimeToUtc } from './solar.mjs';
import { direction, message, t } from './i18n.mjs';
import { translateDirection } from './shared/i18n.mjs';

const $ = (id) => document.getElementById(id);
const MAX_ANALYSED = 4;
const labels = () => ({ sun: t('Sol estimado', 'Estimated sun'), shade: t('Sombra estimada', 'Estimated shade'), night: t('Noche', 'Night'), unknown: t('Sin datos suficientes', 'Not enough data') });
const pointName = (point) => point.i18nName ? t(point.i18nName.es, point.i18nName.en) : point.name;
const write = (id, es, en) => message($(id), es, en);
const time = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const distance = (metres) => metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1).replace('.', t(',', '.'))} km`;

export function createExplorer({ getCenter, getDate, getTime, onPlaces, onPoint }) {
  let selected = null, pointRequest = 0, placeRequest = 0, nearbyRequest = 0;
  let places = [], nearby = [], criteria = null, sceneByPlace = new Map(), pending = new Set(), nearbyFailures = 0;

  function mapPlaces(items) {
    onPlaces(items.map((place) => ({ ...place, position: { lat: place.latitude, lng: place.longitude },
      pinLabel: t(`${place.name}, ubicación aproximada`, `${place.name}, approximate location`) })), (id) => {
      const place = items.find((item) => item.id === id);
      if (place) selectPoint(place, true);
    });
  }

  function pointNote(point, source) {
    const position = point.kind === 'business' ? t('Es la posición aproximada del local, no de sus mesas. Para una terraza, marca en el mapa dónde están las mesas. ', 'This is the approximate location of the business, not its tables. For outdoor seating, mark the tables on the map. ') :
      point.kind === 'public' ? t('Es un punto de referencia, no una estimación para todo el parque o plaza. ', 'This is a reference point, not an estimate for the whole park or square. ') :
      point.kind === 'place' ? t('Es una ubicación aproximada; para mayor precisión marca el punto exterior en el mapa. ', 'This is an approximate location; for more precision, mark the outdoor point on the map. ') :
      point.kind === 'approx' ? t('Es un punto exterior aproximado, no la posición confirmada de las mesas. ', 'This is an approximate outdoor point, not the confirmed location of the tables. ') : '';
    const attribution = source === 'madrid' ? t('Alturas: Ayuntamiento de Madrid (CC BY 4.0).', 'Heights: Madrid City Council (CC BY 4.0).') : t('Edificios: OpenStreetMap y colaboradores.', 'Buildings: OpenStreetMap and contributors.');
    return position + t('Muestras cada 30 minutos; horas aproximadas, hora de Madrid. No incluye nubes, árboles, toldos ni sombrillas. ', 'Samples every 30 minutes; approximate times in Madrid time. Clouds, trees, awnings and parasols are not included. ') + attribution;
  }

  function resetTimeline(spanish, english) {
    write('daylight-place', spanish, english);
    $('daylight-segments').replaceChildren(); $('daylight-readable').replaceChildren(); $('daylight-highlights').replaceChildren();
    $('daylight-highlights').hidden = true;
    $('daylight-now').hidden = true; $('outdoor-options').hidden = true;
    $('outdoor-list').replaceChildren();
  }

  function renderPoint() {
    if (!selected) return;
    $('point-title').textContent = pointName(selected);
    const list = $('point-windows'); list.replaceChildren();
    if (!selected.scene) return;
    if (selected.windowsDate !== getDate()) {
      selected.windows = solarWindows(selected.scene, getDate(), civilTimeToUtc);
      for (const choice of selected.choices || []) choice.windows = solarWindows(choice.scene, getDate(), civilTimeToUtc);
      selected.windowsDate = getDate();
    }
    const windows = selected.windows;
    const current = lightAt(selected.scene, civilTimeToUtc(getDate(), getTime()));
    const inside = sceneInsideBuilding(selected.scene);
    $('point-status').textContent = inside ? t('La referencia cae dentro de un edificio. Elige un punto exterior.', 'The reference point is inside a building. Choose an outdoor point.') : t(`${labels()[current]} a las ${time(getTime())} · transiciones aproximadas`, `${labels()[current]} at ${time(getTime())} · approximate transitions`);
    $('daylight-place').textContent = inside ? t(`${pointName(selected)} · Elige un punto exterior para consultar su luz.`, `${pointName(selected)} · Choose an outdoor point to check its light.`) : t(`${pointName(selected)} · ${labels()[current]} a las ${time(getTime())}`, `${pointName(selected)} · ${labels()[current]} at ${time(getTime())}`);
    const bar = $('daylight-segments'), readable = $('daylight-readable'), highlights = $('daylight-highlights');
    bar.replaceChildren(); readable.replaceChildren(); highlights.replaceChildren(); highlights.hidden = true;
    $('daylight-now').hidden = false;
    $('daylight-now').style.left = `${getTime() / 1440 * 100}%`;
    for (const window of windows) {
      const item = document.createElement('li');
      item.className = `light-window is-${window.state}`;
      if (window.from <= getTime() && window.to > getTime()) item.classList.add('is-current');
      const name = document.createElement('span'), hours = document.createElement('strong');
      name.textContent = labels()[window.state];
      hours.textContent = `≈ ${time(window.from)} – ${time(window.to)}`;
      item.append(name, hours); list.append(item);
      const segment = document.createElement('span');
      segment.className = `daylight-segment is-${window.state}`;
      segment.style.flexGrow = String(window.to - window.from);
      segment.style.flexBasis = '0';
      bar.append(segment);
      const description = document.createElement('li');
      description.textContent = t(`${labels()[window.state]} aproximadamente de ${time(window.from)} a ${time(window.to)}.`, `${labels()[window.state]} approximately from ${time(window.from)} to ${time(window.to)}.`);
      readable.append(description);
      if (window.state === 'sun' || window.state === 'shade') {
        const highlight = document.createElement('li'), name = document.createElement('span'), hours = document.createElement('strong');
        highlight.className = `is-${window.state}`;
        name.textContent = window.state === 'sun' ? t('☼ Sol', '☼ Sun') : t('◒ Sombra', '◒ Shade');
        hours.textContent = `≈ ${time(window.from)} – ${time(window.to)}`;
        highlight.append(name, hours); highlights.append(highlight); highlights.hidden = false;
      }
    }
    const choices = $('outdoor-list'); choices.replaceChildren();
    $('outdoor-options').hidden = !inside || !(selected.choices?.length);
    for (const choice of selected.choices || []) {
      const item = document.createElement('li'), button = document.createElement('button');
      const title = document.createElement('strong'), detail = document.createElement('small');
      button.type = 'button';
      title.textContent = t(`${choice.direction} · a unos ${choice.metres} m`, `${direction(choice.direction)} · about ${choice.metres} m away`);
      const useful = choice.windows.filter((window) => window.state === 'sun' || window.state === 'shade');
      detail.textContent = useful.length ? useful.map((window) => `${labels()[window.state]} ${time(window.from)}–${time(window.to)}`).join(' · ') : t('Sin horas suficientes para estimar', 'Not enough hours to estimate');
      button.append(title, detail); item.append(button); choices.append(item);
      button.addEventListener('click', () => selectPoint({ ...choice.point, i18nName: { es: `Punto al ${choice.direction.toLocaleLowerCase('es')} de ${selected.i18nName?.es || selected.name}`, en: `Point ${translateDirection('en', choice.direction.toLocaleLowerCase('es'))} of ${selected.i18nName?.en || selected.name}` }, kind: 'approx' }, true, { scene: choice.scene, source: selected.source }));
    }
    $('point-note').hidden = false;
    $('point-note').textContent = pointNote(selected, selected.source);
  }

  async function selectPoint(point, focus = false, prepared = null) {
    if (!validCoordinate(point)) return;
    const request = ++pointRequest;
    selected = { ...point, name: point.name || point.i18nName?.es || 'Punto elegido en el mapa', i18nName: point.i18nName || (!point.name ? { es: 'Punto elegido en el mapa', en: 'Point selected on the map' } : null), kind: point.kind || 'point', scene: null };
    onPoint({ ...selected, name: pointName(selected) }, focus);
    $('point-title').textContent = pointName(selected);
    write('point-status', 'Consultando los edificios de alrededor…', 'Checking nearby buildings…');
    $('point-windows').replaceChildren();
    resetTimeline('Consultando los edificios de este punto…', 'Checking buildings around this point…');
    $('point-note').hidden = false;
    message($('point-note'), selected.kind === 'business' ? 'La marca es la ubicación aproximada del local; puedes tocar las mesas en el mapa.' : 'Calculamos la luz de este punto, no de toda la zona.', selected.kind === 'business' ? 'The marker shows the approximate business location; you can tap the tables on the map.' : 'We calculate the light at this point, not the whole area.');
    try {
      const geometry = prepared || await getScenes([selected]);
      if (request !== pointRequest) return;
      selected.scene = geometry.scene || prepareScene(selected, geometry.buildings, geometry.radius);
      selected.source = geometry.source;
      if (!selected.scene) throw new Error('Sin geometría');
      selected.choices = geometry.buildings ? nearbyOutdoorScenes(selected.scene, geometry.buildings) : [];
      renderPoint();
    } catch {
      if (request !== pointRequest) return;
      write('point-status', 'No hay datos suficientes de edificios para calcular la luz de este punto.', 'There is not enough building data to calculate light at this point.');
      resetTimeline('No hay datos suficientes de edificios para calcular este punto.', 'There is not enough building data to calculate this point.');
      $('point-note').hidden = false;
      write('point-note', 'Prueba otro punto o vuelve a intentarlo. Las nubes, los árboles y los toldos no están incluidos.', 'Try another point or try again. Clouds, trees and awnings are not included.');
    }
  }

  function addPlaces(current, incoming) {
    const merged = [...current];
    for (const item of incoming) {
      if (!validCoordinate(item) || !Number.isFinite(item.distance)) continue;
      if (!merged.some((other) => other.id === item.id || (other.name.toLocaleLowerCase('es') === item.name.toLocaleLowerCase('es') && Math.abs(other.latitude - item.latitude) < .0002 && Math.abs(other.longitude - item.longitude) < .0002))) merged.push(item);
    }
    return merged.sort((a, b) => a.distance - b.distance).slice(0, 80);
  }

  function placeButton(place, detail) {
    const item = document.createElement('li'), button = document.createElement('button');
    const icon = document.createElement('span'), text = document.createElement('span');
    const title = document.createElement('strong'), subtitle = document.createElement('small');
    button.type = 'button'; icon.className = 'result-icon'; icon.textContent = place.kind === 'public' ? '✳' : '↗';
    title.textContent = place.name; subtitle.textContent = `${distance(place.distance)} · ${detail}`;
    text.append(title, subtitle); button.append(icon, text); item.append(button);
    button.addEventListener('click', () => {
      selectPoint(place, true);
      const searchPanel = document.querySelector('.search-panel');
      const map = document.querySelector('.map-figure');
      if (searchPanel && map && searchPanel.getBoundingClientRect().bottom <= map.getBoundingClientRect().top) {
        map.focus({ preventScroll: true });
        map.scrollIntoView({ block: 'start' });
      }
    });
    return item;
  }

  function renderPlaces() {
    const list = $('place-results'); list.replaceChildren();
    for (const place of places.slice(0, 20)) list.append(placeButton(place, place.categoryUnknown ? t('Terraza registrada · tipo sin confirmar', 'Registered outdoor seating · type unconfirmed') : place.kind === 'business' ? t('Local · mesas sin localizar', 'Business · table location unknown') : t('Ubicación aproximada', 'Approximate location')));
    if (places.length) mapPlaces(places.slice(0, 20));
  }

  function rangeState(scene) {
    if (!scene || !criteria) return 'unknown';
    return lightForInterval(scene, getDate(), criteria.from, criteria.to, civilTimeToUtc);
  }

  function renderNearby() {
    const list = $('nearby-results'); list.replaceChildren();
    if (!criteria) return;
    const sunny = [], uncertain = [];
    for (const place of nearby) {
      const scene = sceneByPlace.get(place.id);
      const state = place.kind === 'public' && scene ? rangeState(scene) : 'unknown';
      if (state === 'sun') sunny.push(place);
      else if (state === 'unknown') uncertain.push(place);
    }
    const heading = (text) => { const li = document.createElement('li'); li.className = 'result-group'; li.textContent = text; list.append(li); };
    if (sunny.length) {
      heading(t('CON SOL ESTIMADO', 'ESTIMATED SUN'));
      for (const place of sunny.slice(0, 20)) list.append(placeButton(place, t('Sol estimado en este punto', 'Estimated sun at this point')));
    }
    if (uncertain.length) {
      heading(t('AÚN SIN PODER CONFIRMAR', 'NOT YET CONFIRMED'));
      for (const place of uncertain.slice(0, 20)) list.append(placeButton(place,
        place.kind === 'business' ? t('Local · mesas sin localizar', 'Business · table location unknown') : pending.has(place.id) ? t('Calculando este punto…', 'Calculating this point…') : t('Sin datos suficientes', 'Not enough data')));
    }
    const analysed = [...sceneByPlace.values()].filter(Boolean).length;
    const warningEs = nearbyFailures ? ' Algunas fuentes no están disponibles; los resultados pueden estar incompletos.' : '';
    const warningEn = nearbyFailures ? ' Some sources are unavailable; results may be incomplete.' : '';
    write('nearby-status', nearby.length ? `${sunny.length} con sol estimado · ${analysed} puntos de espacios exteriores analizados. Distancias desde donde buscaste. Hora de Madrid; muestras cada 30 min.${warningEs}` : 'Todavía no hay resultados. Mueve el mapa, cambia la distancia o vuelve a intentarlo.', nearby.length ? `${sunny.length} with estimated sun · ${analysed} outdoor points analysed. Distances from your search area. Madrid time; samples every 30 min.${warningEn}` : 'No results yet. Move the map, change the distance or try again.');
    if (nearby.length) mapPlaces([...sunny, ...uncertain].slice(0, 20));
  }

  function analyseNearby(request) {
    for (const place of nearby) {
      if (place.kind !== 'public' || sceneByPlace.has(place.id) || pending.has(place.id)) continue;
      if (sceneByPlace.size + pending.size >= MAX_ANALYSED) break;
      pending.add(place.id);
      getScenes([place]).then((geometry) => {
        if (request !== nearbyRequest) return;
        const scene = prepareScene(place, geometry.buildings, geometry.radius);
        sceneByPlace.set(place.id, scene);
      }).catch(() => {
        if (request === nearbyRequest) sceneByPlace.set(place.id, null);
      }).finally(() => {
        if (request !== nearbyRequest) return;
        pending.delete(place.id); renderNearby();
      });
    }
    renderNearby();
  }

  $('place-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = $('place-query').value.trim(), center = getCenter();
    if (query.length < 2 || query.length > 80 || /[\x00-\x1f]/.test(query) || !validCoordinate(center)) {
      write('place-status', 'Escribe entre 2 y 80 caracteres y sitúa el mapa en la zona que buscas.', 'Enter 2 to 80 characters and move the map to your search area.'); return;
    }
    const request = ++placeRequest; ++nearbyRequest; criteria = null;
    places = []; nearby = []; sceneByPlace = new Map(); pending = new Set();
    $('place-results').replaceChildren(); $('nearby-results').replaceChildren();
    write('nearby-status', 'Busca parques y terrazas para la fecha seleccionada.', 'Search parks and outdoor seating for the selected date.');
    onPlaces([], () => {});
    write('place-status', 'Buscando lugares cerca del mapa…', 'Searching for places near the map…');
    const sources = [searchPlaces(query, center)];
    if (inMadridArea(center)) sources.push(searchMadridFallback(center, 5000, query), searchMadridParks(center, 5000, query));
    if (inBarcelonaArea(center)) sources.push(searchBarcelonaTerraces(center, 5000, query));
    let waiting = sources.length, successes = 0, failures = 0;
    for (const source of sources) source.then((found) => {
      if (request !== placeRequest) return;
      successes++; places = addPlaces(places, found); renderPlaces();
    }).catch(() => { if (request === placeRequest) failures++; }).finally(() => {
      if (request !== placeRequest) return;
      waiting--;
      const warningEs = failures ? ' Algunas fuentes no están disponibles; la búsqueda puede estar incompleta.' : '';
      const warningEn = failures ? ' Some sources are unavailable; the search may be incomplete.' : '';
      write('place-status', places.length ? `${places.length > 20 ? `Mostramos 20 de ${places.length}` : `${places.length}`} ${places.length === 1 ? 'lugar' : 'lugares'} cerca del mapa${waiting ? ' · buscando más…' : ''}. Selecciona uno.${warningEs}` : waiting ? 'Buscando lugares cerca del mapa…' : successes ? (failures ? 'No hemos encontrado coincidencias en las fuentes disponibles; la búsqueda está incompleta. Vuelve a intentarlo.' : 'No hemos encontrado coincidencias cerca. Prueba otro nombre o mueve el mapa.') : 'No hemos podido consultar los lugares. Vuelve a intentarlo.', places.length ? `${places.length > 20 ? `Showing 20 of ${places.length}` : `${places.length}`} ${places.length === 1 ? 'place' : 'places'} near the map${waiting ? ' · searching for more…' : ''}. Select one.${warningEn}` : waiting ? 'Searching for places near the map…' : successes ? (failures ? 'No matches in available sources; the search is incomplete. Please try again.' : 'No matches nearby. Try another name or move the map.') : 'Could not retrieve places. Please try again.');
    });
  });

  $('nearby-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const center = getCenter(), radius = $('nearby-radius').valueAsNumber;
    const from = $('nearby-start').valueAsNumber, to = $('nearby-end-enabled').checked ? $('nearby-end').valueAsNumber : from;
    if (!validCoordinate(center) || !Number.isInteger(radius) || radius < 500 || radius > 5000 || !Number.isInteger(from) || !Number.isInteger(to) || to < from || ($('nearby-end-enabled').checked && to === from)) {
      write('nearby-status', 'Elige una distancia de 500 m a 5 km y una hora final posterior al inicio.', 'Choose a distance from 500 m to 5 km and an end time after the start.'); return;
    }
    const request = ++nearbyRequest; ++placeRequest;
    places = []; nearby = []; nearbyFailures = 0; criteria = { from, to }; sceneByPlace = new Map(); pending = new Set();
    $('place-results').replaceChildren();
    write('place-status', 'Buscamos cerca del centro del mapa, hasta 5 km.', 'We search within 5 km of the centre of the map.');
    onPlaces([], () => {});
    $('nearby-results').replaceChildren(); write('nearby-status', 'Buscando lugares y consultando edificios…', 'Searching for places and checking buildings…');
    const sources = [searchNearby(center, radius)];
    if (inMadridArea(center)) sources.push(searchMadridParks(center, radius), searchMadridFallback(center, radius, ''));
    if (inBarcelonaArea(center)) sources.push(searchBarcelonaTerraces(center, radius));
    let waiting = sources.length, successes = 0;
    for (const source of sources) source.then((found) => {
      if (request !== nearbyRequest) return;
      successes++; nearby = addPlaces(nearby, found); analyseNearby(request);
    }).catch(() => { if (request === nearbyRequest) nearbyFailures++; }).finally(() => {
      if (request !== nearbyRequest) return;
      waiting--;
      if (nearby.length) renderNearby();
      else if (!waiting) write('nearby-status', successes ? (nearbyFailures ? 'No hay resultados en las fuentes disponibles; la búsqueda está incompleta. Vuelve a intentarlo.' : 'No hemos encontrado lugares en esta zona. Prueba otra distancia.') : 'No hemos podido consultar los lugares. Vuelve a intentarlo.', successes ? (nearbyFailures ? 'No results in available sources; the search is incomplete. Please try again.' : 'No places found in this area. Try a different distance.') : 'Could not retrieve places. Please try again.');
    });
  });

  return {
    selectPoint,
    updateDate() { renderPoint(); renderNearby(); },
    updateTime() { renderPoint(); },
    refreshLanguage() { renderPoint(); if (criteria && nearby.length) renderNearby(); else if (places.length) renderPlaces(); if (selected) onPoint({ ...selected, name: pointName(selected) }, false); },
    getSelected() { return selected ? { ...selected, name: pointName(selected) } : null; },
  };
}
