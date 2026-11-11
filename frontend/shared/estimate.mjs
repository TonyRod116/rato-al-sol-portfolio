import { classifyLight, pointInOrOnPolygon, sunPosition } from '../solar.mjs';
import { validCoordinate } from './places.mjs';

const METRES_PER_DEGREE = 111319.49079327358;
export function prepareScene(point, buildings, radius = 400) {
  if (!validCoordinate(point) || !Array.isArray(buildings) || !buildings.length) return null;
  if (!Number.isFinite(radius) || radius < 100) return null;
  const east = METRES_PER_DEGREE * Math.cos(point.latitude * Math.PI / 180);
  const scene = [];
  for (const b of buildings) {
    if (!Array.isArray(b.footprint) || b.footprint.length < 4 || !b.footprint.every(validCoordinate)) return null;
    const footprint = b.footprint.map((p) => [(p.longitude - point.longitude) * east, (point.latitude - p.latitude) * METRES_PER_DEGREE]);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of footprint) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    // A long edge can cross the covered area while every vertex lies outside.
    // A bounding box may keep extra buildings, but never discards such edges.
    const x = Math.max(minX, Math.min(0, maxX));
    const y = Math.max(minY, Math.min(0, maxY));
    if (x * x + y * y > (radius + 30) ** 2) continue;
    scene.push({ footprint, height: b.height, heightSource: b.heightSource });
  }
  return scene.length ? { point, buildings: scene, radius } : null;
}

// Keep one classification algorithm for synchronous callers and interruptible
// mobile work. A shadow cannot be returned until every footprint is checked:
// an invalid or containing footprint still makes the result unknown.
export function createLightAtBuilder(scene, instant) {
  const sun = scene && sunPosition(instant, scene.point.latitude, scene.point.longitude);
  let output = !sun ? 'unknown' : sun.altitude < -1 ? 'night' : sun.altitude < 5 || !Array.isArray(scene.buildings) ? 'unknown' : null;
  let index = 0, knownShade = false, uncertainShade = false;
  const buildings = scene?.buildings || [];
  return {
    step(maxBuildings = 50) {
      if (!Number.isSafeInteger(maxBuildings) || maxBuildings < 1) throw new RangeError('Invalid light batch size');
      if (output !== null) return true;
      const known = [], uncertain = [], end = Math.min(buildings.length, index + maxBuildings);
      while (index < end) {
        const building = buildings[index++];
        if (Number.isFinite(building.height) && building.height > 0) known.push(building);
        else uncertain.push({ ...building, height: 10000 });
      }
      const args = { sun, point: [0, 0], coverage: true };
      const actual = known.length ? classifyLight({ ...args, buildings: known }) : 'sun';
      const missing = uncertain.length ? classifyLight({ ...args, buildings: uncertain }) : 'sun';
      if (actual === 'unknown' || missing === 'unknown') { output = 'unknown'; return true; }
      knownShade ||= actual === 'shade';
      uncertainShade ||= missing === 'shade';
      if (index < buildings.length) return false;
      // A known obstruction establishes shade even if coverage is incomplete.
      if (knownShade) output = 'shade';
      else {
        const assumedMaximum = Math.max(100, ...buildings.map((building) => building.height || 0));
        output = assumedMaximum / Math.tan(sun.altitude * Math.PI / 180) > (scene.radius ?? 400) - 50 || uncertainShade ? 'unknown' : 'sun';
      }
      return true;
    },
    result() {
      if (output === null) throw new Error('Light calculation incomplete');
      return output;
    },
  };
}

export function lightAt(scene, instant) {
  const builder = createLightAtBuilder(scene, instant);
  while (!builder.step(500)) {}
  return builder.result();
}

export function sceneInsideBuilding(scene) {
  return !!scene?.buildings?.some((building) => pointInOrOnPolygon([0, 0], building.footprint));
}

// A selected point can lie inside a building. Offer several explicitly
// approximate exterior references rather than silently choosing a sidewalk.
export function nearbyOutdoorScenes(scene, buildings) {
  if (!sceneInsideBuilding(scene) || !Array.isArray(buildings)) return [];
  const directions = [
    { direction: 'Norte', east: 0, north: 1 }, { direction: 'Este', east: 1, north: 0 },
    { direction: 'Sur', east: 0, north: -1 }, { direction: 'Oeste', east: -1, north: 0 },
  ];
  const east = METRES_PER_DEGREE * Math.cos(scene.point.latitude * Math.PI / 180);
  const choices = [];
  for (const entry of directions) {
    let outside = false;
    for (let metres = 5; metres <= 40; metres += 5) {
      const point = { latitude: scene.point.latitude + entry.north * metres / METRES_PER_DEGREE,
        longitude: scene.point.longitude + entry.east * metres / east };
      const candidate = prepareScene(point, buildings, scene.radius - metres);
      if (!candidate || sceneInsideBuilding(candidate)) { outside = false; continue; }
      // Leave a small buffer beyond the estimated building outline.
      if (!outside && metres < 40) { outside = true; continue; }
      choices.push({ direction: entry.direction, metres, point, scene: candidate });
      break;
    }
  }
  return choices;
}

export function atMinutes(day, minutes) {
  const date = new Date(day);
  if (!Number.isFinite(date.valueOf()) || !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return null;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.getHours() === Math.floor(minutes / 60) && date.getMinutes() === minutes % 60 ? date : null;
}

export function createSolarWindowsBuilder(scene, day, instantAt = atMinutes) {
  const windows = [];
  let minutes = 0;
  let light;
  return {
    step(maxBuildings) {
      if (!scene || minutes >= 1440) return true;
      light ??= createLightAtBuilder(scene, instantAt(day, minutes));
      if (!light.step(maxBuildings)) return false;
      const state = light.result();
      const last = windows.at(-1);
      if (last?.state === state) last.to = minutes + 30;
      else windows.push({ state, from: minutes, to: minutes + 30 });
      light = null;
      minutes += 30;
      return minutes >= 1440;
    },
    result() {
      if (scene && minutes < 1440) throw new Error('Solar windows calculation incomplete');
      return windows;
    },
  };
}

export function solarWindows(scene, day, instantAt = atMinutes) {
  const builder = createSolarWindowsBuilder(scene, day, instantAt);
  while (!builder.step(500)) {}
  return builder.result();
}

// A range matches only when every sampled segment covering it is sunny.
// An absent segment, an unknown state, or a night segment cannot count as sun.
export function sunnyInRange(windows, from, to = from) {
  if (!Array.isArray(windows) || !Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || from >= 1440 || to < from || to > 1440) return false;
  const end = to === from ? from + 1 : to;
  let cursor = from;
  for (const segment of windows) {
    if (segment.to <= cursor) continue;
    if (segment.from > cursor || segment.state !== 'sun') return false;
    cursor = Math.min(end, segment.to);
    if (cursor >= end) return true;
  }
  return false;
}

// Return a conservative classification for one moment or a sampled interval.
export function lightForInterval(scene, day, from, to = from, instantAt = atMinutes) {
  if (!scene || !Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || from >= 1440 || to < from || to > 1440) return 'unknown';
  if (from === to) return lightAt(scene, instantAt(day, from));
  // Only the half-hour samples intersecting this interval can change its
  // answer. Computing every hour of the day blocks the UI for nearby places.
  let sunny = true, obstructed = false;
  for (let minute = Math.floor(from / 30) * 30; minute < to; minute += 30) {
    const state = lightAt(scene, instantAt(day, minute));
    if (state !== 'sun') sunny = false;
    if (state === 'shade' || state === 'night') obstructed = true;
  }
  const edges = [from, to - 1].map((minute) => lightAt(scene, instantAt(day, minute)));
  if (sunny && edges.every((state) => state === 'sun')) return 'sun';
  return obstructed || edges.some((state) => state === 'shade' || state === 'night') ? 'shade' : 'unknown';
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
