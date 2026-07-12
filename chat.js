(function () {
  const TASKBAR_HEIGHT = 40;
  const elements = {
    desktopIcon: document.getElementById('chatDesktopIcon'),
    taskbarButton: document.getElementById('chatTaskbarButton'),
    window: document.getElementById('chatWindow'),
    titlebar: document.getElementById('chatTitlebar'),
    minimize: document.getElementById('chatMinimize'),
    maximize: document.getElementById('chatMaximize'),
    close: document.getElementById('chatClose'),
    messages: document.getElementById('chatMessages'),
    compose: document.getElementById('chatCompose'),
    resizeHandles: Array.from(document.querySelectorAll('[data-chat-resize-edge]')),
  };

  if (!elements.desktopIcon || !elements.window) return;

  const state = {
    open: false,
    minimized: false,
    maximized: false,
    loaded: false,
    loading: false,
    drag: null,
    resize: null,
    bounds: null,
  };

  function getUser() {
    return window.authManager && typeof window.authManager.getCurrentUser === 'function'
      ? window.authManager.getCurrentUser()
      : null;
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
  }

  function renderCompose() {
    elements.compose.replaceChildren();
    const user = getUser();
    if (!user || user.role === 'guest') {
      const notice = document.createElement('p');
      notice.className = 'chat-guest-notice';
      notice.textContent = '登录后可以发送消息';
      elements.compose.appendChild(notice);
      return;
    }

    const row = document.createElement('div');
    row.className = 'chat-compose-row';
    const input = document.createElement('textarea');
    input.className = 'chat-input';
    input.rows = 1;
    input.placeholder = '输入消息...';
    input.setAttribute('aria-label', '消息内容');
    const button = document.createElement('button');
    button.className = 'chat-send-button';
    button.type = 'button';
    button.textContent = '发送';
    button.disabled = true;
    button.title = '消息发送将在后续实时通信阶段开放';
    row.append(input, button);
    elements.compose.appendChild(row);
  }

  function formatDate(value) {
    if (typeof value !== 'string') return '';
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return match ? `${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}` : value;
  }

  function renderStatus(text, isError) {
    elements.messages.replaceChildren();
    const status = document.createElement('p');
    status.className = 'chat-status' + (isError ? ' is-error' : '');
    status.textContent = text;
    elements.messages.appendChild(status);
  }

  function renderMessages(messages) {
    elements.messages.replaceChildren();
    if (!messages.length) {
      renderStatus('公共大厅暂无消息', false);
      return;
    }

    messages.slice(-50).forEach(function (message) {
      const item = document.createElement('article');
      item.className = 'chat-message';
      const header = document.createElement('header');
      header.className = 'chat-message-header';
      const author = document.createElement('strong');
      author.className = 'chat-message-author' + (message.role === 'admin' ? ' is-admin' : '');
      author.textContent = typeof message.username === 'string' ? message.username : '未知用户';
      const time = document.createElement('time');
      time.className = 'chat-message-time';
      time.textContent = formatDate(message.created_at);
      const content = document.createElement('p');
      content.className = 'chat-message-content';
      content.textContent = typeof message.content === 'string' ? message.content : '';
      header.append(author, time);
      item.append(header, content);
      elements.messages.appendChild(item);
    });
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  async function loadMessages(force) {
    if (state.loading || (state.loaded && !force)) return;
    state.loading = true;
    renderStatus('正在加载历史消息...', false);
    try {
      let data;
      if (window.authManager && typeof window.authManager.apiRequest === 'function') {
        data = await window.authManager.apiRequest('/api/chat/messages');
      } else {
        const response = await fetch('/api/chat/messages');
        data = await response.json();
        if (!response.ok) throw new Error('request-failed');
      }
      if (!data || !Array.isArray(data.messages)) throw new Error('invalid-data');
      state.loaded = true;
      renderMessages(data.messages);
    } catch (error) {
      renderStatus('历史消息加载失败，请稍后重试', true);
    } finally {
      state.loading = false;
    }
  }

  function openWindow() {
    state.open = true;
    state.minimized = false;
    setSelected(true);
    renderCompose();
    updateWindow();
    loadMessages(false);
    if (window.homeDesktop) window.homeDesktop.closeStartMenu();
  }

  function closeWindow() {
    state.open = false;
    state.minimized = false;
    state.maximized = false;
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
    state.maximized = !state.maximized;
    state.minimized = false;
    updateWindow();
  }

  function clampWindow(left, top) {
    const rect = elements.window.getBoundingClientRect();
    return {
      left: Math.max(0, Math.min(left, Math.max(0, window.innerWidth - rect.width))),
      top: Math.max(0, Math.min(top, Math.max(0, window.innerHeight - TASKBAR_HEIGHT - 32))),
    };
  }

  function startDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest && event.target.closest('.window-control')) return;
    if (!state.open || state.minimized || state.maximized) return;
    const rect = elements.window.getBoundingClientRect();
    state.drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    elements.window.classList.add('is-dragging');
    document.addEventListener('pointermove', dragWindow);
    document.addEventListener('pointerup', stopDrag, { once: true });
  }

  function dragWindow(event) {
    if (!state.drag) return;
    const position = clampWindow(
      state.drag.left + event.clientX - state.drag.x,
      state.drag.top + event.clientY - state.drag.y
    );
    elements.window.style.left = position.left + 'px';
    elements.window.style.top = position.top + 'px';
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
    const rect = elements.window.getBoundingClientRect();
    state.resize = {
      edge,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
    elements.window.classList.add('is-resizing');
    document.addEventListener('pointermove', resizeWindow);
    document.addEventListener('pointerup', stopResize, { once: true });
  }

  function resizeWindow(event) {
    if (!state.resize) return;
    const original = state.resize;
    const deltaX = event.clientX - original.x;
    const deltaY = event.clientY - original.y;
    const minimumWidth = Math.min(540, window.innerWidth);
    const minimumHeight = Math.min(360, window.innerHeight - TASKBAR_HEIGHT);
    let left = original.left;
    let top = original.top;
    let right = original.right;
    let bottom = original.bottom;

    if (original.edge.includes('e')) {
      right = Math.min(window.innerWidth, Math.max(left + minimumWidth, original.right + deltaX));
    }
    if (original.edge.includes('s')) {
      bottom = Math.min(
        window.innerHeight - TASKBAR_HEIGHT,
        Math.max(top + minimumHeight, original.bottom + deltaY)
      );
    }
    if (original.edge.includes('w')) {
      left = Math.max(0, Math.min(original.right - minimumWidth, original.left + deltaX));
    }
    if (original.edge.includes('n')) {
      top = Math.max(0, Math.min(original.bottom - minimumHeight, original.top + deltaY));
    }

    elements.window.style.left = left + 'px';
    elements.window.style.top = top + 'px';
    elements.window.style.width = right - left + 'px';
    elements.window.style.height = bottom - top + 'px';
  }

  function stopResize() {
    state.resize = null;
    elements.window.classList.remove('is-resizing');
    document.removeEventListener('pointermove', resizeWindow);
  }

  elements.desktopIcon.addEventListener('click', function (event) {
    event.stopPropagation();
    setSelected(true);
  });
  elements.desktopIcon.addEventListener('dblclick', openWindow);
  elements.desktopIcon.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') openWindow();
  });
  elements.taskbarButton.addEventListener('click', toggleTaskbar);
  elements.minimize.addEventListener('click', minimizeWindow);
  elements.maximize.addEventListener('click', toggleMaximize);
  elements.close.addEventListener('click', closeWindow);
  elements.titlebar.addEventListener('pointerdown', startDrag);
  elements.titlebar.addEventListener('dblclick', toggleMaximize);
  elements.resizeHandles.forEach(function (handle) {
    handle.addEventListener('pointerdown', function (event) {
      startResize(event, handle.dataset.chatResizeEdge);
    });
  });
  if (window.homeDesktop && typeof window.homeDesktop.getIconDragController === 'function') {
    const iconDrag = window.homeDesktop.getIconDragController();
    if (iconDrag) {
      iconDrag.registerIcon(elements.desktopIcon, {
        onDragStart: function () {
          setSelected(true);
          window.homeDesktop.closeStartMenu();
        },
      });
    }
  }
  window.addEventListener('resize', function () {
    if (!state.open || state.maximized) return;
    const rect = elements.window.getBoundingClientRect();
    const position = clampWindow(rect.left, rect.top);
    elements.window.style.left = position.left + 'px';
    elements.window.style.top = position.top + 'px';
  });

  updateWindow();
  window.chatApp = {
    openWindow,
    closeWindow,
    loadMessages,
    refreshIdentity: renderCompose,
  };
}());
