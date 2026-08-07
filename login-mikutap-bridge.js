(function () {
  'use strict';

  const frame = document.getElementById('loginMikutapFrame');
  const loginScreen = document.getElementById('loginScreen');
  if (!frame || !loginScreen) return;

  let forwardingPointer = false;

  function isLoginVisible() {
    return loginScreen.getAttribute('aria-hidden') !== 'true';
  }

  function callFrame(method, ...args) {
    if (!frame.contentWindow || !isLoginVisible()) return;
    const handler = frame.contentWindow[method];
    if (typeof handler === 'function') handler(...args);
  }

  loginScreen.addEventListener('pointerdown', function (event) {
    if (event.target === frame) return;
    forwardingPointer = true;
    callFrame('loginMikutapPointerDown', event.clientX, event.clientY);
  }, true);

  loginScreen.addEventListener('pointermove', function (event) {
    if (!forwardingPointer) return;
    callFrame('loginMikutapPointerMove', event.clientX, event.clientY);
  }, true);

  window.addEventListener('pointerup', function () {
    if (!forwardingPointer) return;
    forwardingPointer = false;
    callFrame('loginMikutapPointerUp');
  }, true);

  window.addEventListener('keydown', function (event) {
    if (event.repeat || !isLoginVisible()) return;
    callFrame('loginMikutapKeyDown', event.keyCode || event.which || 0);
  });

  window.addEventListener('keyup', function (event) {
    if (!isLoginVisible()) return;
    callFrame('loginMikutapKeyUp', event.keyCode || event.which || 0);
  });
}());
