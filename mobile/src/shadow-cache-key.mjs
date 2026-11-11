// The digest covers all provider geometry and attributes, plus rendering
// parameters. A changed building must never reuse an older rendered mask.
const signatures = new WeakMap();
function digest() {
  const state = [2166136261, 2246822519, 3266489917, 668265263];
  const primes = [16777619, 2246822519, 3266489917, 668265263];
  const buffer = new DataView(new ArrayBuffer(8));
  function word(value) {
    for (let i = 0; i < state.length; i++) state[i] = Math.imul(state[i] ^ value, primes[i]);
  }
  return {
    add(value) {
      const text = `${value}\u0000`;
      for (let i = 0; i < text.length; i++) word(text.charCodeAt(i));
    },
    word,
    number(value) {
      // IEEE-754 words are stable across runs and avoid converting every
      // coordinate to a long decimal string on the phone's JS thread.
      buffer.setFloat64(0, value, true);
      word(buffer.getUint32(0, true)); word(buffer.getUint32(4, true));
    },
    value() { return state.map((value) => (value >>> 0).toString(16).padStart(8, '0')).join(''); },
  };
}

// Bound uninterrupted work so even a dense provider response remains
// responsive. The result is memoized only after a complete, uncancelled pass.
export async function geometrySignature(buildings, cancelled = () => false, yieldWork = () => new Promise((resolve) => setTimeout(resolve, 0)), now = Date.now) {
  if (!buildings || !Array.isArray(buildings.features)) return null;
  if (signatures.has(buildings)) return signatures.get(buildings);
  const hash = digest();
  const { features } = buildings;
  // Fixed field order makes equivalent geometry loaded from disk match even
  // when object properties were reconstructed in a different order.
  hash.add(JSON.stringify([buildings.source, buildings.bounds, buildings.fetchedAt, buildings.omitted, features.length]));
  let sinceYield = 0, batchStart = now(), operations = 0;
  for (let i = 0; i < features.length; i++) {
    if (cancelled()) return null;
    const feature = features[i], geometry = feature?.geometry, properties = feature?.properties;
    hash.add(JSON.stringify([properties?.id, properties?.height, geometry?.type]));
    const pending = [geometry?.coordinates];
    while (pending.length) {
      const item = pending.pop();
      if (Array.isArray(item)) {
        hash.word(0x61727279); hash.word(item.length);
        for (let j = item.length - 1; j >= 0; j--) pending.push(item[j]);
      } else if (typeof item === 'number') {
        hash.word(0x6e756d62); hash.number(item);
      } else {
        hash.word(0x6f746872); hash.add(JSON.stringify(item));
      }
      // Very large single buildings must also give gestures and raster work
      // time to run, not just collections containing many small buildings.
      if (((++operations) & 255) === 0 && now() - batchStart >= 6) {
        await yieldWork();
        if (cancelled()) return null;
        sinceYield = 0; batchStart = now();
      }
    }
    if (++sinceYield >= 50) {
      // Fifty small buildings can take far less than one frame budget.
      // Avoid a timer for every fifty if there is still time to do useful work.
      sinceYield = 0;
      if (now() - batchStart >= 6) {
        await yieldWork();
        if (cancelled()) return null;
        batchStart = now();
      }
    }
  }
  if (cancelled()) return null;
  const value = hash.value();
  signatures.set(buildings, value);
  return value;
}

export function renderedShadowKey(signature, { area, latitude, longitude, timeKey }) {
  if (!signature || !Array.isArray(area) || area.length !== 4 || !area.every(Number.isFinite) ||
      ![latitude, longitude, timeKey].every(Number.isFinite)) return null;
  const hash = digest();
  hash.add(JSON.stringify({ area, latitude, longitude, timeKey }));
  return `mask-v11-${signature}-${hash.value()}`;
}

export function localFrameDay(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Local calendar arithmetic handles daylight-saving transitions correctly.
export function millisecondsUntilNextDay(date) {
  const midnight = new Date(date);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, midnight.getTime() - date.getTime());
}
