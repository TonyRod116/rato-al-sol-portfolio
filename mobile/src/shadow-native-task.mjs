import { advanceShadowRasterPath, createShadowRasterPath } from './shadow-raster-path.mjs';

let sequence = 0;

// Build a bounded SVG path in interruptible JS batches, then let the native
// renderer draw and write the image off the UI thread. Every task has its own
// cancellation token and never publishes a result for an obsolete viewport.
export function startNativeShadowTask({ shadows, bounds, retryToken = 0, uri, native, retire, onReady, onError,
  schedule = setTimeout, unschedule = clearTimeout, timeout = 15000 }) {
  const id = `shadow-${Date.now()}-${++sequence}`;
  const identity = { source: shadows, area: bounds, retryToken };
  let cancelled = false, abandoned = false, delivered = false, registered = false, rendering = false;
  let timer, deadline, retired = false;
  const remove = () => { if (!retired) { retired = true; retire(uri); } };
  const cancelNative = () => {
    if (!registered) return;
    registered = false;
    try { Promise.resolve(native.cancel(id)).catch(() => {}); } catch { /* Best effort; late output is discarded. */ }
  };
  const fail = (reason) => {
    if (cancelled || abandoned || delivered) return;
    abandoned = true;
    unschedule(deadline);
    cancelNative();
    // A native write may still be in progress. Retire only after it settles.
    if (!rendering) remove();
    onError({ ...identity, reason });
  };
  let builder;
  if (!native || typeof native.register !== 'function' || typeof native.render !== 'function' || typeof native.cancel !== 'function') {
    fail('native');
    return () => { cancelled = true; remove(); };
  }
  try {
    builder = createShadowRasterPath(shadows, bounds, { longestSide: 256, nativeGroups: true });
  } catch {
    fail('geometry');
    return () => { cancelled = true; remove(); };
  }

  function render(job) {
    // Registration and rendering are both asynchronous. Cancellation while
    // registration is pending must cancel once registration completes too.
    deadline = schedule(() => fail('timeout'), timeout);
    Promise.resolve().then(() => native.register(id)).then((accepted) => {
      // A full native queue is a resource limit, not an invitation to start
      // an additional expensive bitmap job on the JavaScript thread.
      if (accepted !== true) { fail('busy'); return null; }
      registered = true;
      if (cancelled || abandoned) { cancelNative(); remove(); return null; }
      rendering = true;
      return native.render(id, job.d, job.roofD, job.width, job.height, uri);
    }).then((result) => {
      if (!rendering) return;
      rendering = false;
      unschedule(deadline);
      if (cancelled || abandoned) { remove(); return; }
      if (result === 'rato-shadow-complexity') { registered = false; remove(); fail('complexity'); return; }
      if (result === 'rato-shadow-geometry') { registered = false; remove(); fail('geometry'); return; }
      if (typeof result !== 'string' || !result) { remove(); fail('native'); return; }
      registered = false;
      delivered = true;
      onReady({ ...identity, uri, bounds: job.bounds });
    }, () => {
      rendering = false;
      unschedule(deadline);
      remove();
      fail('native');
    });
  }
  function advance() {
    if (cancelled || abandoned) return;
    try {
      if (advanceShadowRasterPath(builder)) render(builder.result());
      else timer = schedule(advance, 0);
    } catch { fail('geometry'); }
  }
  timer = schedule(advance, 0);
  return () => {
    if (cancelled) return;
    cancelled = true;
    unschedule(timer); unschedule(deadline);
    cancelNative();
    if (!rendering) remove();
  };
}
