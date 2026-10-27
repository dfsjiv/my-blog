import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('desktop scripts and legacy iframe are not loaded by a blog visit', () => {
  assert.doesNotMatch(html, /<iframe[^>]*\ssrc="blog\.html"/);
  assert.match(html, /id="blogFrame"[^>]*data-src="blog\.html"/);
  for (const file of ['home-desktop.js','particle-wallpaper.js','night-rain-city-3d.js','chat.js','ai-chat.js','city-world-app.js']) {
    assert.ok(!html.includes('<script src="' + file));
  }
  assert.match(fs.readFileSync(new URL('../auth.js', import.meta.url), 'utf8'), /await window\.KnowledgeFeatures\.ensure\('desktop'\)/);
});
test('wallpaper animation only starts on the desktop and stops on blog/login or a hidden tab', () => {
  let desktop = false, requested = 0, cancelled = 0;
  const document = { readyState: 'loading', hidden: false, addEventListener() {},
    getElementById: () => ({}), body: { classList: { contains: () => desktop } } };
  const window = { requestAnimationFrame: () => ++requested, cancelAnimationFrame: () => cancelled++ };
  vm.runInNewContext(fs.readFileSync(new URL('../particle-wallpaper.js', import.meta.url), 'utf8'), { window, document });
  const wallpaper = Object.create(window.GpuParticleWallpaper.prototype);
  Object.assign(wallpaper, { initialized: true, destroyed: false, enabled: true, animationFrameId: null,
    canvas: { classList: { remove() {} } } });
  wallpaper.start(); assert.equal(requested, 0);
  desktop = true; wallpaper.onVisibilityChange();
  assert.equal(requested, 1); assert.notEqual(wallpaper.animationFrameId, null);
  desktop = false; wallpaper.onVisibilityChange();
  assert.equal(cancelled, 1); assert.equal(wallpaper.animationFrameId, null);
  desktop = true; document.hidden = true; wallpaper.onVisibilityChange();
  assert.equal(requested, 1);
  document.hidden = false; wallpaper.onVisibilityChange(); assert.equal(requested, 2);
});
