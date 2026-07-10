const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'home-desktop.js');
const cssPath = path.join(rootDir, 'home-desktop.css');
const indexPath = path.join(rootDir, 'index.html');
const blogIconPath = path.join(rootDir, 'assets', 'blog-icon.png');

assert.ok(fs.existsSync(scriptPath), 'home-desktop.js should exist');
assert.ok(fs.existsSync(cssPath), 'home-desktop.css should exist');
assert.ok(fs.existsSync(blogIconPath), 'assets/blog-icon.png should exist');

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }

  toggle(name, enabled) {
    if (enabled) {
      this.add(name);
    } else {
      this.remove(name);
    }
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.src = '';
  }

  addEventListener(eventName, handler) {
    this.listeners[eventName] = handler;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  contains(target) {
    return target === this;
  }
}

function makeElements() {
  return {
    desktopShell: new FakeElement('desktopShell'),
    desktopSurface: new FakeElement('desktopSurface'),
    startButton: new FakeElement('startButton'),
    startMenu: new FakeElement('startMenu'),
    startBlogButton: new FakeElement('startBlogButton'),
    blogDesktopIcon: new FakeElement('blogDesktopIcon'),
    blogTaskbarButton: new FakeElement('blogTaskbarButton'),
    blogWindow: new FakeElement('blogWindow'),
    blogTitlebar: new FakeElement('blogTitlebar'),
    blogFrame: new FakeElement('blogFrame'),
    windowMinimize: new FakeElement('windowMinimize'),
    windowMaximize: new FakeElement('windowMaximize'),
    windowClose: new FakeElement('windowClose'),
    clockTime: new FakeElement('clockTime'),
    clockDate: new FakeElement('clockDate'),
  };
}

function loadDesktopScript() {
  const source = fs.readFileSync(scriptPath, 'utf8');
  const listeners = {};
  const elements = makeElements();
  const document = {
    readyState: 'loading',
    addEventListener(eventName, handler) {
      listeners[eventName] = handler;
    },
    getElementById(id) {
      return elements[id] || null;
    },
  };
  const window = {
    document,
    innerWidth: 1366,
    innerHeight: 768,
    addEventListener(eventName, handler) {
      listeners[eventName] = handler;
    },
    setInterval() {
      return 1;
    },
  };
  const sandbox = {
    window,
    document,
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: scriptPath });

  return { window, document, elements, listeners };
}

const { window, elements } = loadDesktopScript();

assert.ok(window.HomeDesktop, 'HomeDesktop should be exposed');
assert.strictEqual(typeof window.HomeDesktop.createDesktopController, 'function');

const controller = window.HomeDesktop.createDesktopController(elements, {
  viewport: () => ({ width: 1366, height: 768 }),
  now: () => new Date('2026-07-10T12:34:00'),
});

controller.init();

assert.strictEqual(elements.clockTime.textContent, '12:34');
assert.ok(elements.clockDate.textContent.includes('2026'));

controller.selectDesktopIcon();
assert.strictEqual(elements.blogDesktopIcon.classList.contains('is-selected'), true);
assert.strictEqual(elements.blogDesktopIcon.getAttribute('aria-selected'), 'true');

controller.openBlogWindow();
assert.strictEqual(elements.blogWindow.classList.contains('is-hidden'), false);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-running'), true);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-active'), true);
assert.strictEqual(elements.blogFrame.src, 'blog.html');

controller.minimizeBlogWindow();
assert.strictEqual(elements.blogWindow.classList.contains('is-minimized'), true);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-running'), true);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-active'), false);

controller.toggleBlogFromTaskbar();
assert.strictEqual(elements.blogWindow.classList.contains('is-minimized'), false);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-active'), true);

controller.toggleMaximizeBlogWindow();
assert.strictEqual(elements.blogWindow.classList.contains('is-maximized'), true);
controller.toggleMaximizeBlogWindow();
assert.strictEqual(elements.blogWindow.classList.contains('is-maximized'), false);

controller.toggleStartMenu();
assert.strictEqual(elements.startMenu.classList.contains('is-open'), true);
controller.closeStartMenu();
assert.strictEqual(elements.startMenu.classList.contains('is-open'), false);

controller.moveWindowTo(-200, -200);
assert.strictEqual(elements.blogWindow.style.left, '0px');
assert.strictEqual(elements.blogWindow.style.top, '0px');

controller.moveWindowTo(2000, 2000);
assert.ok(parseInt(elements.blogWindow.style.left, 10) <= 1366 - 320);
assert.ok(parseInt(elements.blogWindow.style.top, 10) <= 768 - 40 - 220);

controller.closeBlogWindow();
assert.strictEqual(elements.blogWindow.classList.contains('is-hidden'), true);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-running'), false);

{
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  assert.match(indexHtml, /id="desktopShell"/);
  assert.match(indexHtml, /id="blogWindow"/);
  assert.match(indexHtml, /id="blogFrame"[^>]+src="blog\.html"/);
  assert.match(indexHtml, /<link\s+rel="stylesheet"\s+href="home-desktop\.css"\s*\/>/);
  assert.match(indexHtml, /<script\s+src="home-desktop\.js"><\/script>/);
  assert.strictEqual((indexHtml.match(/src="assets\/blog-icon\.png"/g) || []).length, 4);
  assert.doesNotMatch(indexHtml, /document-app-icon[\s\S]*?<svg/);
}

console.log('home-desktop tests passed');
