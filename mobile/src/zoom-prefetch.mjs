import { inMadridArea } from '../../frontend/shared/madrid-scene.mjs';
import { inBarcelonaArea } from '../../frontend/shared/barcelona-terraces.mjs';
import { viewportBounds } from '../../frontend/viewport-buildings.mjs';

const validBounds = (bounds) => Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite) &&
  bounds[0] < bounds[2] && bounds[1] < bounds[3];
const covers = (outer, inner) => validBounds(outer) && validBounds(inner) &&
  outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
const inside = (bounds, check) => [[bounds[0], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[1]], [bounds[2], bounds[3]]]
  .every(([longitude, latitude]) => check({ longitude, latitude }));

// A modest single zoom-out step. Use the same rounding and geographic
// limits as the real loader: never schedule a request which cannot succeed.
export function zoomPrefetchBounds(bounds, source) {
  if (!validBounds(bounds)) return null;
  const [west, south, east, north] = bounds;
  const dx = (east - west) * .12, dy = (north - south) * .12;
  const target = viewportBounds([west - dx, south - dy, east + dx, north + dy]);
  if (!target || !covers(target, bounds)) return null;
  // At very close zoom, rounding can turn a small step into a very large
  // expansion. Avoid speculative downloads over three times the current area.
  const ratio = ((target[2] - target[0]) * (target[3] - target[1])) / ((east - west) * (north - south));
  if (ratio > 3.1) return null;
  if (source === 'madrid') {
    if (!inside(target, inMadridArea) || target[2] - target[0] > .04 || target[3] - target[1] > .03) return null;
  } else if (source === 'osm') {
    if (!inside(target, inBarcelonaArea)) return null;
    const latitude = (target[1] + target[3]) / 2;
    const columns = Math.max(1, Math.ceil((target[2] - target[0]) * 111319.49 * Math.cos(latitude * Math.PI / 180) / 500));
    const rows = Math.max(1, Math.ceil((target[3] - target[1]) * 111319.49 / 500));
    if (columns * rows > 6) return null;
  } else return null;
  return target;
}

// Background work is deliberately modest: a stable view, one request at a
// time and a cooldown. Cancelling does not abort a loader request that the
// foreground view may also be using, but suppresses its subsequent disk save.
export function createZoomPrefetch({ loader, buildingCache, generation, now = Date.now,
  schedule = setTimeout, unschedule = clearTimeout, delay = 3000, cooldown = 30000 }) {
  let active = null, timer = null, running = false, lastNetwork = -Infinity;
  function cancel() {
    active = null;
    if (timer !== null) unschedule(timer);
    timer = null;
  }
  function valid(task) {
    return active === task && generation() === task.generation && loader() === task.loader;
  }
  function queue() {
    if (!active || timer !== null || running) return;
    const wait = Math.max(delay, lastNetwork + cooldown - now());
    timer = schedule(run, wait);
  }
  async function run() {
    timer = null;
    const task = active;
    if (!task || running || !valid(task)) return;
    running = true;
    try {
      if (task.loader.find(task.target)) return;
      let saved;
      try { saved = await buildingCache.find(task.target); } catch { /* A cache miss must not block the app. */ }
      if (!valid(task)) return;
      if (saved?.value?.source === task.source && covers(saved.value.bounds, task.target)) {
        task.loader.prime({ ...saved.value, fetchedAt: saved.fetchedAt });
        return;
      }
      if (task.loader.find(task.target)) return;
      lastNetwork = now();
      const area = await task.loader.get(task.target);
      if (!valid(task) || area?.source !== task.source || !covers(area?.bounds, task.target)) return;
      await buildingCache.save(area, { fetchedAt: area.fetchedAt ?? now() });
    } catch { /* Speculative work must never disrupt the foreground view. */ }
    finally {
      running = false;
      if (active && active !== task) queue();
    }
  }
  function start({ bounds, geometry }) {
    cancel();
    const target = zoomPrefetchBounds(bounds, geometry?.source);
    if (!target || !covers(geometry?.bounds, bounds)) return () => {};
    const selectedLoader = loader();
    if (!selectedLoader || covers(geometry.bounds, target) || selectedLoader.find(target)) return () => {};
    const task = { target, source: geometry.source, loader: selectedLoader, generation: generation() };
    active = task;
    queue();
    return () => { if (active === task) cancel(); };
  }
  return { start, cancel };
}
