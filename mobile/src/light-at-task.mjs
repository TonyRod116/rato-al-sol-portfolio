import { createLightAtBuilder, createSolarWindowsBuilder } from '../../frontend/shared/estimate.mjs';

// Yield between groups so dense scenes do not monopolize the UI thread.
function startLightTask(createBuilder, onReady, onError, {
  schedule = setTimeout, unschedule = clearTimeout, now = Date.now,
} = {}) {
  let cancelled = false, timer;
  try {
    const builder = createBuilder();
    const advance = () => {
      if (cancelled) return;
      try {
        const deadline = now() + 6;
        do {
          if (builder.step(10)) { onReady(builder.result()); return; }
        } while (now() < deadline);
        timer = schedule(advance, 0);
      } catch (error) { if (!cancelled) onError(error); }
    };
    timer = schedule(advance, 0);
  } catch (error) { onError(error); }
  return () => { cancelled = true; unschedule(timer); };
}

export function startLightAtTask(scene, instant, onReady, onError, options) {
  return startLightTask(() => createLightAtBuilder(scene, instant), onReady, onError, options);
}

export function startSolarWindowsTask(scene, day, onReady, onError, options) {
  return startLightTask(() => createSolarWindowsBuilder(scene, day), onReady, onError, options);
}
