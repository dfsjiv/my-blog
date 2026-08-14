(function () {
  'use strict';

  const STORAGE_KEY = 'lee_site_entry_seen_v1';
  const DEFAULT_LABEL = "LEE'S SITE";
  const loader = document.getElementById('siteEntryLoader');
  const canvas = document.getElementById('siteEntryLoaderCanvas');
  const fallbackLabel = document.getElementById('siteEntryLoaderLabel');
  const progressLabel = document.getElementById('siteEntryLoaderProgress');
  let animationFrame = 0;
  let activeRun = 0;
  let activeLabel = DEFAULT_LABEL;

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

  function resizeCanvas() {
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height, ratio };
  }

  function draw(progress, elapsed) {
    const size = resizeCanvas();
    if (!size) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const fontSize = Math.min(size.height * 0.7, size.width * 0.19);
    context.clearRect(0, 0, size.width, size.height);
    context.font = `800 ${fontSize}px "Segoe UI", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';

    const centerX = size.width / 2;
    const centerY = size.height / 2;
    const metrics = context.measureText(activeLabel);
    const textWidth = metrics.width;
    const startX = centerX - textWidth / 2;
    const revealWidth = textWidth * (progress / 100);

    context.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    context.lineWidth = Math.max(1, size.ratio * 1.2);
    context.strokeText(activeLabel, centerX, centerY);

    context.save();
    context.beginPath();
    context.rect(startX - 3, 0, revealWidth + 6, size.height);
    context.clip();
    context.fillStyle = '#f5f7fa';
    context.fillText(activeLabel, centerX, centerY);

    const sweepX = startX + revealWidth;
    const sweep = context.createLinearGradient(sweepX - fontSize * 0.3, 0, sweepX + fontSize * 0.1, 0);
    sweep.addColorStop(0, 'rgba(255,255,255,0)');
    sweep.addColorStop(0.75, `rgba(118, 211, 210, ${0.28 + Math.sin(elapsed / 130) * 0.08})`);
    sweep.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = sweep;
    context.fillRect(sweepX - fontSize * 0.3, 0, fontSize * 0.4, size.height);
    context.restore();

    loader?.classList.add('is-canvas-ready');
  }

  function waitForPageLoad() {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise(function (resolve) {
      window.addEventListener('load', resolve, { once: true });
      window.setTimeout(resolve, 7000);
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
    activeLabel = typeof settings.label === 'string' && settings.label.trim()
      ? settings.label.trim().toUpperCase()
      : DEFAULT_LABEL;
    if (fallbackLabel) fallbackLabel.textContent = activeLabel;
    loader.setAttribute('aria-label', `Loading ${activeLabel}`);
    loader.hidden = false;
    loader.classList.remove('is-leaving');
    progressLabel.textContent = '0';

    const loadReady = settings.force
      ? Promise.resolve()
      : waitForPageLoad();

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
        draw(rounded, elapsed);

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

  window.siteEntryLoader = { play };
  play();
})();
