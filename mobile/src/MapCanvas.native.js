import React, { useEffect, useRef } from 'react';
import MapView, { Marker, Overlay } from 'react-native-maps';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { mapAtmosphere } from '../../frontend/map-atmosphere.mjs';
import { DEFAULT_LOCATION } from '../../frontend/shared/default-location.mjs';
import { translate } from '../../frontend/shared/i18n.mjs';
import { nativeVisibleViewport, paddedViewport } from './viewport.mjs';
import { useGroundShadowImage } from './ShadowOverlay';
import { shadowOverlayBoundsKey } from './shadow-overlay-image.mjs';
import { createMapGestureGuard } from './map-gesture-guard.mjs';

// Android's map colour-scheme prop is only applied at creation by this version
// of react-native-maps, so a map style lets it follow the time slider live.
const nightMap = [
  { elementType: 'geometry', stylers: [{ color: '#263a46' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d2dce0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#263a46' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#405560' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#182e3b' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#304b49' }] },
];
const defaultMap = [];
// Google Maps' building layer is subtle at the same tilt used by MapKit.
// Keep the existing zoom and use a slightly steeper camera only on Android.
const mapPitch = Platform.OS === 'android' ? 35 : 20;

// A fixed-size annotation avoids MapKit enlarging its default marker on selection.
function SelectedPin() {
  return <Svg width={32} height={40} viewBox="0 0 32 40" pointerEvents="none">
    <Path d="M16 38 9.6 31.5A14 14 0 1 1 22.4 31.5Z" fill="#273e33" stroke="#fffdf7" strokeWidth={2.5} strokeLinejoin="round" />
    <Circle cx={16} cy={11.5} r={3} fill="#fffdf7" />
    <Path d="M16 18v8" stroke="#fffdf7" strokeWidth={3} strokeLinecap="round" />
  </Svg>;
}

export default function MapCanvas({ camera, places, selected, language, groundShadow, sun, view3D, onMove, onPick, onPlace, onUserInteraction, style }) {
  const map = useRef(null), viewRequest = useRef(0);
  const latestCamera = useRef(camera);
  latestCamera.current = camera;
  const movement = useRef(null);
  if (!movement.current) movement.current = createMapGestureGuard(Platform.OS);
  const markInteraction = () => { latestCamera.current = null; onUserInteraction?.(); };
  const animate = (cameraUpdate) => {
    if (!map.current) return;
    movement.current.programmatic();
    map.current.animateCamera(cameraUpdate, { duration: 350 });
  };
  const atmosphere = mapAtmosphere(sun);
  const shadowImage = useGroundShadowImage(groundShadow);
  useEffect(() => {
    if (camera) animate({ center: { latitude: camera.latitude, longitude: camera.longitude } });
  }, [camera]);
  useEffect(() => { animate({ pitch: view3D ? mapPitch : 0 }); }, [view3D]);
  async function move(region) {
    const request = ++viewRequest.current;
    let boundary;
    try { boundary = await map.current?.getMapBoundaries(); } catch { /* Fall back to the reported region. */ }
    if (request !== viewRequest.current) return;
    const visibleBounds = nativeVisibleViewport(region, boundary);
    onMove({ latitude: region.latitude, longitude: region.longitude, bounds: paddedViewport(visibleBounds), visibleBounds });
  }
  return <View style={[styles.container, style]}>
    <MapView ref={map} style={StyleSheet.absoluteFill} initialCamera={{ center: DEFAULT_LOCATION, pitch: mapPitch, heading: 0, altitude: 525, zoom: 17.1 }}
      showsBuildings showsCompass pitchEnabled rotateEnabled userInterfaceStyle={Platform.OS === 'android' ? 'light' : atmosphere.isNight ? 'dark' : 'light'}
      customMapStyle={Platform.OS === 'android' ? atmosphere.isNight ? nightMap : defaultMap : undefined}
      onMapReady={() => { const point = latestCamera.current; if (point) animate({ center: { latitude: point.latitude, longitude: point.longitude } }); }}
      onTouchStart={markInteraction}
      onPanDrag={markInteraction}
      onDoublePress={markInteraction}
      onLongPress={markInteraction}
      onRegionChangeStart={(_, details) => { if (movement.current.started(details)) markInteraction(); }}
      onRegionChangeComplete={(region, details) => { if (movement.current.completed(details)) markInteraction(); void move(region); }}
      onPress={(event) => { markInteraction(); onPick(event.nativeEvent.coordinate); }} accessibilityLabel={translate(language, 'Mapa. Toca para elegir un punto exterior.', 'Map. Tap to choose an outdoor point.')}>
      {groundShadow?.uri && <Overlay key={shadowOverlayBoundsKey(groundShadow)} bounds={groundShadow.bounds} image={shadowImage} />}
      {places.slice(0, 30).map((place) => <Marker key={place.id} coordinate={place} title={place.name} pinColor="#cf7554"
        onPress={(event) => { event.stopPropagation(); markInteraction(); onPlace(place); }} />)}
      {selected && <Marker coordinate={selected} accessibilityLabel={selected.name}
        anchor={{ x: .5, y: 1 }} centerOffset={{ x: 0, y: -20 }} style={styles.selectedPin}
        onPress={(event) => event.stopPropagation()}>
        <SelectedPin />
      </Marker>}
    </MapView>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: atmosphere.nativeTint }]} />
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ebe4d7', overflow: 'hidden' },
  selectedPin: { width: 32, height: 40 },
});
