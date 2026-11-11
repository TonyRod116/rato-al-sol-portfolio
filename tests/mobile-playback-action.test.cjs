const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require(require.resolve('@babel/parser', { paths: [path.join(__dirname, '../mobile')] }));

const source = fs.readFileSync(path.join(__dirname, '../mobile/App.js'), 'utf8');
const tree = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });

function findVariable(node, name) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'VariableDeclarator' && node.id?.name === name) return node.init;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) { const found = findVariable(item, name); if (found) return found; }
    } else if (value && typeof value === 'object') {
      const found = findVariable(value, name); if (found) return found;
    }
  }
  return null;
}
function expression(name) {
  const node = findVariable(tree, name);
  assert.ok(node, `${name} was not found`);
  return source.slice(node.start, node.end);
}

test('play preserves a manually selected time, including resume and the last slot', async () => {
  const { nextPlaybackTime, PLAYBACK_END } = await import('../mobile/src/day-playback.mjs');
  const actionSource = expression('toggleDayPlayback');
  const prefetch = new Function('minutes', 'nextPlaybackTime', `return (${expression('prefetchMinutes')})`);
  for (const minutes of [360, 615, 1020, PLAYBACK_END]) {
    let selected = minutes, playing = false;
    const setMinutes = value => { selected = value; };
    const setPlayingDay = value => { playing = value; };
    const invoke = (isPlaying) => new Function('playingDay', 'setPlayingDay', 'setCacheEnabled', 'prefetchBlocked', 'setPrefetchBlocked', 'setNotice', 'setMinutes', `return (${actionSource})`)(isPlaying, setPlayingDay, () => {}, false, () => {}, () => {}, setMinutes)();
    invoke(false);
    assert.equal(selected, minutes, 'play must not move the selected time');
    assert.equal(playing, true);
    assert.equal(prefetch(minutes, nextPlaybackTime), nextPlaybackTime(minutes));
    invoke(true);
    assert.equal(playing, false);
    invoke(false);
    assert.equal(selected, minutes, 'resume must not change the selected time');
    assert.equal(playing, true);
  }
  assert.equal(prefetch(PLAYBACK_END, nextPlaybackTime), 360, 'the animation still loops after 22:00');
});
