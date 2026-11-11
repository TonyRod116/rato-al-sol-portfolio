// Composite every shadow at full opacity first; the map applies transparency once.
export function drawShadowMask(canvas, collection, bounds, longestSide = 1536) {
  const [west, south, east, north] = bounds;
  const mercatorY = (lat) => (1 - Math.asinh(Math.tan(Math.max(-85.051128, Math.min(85.051128, lat)) * Math.PI / 180)) / Math.PI) / 2;
  const top = mercatorY(north), bottom = mercatorY(south);
  const spanX = (east - west) / 360, spanY = bottom - top;
  const scale = Math.min(2048, Math.max(256, longestSide)) / Math.max(spanX, spanY);
  const width = Math.max(1, Math.ceil(spanX * scale));
  const height = Math.max(1, Math.ceil(spanY * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#5c6261';
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      context.beginPath();
      for (const ring of polygon) {
        ring.forEach(([lng, lat], index) => {
          const x = ((lng - west) / 360) * width / spanX;
          const y = (mercatorY(lat) - top) * height / spanY;
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.closePath();
      }
      context.fill('evenodd');
    }
  }
}
