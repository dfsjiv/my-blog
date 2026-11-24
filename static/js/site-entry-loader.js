(function () {
  'use strict';

  const STORAGE_KEY = 'lee_site_entry_seen_v1';
  const loader = document.getElementById('siteEntryLoader');
  const progressLabel = document.getElementById('siteEntryLoaderProgress');
  const progressLine = document.getElementById('siteEntryLoaderLine');
  const readinessTasks = new Set();
  let animationFrame = 0;
  let activeRun = 0;
  let finishActive = null;

  function hasVisited() {
    try { return window.sessionStorage.getItem(STORAGE_KEY) === '1'; }
    catch (_error) { return false; }
  }

  function rememberVisit() {
    try { window.sessionStorage.setItem(STORAGE_KEY, '1'); }
    catch (_error) { /* The animation also works without storage. */ }
  }

  function waitForPageLoad() {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise(function (resolve) {
      const finish = function () { window.clearTimeout(timer); window.removeEventListener('load', finish); resolve(); };
      const timer = window.setTimeout(finish, 7000);
      window.addEventListener('load', finish, { once: true });
    });
  }

  function holdUntil(task) {
    const tracked = Promise.resolve(task).catch(function () {
      // The page owns its error state; the overlay just waits for that state.
    });
    readinessTasks.add(tracked);
    tracked.finally(function () { readinessTasks.delete(tracked); });
    return task;
  }

  function nextPaint() {
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(resolve); });
    });
  }

  async function waitForPageReady() {
    await waitForPageLoad();
    while (readinessTasks.size) await Promise.allSettled(Array.from(readinessTasks));
    await nextPaint();
  }

  function boundedReady(task) {
    return new Promise(function (resolve) {
      // Failed resources must never trap a visitor behind the overlay.
      const deadline = window.setTimeout(resolve, 6000);
      Promise.resolve(task).catch(function () {}).finally(function () {
        window.clearTimeout(deadline); resolve();
      });
    });
  }

  function cancelPlayback() {
    window.cancelAnimationFrame(animationFrame);
    if (finishActive) { finishActive(); finishActive = null; }
  }

  function play(options) {
    if (!loader) return Promise.resolve();
    const settings = options || {};
    if (!settings.force && hasVisited()) { loader.hidden = true; return Promise.resolve(); }
    cancelPlayback();
    rememberVisit();
    const run = ++activeRun;
    const startedAt = performance.now();
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let target = 88, displayed = 0;
    loader.hidden = false;
    loader.classList.remove('is-leaving', 'is-covering', 'is-route-cover');
    if (settings.route) loader.classList.add('is-route-transition');
    else loader.classList.remove('is-route-transition');
    progressLabel.textContent = '0';
    if (progressLine) progressLine.style.width = '0%';
    const loadReady = settings.ready !== undefined ? boundedReady(settings.ready)
      : settings.force ? Promise.resolve() : boundedReady(waitForPageReady());
    loadReady.then(function () { if (run === activeRun) target = 100; });

    return new Promise(function (resolve) {
      let exitTimer = 0;
      const settle = function () {
        window.clearTimeout(exitTimer);
        if (finishActive === settle) finishActive = null;
        resolve();
      };
      finishActive = settle;
      function finish() {
        loader.classList.add('is-leaving');
        exitTimer = window.setTimeout(function () {
          if (run !== activeRun) return;
          loader.hidden = true;
          loader.classList.remove('is-route-transition');
          settle();
        }, reducedMotion ? 120 : settings.route ? 500 : 920);
      }
      function frame(now) {
        if (run !== activeRun) return;
        const step = reducedMotion ? 100 : target === 100 ? (settings.route ? 7 : 2.8) : Math.max(0.3, (target - displayed) * 0.035);
        displayed = Math.min(target, displayed + step);
        const rounded = Math.min(100, Math.floor(displayed));
        progressLabel.textContent = String(rounded);
        if (progressLine) progressLine.style.width = rounded + '%';
        if (rounded >= 100 && now - startedAt >= (reducedMotion ? 0 : settings.route ? 120 : 720)) { finish(); return; }
        animationFrame = window.requestAnimationFrame(frame);
      }
      animationFrame = window.requestAnimationFrame(frame);
    });
  }

  async function transition(update) {
    if (!loader) return update();
    cancelPlayback();
    const coverRun = ++activeRun;
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    loader.hidden = false;
    loader.classList.remove('is-leaving');
    loader.classList.add('is-route-transition', 'is-route-cover', 'is-covering');
    progressLabel.textContent = '0';
    if (progressLine) progressLine.style.width = '0%';
    await nextPaint();
    if (coverRun !== activeRun) return;
    loader.classList.remove('is-covering');
    await new Promise(function (resolve) { window.setTimeout(resolve, reducedMotion ? 0 : 240); });
    if (coverRun !== activeRun) return;
    loader.classList.remove('is-route-cover');
    const ready = Promise.resolve().then(update);
    const animation = play({ force: true, route: true, ready });
    try { return await ready; }
    finally { await animation; }
  }

  window.siteEntryLoader = { play, holdUntil, transition };
  play();
})();
