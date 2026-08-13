(function () {
  'use strict';

  const frame = document.getElementById('loginMikutapFrame');
  const loginScreen = document.getElementById('loginScreen');
  if (!frame || !loginScreen) return;

  let forwardingPointer = false;

  function isMikutapVisible() {
    return loginScreen.getAttribute('aria-hidden') !== 'true';
  }

  function callFrame(method, ...args) {
    if (!frame.contentWindow || !isMikutapVisible()) return;
    const handler = frame.contentWindow[method];
    if (typeof handler === 'function') handler(...args);
  }

  function pauseFrameAudio() {
    if (!frame.contentWindow) return;
    const pause = frame.contentWindow.pauseMikutapAudio;
    if (typeof pause === 'function') pause();
  }

  function syncMikutapState() {
    if (!isMikutapVisible()) {
      pauseFrameAudio();
      return;
    }
    const activateVisuals = frame.contentWindow && frame.contentWindow.setMikutapVisualActive;
    if (typeof activateVisuals === 'function') activateVisuals(true);
  }

  const visibilityObserver = new MutationObserver(syncMikutapState);
  visibilityObserver.observe(loginScreen, {
    attributes: true,
    attributeFilter: ['aria-hidden'],
  });
  frame.addEventListener('load', syncMikutapState);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pauseFrameAudio();
  });

  function handlePointerDown(event) {
    if (event.target === frame) return;
    forwardingPointer = true;
    callFrame('loginMikutapPointerDown', event.clientX, event.clientY);
  }

  function handlePointerMove(event) {
    if (!forwardingPointer) return;
    callFrame('loginMikutapPointerMove', event.clientX, event.clientY);
  }

  loginScreen.addEventListener('pointerdown', handlePointerDown, true);
  loginScreen.addEventListener('pointermove', handlePointerMove, true);

  window.addEventListener('pointerup', function () {
    if (!forwardingPointer) return;
    forwardingPointer = false;
    callFrame('loginMikutapPointerUp');
  }, true);

  window.addEventListener('keydown', function (event) {
    if (event.repeat || !isMikutapVisible()) return;
    callFrame('loginMikutapKeyDown', event.keyCode || event.which || 0);
  });

  window.addEventListener('keyup', function (event) {
    if (!isMikutapVisible()) return;
    callFrame('loginMikutapKeyUp', event.keyCode || event.which || 0);
  });
}());
