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
    this.offsetWidth = 76;
    this.offsetHeight = 88;
    this.capturedPointerId = null;
  }

  addEventListener(eventName, handler) {
    this.listeners[eventName] = (event = {}) => {
      if (!event.currentTarget) {
        event.currentTarget = this;
      }
      return handler(event);
    };
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

  getBoundingClientRect() {
    return {
      left: parseInt(this.style.left, 10) || 0,
      top: parseInt(this.style.top, 10) || 0,
      width: this.offsetWidth,
      height: this.offsetHeight,
      right: (parseInt(this.style.left, 10) || 0) + this.offsetWidth,
      bottom: (parseInt(this.style.top, 10) || 0) + this.offsetHeight,
    };
  }

  setPointerCapture(pointerId) {
    this.capturedPointerId = pointerId;
  }
}

function makeElements() {
  const resizeHandles = {
    resizeN: new FakeElement('resizeN'),
    resizeE: new FakeElement('resizeE'),
    resizeS: new FakeElement('resizeS'),
    resizeW: new FakeElement('resizeW'),
    resizeNE: new FakeElement('resizeNE'),
    resizeSE: new FakeElement('resizeSE'),
    resizeSW: new FakeElement('resizeSW'),
    resizeNW: new FakeElement('resizeNW'),
  };
  resizeHandles.resizeN.dataset.resizeEdge = 'n';
  resizeHandles.resizeE.dataset.resizeEdge = 'e';
  resizeHandles.resizeS.dataset.resizeEdge = 's';
  resizeHandles.resizeW.dataset.resizeEdge = 'w';
  resizeHandles.resizeNE.dataset.resizeEdge = 'ne';
  resizeHandles.resizeSE.dataset.resizeEdge = 'se';
  resizeHandles.resizeSW.dataset.resizeEdge = 'sw';
  resizeHandles.resizeNW.dataset.resizeEdge = 'nw';

  return {
    desktopShell: new FakeElement('desktopShell'),
    desktopSurface: new FakeElement('desktopSurface'),
    startButton: new FakeElement('startButton'),
    startMenu: new FakeElement('startMenu'),
    startBlogButton: new FakeElement('startBlogButton'),
    startBlogStatus: new FakeElement('startBlogStatus'),
    startThemeButton: new FakeElement('startThemeButton'),
    blogDesktopIcon: new FakeElement('blogDesktopIcon'),
    blogTaskbarButton: new FakeElement('blogTaskbarButton'),
    blogWindow: new FakeElement('blogWindow'),
    blogTitlebar: new FakeElement('blogTitlebar'),
    blogFrame: new FakeElement('blogFrame'),
    windowMinimize: new FakeElement('windowMinimize'),
    windowMaximize: new FakeElement('windowMaximize'),
    windowClose: new FakeElement('windowClose'),
    resizeHandles: Object.values(resizeHandles),
    clockTime: new FakeElement('clockTime'),
    clockDate: new FakeElement('clockDate'),
    ...resizeHandles,
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
    removeEventListener(eventName, handler) {
      if (listeners[eventName] === handler) {
        delete listeners[eventName];
      }
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

const { window, elements, listeners } = loadDesktopScript();

assert.ok(window.HomeDesktop, 'HomeDesktop should be exposed');
assert.strictEqual(typeof window.HomeDesktop.createDesktopController, 'function');
assert.strictEqual(typeof window.HomeDesktop.createDesktopIconDrag, 'function');

const controller = window.HomeDesktop.createDesktopController(elements, {
  viewport: () => ({ width: 1366, height: 768 }),
  now: () => new Date('2026-07-10T12:34:00'),
});

controller.init();

assert.strictEqual(typeof elements.blogDesktopIcon.listeners.pointerdown, 'function');
elements.blogDesktopIcon.listeners.pointerdown({
  button: 0,
  pointerId: 7,
  clientX: 18,
  clientY: 22,
  preventDefault() {},
  stopPropagation() {},
});
assert.strictEqual(elements.blogDesktopIcon.capturedPointerId, 7);
assert.strictEqual(typeof elements.blogDesktopIcon.listeners.dragstart, 'function');
assert.strictEqual(typeof listeners.pointermove, 'function');
listeners.pointermove({ clientX: -500, clientY: -500 });
assert.strictEqual(elements.blogDesktopIcon.style.left, '0px');
assert.strictEqual(elements.blogDesktopIcon.style.top, '0px');
listeners.pointermove({ clientX: 5000, clientY: 5000 });
assert.ok(parseInt(elements.blogDesktopIcon.style.left, 10) <= 1366 - 76);
assert.ok(parseInt(elements.blogDesktopIcon.style.top, 10) <= 768 - 40 - 88);
assert.strictEqual(elements.blogDesktopIcon.classList.contains('is-dragging'), true);
listeners.pointerup();
assert.strictEqual(elements.blogDesktopIcon.classList.contains('is-dragging'), false);

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
assert.strictEqual(elements.startBlogStatus.textContent, '正在运行');

assert.strictEqual(typeof elements.resizeSE.listeners.pointerdown, 'function');
elements.resizeSE.listeners.pointerdown({
  button: 0,
  pointerId: 21,
  clientX: 1000,
  clientY: 600,
  preventDefault() {},
  stopPropagation() {},
});
assert.strictEqual(elements.resizeSE.capturedPointerId, 21);
assert.strictEqual(elements.blogWindow.classList.contains('is-resizing'), true);
listeners.pointermove({ clientX: 1100, clientY: 660 });
assert.ok(parseInt(elements.blogWindow.style.width, 10) > 1040);
assert.ok(parseInt(elements.blogWindow.style.height, 10) > 680);
listeners.pointerup();
assert.strictEqual(elements.blogWindow.classList.contains('is-resizing'), false);

elements.resizeNW.listeners.pointerdown({
  button: 0,
  pointerId: 22,
  clientX: 100,
  clientY: 100,
  preventDefault() {},
  stopPropagation() {},
});
listeners.pointermove({ clientX: 2000, clientY: 2000 });
assert.strictEqual(parseInt(elements.blogWindow.style.width, 10), 320);
assert.strictEqual(parseInt(elements.blogWindow.style.height, 10), 220);
assert.ok(parseInt(elements.blogWindow.style.left, 10) >= 0);
assert.ok(parseInt(elements.blogWindow.style.top, 10) >= 0);
listeners.pointerup();

controller.minimizeBlogWindow();
assert.strictEqual(elements.blogWindow.classList.contains('is-minimized'), true);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-running'), true);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-active'), false);
assert.strictEqual(elements.startBlogStatus.textContent, '已最小化');

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

elements.startThemeButton.listeners.click();
assert.strictEqual(elements.desktopShell.classList.contains('is-light-theme'), true);
assert.strictEqual(elements.startThemeButton.getAttribute('aria-pressed'), 'true');

controller.moveWindowTo(-200, -200);
assert.strictEqual(elements.blogWindow.style.left, '0px');
assert.strictEqual(elements.blogWindow.style.top, '0px');

controller.moveWindowTo(2000, 2000);
assert.ok(parseInt(elements.blogWindow.style.left, 10) <= 1366 - 320);
assert.ok(parseInt(elements.blogWindow.style.top, 10) <= 768 - 40 - 220);

controller.closeBlogWindow();
assert.strictEqual(elements.blogWindow.classList.contains('is-hidden'), true);
assert.strictEqual(elements.blogTaskbarButton.classList.contains('is-running'), false);
assert.strictEqual(elements.startBlogStatus.textContent, '文章、随笔与图片');

{
  const values = {
    myBlogDesktopState: JSON.stringify({
      theme: 'light',
      blogPage: 'algorithm',
      window: { x: 9999, y: -80, width: 700, height: 500, maximized: true },
    }),
  };
  const storage = {
    getItem(key) {
      return values[key] || null;
    },
    setItem(key, value) {
      values[key] = value;
    },
  };
  const restoredElements = makeElements();
  const restoredController = window.HomeDesktop.createDesktopController(restoredElements, {
    viewport: () => ({ width: 900, height: 640 }),
    storage,
  });

  restoredController.init();
  const restoredState = restoredController.getState();
  assert.strictEqual(restoredState.maximized, true);
  assert.strictEqual(restoredState.bounds.left, 200);
  assert.strictEqual(restoredState.bounds.top, 0);
  assert.strictEqual(restoredElements.desktopShell.classList.contains('is-light-theme'), true);

  restoredController.openBlogWindow();
  restoredController.toggleMaximizeBlogWindow();
  restoredController.moveWindowTo(50, 60);
  restoredController.resizeWindowFromEdge('se', -100, -80);
  restoredController.closeBlogWindow();

  restoredElements.startThemeButton.listeners.click();
  const saved = JSON.parse(values.myBlogDesktopState);
  assert.strictEqual(saved.theme, 'dark');
  assert.strictEqual(saved.blogPage, 'algorithm');
  assert.deepStrictEqual(saved.window, {
    x: 50,
    y: 60,
    width: 600,
    height: 420,
    maximized: false,
  });
}

{
  const invalidElements = makeElements();
  const invalidController = window.HomeDesktop.createDesktopController(invalidElements, {
    viewport: () => ({ width: 900, height: 640 }),
    storage: {
      getItem() { return '{invalid'; },
      setItem() {},
    },
  });
  assert.doesNotThrow(() => invalidController.init());
  assert.strictEqual(invalidController.getState().maximized, false);
}

{
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const homeDesktopCss = fs.readFileSync(cssPath, 'utf8');
  assert.match(indexHtml, /id="desktopShell"/);
  assert.match(indexHtml, /id="blogWindow"/);
  assert.match(indexHtml, /id="blogFrame"[^>]+src="blog\.html"/);
  assert.strictEqual((indexHtml.match(/data-resize-edge="/g) || []).length, 8);
  assert.match(homeDesktopCss, /\.start-menu-apps\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.doesNotMatch(indexHtml, /class="home-entry"/);
  assert.doesNotMatch(indexHtml, /欢迎来到我的主页|进入我的博客/);
  assert.match(indexHtml, /<link\s+rel="stylesheet"\s+href="home-desktop\.css"\s*\/>/);
  assert.match(indexHtml, /<script\s+src="home-desktop\.js"><\/script>/);
  assert.strictEqual((indexHtml.match(/src="assets\/blog-icon\.png"/g) || []).length, 5);
  assert.strictEqual((indexHtml.match(/src="assets\/chat-icon\.png"/g) || []).length, 4);
  assert.strictEqual((indexHtml.match(/draggable="false"/g) || []).length, 9);
  assert.match(indexHtml, /id="startBlogStatus"/);
  assert.match(indexHtml, /id="startThemeButton"/);
  assert.doesNotMatch(indexHtml, /document-app-icon[\s\S]*?<svg/);
}

console.log('home-desktop tests passed');
