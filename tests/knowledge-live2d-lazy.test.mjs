import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../knowledge-live2d-mana-position-20260809.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function setup() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.events = {}; this.attrs = {}; }
    appendChild(node) { this.children.push(node); }
    getAttribute(name) { return this.attrs[name]; }
    setAttribute(name, value) { this.attrs[name] = value; }
    addEventListener(name, handler) { this.events[name] = handler; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  const shell = new Element('main'); shell.dataset.language = 'zh'; shell.dataset.route = 'home';
  shell.classList = { contains: name => shell.writing && name === 'knowledge-writing-mode' };
  const head = new Element('head'), body = new Element('body'), timers = new Map();
  let observer, loaded, created = 0, destroyed = 0, nextTimer = 0;
  const window = { matchMedia: () => ({ matches: true }), addEventListener() {},
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id) };
  const api = { createWidget: () => { created++; return { destroy: async () => { destroyed++; },
    l2d: { on: (event, fn) => { if (event === 'loaded') loaded = fn; } } }; } };
  vm.runInNewContext(source, { window, console: { error() {} },
    document: { head, body, getElementById: () => shell, createElement: tag => new Element(tag) },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} } });
  return { shell, head, button: body.children[0], timers, window, api,
    change: () => observer(), loaded: () => loaded(), created: () => created, destroyed: () => destroyed };
}

test('initial page and route mutations do not load library or model; click loads once', async () => {
  const s = setup(); await flush();
  assert.equal(s.button.textContent, '休息中'); assert.equal(s.button.hidden, false);
  s.change(); await flush(); assert.equal(s.head.children.length, 0); assert.equal(s.created(), 0);
  s.button.events.click(); s.button.events.click(); await flush();
  assert.equal(s.head.children.length, 1); assert.equal(s.button.disabled, true);
  s.window.L2D_WIDGET = s.api; s.head.children[0].onload(); await flush();
  assert.equal(s.created(), 1); assert.equal(s.button.hidden, false);
  s.loaded(); assert.equal(s.button.hidden, true); assert.equal(s.timers.size, 0);
  s.shell.writing = true; s.change(); await flush(); assert.equal(s.destroyed(), 1); assert.equal(s.button.hidden, true);
});

test('download failure keeps a retryable tab and hidden routes never load', async () => {
  const s = setup(); await flush();
  s.shell.attrs['aria-hidden'] = 'true'; s.change(); await flush();
  assert.equal(s.button.hidden, true); s.button.events.click(); await flush(); assert.equal(s.head.children.length, 0);
  s.shell.attrs['aria-hidden'] = 'false'; s.change(); await flush(); s.button.events.click(); await flush();
  s.head.children[0].onerror(); await flush();
  assert.equal(s.button.textContent, '点击重试'); assert.equal(s.button.disabled, false);
  s.button.events.click(); await flush(); assert.equal(s.head.children.length, 2);
  s.window.L2D_WIDGET = s.api; s.head.children[1].onload(); await flush(); s.loaded();
  assert.equal(s.created(), 1); assert.equal(s.button.hidden, true);
});

test('model timeout destroys the failed widget and permits retry', async () => {
  const s = setup(); s.window.L2D_WIDGET = s.api; await flush();
  s.button.events.click(); await flush(); assert.equal(s.created(), 1);
  await [...s.timers.values()][0](); await flush();
  assert.equal(s.destroyed(), 1); assert.equal(s.button.textContent, '点击重试');
  s.button.events.click(); await flush(); assert.equal(s.created(), 2);
  s.loaded(); assert.equal(s.button.hidden, true);
});
