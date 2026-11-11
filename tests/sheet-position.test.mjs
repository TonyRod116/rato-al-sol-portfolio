import test from 'node:test';
import assert from 'node:assert/strict';
import { measuredSheetHeight, normalSheetHeight, swipeSheet, tapSheet } from '../mobile/src/sheet-position.mjs';

test('dragging down reveals the map and dragging up restores the panel', () => {
  assert.equal(swipeSheet('expanded', 40), 'normal');
  assert.equal(swipeSheet('normal', 40), 'minimized');
  assert.equal(swipeSheet('minimized', -40), 'normal');
  assert.equal(swipeSheet('normal', -40), 'expanded');
  assert.equal(swipeSheet('normal', 12), 'normal');
});

test('tapping the handle reveals the map and can always restore the panel', () => {
  assert.equal(tapSheet('normal'), 'minimized');
  assert.equal(tapSheet('minimized'), 'normal');
  assert.equal(tapSheet('expanded'), 'normal');
});

test('the normal point panel leaves more map visible on a small phone', () => {
  const height = normalSheetHeight(780, 47, 1, 'place');
  assert.equal(height, 320);
  assert.ok(height < normalSheetHeight(780, 47, 1, 'nearby'));
});

test('the point panel does not grow to half of a tall tablet screen', () => {
  assert.equal(normalSheetHeight(1200, 24, 1, 'place'), 350);
  assert.ok(normalSheetHeight(1200, 24, 1, 'place') < normalSheetHeight(1200, 24, 1, 'nearby'));
});

test('larger system text expands the panel without exceeding available screen space', () => {
  const normal = normalSheetHeight(780, 47, 1, 'place');
  const accessible = normalSheetHeight(780, 47, 1.5, 'place');
  assert.ok(accessible > normal);
  assert.ok(normalSheetHeight(400, 44, 3, 'place') <= 400 - 44 - 42);
});

test('business points reserve room for the warning about unknown table locations', () => {
  assert.equal(normalSheetHeight(780, 47, 1, 'place', true), 354);
  assert.ok(normalSheetHeight(400, 44, 3, 'place', true) <= 400 - 44 - 42);
});

test('the compact panel uses only measured content instead of leaving a blank gap', () => {
  const parts = { handle: 25, summary: 58.2, controls: 143.1, navigation: 61 };
  assert.equal(measuredSheetHeight(320, parts), 288);
  assert.ok(measuredSheetHeight(320, parts) < 320);
});

test('long summaries stay bounded so the map remains visible and the summary can scroll', () => {
  assert.equal(measuredSheetHeight(320, { handle: 25, summary: 250, controls: 143, navigation: 61 }), 320);
});

test('before measurement the panel keeps enough room for the controls', () => {
  assert.equal(measuredSheetHeight(320, { handle: 25, summary: 60 }), 320);
  assert.equal(measuredSheetHeight(320, null), 320);
});
