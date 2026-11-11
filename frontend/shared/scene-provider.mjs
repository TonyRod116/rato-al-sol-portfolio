import { getBuildings } from './places.mjs';
import { getMadridScene, inMadridArea, MADRID_RADIUS } from './madrid-scene.mjs';

export async function getScenes(points, fetchFn = fetch) {
  // A single point in Madrid can use municipal heights, which are more useful
  // than sparse community height tags. Larger batches use OpenStreetMap.
  if (points.length === 1 && inMadridArea(points[0])) {
    try {
      return { buildings: await getMadridScene(points[0], fetchFn), radius: MADRID_RADIUS, source: 'madrid' };
    } catch { /* Madrid can fail or have no coverage; try the worldwide source. */ }
  }
  return { buildings: await getBuildings(points, fetchFn), radius: 400, source: 'osm' };
}
