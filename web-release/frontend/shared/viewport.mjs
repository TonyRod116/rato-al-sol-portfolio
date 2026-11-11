import { inMadridArea } from './madrid-scene.mjs';
import { inBarcelonaArea } from './barcelona-terraces.mjs';

// Ignore sub-centimetre coordinate noise from repeated native map events.
const MAP_JITTER = 1e-7;
export function stableMapCenter(previous, point) {
  if (!Number.isFinite(point?.latitude) || !Number.isFinite(point?.longitude)) return previous;
  if (Number.isFinite(previous?.latitude) && Number.isFinite(previous?.longitude) &&
      Math.abs(previous.latitude - point.latitude) <= MAP_JITTER && Math.abs(previous.longitude - point.longitude) <= MAP_JITTER) return previous;
  return { latitude: point.latitude, longitude: point.longitude };
}

export function stableMapBounds(previous, next) {
  if (previous === next) return previous;
  if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== 4 || next.length !== 4) return next;
  return previous.every((value, i) => Number.isFinite(value) && Number.isFinite(next[i]) && Math.abs(value - next[i]) <= MAP_JITTER) ? previous : next;
}

// Include a margin so shadows from buildings just outside the map can reach it.
export function paddedViewport(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
  const [west, south, east, north] = bounds;
  if (west >= east || south >= north || south < -85 || north > 85) return null;
  const latitude = (south + north) / 2;
  const padY = Math.max((north - south) * .2, 100 / 111319.49);
  const padX = Math.max((east - west) * .2, padY / Math.cos(latitude * Math.PI / 180));
  const result = [west - padX, south - padY, east + padX, north + padY];
  return result[0] >= -180 && result[2] <= 180 && result[1] >= -85 && result[3] <= 85 ? result : null;
}

export function nativeVisibleViewport(region, boundary) {
  const sw = boundary?.southWest, ne = boundary?.northEast;
  const visible = sw && ne && [sw.longitude, sw.latitude, ne.longitude, ne.latitude];
  if (paddedViewport(visible)) return visible;
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region || {};
  if (![latitude, longitude, latitudeDelta, longitudeDelta].every(Number.isFinite)) return null;
  const fallback = [longitude - longitudeDelta / 2, latitude - latitudeDelta / 2,
    longitude + longitudeDelta / 2, latitude + latitudeDelta / 2];
  return paddedViewport(fallback) ? fallback : null;
}

export function nativeViewport(region, boundary) {
  return paddedViewport(nativeVisibleViewport(region, boundary));
}

const contains = (outer, inner) => Array.isArray(outer) && Array.isArray(inner) &&
  outer.length === 4 && inner.length === 4 && outer.every(Number.isFinite) && inner.every(Number.isFinite) &&
  outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

// A shadow image may cover more than the visible screen, but only when the
// building data also covers the expanded area plus the normal projection
// margin. Keep the exact same object through small pans to avoid rebuilding
// the image. A new time or dataset must always produce a new frame.
export function stableShadowViewport(visible, geometry, timeKey, previous = null, maxExpansion = .35) {
  const coverage = geometry?.bounds;
  if (timeKey == null || !paddedViewport(visible) || !contains(coverage, paddedViewport(visible)) ||
      !Number.isFinite(maxExpansion) || maxExpansion < 0) return null;
  if (previous && previous.geometry === geometry &&
      contains(previous.bounds, visible) && contains(coverage, paddedViewport(previous.bounds))) {
    // The next time must still produce a distinct frame/image, but keeping
    // the same array lets a safely prepared future frame match this area.
    return previous.timeKey === timeKey ? previous : { bounds: previous.bounds, geometry, timeKey };
  }
  const [w, s, e, n] = visible, result = [...visible];
  // Grow each edge independently; one blocked edge must not prevent reuse
  // in the opposite direction. Limit speculative image size and preserve the
  // original complete-data margin for every candidate.
  for (const [edge, distance] of [[0, (e - w) * maxExpansion], [2, (e - w) * maxExpansion],
    [1, (n - s) * maxExpansion], [3, (n - s) * maxExpansion]]) {
    let low = 0, high = distance;
    for (let i = 0; i < 24; i++) {
      const delta = (low + high) / 2, candidate = [...result];
      candidate[edge] += (edge < 2 ? -1 : 1) * delta;
      if (contains(coverage, paddedViewport(candidate))) low = delta;
      else high = delta;
    }
    result[edge] += (edge < 2 ? -1 : 1) * low;
  }
  return { bounds: result, geometry, timeKey };
}

// After a local pan, request one additional 0.001-degree strip in the
// direction of movement. Do not increase the first request or distant jumps,
// and retain the existing tighter Overpass limits outside Madrid.
export function expandedMadridViewport(bounds, previous) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      !Array.isArray(previous) || previous.length !== 4 || !previous.every(Number.isFinite)) return bounds;
  const center = { latitude: (bounds[1] + bounds[3]) / 2, longitude: (bounds[0] + bounds[2]) / 2 };
  const prior = { latitude: (previous[1] + previous[3]) / 2, longitude: (previous[0] + previous[2]) / 2 };
  if (!inMadridArea(center) || !inMadridArea(prior)) return bounds;
  const dx = center.longitude - prior.longitude, dy = center.latitude - prior.latitude;
  if (Math.abs(dx) > (bounds[2] - bounds[0]) * 2 || Math.abs(dy) > (bounds[3] - bounds[1]) * 2) return bounds;
  const expanded = [...bounds];
  if (Math.abs(dx) > 1e-8) { const side = dx > 0 ? 2 : 0; expanded[side] = Math.round((expanded[side] + Math.sign(dx) * .001) * 1000) / 1000; }
  if (Math.abs(dy) > 1e-8) { const side = dy > 0 ? 3 : 1; expanded[side] = Math.round((expanded[side] + Math.sign(dy) * .001) * 1000) / 1000; }
  if (expanded[0] < -3.94 || expanded[2] > -3.50 || expanded[1] < 40.28 || expanded[3] > 40.62 ||
      expanded[2] - expanded[0] > .04 || expanded[3] - expanded[1] > .03) return bounds;
  return expanded;
}

// Reuse only complete areas: a nearby viewport may be served from a wider
// request, but never present partial building coverage as a complete result.
export function createViewportLoader(load, now = Date.now, requestBounds = (bounds) => bounds) {
  const recent = [];
  const pending = [];
  let previousBounds = null;
  const covers = (outer, inner) => Array.isArray(outer) && Array.isArray(inner) &&
    outer.length === 4 && inner.length === 4 && outer.every(Number.isFinite) && inner.every(Number.isFinite) &&
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
  const sourceFor = (bounds) => {
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) return null;
    const [w, s, e, n] = bounds;
    const corners = [{ longitude: w, latitude: s }, { longitude: w, latitude: n },
      { longitude: e, latitude: s }, { longitude: e, latitude: n }];
    return corners.every(inMadridArea) ? 'madrid' : corners.every(inBarcelonaArea) ? 'osm' : null;
  };
  function incrementalBase(bounds) {
    const source = sourceFor(bounds);
    if (!source) return null;
    const [w, s, e, n] = bounds, area = (e - w) * (n - s), time = now();
    let best = null, bestArea = 0;
    // A pan can finish while the first request is still downloading. Its
    // eventual result is just as reusable as a completed request, provided
    // that it succeeds and proves complete coverage before we publish it.
    for (const entry of [...recent, ...pending]) {
      if (entry.value ? entry.expires <= time || entry.value.source !== source : !entry.promise || sourceFor(entry.bounds) !== source) continue;
      const [ow, os, oe, on] = entry.bounds;
      const intersection = [Math.max(w, ow), Math.max(s, os), Math.min(e, oe), Math.min(n, on)];
      const overlap = Math.max(0, intersection[2] - intersection[0]) * Math.max(0, intersection[3] - intersection[1]);
      if (overlap > bestArea && overlap >= area * .35) { best = { entry, intersection, source }; bestArea = overlap; }
    }
    return best;
  }
  async function loadIncrementally(bounds, base) {
    const [w, s, e, n] = bounds, [iw, is, ie, inn] = base.intersection;
    // Rectangles outside the already complete cached area. Never mark the
    // resulting viewport complete until every missing strip succeeds.
    const strips = [[w, s, iw, n], [ie, s, e, n], [iw, s, ie, is], [iw, inn, ie, n]]
      .filter(([left, bottom, right, top]) => right > left && top > bottom);
    // The municipal server can return geometry just outside the requested
    // envelope due to its spatial index. Query a small overlap around each
    // strip so shadows from boundary buildings are not lost at the seams.
    let expanded = strips.map(([left, bottom, right, top]) => [left - .0002, bottom - .0002, right + .0002, top + .0002]);
    // The public Overpass service should receive one query for a pan, not
    // simultaneous queries for the different sides of a diagonal pan.
    // A bounding rectangle covers every missing strip, even if it also
    // includes some geometry already known from the base.
    if (base.source === 'osm' && expanded.length > 1) expanded = [[
      Math.min(...expanded.map((strip) => strip[0])), Math.min(...expanded.map((strip) => strip[1])),
      Math.max(...expanded.map((strip) => strip[2])), Math.max(...expanded.map((strip) => strip[3])),
    ]];
    if (expanded.some((strip) => sourceFor(strip) !== base.source)) return { value: await load(bounds), expires: now() + 120000 };
    // Start the missing strips immediately, in parallel with a pending base.
    // Attach a rejection handler now: the base may take longer to complete.
    const additionsResult = Promise.all(expanded.map((strip) => load(strip, undefined, { allowEmpty: true })))
      .then((value) => ({ value }), (error) => ({ error }));
    if (base.entry.promise && !base.entry.value) {
      let value;
      try { value = await base.entry.promise; } catch { /* Fetch the whole area below. */ }
      if (!value || value.source !== base.source || !covers(value.bounds, base.entry.bounds) || base.entry.expires <= now()) {
        return { value: await load(bounds), expires: now() + 120000 };
      }
      base = { ...base, entry: { ...base.entry, value } };
    }
    const additionsOutcome = await additionsResult;
    if ('error' in additionsOutcome) {
      // A bounding rectangle of diagonal OSM strips may exceed the provider's
      // cell limit while the actual requested view still fits in it.
      if (base.source === 'osm' && additionsOutcome.error?.message?.startsWith('Acerca el mapa'))
        return { value: await load(bounds), expires: now() + 120000 };
      throw additionsOutcome.error;
    }
    const additions = additionsOutcome.value;
    if (additions.some((item, i) => item?.source !== base.source || !Array.isArray(item.features) || !covers(item.bounds, expanded[i]))) {
      throw new Error('Geometría de edificios incompleta.');
    }
    if (base.entry.expires <= now()) return { value: await load(bounds), expires: now() + 120000 };
    const features = [], seen = new Set();
    let vertices = 0;
    for (const value of [base.entry.value, ...additions]) for (const feature of value.features) {
      const id = feature?.properties?.id;
      if (id !== undefined && seen.has(id)) continue;
      if (id !== undefined) seen.add(id);
      features.push(feature);
      const geometry = feature.geometry;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) vertices += ring.length;
      if (features.length > (base.source === 'osm' ? 3999 : 8000) || vertices > 200000) {
        // The combined views must obey the same resource limits as a single
        // Madrid response, even when each individual strip was under budget.
        return { value: await load(bounds), expires: now() + 120000 };
      }
    }
    const omitted = [base.entry.value, ...additions].reduce((sum, item) => sum + (item.omitted || 0), 0);
    return { value: { type: 'FeatureCollection', source: base.source, features, bounds, omitted,
      fetchedAt: Math.min(base.entry.value.fetchedAt ?? now(), ...additions.map((item) => item.fetchedAt ?? now())) }, expires: base.entry.expires };
  }
  function find(bounds) {
    const time = now();
    return recent.find((entry) => entry.expires > time && covers(entry.bounds, bounds))?.value || null;
  }
  function prime(value) {
    if (!value || !Array.isArray(value.bounds) || !Array.isArray(value.features)) return;
    recent.push({ bounds: value.bounds, value, expires: now() + 120000 });
    if (recent.length > 6) recent.shift();
  }
  function get(bounds) {
    const cached = find(bounds);
    if (cached) return Promise.resolve(cached);
    const underway = pending.find((entry) => covers(entry.bounds, bounds));
    if (underway) return underway.promise;
    const requested = requestBounds(bounds, previousBounds);
    previousBounds = [...bounds];
    const entry = { bounds: [...(covers(requested, bounds) ? requested : bounds)] };
    const base = incrementalBase(entry.bounds);
    entry.promise = Promise.resolve().then(() => base ? loadIncrementally(entry.bounds, base)
      : Promise.resolve(load(entry.bounds)).then((value) => ({ value, expires: now() + 120000 }))).then(({ value, expires }) => {
      entry.expires = expires;
      if (covers(value?.bounds, entry.bounds)) {
        recent.push({ bounds: value.bounds, value, expires });
        if (recent.length > 6) recent.shift();
      }
      return value;
    }).finally(() => {
      const index = pending.indexOf(entry);
      if (index >= 0) pending.splice(index, 1);
    });
    pending.push(entry);
    return entry.promise;
  }
  // The caller can avoid waiting for a disk scan when the next city area
  // can be reconstructed from a complete in-memory or in-flight base.
  const hasIncremental = (bounds) => Boolean(incrementalBase(bounds));
  return { find, get, prime, hasIncremental };
}
