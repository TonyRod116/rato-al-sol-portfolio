import { getPosition } from './vendor/suncalc-2.0.2.mjs';

const madridClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function civilTimeToUtc(date, minutes) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 2000 || year > 2099) return null;
  const wallClock = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const desired = new Date(wallClock);
  if (desired.getUTCFullYear() !== year || desired.getUTCMonth() !== month - 1 || desired.getUTCDate() !== day) return null;

  const asMadridWallClock = (instant) => {
    const fields = Object.fromEntries(madridClock.formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
    return Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute);
  };
  // Sample offsets on either side of a clock change. A skipped hour has no
  // match; a repeated hour resolves to its first occurrence.
  const offsets = new Set([-36, 0, 36].map((hours) => {
    const sample = wallClock + hours * 3600000;
    return asMadridWallClock(new Date(sample)) - sample;
  }));
  const matches = [...offsets].map((offset) => wallClock - offset)
    .filter((instant) => asMadridWallClock(new Date(instant)) === wallClock).sort((a, b) => a - b);
  return matches.length ? new Date(matches[0]) : null;
}

export function sunPosition(instant, latitude, longitude) {
  if (!(instant instanceof Date) || !Number.isFinite(instant.valueOf()) ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return getPosition(instant, latitude, longitude); // degrees, azimuth clockwise from north
}

// Ground displacement of a building's roof shadow; x east, y south, metres.
// Match the classification's horizon threshold rather than drawing false precision.
export function shadowOffset(sun, height) {
  if (!sun || !Number.isFinite(sun.altitude) || sun.altitude < 5 || sun.altitude > 90 ||
      !Number.isFinite(sun.azimuth) || sun.azimuth < 0 || sun.azimuth > 360 ||
      !Number.isFinite(height) || height <= 0) return null;
  const angle = sun.azimuth * Math.PI / 180;
  const length = height / Math.tan(sun.altitude * Math.PI / 180);
  return [-Math.sin(angle) * length, Math.cos(angle) * length];
}

const EPSILON = 1e-8;
const cross = ([ax, ay], [bx, by]) => ax * by - ay * bx;
const minus = ([ax, ay], [bx, by]) => [ax - bx, ay - by];
const validPoint = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

function validFootprint(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3 || !polygon.every(validPoint)) return false;
  const twiceArea = polygon.reduce((sum, point, index) => sum + cross(point, polygon[(index + 1) % polygon.length]), 0);
  return Math.abs(twiceArea) > EPSILON;
}

// Sweep the footprint away from the sun, returning the ground polygons to draw.
export function shadowPolygons(sun, building) {
  const offset = shadowOffset(sun, building?.height);
  if (!offset || !validFootprint(building?.footprint)) return [];
  const footprint = building.footprint;
  const shifted = footprint.map(([x, y]) => [x + offset[0], y + offset[1]]);
  return [shifted, ...footprint.map((point, i) => {
    const next = (i + 1) % footprint.length;
    return [point, footprint[next], shifted[next], shifted[i]];
  })];
}

export function pointInOrOnPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    const ab = minus(b, a), ap = minus(point, a);
    const lengthSquared = ab[0] ** 2 + ab[1] ** 2;
    if (lengthSquared < EPSILON) continue;
    const dot = ap[0] * ab[0] + ap[1] * ab[1];
    if (Math.abs(cross(ab, ap)) < EPSILON && dot >= -EPSILON && dot <= lengthSquared + EPSILON) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Distance along a horizontal ray to the first polygon edge; x east, y south.
function rayDistance(point, direction, polygon) {
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], edge = minus(polygon[(i + 1) % polygon.length], a);
    if (edge[0] ** 2 + edge[1] ** 2 < EPSILON) continue;
    const offset = minus(a, point), denominator = cross(direction, edge);
    if (Math.abs(denominator) < EPSILON) {
      if (Math.abs(cross(offset, direction)) < EPSILON) {
        const projections = [a, polygon[(i + 1) % polygon.length]].map((p) => {
          const delta = minus(p, point);
          return delta[0] * direction[0] + delta[1] * direction[1];
        });
        if (Math.max(...projections) >= 0) nearest = Math.min(nearest, Math.max(0, Math.min(...projections)));
      }
      continue;
    }
    const distance = cross(offset, edge) / denominator;
    const alongEdge = cross(offset, direction) / denominator;
    if (distance >= 0 && alongEdge >= -EPSILON && alongEdge <= 1 + EPSILON) nearest = Math.min(nearest, distance);
  }
  return nearest;
}

// Flat, synthetic scene: height and planar coordinates are in the same metres.
// coverage=true is an explicit statement that the scene's obstacles are known.
export function classifyLight({ sun, point, buildings, coverage }) {
  if (!sun || !Number.isFinite(sun.altitude) || Math.abs(sun.altitude) > 90 ||
      !Number.isFinite(sun.azimuth) || sun.azimuth < 0 || sun.azimuth > 360) return 'unknown';
  if (sun.altitude < -1) return 'night';
  if (sun.altitude < 5 || coverage !== true || !validPoint(point) || !Array.isArray(buildings)) return 'unknown';
  if (buildings.some((building) => !Number.isFinite(building?.height) || building.height <= 0 ||
      !validFootprint(building.footprint) || pointInOrOnPolygon(point, building.footprint))) return 'unknown';

  const angle = sun.azimuth * Math.PI / 180;
  const direction = [Math.sin(angle), -Math.cos(angle)];
  const slope = Math.tan(sun.altitude * Math.PI / 180);
  return buildings.some(({ footprint, height }) => rayDistance(point, direction, footprint) * slope <= height + EPSILON)
    ? 'shade' : 'sun';
}
