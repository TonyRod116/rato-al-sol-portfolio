import { createShadowBitmap, createShadowPng } from './shadow-raster-cpu.mjs';

// Keep work interruptible between batches so map gestures and time controls
// can respond while a dense city scene is rasterized and encoded.
export function startShadowBitmapTask({ shadows, bounds, retryToken, uri, write, retire, onReady, onError,
  schedule = setTimeout, unschedule = clearTimeout, now = Date.now }) {
  let cancelled = false, timer, writeTimer, writing = false, retired = false, abandoned = false;
  const identity = { source: shadows, area: bounds, retryToken };
  const remove = () => { if (!retired) { retired = true; retire(uri); } };
  const fail = (reason) => { if (!cancelled) onError({ ...identity, reason }); };
  let builder, stage = 'bitmap', bitmap;
  try { builder = createShadowBitmap(shadows, bounds, 512); }
  catch { fail('geometry'); return () => {}; }
  const advance = () => {
    if (cancelled) return;
    try {
      const deadline = now() + 6;
      // Many small polygons need only one or two rows. The time budget,
      // rather than an arbitrary small batch count, controls responsiveness;
      // otherwise dense scenes schedule hundreds of extra timers per frame.
      for (let batch = 0; batch < 10000; batch++) {
        if (builder.step(stage === 'bitmap' ? 5 : 2048)) {
          if (stage === 'bitmap') {
            bitmap = builder.result();
            builder = createShadowPng(bitmap, [48, 67, 73, 66], 2);
            stage = 'png';
          } else {
            const base64 = builder.result();
            writing = true;
            Promise.resolve().then(() => {
              if (cancelled) return undefined;
              const pending = write(uri, base64);
              // FileSystem has no cancellation API: time out the UI, but do
              // not remove a partial file while the write is still active.
              writeTimer = schedule(() => { abandoned = true; fail('storage_timeout'); }, 8000);
              return pending;
            }).then(() => {
              unschedule(writeTimer);
              writing = false;
              if (cancelled || abandoned) { remove(); return; }
              onReady({ ...identity, uri, bounds: bitmap.bounds });
            }, () => { unschedule(writeTimer); writing = false; remove(); if (!abandoned) fail('storage'); });
            return;
          }
        }
        if (now() >= deadline) break;
      }
      timer = schedule(advance, 0);
    } catch { fail(stage === 'bitmap' ? 'geometry' : 'encoding'); }
  };
  timer = schedule(advance, 0);
  return () => {
    cancelled = true;
    unschedule(timer);
    unschedule(writeTimer);
    // A write cannot be stopped halfway through; delete only after it settles.
    if (!writing) remove();
  };
}
