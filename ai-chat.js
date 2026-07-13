(function () {
  const TASKBAR_HEIGHT = 40;
  const MIN_WIDTH = 420;
  const MIN_HEIGHT = 300;
  const elements = {
    desktopIcon: document.getElementById('aiDesktopIcon'),
    taskbarButton: document.getElementById('aiTaskbarButton'),
    startButton: document.getElementById('startAiButton'),
    startStatus: document.getElementById('startAiStatus'),
    window: document.getElementById('aiWindow'),
    titlebar: document.getElementById('aiTitlebar'),
    minimize: document.getElementById('aiMinimize'),
    maximize: document.getElementById('aiMaximize'),
    close: document.getElementById('aiClose'),
    form: document.getElementById('aiInputForm'),
    input: document.getElementById('aiInput'),
    replyArea: document.getElementById('aiReplyArea'),
    reply: document.getElementById('aiReplyMessage'),
    resizeHandles: Array.from(document.querySelectorAll('[data-ai-resize-edge]')),
  };

  if (!elements.desktopIcon || !elements.window || !elements.form) return;

  const state = {
    open: false,
    minimized: false,
    maximized: false,
    drag: null,
    resize: null,
    restoreBounds: null,
  };

  function isAdmin() {
    return Boolean(window.authManager && typeof window.authManager.isAdmin === 'function'
      && window.authManager.isAdmin());
  }

  function setSelected(selected) {
    elements.desktopIcon.classList.toggle('is-selected', selected);
    elements.desktopIcon.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  function updateWindow() {
    elements.window.classList.toggle('is-hidden', !state.open);
    elements.window.classList.toggle('is-minimized', state.open && state.minimized);
    elements.window.classList.toggle('is-maximized', state.open && state.maximized);
    elements.taskbarButton.classList.toggle('is-running', state.open);
    elements.taskbarButton.classList.toggle('is-active', state.open && !state.minimized);
    elements.taskbarButton.setAttribute('aria-pressed', state.open && !state.minimized ? 'true' : 'false');
    elements.maximize.setAttribute('aria-label', state.maximized ? '还原' : '最大化');
    if (elements.startStatus) {
      elements.startStatus.textContent = state.open
        ? (state.minimized ? '已最小化' : '正在运行')
        : '本地测试';
    }
  }

  function openWindow() {
    if (!isAdmin()) return;
    state.open = true;
    state.minimized = false;
    setSelected(true);
    updateWindow();
    if (window.homeDesktop) window.homeDesktop.closeStartMenu();
    elements.input.focus();
  }

  function closeWindow() {
    state.open = false;
    state.minimized = false;
    state.maximized = false;
    state.restoreBounds = null;
    setSelected(false);
    updateWindow();
  }

  function minimizeWindow() {
    if (!state.open) return;
    state.minimized = true;
    updateWindow();
  }

  function toggleTaskbar() {
    if (!state.open) return openWindow();
    state.minimized = !state.minimized;
    updateWindow();
  }

  function toggleMaximize() {
    if (!state.open) openWindow();
    if (!state.open) return;
    if (state.maximized) {
      state.maximized = false;
      if (state.restoreBounds) applyBounds(state.restoreBounds);
      state.restoreBounds = null;
    } else {
      state.restoreBounds = readBounds();
      state.maximized = true;
      state.minimized = false;
    }
    updateWindow();
  }

  function readBounds() {
    const rect = elements.window.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function applyBounds(bounds) {
    elements.window.style.left = bounds.left + 'px';
    elements.window.style.top = bounds.top + 'px';
    elements.window.style.width = bounds.width + 'px';
    elements.window.style.height = bounds.height + 'px';
  }

  function startDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest && event.target.closest('.window-control')) return;
    if (!state.open || state.minimized || state.maximized) return;
    const bounds = readBounds();
    state.drag = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
    elements.window.classList.add('is-dragging');
    document.addEventListener('pointermove', dragWindow);
    document.addEventListener('pointerup', stopDrag, { once: true });
  }

  function dragWindow(event) {
    if (!state.drag) return;
    const bounds = readBounds();
    const left = Math.max(0, Math.min(
      state.drag.left + event.clientX - state.drag.x,
      window.innerWidth - bounds.width
    ));
    const top = Math.max(0, Math.min(
      state.drag.top + event.clientY - state.drag.y,
      window.innerHeight - TASKBAR_HEIGHT - 32
    ));
    elements.window.style.left = left + 'px';
    elements.window.style.top = top + 'px';
  }

  function stopDrag() {
    state.drag = null;
    elements.window.classList.remove('is-dragging');
    document.removeEventListener('pointermove', dragWindow);
  }

  function startResize(event, edge) {
    if (event.button !== undefined && event.button !== 0) return;
    if (!state.open || state.minimized || state.maximized) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = readBounds();
    state.resize = {
      edge,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top,
      right: bounds.left + bounds.width,
      bottom: bounds.top + bounds.height,
    };
    elements.window.classList.add('is-resizing');
    document.addEventListener('pointermove', resizeWindow);
    document.addEventListener('pointerup', stopResize, { once: true });
  }

  function resizeWindow(event) {
    if (!state.resize) return;
    const original = state.resize;
    const dx = event.clientX - original.x;
    const dy = event.clientY - original.y;
    const minWidth = Math.min(MIN_WIDTH, window.innerWidth);
    const minHeight = Math.min(MIN_HEIGHT, window.innerHeight - TASKBAR_HEIGHT);
    let left = original.left;
    let top = original.top;
    let right = original.right;
    let bottom = original.bottom;
    if (original.edge.includes('e')) right = Math.min(window.innerWidth, Math.max(left + minWidth, original.right + dx));
    if (original.edge.includes('s')) bottom = Math.min(window.innerHeight - TASKBAR_HEIGHT, Math.max(top + minHeight, original.bottom + dy));
    if (original.edge.includes('w')) left = Math.max(0, Math.min(original.right - minWidth, original.left + dx));
    if (original.edge.includes('n')) top = Math.max(0, Math.min(original.bottom - minHeight, original.top + dy));
    applyBounds({ left, top, width: right - left, height: bottom - top });
  }

  function stopResize() {
    state.resize = null;
    elements.window.classList.remove('is-resizing');
    document.removeEventListener('pointermove', resizeWindow);
  }

  function submitLocalMessage() {
    const content = elements.input.value.trim();
    if (!content) return;
    elements.reply.textContent = '收到：' + content;
    elements.input.value = '';
    elements.replyArea.scrollTop = elements.replyArea.scrollHeight;
  }

  function refreshAccess() {
    const allowed = isAdmin();
    elements.desktopIcon.classList.toggle('ai-access-hidden', !allowed);
    elements.taskbarButton.classList.toggle('ai-access-hidden', !allowed);
    if (elements.startButton) elements.startButton.classList.toggle('ai-access-hidden', !allowed);
    if (!allowed) closeWindow();
  }

  elements.form.addEventListener('submit', function (event) {
    event.preventDefault();
    submitLocalMessage();
  });
  elements.input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitLocalMessage();
    }
  });
  elements.desktopIcon.addEventListener('click', function (event) {
    event.stopPropagation();
    if (isAdmin()) setSelected(true);
  });
  elements.desktopIcon.addEventListener('dblclick', openWindow);
  elements.desktopIcon.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') openWindow();
  });
  elements.taskbarButton.addEventListener('click', toggleTaskbar);
  if (elements.startButton) elements.startButton.addEventListener('click', openWindow);
  elements.minimize.addEventListener('click', minimizeWindow);
  elements.maximize.addEventListener('click', toggleMaximize);
  elements.close.addEventListener('click', closeWindow);
  elements.titlebar.addEventListener('pointerdown', startDrag);
  elements.titlebar.addEventListener('dblclick', toggleMaximize);
  elements.resizeHandles.forEach(function (handle) {
    handle.addEventListener('pointerdown', function (event) {
      startResize(event, handle.dataset.aiResizeEdge);
    });
  });

  let iconDragRegistered = false;
  function registerDesktopIconDrag() {
    if (iconDragRegistered || !window.homeDesktop
      || typeof window.homeDesktop.getIconDragController !== 'function') return;
    const iconDrag = window.homeDesktop.getIconDragController();
    if (!iconDrag) return;
    iconDrag.registerIcon(elements.desktopIcon, {
      onDragStart: function () {
        if (!isAdmin()) return;
        setSelected(true);
        window.homeDesktop.closeStartMenu();
      },
    });
    iconDragRegistered = true;
  }
  registerDesktopIconDrag();
  if (!iconDragRegistered) {
    document.addEventListener('DOMContentLoaded', registerDesktopIconDrag, { once: true });
  }

  updateWindow();
  refreshAccess();
  window.aiChat = { openWindow, closeWindow, refreshAccess };
}());
