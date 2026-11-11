import { shadowFrameMatches } from './shadow-frame.mjs';

// The probe is valid only for the exact dataset, frame and cache generation.
export function shadowCacheProbePending(key, adopted, probe, context) {
  return Boolean(key && !adopted && (!probe || probe.key !== key || !shadowFrameMatches(probe.context, context)));
}

// Bound cache latency: an unavailable or busy disk must not stall shadows.
// Copied cache hits are retired even when they arrive after cancellation.
export function startShadowCacheProbe({ lookup, isCurrent, retire, onHit, onMiss,
  schedule = setTimeout, unschedule = clearTimeout, timeout = 300 }) {
  let done = false, cancelled = false;
  const miss = () => {
    if (done || cancelled) return;
    done = true;
    if (isCurrent()) onMiss();
  };
  const timer = schedule(miss, timeout);
  Promise.resolve().then(lookup).then((uri) => {
    if (uri) retire(uri);
    if (done || cancelled) return;
    unschedule(timer);
    done = true;
    if (!isCurrent()) return;
    if (uri) onHit(uri); else onMiss();
  }, () => { unschedule(timer); miss(); });
  return () => { cancelled = true; unschedule(timer); };
}
