(function () {
  'use strict';

  const STORAGE_KEY = 'lee_site_entry_seen_v1';
  const loader = document.getElementById('siteEntryLoader');
  const progressLabel = document.getElementById('siteEntryLoaderProgress');
  const readinessTasks = new Set();
  let animationFrame = 0;
  let activeRun = 0;

  function hasVisited() {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch (_error) {
      return false;
    }
  }

  function rememberVisit() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (_error) {
      // Storage may be unavailable in strict privacy modes; the loader can still run.
    }
  }

  function waitForPageLoad() {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise(function (resolve) {
      window.addEventListener('load', resolve, { once: true });
      window.setTimeout(resolve, 7000);
    });
  }

  function holdUntil(task) {
    const tracked = Promise.resolve(task).catch(function () {
      // The page renders its own error state; the loader only waits for that render to finish.
    });
    readinessTasks.add(tracked);
    tracked.finally(function () {
      readinessTasks.delete(tracked);
    });
    return task;
  }

  async function waitForPageReady() {
    await waitForPageLoad();
    while (readinessTasks.size) {
      await Promise.allSettled(Array.from(readinessTasks));
    }
    await new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  function play(options) {
    if (!loader) return Promise.resolve();
    const settings = options || {};
    if (!settings.force && hasVisited()) {
      loader.hidden = true;
      return Promise.resolve();
    }

    rememberVisit();
    const run = ++activeRun;
    const startedAt = performance.now();
    let target = 88;
    let displayed = 0;
    loader.hidden = false;
    loader.classList.remove('is-leaving');
    progressLabel.textContent = '0';

    const loadReady = settings.force
      ? Promise.resolve()
      : waitForPageReady();

    loadReady.then(function () {
      target = 100;
    });

    return new Promise(function (resolve) {
      function finish() {
        loader.classList.add('is-leaving');
        window.setTimeout(function () {
          if (run !== activeRun) return;
          loader.hidden = true;
          resolve();
        }, 380);
      }

      function frame(now) {
        if (run !== activeRun) return;
        const elapsed = now - startedAt;
        const step = target === 100 ? 2.8 : Math.max(0.3, (target - displayed) * 0.035);
        displayed = Math.min(target, displayed + step);
        const rounded = Math.min(100, Math.floor(displayed));
        progressLabel.textContent = String(rounded);
        if (rounded >= 100 && elapsed >= 720) {
          finish();
          return;
        }
        animationFrame = window.requestAnimationFrame(frame);
      }

      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(frame);
    });
  }

  window.siteEntryLoader = { play, holdUntil };
  play();
})();
