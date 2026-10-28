import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../knowledge-site-v4.js', import.meta.url), 'utf8');
test('latest posts render without waiting for slow featured content', async () => {
  const fn = source.slice(source.indexOf('  async function loadHome('), source.indexOf('  function renderHomeFailure('));
  let resolveFeatured;
  const shown = [];
  const section = { hidden: true };
  const containers = Object.fromEntries(['knowledgeFeaturedList', 'knowledgeLatestList'].map(id => [id, {
    closest: () => section, replaceChildren() {}, appendChild() {}
  }]));
  const context = {
    AbortController, Set, state: {},
    document: { getElementById: id => containers[id] },
    repository: { getPosts(filters) {
      if (filters.featured) return new Promise(resolve => { resolveFeatured = resolve; });
      return Promise.resolve({ items: [{ slug: 'latest' }], pagination: { page: 1, hasNext: false } });
    } },
    makeLoadingState() {}, updateHomeLoadMoreButton() {}, homeLatestFilters: () => ({}),
    appendLatestPosts: (_, posts) => shown.push(...posts), updateHomeLatestFilterControls() {}, applyViewMode() {},
    renderCollection: () => shown.push('featured'), makeFeaturedCard() {}
  };
  vm.createContext(context); vm.runInContext(fn, context);
  await context.loadHome({});
  assert.equal(shown[0].slug, 'latest');
  assert.equal(section.hidden, true);
  resolveFeatured({ items: [{ slug: 'featured' }] });
  await Promise.resolve(); await Promise.resolve();
  assert.ok(shown.includes('featured'));
  assert.equal(section.hidden, false);
});

test('the entry loader reveals the page even if a readiness task never settles', async () => {
  const loaderSource = fs.readFileSync(new URL('../site-entry-loader.js', import.meta.url), 'utf8');
  const timers = [], frames = [];
  const node = { hidden: false, classList: { add() {}, remove() {} } };
  const progress = { textContent: '', style: {} };
  const window = {
    sessionStorage: { getItem: () => null, setItem() {} }, addEventListener() {},
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, cancelAnimationFrame() {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}
  };
  vm.runInNewContext(loaderSource, { window, document: { readyState: 'complete', getElementById: id => id === 'siteEntryLoader' ? node : progress }, performance: { now: () => 0 }, Promise, Set });
  window.siteEntryLoader.holdUntil(new Promise(() => {}));
  const deadline = timers.find(t => t.ms === 6000);
  assert.ok(deadline);
  deadline.fn(); await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 40 && frames.length; i++) frames.shift()(6100 + i * 17);
  assert.equal(progress.style.width, '100%');
  const hide = timers.find(t => t.ms === 920);
  assert.ok(hide); hide.fn();
  assert.equal(node.hidden, true);
});
