// Pack the visible shadow geometry into one SVG path. Every exterior has the
// same winding, and each courtyard has the opposite winding, so the nonzero
// fill rule paints overlapping shadows only once without polygon clipping.
const MERCATOR_LIMIT = 85.05112878;
const mercator = (latitude) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2;
const quantize = (value) => Math.round(value * 10) / 10;
// Roof footprints are immutable and reused between times in the same scene.
// Weak keys keep this small cache tied to the lifetime of the building data.
const projectedRoofs = new WeakMap();

// Group small batches within a short time budget. Yielding after every 100
// polygons adds substantial timer overhead in dense city centres, but doing
// the whole mask at once would block gestures on the JavaScript thread.
export function advanceShadowRasterPath(builder, now = Date.now) {
  const started = now();
  for (let batch = 0; batch < 80; batch++) {
    if (builder.step(25)) return true;
    if (now() - started >= 6) break;
  }
  return false;
}

export function createShadowRasterPath(collection, bounds, { longestSide = 384, maxVertices = 120000, nativeGroups = false } = {}) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new Error('Invalid shadow bounds');
  const [west, south, east, north] = bounds;
  if (west >= east || south >= north || south < -MERCATOR_LIMIT || north > MERCATOR_LIMIT) throw new Error('Invalid shadow bounds');
  const top = mercator(north), bottom = mercator(south), spanX = (east - west) / 360, spanY = bottom - top;
  const size = Math.max(64, Math.min(768, longestSide));
  const scale = size / Math.max(spanX, spanY);
  const width = Math.max(1, Math.ceil(spanX * scale)), height = Math.max(1, Math.ceil(spanY * scale));
  const projectionKey = `${west},${south},${east},${north},${width},${height}`;
  const paths = [], roofPaths = [], shadowFeatures = collection?.features || [], roofs = collection?.roofs || [];
  const features = [...shadowFeatures, ...roofs];
  let featureIndex = 0, polygonIndex = 0, vertices = 0, roofVertices = 0, pieces = 0;
  function addPolygon(polygon, roof) {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('Invalid shadow polygon');
    const cached = roof ? projectedRoofs.get(polygon) : null;
    if (cached?.key === projectionKey) {
      roofVertices += cached.vertices;
      if (roofVertices > maxVertices) throw new Error('Shadow geometry is too large');
      if (cached.path) roofPaths.push(cached.path);
      pieces++;
      return;
    }
    const polygonPaths = [];
    let polygonVertices = 0;
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
      const ring = polygon[ringIndex];
      if (!Array.isArray(ring) || ring.length < 4) throw new Error('Invalid shadow ring');
      if (roof) { roofVertices += ring.length; polygonVertices += ring.length; }
      else vertices += ring.length;
      if ((roof ? roofVertices : vertices) > maxVertices) throw new Error('Shadow geometry is too large');
      const points = ring.map((point) => {
        if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[1]) > MERCATOR_LIMIT) throw new Error('Invalid shadow point');
        return [quantize(((point[0] - west) / 360) * width / spanX), quantize((mercator(point[1]) - top) * height / spanY)];
      });
      let twiceArea = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        twiceArea += a[0] * b[1] - b[0] * a[1];
      }
      // A zero-area sweep or subpixel piece has no visible filled area.
      if (Math.abs(twiceArea) < 1e-7) continue;
      if ((ringIndex === 0) !== (twiceArea > 0)) points.reverse();
      // Z already closes the ring; omitting a repeated closing coordinate
      // makes the native SVG path smaller without changing its silhouette.
      if (points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) points.pop();
      polygonPaths.push(`M${points.map(([x, y]) => `${x},${y}`).join('L')}Z`);
    }
    const path = polygonPaths.join('');
    if (path) (roof ? roofPaths : paths).push(path);
    if (roof) projectedRoofs.set(polygon, { key: projectionKey, path, vertices: polygonVertices });
    pieces++;
  }
  function step(maxPieces = 100) {
    let processed = 0;
    while (featureIndex < features.length && processed < maxPieces) {
      const geometry = features[featureIndex]?.geometry;
      const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
      if (!Array.isArray(polygons)) throw new Error('Invalid shadow geometry');
      if (polygonIndex >= polygons.length) { featureIndex++; polygonIndex = 0; continue; }
      addPolygon(polygons[polygonIndex++], featureIndex >= shadowFeatures.length);
      processed++;
    }
    return featureIndex >= features.length;
  }
  function result() {
    if (featureIndex < features.length) throw new Error('Shadow path is incomplete');
    // Native drawing can render one complete polygon (including its holes)
    // at a time. SVG consumers continue to receive the original single path.
    const separator = nativeGroups ? '|' : '';
    return { d: paths.join(separator), roofD: roofPaths.join(separator), width, height,
      bounds: [[north, east], [south, west]], vertices, roofVertices, pieces };
  }
  return { step, result };
}
