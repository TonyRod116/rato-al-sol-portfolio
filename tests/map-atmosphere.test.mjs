import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAtmosphere } from '../frontend/map-atmosphere.mjs';

test('the visual atmosphere distinguishes daylight, the night, and both twilights', () => {
  const day = mapAtmosphere({ altitude: 45, azimuth: 180 });
  const night = mapAtmosphere({ altitude: -20, azimuth: 0 });
  const dawn = mapAtmosphere({ altitude: 2, azimuth: 80 });
  const dusk = mapAtmosphere({ altitude: 2, azimuth: 280 });
  assert.equal(day.isNight, false);
  assert.equal(night.isNight, true);
  assert.notEqual(night.cssFilter, day.cssFilter);
  assert.notEqual(dawn.cssFilter, day.cssFilter);
  assert.notEqual(dawn.nativeTint, dusk.nativeTint);
  assert.equal(mapAtmosphere(null).cssFilter, 'none');
});
