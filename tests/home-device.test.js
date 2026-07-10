const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'home-device.js');
const indexPath = path.join(rootDir, 'index.html');

assert.ok(fs.existsSync(scriptPath), 'home-device.js should exist');

const source = fs.readFileSync(scriptPath, 'utf8');

function createBrowserContext(options = {}) {
  const bodyClassNames = new Set();
  const listeners = {};
  const body = {
    dataset: {},
    classList: {
      toggle(name, enabled) {
        if (enabled) {
          bodyClassNames.add(name);
        } else {
          bodyClassNames.delete(name);
        }
      },
      contains(name) {
        return bodyClassNames.has(name);
      },
    },
  };
  const documentElement = { dataset: {} };
  const document = {
    body,
    documentElement,
    readyState: 'complete',
    addEventListener(eventName, handler) {
      listeners[eventName] = handler;
    },
  };
  const window = {
    document,
    innerWidth: options.innerWidth ?? 1200,
    navigator: {
      userAgent: options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      maxTouchPoints: options.maxTouchPoints ?? 0,
    },
    matchMedia() {
      return { matches: Boolean(options.coarsePointer) };
    },
    addEventListener(eventName, handler) {
      listeners[eventName] = handler;
    },
  };

  const sandbox = {
    window,
    document,
    navigator: window.navigator,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: scriptPath });

  return { window, document, bodyClassNames, listeners };
}

{
  const { window } = createBrowserContext({ innerWidth: 1200 });
  assert.strictEqual(window.HomeDevice.getDeviceType(), 'desktop');
  assert.strictEqual(window.homeDevice.type, 'desktop');
  assert.strictEqual(window.homeDevice.isDesktop, true);
}

{
  const { window, document, bodyClassNames } = createBrowserContext({ innerWidth: 390 });
  assert.strictEqual(window.HomeDevice.getDeviceType(), 'mobile');
  assert.strictEqual(window.homeDevice.type, 'mobile');
  assert.strictEqual(document.body.dataset.device, 'mobile');
  assert.strictEqual(document.documentElement.dataset.device, 'mobile');
  assert.strictEqual(bodyClassNames.has('is-mobile'), true);
  assert.strictEqual(bodyClassNames.has('is-desktop'), false);
}

{
  const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';
  const { window } = createBrowserContext({ innerWidth: 900, userAgent: mobileUserAgent });
  assert.strictEqual(window.HomeDevice.getDeviceType(), 'mobile');
}

{
  const { window, listeners } = createBrowserContext({ innerWidth: 1100 });
  assert.strictEqual(window.homeDevice.type, 'desktop');
  window.innerWidth = 430;
  listeners.resize();
  assert.strictEqual(window.homeDevice.type, 'mobile');
}

{
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  assert.match(indexHtml, /<script\s+src="home-device\.js"><\/script>/);
}

console.log('home-device tests passed');
