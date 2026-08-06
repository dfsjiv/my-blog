(function () {
  'use strict';

  const frame = document.getElementById('loginMikutapFrame');
  const loginScreen = document.getElementById('loginScreen');
  if (!frame || !loginScreen) return;

  let forwardingPointer = false;

  function isLoginVisible() {
    return loginScreen.getAttribute('aria-hidden') !== 'true';
  }

  function send(payload) {
    if (!frame.contentWindow || !isLoginVisible()) return;
    frame.contentWindow.postMessage({
      source: 'login-mikutap-bridge',
      ...payload,
    }, window.location.origin);
  }

  loginScreen.addEventListener('pointerdown', function (event) {
    if (event.target === frame) return;
    forwardingPointer = true;
    send({ type: 'pointerdown', x: event.clientX, y: event.clientY });
  }, true);

  loginScreen.addEventListener('pointermove', function (event) {
    if (!forwardingPointer) return;
    send({ type: 'pointermove', x: event.clientX, y: event.clientY });
  }, true);

  window.addEventListener('pointerup', function () {
    if (!forwardingPointer) return;
    forwardingPointer = false;
    send({ type: 'pointerup' });
  }, true);

  window.addEventListener('keydown', function (event) {
    if (event.repeat || !isLoginVisible()) return;
    send({ type: 'keydown', keyCode: event.keyCode || event.which || 0 });
  });

  window.addEventListener('keyup', function (event) {
    if (!isLoginVisible()) return;
    send({ type: 'keyup', keyCode: event.keyCode || event.which || 0 });
  });
}());
