// Only the browser Maps key is used here; no Routes/Places server credential.
export async function createMadridMap(element, onAuthFailure, onCapability) {
  const response = await fetch('./maps-config.local.json', { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Map configuration unavailable');
  const config = await response.json();
  if (typeof config?.key !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(config.key)) {
    throw new Error('Map configuration invalid');
  }

  await new Promise((resolve, reject) => {
    const callback = 'ratoGoogleMapsReady';
    const script = document.createElement('script');
    const params = new URLSearchParams({ key: config.key, callback, libraries: 'marker', v: 'weekly', loading: 'async' });
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      delete window[callback];
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('Map timed out')), 15000);
    window[callback] = () => finish();
    window.gm_authFailure = () => { finish(new Error('Map authentication failed')); onAuthFailure(); };
    script.onerror = () => finish(new Error('Map could not load'));
    script.async = true;
    script.referrerPolicy = 'origin';
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    document.head.append(script);
  });
  const maps = window.google?.maps;
  if (!maps?.Map || !maps.marker?.AdvancedMarkerElement) throw new Error('Map unavailable');
  const map = new maps.Map(element, {
    center: { lat: 40.42713, lng: -3.68856 }, zoom: 17.5,
    mapId: 'DEMO_MAP_ID', renderingType: maps.RenderingType?.VECTOR,
    tilt: 45, heading: 0, tiltInteractionEnabled: true, headingInteractionEnabled: true, gestureHandling: 'cooperative',
    mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
  });
  const reportCapability = () => {
    const renderingType = map.getRenderingType?.();
    if (renderingType && maps.RenderingType?.VECTOR) onCapability(renderingType === maps.RenderingType.VECTOR);
  };
  map.addListener('renderingtype_changed', reportCapability);
  let markers = [];
  return {
    showPlaces(places, onSelect) {
      for (const entry of markers) entry.marker.map = null;
      markers = places.flatMap((place, index) => {
        if (!place.position) return [];
        const pin = document.createElement('span');
        pin.className = 'google-pin';
        pin.textContent = String(index + 1);
        const marker = new maps.marker.AdvancedMarkerElement({
          map, position: place.position, title: `${place.name}, entrada aproximada`, content: pin,
          gmpClickable: true,
        });
        marker.addEventListener('gmp-click', () => onSelect(place.id));
        return [{ marker, pin, id: place.id }];
      });
    },
    focus(position) { if (position) map.panTo(position); },
    highlight(id) { for (const entry of markers) entry.pin.classList.toggle('is-selected', entry.id === id); },
    invalidate() { maps.event.trigger(map, 'resize'); },
    rotate() { map.setHeading((map.getHeading() || 0) + 45); },
    set3D(enabled) { map.setTilt(enabled ? 45 : 0); },
    is3D() {
      const renderingType = map.getRenderingType?.();
      return renderingType ? renderingType === maps.RenderingType?.VECTOR : undefined;
    },
  };
}
