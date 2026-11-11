import { civilTimeToUtc, sunPosition, classifyLight } from './solar.mjs';

// Barrio imaginario, con norte hacia arriba. Una unidad del dibujo equivale a
// un metro: ni las fachadas ni las alturas corresponden a edificios reales.
export const buildings = [
  { footprint: [[0, 0], [104, 0], [146, 78], [0, 31]], height: 42 },
  { footprint: [[198, 0], [419, 0], [375, 89], [231, 40]], height: 50 },
  { footprint: [[475, 0], [600, 0], [600, 58], [433, 137]], height: 45 },
  { footprint: [[0, 152], [126, 198], [82, 298], [0, 266]], height: 45 },
  { footprint: [[266, 104], [357, 139], [322, 220], [306, 227]], height: 40 },
  { footprint: [[448, 165], [600, 95], [600, 247], [506, 211]], height: 45 },
  { footprint: [[0, 455], [148, 385], [201, 483], [184, 520], [0, 520]], height: 40 },
  { footprint: [[378, 391], [600, 475], [600, 520], [425, 520]], height: 40 },
];

export const places = [
  { id: 'la-parra', number: 1, name: 'La Parra', description: 'Junto a la plaza', x: 25, y: 25, hasTables: true },
  { id: 'el-mirador', number: 2, name: 'El Mirador', description: 'En la calle tranquila', x: 72, y: 33, hasTables: true },
  { id: 'la-plaza', number: 3, name: 'La Plaza', description: 'Frente al jardín', x: 38, y: 69, hasTables: true },
  { id: 'el-olivo', number: 4, name: 'El Olivo', description: 'Al final del paseo', x: 78, y: 76, hasTables: false },
];

export function demoSun(date, minutes) {
  const instant = civilTimeToUtc(date, minutes);
  // Posición aproximada de Madrid para probar el reloj; el barrio es ficticio.
  return instant ? sunPosition(instant, 40.4, -3.7) : null;
}

export function outcomeFor(place, sun) {
  if (!place) return 'unknown';
  const point = place.hasTables ? [place.x * 6, place.y * 5.2] : null;
  return classifyLight({ sun, point, buildings, coverage: true });
}

export function visiblePlaces(filter, sun) {
  return places.filter((place) => filter === 'all' || outcomeFor(place, sun) === filter);
}

// Ten-minute samples describe approximate intervals, not exact transition times.
export function intervalsFor(place, date) {
  const intervals = [];
  for (let minutes = 540; minutes < 1200; minutes += 10) {
    const outcome = outcomeFor(place, demoSun(date, minutes));
    const previous = intervals.at(-1);
    if (previous?.outcome === outcome) previous.end = minutes + 10;
    else intervals.push({ start: minutes, end: minutes + 10, outcome });
  }
  return intervals;
}

function validDate(value) {
  return civilTimeToUtc(value, 720) !== null;
}

export function parseSharedState(search, defaults) {
  const params = new URLSearchParams(search);
  const date = params.get('fecha');
  const time = params.get('hora');
  const minutes = /^\d{3,4}$/.test(time ?? '') ? Number(time) : NaN;
  const filter = params.get('filtro');
  const selected = params.get('terraza');
  return {
    date: validDate(date ?? '') ? date : defaults.date,
    minutes: Number.isInteger(minutes) && minutes >= 540 && minutes <= 1200 && minutes % 10 === 0 ? minutes : defaults.minutes,
    filter: ['all', 'sun', 'shade'].includes(filter) ? filter : defaults.filter,
    selected: places.some((place) => place.id === selected) ? selected : defaults.selected,
  };
}

export function shareUrl(currentUrl, state) {
  const url = new URL(currentUrl);
  url.username = '';
  url.password = '';
  url.search = new URLSearchParams({ fecha: state.date, hora: String(state.minutes), filtro: state.filter, terraza: state.selected });
  url.hash = '';
  return url.href;
}
