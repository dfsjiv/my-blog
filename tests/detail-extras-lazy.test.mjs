import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../static/js/knowledge-site-v4.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('  function whenNearViewport('), source.indexOf('  async function loadDetailExtras('));
function setup(supported = true) {
  const observations = [];
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; observations.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.stopped = true; }
  }
  const context = { window: supported ? { IntersectionObserver: Observer } : {}, IntersectionObserver: Observer, shell: {}, Promise };
  vm.createContext(context); vm.runInContext(fn, context);
  return { schedule: context.whenNearViewport, observations };
}

test('article extras do not request until near the viewport and run only once', async () => {
  const { schedule, observations } = setup();
  const controller = new AbortController(); let calls = 0;
  schedule({}, () => { calls++; }, controller);
  assert.equal(calls, 0); assert.equal(observations[0].options.rootMargin, '600px 0px');
  observations[0].callback([{ isIntersecting: false }]); await Promise.resolve(); assert.equal(calls, 0);
  observations[0].callback([{ isIntersecting: true }]); observations[0].callback([{ isIntersecting: true }]);
  await Promise.resolve(); assert.equal(calls, 1); assert.equal(observations[0].stopped, true);
});

test('leaving an unread article cancels pending extras, with a safe fallback without observers', async () => {
  const { schedule, observations } = setup(); let calls = 0;
  const controller = new AbortController(); schedule({}, () => calls++, controller); controller.abort();
  observations[0].callback([{ isIntersecting: true }]); await Promise.resolve();
  assert.equal(calls, 0); assert.equal(observations[0].stopped, true);
  setup(false).schedule({}, () => calls++, new AbortController()); await Promise.resolve(); assert.equal(calls, 1);
});
