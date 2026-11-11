import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { buildWeb } from '../scripts/build-web.mjs';

test('release HTML and local module imports resolve within a versioned directory', () => {
  const temp = mkdtempSync(join(tmpdir(), 'rato-web-release-test-'));
  try {
    const first = buildWeb(join(temp, 'first'));
    const second = buildWeb(join(temp, 'second'));
    const html = readFileSync(join(first, 'index.html'), 'utf8');
    const releases = [...html.matchAll(/\.\/releases\/([a-f0-9]{16})\/(app\.mjs|styles\.css|favicon\.svg)/g)];
    assert.equal(releases.length, 3);
    assert.equal(new Set(releases.map((match) => match[1])).size, 1);
    assert.equal(html, readFileSync(join(second, 'index.html'), 'utf8'));
    const releaseRoot = join(first, 'releases', releases[0][1]);
    for (const match of releases) assert.ok(statSync(join(releaseRoot, match[2])).isFile());
    const pending = [join(releaseRoot, 'app.mjs')], visited = new Set();
    while (pending.length) {
      const module = pending.pop();
      if (visited.has(module)) continue;
      visited.add(module);
      const content = readFileSync(module, 'utf8');
      for (const match of content.matchAll(/(?:from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const dependency = resolve(dirname(module), match[1].split('?')[0]);
        assert.ok(dependency.startsWith(releaseRoot + sep), `Outside release: ${dependency}`);
        assert.ok(statSync(dependency).isFile());
        pending.push(dependency);
      }
    }
    assert.ok(visited.size > 15);
    assert.deepEqual(readdirSync(first).sort(), ['index.html', 'releases']);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
