import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../knowledge-site-v4.js', import.meta.url), 'utf8');
const setup = source.slice(source.indexOf('  function setupHeroCarousel('), source.indexOf('  function t('));
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function fixture({ reduced = false, route = 'home' } = {}) {
  const images = [], intervals = new Map(), deadlines = new Map(), observers = [];
  const slides = Array.from({ length: 4 }, (_, i) => ({ dataset: { backgroundUrl: 'hero-' + (i + 1) }, style: {},
    active: i === 0, classList: { toggle(_, on) { slides[i].active = on; } } }));
  const body = { classList: { contains: () => true } };
  const shell = { dataset: { route }, querySelector: () => ({ querySelectorAll: selector => selector === '[data-custom-background]' ? [] : slides }) };
  let nextTimer = 0, backgroundRequests = 0;
  const context = { shell, heroSlides: slides, heroCarouselRefresh: null, console,
    Image: class { constructor() { images.push(this); } },
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    repository: { getBackgrounds: async () => { backgroundRequests++; return []; } },
    document: { body, hidden: false, addEventListener() {} },
    window: { KnowledgeBackgroundDisplay: { get: async () => [], apply() {} },
      matchMedia: () => ({ matches: reduced, addEventListener() {} }),
      setInterval: fn => { intervals.set(++nextTimer, fn); return nextTimer; }, clearInterval: id => intervals.delete(id),
      setTimeout: fn => { deadlines.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => deadlines.delete(id) }
  };
  vm.createContext(context); vm.runInContext(setup + '\nsetupHeroCarousel();', context);
  return { context, images, intervals, deadlines, observers, slides, backgroundRequests: () => backgroundRequests };
}
test('only current and next hero images load; leaving home stops carousel work', async () => {
  const f = fixture(); await flush();
  assert.equal(f.images.length, 1);
  f.images[0].onload(); await flush();
  assert.equal(f.images.length, 2);
  assert.deepEqual(f.images.map(i => i.src), ['hero-1','hero-2']);
  f.images[1].onload(); await flush();
  assert.equal(f.images.length, 2);
  assert.equal(f.intervals.size, 1);
  f.context.shell.dataset.route = 'detail'; f.observers[0]();
  assert.equal(f.intervals.size, 0);
  assert.equal(f.images.length, 2);
});
test('deep-linked articles do not fetch custom background settings or hidden carousel images', async () => {
  const f = fixture({ route: 'detail' }); await flush();
  assert.equal(f.images.length, 0); assert.equal(f.backgroundRequests(), 0);
  f.context.shell.dataset.route = 'home'; f.observers[0](); await flush();
  assert.equal(f.images.length, 1); assert.equal(f.backgroundRequests(), 1);
});
test('reduced motion loads only the displayed photo; failed images do not replace the active slide', async () => {
  const reduced = fixture({ reduced: true }); await flush();
  reduced.images[0].onload(); await flush();
  assert.equal(reduced.images.length, 1); assert.equal(reduced.intervals.size, 0);
  const f = fixture(); await flush();
  for (let i = 0; i < 4; i++) { f.images[i].onerror(); await flush(); }
  assert.equal(f.slides[0].active, true);
  assert.equal(f.slides.filter(slide => slide.active).length, 1);
});
