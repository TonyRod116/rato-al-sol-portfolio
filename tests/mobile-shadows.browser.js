// Run with playwright-cli against the Expo web preview; buildings are synthetic.
async page => {
  const failures = [], requests = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/sigma.madrid.es/**', route => {
    const query = new URLSearchParams(route.request().postData() || '');
    const area = (query.get('geometry') || '').split(',').map(Number);
    requests.push(area.join(','));
    if (area.length !== 4 || !area.every(Number.isFinite)) return route.fulfill({ status: 400, body: 'Invalid area' });
    const [w, s, e, n] = area;
    const features = Array.from({ length: 180 }, (_, i) => {
      const x = w + (e - w) * (.06 + .88 * (i % 15) / 14);
      const y = s + (n - s) * (.06 + .88 * Math.floor(i / 15) / 11);
      const ring = [[x, y], [x + .00006, y], [x + .00006, y + .00006], [x, y + .00006], [x, y]];
      return { type: 'Feature', properties: { OBJECTID: i, ALTURA: 15 }, geometry: { type: 'Polygon', coordinates: [ring] } };
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:8082/');
  await page.waitForSelector('.maplibregl-ctrl-zoom-in', { timeout: 30000 });
  await page.evaluate(() => {
    const original = window.maplibregl.Map.prototype.easeTo;
    window.maplibregl.Map.prototype.easeTo = function (...args) { window.__ratoMap = this; return original.apply(this, args); };
  });
  await page.getByRole('button', { name: 'Ver mapa en 2D' }).click();
  await page.waitForFunction(() => window.__ratoMap && window.__ratoMap.getPitch() < 0.1);
  await page.getByRole('button', { name: 'Ver mapa en 3D' }).click();
  await page.getByRole('slider', { name: 'Hora para consultar el sol' }).fill('780');
  await page.waitForTimeout(4500);
  const coverage = await page.evaluate(() => {
    const canvas = window.__ratoMap.getSource('ayala-shadows').getCanvas();
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const columns = [0, 0, 0, 0];
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3]) columns[Math.min(3, Math.floor(x * 4 / canvas.width))]++;
    }
    return columns;
  });
  if (coverage.some((count) => count === 0)) throw new Error(`Sin sombras en parte del mapa: ${coverage}`);
  const previous = requests.at(-1);
  await page.evaluate(() => window.__ratoMap.panBy([250, 0], { duration: 0 }));
  await page.waitForTimeout(3500);
  if (!requests.some((area) => area !== previous)) throw new Error('No se actualizaron los edificios al desplazar el mapa.');
  if (failures.length) throw new Error(failures.join('; '));
  return { syntheticBuildings: 180, pixelsByQuarter: coverage, requestsForMovedMap: new Set(requests).size, failures };
}
