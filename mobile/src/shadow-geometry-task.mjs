import { createBuildingShadowBuilder } from '../../frontend/map-shadows.mjs';

// Each batch yields to map gestures and other UI work. Cancelling a stale
// request prevents its result from replacing a newer scene.
export function startShadowGeometry(buildings, sun, area, onComplete, onError) {
  let cancelled = false, timer;
  try {
    const builder = createBuildingShadowBuilder(buildings, sun, area, { maxVertices: 120000, excludeRoofs: true });
    const advance = () => {
      if (cancelled) return;
      try {
        const deadline = Date.now() + 6;
        do {
          if (builder.step(10)) { onComplete(builder.result()); return; }
        } while (Date.now() < deadline);
        timer = setTimeout(advance, 0);
      } catch (error) { if (!cancelled) onError(error); }
    };
    timer = setTimeout(advance, 0);
  } catch (error) { onError(error); }
  return () => { cancelled = true; clearTimeout(timer); };
}

// An expanded frame may exceed the limit even when the visible view fits.
// Compute that smaller view once before advancing the playback clock.
export function startShadowGeometryWithFallback({ buildings, sun, area, getVisibleBounds, onReady, onError,
  start = startShadowGeometry }) {
  let cancelled = false, serial = 0, stop = () => {};
  function launch(bounds, fallback) {
    const id = ++serial;
    const cancel = start(buildings, sun, bounds, (source) => {
      if (cancelled || id !== serial) return;
      const visible = getVisibleBounds();
      if (!fallback && source.limitExceeded && visible && visible !== bounds) {
        launch(visible, true);
      } else if (fallback && visible && visible !== bounds) {
        launch(visible, true);
      } else if (fallback && !visible) {
        onError(new Error('Visible area unavailable'));
      } else {
        onReady({ source, area: bounds, fallback, requestArea: area });
      }
    }, (error) => { if (!cancelled && id === serial) onError(error); });
    if (cancelled || serial !== id) cancel();
    else stop = cancel;
  }
  launch(area, false);
  return () => { cancelled = true; serial++; stop(); };
}
