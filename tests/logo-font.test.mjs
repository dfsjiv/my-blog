import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('the wordmark uses the small valid WOFF2 asset, with matching preload and retained license', () => {
  const font = fs.readFileSync(new URL('../assets/vendor/caveat/ZhenWordmark.woff2', import.meta.url));
  assert.equal(font.toString('ascii', 0, 4), 'wOF2');
  assert.equal(font.readUInt32BE(8), font.length);
  assert.ok(font.length < 10000);
  const css = fs.readFileSync(new URL('../knowledge-navigation.css', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(css.includes('ZhenWordmark.woff2')); assert.ok(!css.includes('Caveat.ttf'));
  assert.match(html, /rel="preload"[^>]*ZhenWordmark\.woff2[^>]*as="font"/);
  assert.ok(fs.existsSync(new URL('../assets/vendor/caveat/OFL.txt', import.meta.url)));
});
