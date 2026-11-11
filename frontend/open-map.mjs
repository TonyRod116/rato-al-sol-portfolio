// Fallback when the 3D map is unavailable. Official Leaflet 1.9.4 files
// are pinned with the integrity hashes published by the project.
import { mapAtmosphere } from './map-atmosphere.mjs';
import { drawShadowMask } from './shadow-mask.mjs?v=20261103-6';
import { AYALA_BOUNDS } from './madrid-buildings.mjs';
import { AERIAL_TILES, AERIAL_ATTRIBUTION } from './map-basemap.mjs';
import { DEFAULT_LOCATION } from './shared/default-location.mjs';

export async function createOpenMap(element, onTileStatus, onViewChange = () => {}, onBasemapError = () => {}, onPick = () => {}) {
  const version = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = `${version}.css`;
  css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = 'anonymous';
  const cssReady = new Promise((resolve, reject) => { css.onload = resolve; css.onerror = reject; });
  document.head.append(css);
  const script = document.createElement('script');
  script.src = `${version}.js`;
  script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; script.crossOrigin = 'anonymous';
  const scriptReady = new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; });
  document.head.append(script);
  let timeout;
  try {
    await Promise.race([Promise.all([cssReady, scriptReady]), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Map timed out')), 12000);
    })]);
  } finally { clearTimeout(timeout); }
  if (!window.L?.map) throw new Error('Map unavailable');
  const L = window.L;
  const map = L.map(element, { zoomControl: false, scrollWheelZoom: false }).setView([DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude], 17);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  });
  let loaded = false, failed = 0;
  const tileTimeout = setTimeout(() => { if (!loaded) onTileStatus(false); }, 12000);
  tiles.on('tileload', () => { loaded = true; clearTimeout(tileTimeout); onTileStatus(true); });
  tiles.on('tileerror', () => { if (!loaded && ++failed >= 3) onTileStatus(false); });
  tiles.addTo(map);
  const shadowCanvas = document.createElement('canvas');
  const toLatLngBounds = ([west, south, east, north]) => [[south, west], [north, east]];
  const shadows = L.imageOverlay('', toLatLngBounds(AYALA_BOUNDS), { opacity: .44, interactive: false }).addTo(map);
  let aerial, aerialSelected = false, aerialErrors = 0;
  const notifyView = () => {
    const bounds = map.getBounds().pad(.2);
    onViewChange({ bearing: 0, center: map.getCenter(), settled: true,
      shadowBounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] });
  };
  map.on('moveend', notifyView);
  map.on('click', (event) => onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
  notifyView();
  let markers = [];
  let selectedPoint;
  let pendingFit = false, fittedPlaces = false;
  function fitPlaces() {
    if (!pendingFit || !map.getSize().x || !map.getSize().y) return;
    const bounds = L.latLngBounds(markers.map((marker) => marker.getLatLng()));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: false });
    pendingFit = false;
    fittedPlaces = true;
  }
  return {
    setBuildings() {},
    setSun(sun) { map.getPane('tilePane').style.filter = mapAtmosphere(sun).cssFilter; },
    setShadows(data, bounds = AYALA_BOUNDS) {
      const size = Math.max(element.clientWidth, element.clientHeight) * (window.devicePixelRatio || 1) * 1.4;
      drawShadowMask(shadowCanvas, data, bounds, size);
      shadows.setBounds(toLatLngBounds(bounds));
      shadows.setUrl(shadowCanvas.toDataURL('image/png'));
    },
    setBasemap(kind) {
      aerialSelected = kind === 'aerial';
      shadows.setOpacity(aerialSelected ? .82 : .44);
      aerialErrors = 0;
      if (aerialSelected) {
        if (!aerial) {
          aerial = L.tileLayer(AERIAL_TILES, { maxZoom: 19, attribution: AERIAL_ATTRIBUTION });
          aerial.on('tileerror', () => {
            if (aerialSelected && ++aerialErrors >= 3) {
              aerialSelected = false;
              shadows.setOpacity(.44);
              map.removeLayer(aerial); tiles.addTo(map);
              onBasemapError();
            }
          });
        }
        map.removeLayer(tiles); aerial.addTo(map);
      } else {
        if (aerial) map.removeLayer(aerial);
        tiles.addTo(map);
      }
    },
    setSelectedPoint(point) {
      selectedPoint?.remove();
      if (!point) return;
      const icon = L.divIcon({ className: 'open-map-pin', html: '<span class="selected-point-pin"></span>', iconSize: [30, 38], iconAnchor: [15, 38] });
      selectedPoint = L.marker([point.latitude, point.longitude], { icon, interactive: false, title: point.name }).addTo(map);
    },
    showPlaces(places, onSelect) {
      for (const marker of markers) marker.remove();
      markers = places.flatMap((place, index) => {
        if (!place.position) return [];
        const icon = L.divIcon({ className: 'open-map-pin', html: `<span class="google-pin">${index + 1}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] });
        const marker = L.marker([place.position.lat, place.position.lng], {
          icon, title: place.pinLabel || `${place.name}, entrada aproximada`, alt: place.pinLabel || `${place.name}, entrada aproximada`,
        }).addTo(map).on('click', () => onSelect(place.id));
        marker.ratoId = place.id;
        return [marker];
      });
      pendingFit = !fittedPlaces && markers.length > 0;
      fitPlaces();
    },
    focus(position) { if (position) map.panTo([position.lat, position.lng]); },
    highlight(id) {
      for (const marker of markers) marker.getElement()?.classList.toggle('is-selected', marker.ratoId === id);
    },
    invalidate() { map.invalidateSize(); fitPlaces(); },
  };
}
