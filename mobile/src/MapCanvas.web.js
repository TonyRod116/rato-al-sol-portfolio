import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { createCityMap } from '../../frontend/city-map.mjs';
import { mapAtmosphere } from '../../frontend/map-atmosphere.mjs';
import { DEFAULT_LOCATION } from '../../frontend/shared/default-location.mjs';
import { translate } from '../../frontend/shared/i18n.mjs';
import { paddedViewport } from './viewport.mjs';

let leafletPromise;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = 'anonymous';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.L); script.onerror = reject; document.head.appendChild(script);
  });
  return leafletPromise;
}

export default function MapCanvas({ camera, places, selected, language, shadows, sun, view3D, on3DAvailable, onMove, onPick, onPlace, style }) {
  const element = useRef(null), city = useRef(null), map = useRef(null), layers = useRef(null), view = useRef(null), callbacks = useRef({});
  const [engine, setEngine] = useState('loading');
  callbacks.current = { onMove, onPick, onPlace, on3DAvailable, shadows };
  useEffect(() => {
    let disposed = false;
    let resizeObserver;
    async function start() {
      try {
        const cityMap = await createCityMap(element.current, (next) => {
          view.current = next;
          if (next.settled) {
            callbacks.current.onMove({ latitude: next.center.lat, longitude: next.center.lng, bounds: paddedViewport(next.bounds), visibleBounds: next.bounds });
            city.current?.setShadows(callbacks.current.shadows, next.shadowBounds);
          }
        }, () => {}, (point) => callbacks.current.onPick(point), { pitch: 20, bearing: 0, zoom: 17.3, plainMarkers: true, keepCamera: true, maxMarkers: 30 });
        if (disposed) { cityMap.destroy(); return; }
        city.current = cityMap;
        setEngine('city');
      } catch {
        try {
          const L = await loadLeaflet();
          if (disposed || !element.current) return;
          map.current = L.map(element.current, { zoomControl: false }).setView([DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude], 16);
          L.control.zoom({ position: 'bottomleft' }).addTo(map.current);
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map.current);
          layers.current = L.layerGroup().addTo(map.current);
          const emitView = () => {
            const p = map.current.getCenter(), b = map.current.getBounds();
            const visibleBounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
            callbacks.current.onMove({ latitude: p.lat, longitude: p.lng, bounds: paddedViewport(visibleBounds), visibleBounds });
          };
          map.current.on('moveend', emitView);
          map.current.on('click', (event) => callbacks.current.onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
          emitView();
          callbacks.current.on3DAvailable(false);
          setEngine('leaflet');
        } catch { if (!disposed) { callbacks.current.on3DAvailable(false); setEngine('failed'); } }
      }
      if (!disposed && window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          city.current?.invalidate();
          map.current?.invalidateSize({ animate: false, debounceMoveend: true });
        });
        resizeObserver.observe(element.current);
      }
    }
    start();
    return () => { disposed = true; resizeObserver?.disconnect(); city.current?.destroy(); city.current = null; map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!camera) return;
    city.current?.focus({ lat: camera.latitude, lng: camera.longitude });
    map.current?.setView([camera.latitude, camera.longitude], 16);
  }, [engine, camera]);
  useEffect(() => { if (engine === 'city') city.current?.set3D(view3D); }, [engine, view3D]);
  useEffect(() => {
    if (engine === 'city') city.current?.setSun(sun);
    if (engine === 'leaflet') map.current?.getPane('tilePane').style.setProperty('filter', mapAtmosphere(sun).cssFilter);
  }, [engine, sun]);
  useEffect(() => {
    if (engine === 'city' && view.current) city.current?.setShadows(shadows, view.current.shadowBounds);
  }, [engine, shadows]);
  useEffect(() => {
    if (engine !== 'city') return;
    city.current?.showPlaces(places.map((place) => ({ ...place, position: { lat: place.latitude, lng: place.longitude }, pinLabel: place.name })),
      (id) => { const place = places.find((item) => item.id === id); if (place) callbacks.current.onPlace(place); });
    city.current?.setSelectedPoint(selected);
  }, [engine, places, selected]);
  useEffect(() => {
    if (engine !== 'leaflet' || !map.current || !layers.current) return;
    const L = window.L; layers.current.clearLayers();
    L.geoJSON(shadows, { style: { color: '#304349', weight: 0, fillOpacity: 0.25, interactive: false } }).addTo(layers.current);
    places.slice(0, 30).forEach((place) => {
      const marker = L.circleMarker([place.latitude, place.longitude], { radius: 7, color: '#fffaf0', weight: 2, fillColor: '#cf7554', fillOpacity: 1 }).addTo(layers.current);
      marker.on('click', (e) => { L.DomEvent.stopPropagation(e); callbacks.current.onPlace(place); });
      const label = document.createElement('span'); label.textContent = place.name;
      marker.bindTooltip(label, { direction: 'top' });
    });
    if (selected) L.circleMarker([selected.latitude, selected.longitude], { radius: 9, color: '#fffaf0', weight: 3, fillColor: '#273e33', fillOpacity: 1, interactive: false }).addTo(layers.current);
  }, [engine, places, selected, shadows]);
  useEffect(() => {
    const container = element.current;
    for (const [selector, es, en] of [['.leaflet-control-zoom-in, .maplibregl-ctrl-zoom-in', 'Acercar mapa', 'Zoom in'], ['.leaflet-control-zoom-out, .maplibregl-ctrl-zoom-out', 'Alejar mapa', 'Zoom out']]) {
      const control = container?.querySelector(selector);
      if (control) { control.title = translate(language, es, en); control.setAttribute('aria-label', control.title); }
    }
  }, [engine, language]);
  return <View style={[{ flex: 1, backgroundColor: '#ebe4d7', overflow: 'hidden' }, style]}>
    <div ref={element} aria-label={translate(language, 'Mapa. Toca para elegir un punto exterior.', 'Map. Tap to choose an outdoor point.')} style={{ height: '100%', width: '100%', zIndex: 0 }} />
    {engine === 'failed' && <Text style={{ position: 'absolute', left: 15, top: 115, color: '#31453b' }}>{translate(language, 'No se ha podido cargar el mapa.', 'Could not load the map.')}</Text>}
  </View>;
}
