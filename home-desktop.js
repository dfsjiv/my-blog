(function () {
  const TASKBAR_HEIGHT = 40;
  const MIN_WINDOW_WIDTH = 320;
  const MIN_WINDOW_HEIGHT = 220;
  const DEFAULT_ICON_WIDTH = 76;
  const DEFAULT_ICON_HEIGHT = 88;
  const ICON_DRAG_THRESHOLD = 3;
  const BLOG_URL = 'blog.html';

  function padTime(value) {
    return String(value).padStart(2, '0');
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function readPixelValue(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function readElements(doc) {
    return {
      desktopShell: doc.getElementById('desktopShell'),
      desktopSurface: doc.getElementById('desktopSurface'),
      startButton: doc.getElementById('startButton'),
      startMenu: doc.getElementById('startMenu'),
      startBlogButton: doc.getElementById('startBlogButton'),
      blogDesktopIcon: doc.getElementById('blogDesktopIcon'),
      blogTaskbarButton: doc.getElementById('blogTaskbarButton'),
      blogWindow: doc.getElementById('blogWindow'),
      blogTitlebar: doc.getElementById('blogTitlebar'),
      blogFrame: doc.getElementById('blogFrame'),
      windowMinimize: doc.getElementById('windowMinimize'),
      windowMaximize: doc.getElementById('windowMaximize'),
      windowClose: doc.getElementById('windowClose'),
      resizeHandles: [
        doc.getElementById('resizeN'),
        doc.getElementById('resizeE'),
        doc.getElementById('resizeS'),
        doc.getElementById('resizeW'),
        doc.getElementById('resizeNE'),
        doc.getElementById('resizeSE'),
        doc.getElementById('resizeSW'),
        doc.getElementById('resizeNW'),
      ],
      clockTime: doc.getElementById('clockTime'),
      clockDate: doc.getElementById('clockDate'),
    };
  }

  function createDesktopIconDrag(options) {
    const settings = options || {};
    const dragDocument = settings.document || document;
    const viewport = settings.viewport || function () {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    };
    const taskbarHeight = settings.taskbarHeight == null ? TASKBAR_HEIGHT : settings.taskbarHeight;
    const registrations = new Map();
    const state = {
      active: null,
    };

    function availableArea() {
      const size = viewport();
      return {
        width: Math.max(DEFAULT_ICON_WIDTH, size.width),
        height: Math.max(DEFAULT_ICON_HEIGHT, size.height - taskbarHeight),
      };
    }

    function readIconSize(icon) {
      const rect = icon.getBoundingClientRect ? icon.getBoundingClientRect() : {};
      return {
        width: icon.offsetWidth || rect.width || DEFAULT_ICON_WIDTH,
        height: icon.offsetHeight || rect.height || DEFAULT_ICON_HEIGHT,
      };
    }

    function readIconPosition(icon) {
      const styleLeft = readPixelValue(icon.style.left);
      const styleTop = readPixelValue(icon.style.top);
      if (styleLeft !== null && styleTop !== null) {
        return {
          left: styleLeft,
          top: styleTop,
        };
      }

      return {
        left: Number.isFinite(icon.offsetLeft) ? icon.offsetLeft : 0,
        top: Number.isFinite(icon.offsetTop) ? icon.offsetTop : 0,
      };
    }

    function normalizeIconPosition(icon, left, top) {
      const area = availableArea();
      const size = readIconSize(icon);
      return {
        left: clamp(left, 0, Math.max(0, area.width - size.width)),
        top: clamp(top, 0, Math.max(0, area.height - size.height)),
      };
    }

    function moveIconTo(icon, left, top) {
      const position = normalizeIconPosition(icon, left, top);
      icon.style.left = position.left + 'px';
      icon.style.top = position.top + 'px';
      return position;
    }

    function stopIconDrag() {
      if (!state.active) {
        return;
      }

      const active = state.active;
      state.active = null;
      active.icon.classList.remove('is-dragging');
      active.icon.setAttribute('aria-grabbed', 'false');
      if (dragDocument.removeEventListener) {
        dragDocument.removeEventListener('pointermove', handleIconDragMove);
      }
      if (active.registration.onDragEnd) {
        active.registration.onDragEnd(active.icon, active.moved);
      }
    }

    function handleIconDragMove(event) {
      if (!state.active) {
        return;
      }

      const active = state.active;
      const deltaX = event.clientX - active.pointerX;
      const deltaY = event.clientY - active.pointerY;
      if (Math.abs(deltaX) > ICON_DRAG_THRESHOLD || Math.abs(deltaY) > ICON_DRAG_THRESHOLD) {
        active.moved = true;
      }

      moveIconTo(active.icon, active.left + deltaX, active.top + deltaY);
    }

    function startIconDrag(icon, registration, event) {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      if (event.preventDefault) {
        event.preventDefault();
      }
      if (event.stopPropagation) {
        event.stopPropagation();
      }
      if (event.pointerId !== undefined && icon.setPointerCapture) {
        icon.setPointerCapture(event.pointerId);
      }

      const position = readIconPosition(icon);
      state.active = {
        icon,
        registration,
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: position.left,
        top: position.top,
        moved: false,
      };

      icon.classList.add('is-dragging');
      icon.setAttribute('aria-grabbed', 'true');
      if (registration.onDragStart) {
        registration.onDragStart(icon);
      }

      dragDocument.addEventListener('pointermove', handleIconDragMove);
      dragDocument.addEventListener('pointerup', stopIconDrag, { once: true });
    }

    function registerIcon(icon, registrationOptions) {
      if (!icon || registrations.has(icon)) {
        return;
      }

      const registration = registrationOptions || {};
      registrations.set(icon, registration);
      icon.addEventListener('pointerdown', function (event) {
        startIconDrag(icon, registration, event);
      });
      icon.addEventListener('dragstart', function (event) {
        if (event.preventDefault) {
          event.preventDefault();
        }
      });
    }

    return {
      registerIcon,
      moveIconTo,
      normalizeIconPosition,
    };
  }

  function createDesktopController(elements, options) {
    const settings = options || {};
    const viewport = settings.viewport || function () {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    };
    const now = settings.now || function () {
      return new Date();
    };

    const state = {
      initialized: false,
      open: false,
      minimized: false,
      maximized: false,
      selected: false,
      startMenuOpen: false,
      bounds: null,
      restoreBounds: null,
      drag: null,
      resize: null,
      iconDrag: null,
    };

    function availableArea() {
      const size = viewport();
      return {
        width: Math.max(MIN_WINDOW_WIDTH, size.width),
        height: Math.max(MIN_WINDOW_HEIGHT, size.height - TASKBAR_HEIGHT),
      };
    }

    function normalizeBounds(bounds) {
      const area = availableArea();
      const width = Math.min(Math.max(bounds.width, MIN_WINDOW_WIDTH), area.width);
      const height = Math.min(Math.max(bounds.height, MIN_WINDOW_HEIGHT), area.height);
      const maxLeft = Math.max(0, area.width - width);
      const maxTop = Math.max(0, area.height - height);

      return {
        left: Math.min(Math.max(bounds.left, 0), maxLeft),
        top: Math.min(Math.max(bounds.top, 0), maxTop),
        width,
        height,
      };
    }

    function defaultBounds() {
      const area = availableArea();
      const width = Math.min(1040, Math.max(MIN_WINDOW_WIDTH, area.width - 180));
      const height = Math.min(680, Math.max(MIN_WINDOW_HEIGHT, area.height - 72));

      return normalizeBounds({
        left: Math.round((area.width - width) / 2),
        top: Math.round((area.height - height) / 2),
        width,
        height,
      });
    }

    function ensureBounds() {
      if (!state.bounds) {
        state.bounds = defaultBounds();
      }

      state.bounds = normalizeBounds(state.bounds);
      return state.bounds;
    }

    function applyWindowBounds() {
      if (state.maximized || !elements.blogWindow) {
        return;
      }

      const bounds = ensureBounds();
      elements.blogWindow.style.left = bounds.left + 'px';
      elements.blogWindow.style.top = bounds.top + 'px';
      elements.blogWindow.style.width = bounds.width + 'px';
      elements.blogWindow.style.height = bounds.height + 'px';
    }

    function setElementState(element, className, enabled) {
      if (element) {
        element.classList.toggle(className, enabled);
      }
    }

    function setAttribute(element, name, value) {
      if (element) {
        element.setAttribute(name, value);
      }
    }

    function updateBlogWindowState() {
      const windowHidden = !state.open;
      setElementState(elements.blogWindow, 'is-hidden', windowHidden);
      setElementState(elements.blogWindow, 'is-minimized', state.open && state.minimized);
      setElementState(elements.blogWindow, 'is-maximized', state.open && state.maximized);

      setElementState(elements.blogTaskbarButton, 'is-running', state.open);
      setElementState(elements.blogTaskbarButton, 'is-active', state.open && !state.minimized);
      setAttribute(elements.blogTaskbarButton, 'aria-pressed', state.open && !state.minimized ? 'true' : 'false');
      setAttribute(elements.windowMaximize, 'aria-label', state.maximized ? '还原' : '最大化');

      if (state.open && elements.blogFrame && !elements.blogFrame.src) {
        elements.blogFrame.src = BLOG_URL;
      }

      if (state.open && !state.maximized) {
        applyWindowBounds();
      }
    }

    function selectDesktopIcon(selected) {
      state.selected = selected !== false;
      setElementState(elements.blogDesktopIcon, 'is-selected', state.selected);
      setAttribute(elements.blogDesktopIcon, 'aria-selected', state.selected ? 'true' : 'false');
    }

    function setStartMenuOpen(open) {
      state.startMenuOpen = open;
      setElementState(elements.startMenu, 'is-open', state.startMenuOpen);
      setAttribute(elements.startButton, 'aria-expanded', state.startMenuOpen ? 'true' : 'false');
    }

    function closeStartMenu() {
      setStartMenuOpen(false);
    }

    function toggleStartMenu() {
      setStartMenuOpen(!state.startMenuOpen);
    }

    function openBlogWindow() {
      ensureBounds();
      state.open = true;
      state.minimized = false;
      selectDesktopIcon(true);
      closeStartMenu();
      updateBlogWindowState();
    }

    function minimizeBlogWindow() {
      if (!state.open) {
        return;
      }

      state.minimized = true;
      updateBlogWindowState();
    }

    function restoreBlogWindow() {
      if (!state.open) {
        openBlogWindow();
        return;
      }

      state.minimized = false;
      updateBlogWindowState();
    }

    function closeBlogWindow() {
      state.open = false;
      state.minimized = false;
      state.maximized = false;
      state.restoreBounds = null;
      updateBlogWindowState();
    }

    function toggleBlogFromTaskbar() {
      if (!state.open) {
        openBlogWindow();
        return;
      }

      if (state.minimized) {
        restoreBlogWindow();
      } else {
        minimizeBlogWindow();
      }
    }

    function toggleMaximizeBlogWindow() {
      if (!state.open) {
        openBlogWindow();
      }

      if (state.maximized) {
        state.maximized = false;
        state.bounds = state.restoreBounds || ensureBounds();
        state.restoreBounds = null;
      } else {
        state.restoreBounds = Object.assign({}, ensureBounds());
        state.maximized = true;
        state.minimized = false;
      }

      updateBlogWindowState();
    }

    function moveWindowTo(left, top) {
      if (state.maximized) {
        return;
      }

      const current = ensureBounds();
      state.bounds = normalizeBounds({
        left,
        top,
        width: current.width,
        height: current.height,
      });
      applyWindowBounds();
    }

    function resizeWindowFromEdge(edge, deltaX, deltaY) {
      if (!state.open || state.minimized || state.maximized) {
        return;
      }

      const area = availableArea();
      const original = state.resize ? state.resize.bounds : ensureBounds();
      let left = original.left;
      let top = original.top;
      let right = original.left + original.width;
      let bottom = original.top + original.height;

      if (edge.indexOf('e') !== -1) {
        right = clamp(right + deltaX, left + MIN_WINDOW_WIDTH, area.width);
      }
      if (edge.indexOf('s') !== -1) {
        bottom = clamp(bottom + deltaY, top + MIN_WINDOW_HEIGHT, area.height);
      }
      if (edge.indexOf('w') !== -1) {
        left = clamp(left + deltaX, 0, right - MIN_WINDOW_WIDTH);
      }
      if (edge.indexOf('n') !== -1) {
        top = clamp(top + deltaY, 0, bottom - MIN_WINDOW_HEIGHT);
      }

      state.bounds = {
        left,
        top,
        width: right - left,
        height: bottom - top,
      };
      applyWindowBounds();
    }

    function updateClock() {
      const date = now();
      if (elements.clockTime) {
        elements.clockTime.textContent = padTime(date.getHours()) + ':' + padTime(date.getMinutes());
      }
      if (elements.clockDate) {
        elements.clockDate.textContent = [
          date.getFullYear(),
          padTime(date.getMonth() + 1),
          padTime(date.getDate()),
        ].join('/');
      }
    }

    function startDrag(event) {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (event.target && event.target.closest && event.target.closest('.window-control')) {
        return;
      }
      if (!state.open || state.minimized || state.maximized) {
        return;
      }

      const bounds = ensureBounds();
      state.drag = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: bounds.left,
        top: bounds.top,
      };
      setElementState(elements.blogWindow, 'is-dragging', true);

      document.addEventListener('pointermove', handleDragMove);
      document.addEventListener('pointerup', stopDrag, { once: true });
    }

    function handleDragMove(event) {
      if (!state.drag) {
        return;
      }

      moveWindowTo(
        state.drag.left + event.clientX - state.drag.pointerX,
        state.drag.top + event.clientY - state.drag.pointerY
      );
    }

    function stopDrag() {
      state.drag = null;
      setElementState(elements.blogWindow, 'is-dragging', false);
      if (document.removeEventListener) {
        document.removeEventListener('pointermove', handleDragMove);
      }
    }

    function startResize(event, edge) {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (!state.open || state.minimized || state.maximized) {
        return;
      }

      if (event.preventDefault) {
        event.preventDefault();
      }
      if (event.stopPropagation) {
        event.stopPropagation();
      }
      if (event.pointerId !== undefined && event.currentTarget && event.currentTarget.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      state.resize = {
        edge,
        pointerX: event.clientX,
        pointerY: event.clientY,
        bounds: Object.assign({}, ensureBounds()),
      };
      setElementState(elements.blogWindow, 'is-resizing', true);

      document.addEventListener('pointermove', handleResizeMove);
      document.addEventListener('pointerup', stopResize, { once: true });
    }

    function handleResizeMove(event) {
      if (!state.resize) {
        return;
      }

      resizeWindowFromEdge(
        state.resize.edge,
        event.clientX - state.resize.pointerX,
        event.clientY - state.resize.pointerY
      );
    }

    function stopResize() {
      state.resize = null;
      setElementState(elements.blogWindow, 'is-resizing', false);
      if (document.removeEventListener) {
        document.removeEventListener('pointermove', handleResizeMove);
      }
    }

    function bindEvents() {
      state.iconDrag = createDesktopIconDrag({
        document,
        surface: elements.desktopSurface,
        viewport,
      });
      state.iconDrag.registerIcon(elements.blogDesktopIcon, {
        onDragStart: function () {
          selectDesktopIcon(true);
          closeStartMenu();
        },
      });

      elements.blogDesktopIcon.addEventListener('click', function (event) {
        if (event.stopPropagation) {
          event.stopPropagation();
        }
        selectDesktopIcon(true);
        closeStartMenu();
      });
      elements.blogDesktopIcon.addEventListener('dblclick', function (event) {
        if (event.stopPropagation) {
          event.stopPropagation();
        }
        openBlogWindow();
      });
      elements.blogDesktopIcon.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          openBlogWindow();
        }
      });

      elements.startButton.addEventListener('click', function (event) {
        if (event.stopPropagation) {
          event.stopPropagation();
        }
        toggleStartMenu();
      });
      elements.startBlogButton.addEventListener('click', openBlogWindow);
      elements.blogTaskbarButton.addEventListener('click', toggleBlogFromTaskbar);
      elements.windowMinimize.addEventListener('click', minimizeBlogWindow);
      elements.windowMaximize.addEventListener('click', toggleMaximizeBlogWindow);
      elements.windowClose.addEventListener('click', closeBlogWindow);
      elements.blogTitlebar.addEventListener('pointerdown', startDrag);
      elements.blogTitlebar.addEventListener('dblclick', toggleMaximizeBlogWindow);
      elements.resizeHandles.forEach(function (handle) {
        if (!handle) {
          return;
        }

        handle.addEventListener('pointerdown', function (event) {
          startResize(event, handle.dataset.resizeEdge);
        });
      });
      elements.desktopSurface.addEventListener('click', function (event) {
        if (event.target === elements.desktopSurface) {
          selectDesktopIcon(false);
          closeStartMenu();
        }
      });
      elements.desktopShell.addEventListener('click', function (event) {
        const target = event.target;
        const insideStartMenu = elements.startMenu.contains(target);
        const startClicked = elements.startButton.contains(target);
        if (!insideStartMenu && !startClicked) {
          closeStartMenu();
        }
      });
      window.addEventListener('resize', function () {
        if (!state.maximized) {
          ensureBounds();
          applyWindowBounds();
        }
      });
    }

    function init() {
      if (state.initialized) {
        return;
      }

      state.initialized = true;
      ensureBounds();
      updateClock();
      updateBlogWindowState();
      bindEvents();
      window.setInterval(updateClock, 30000);
    }

    return {
      init,
      openBlogWindow,
      minimizeBlogWindow,
      restoreBlogWindow,
      closeBlogWindow,
      toggleBlogFromTaskbar,
      toggleMaximizeBlogWindow,
      toggleStartMenu,
      closeStartMenu,
      selectDesktopIcon,
      moveWindowTo,
      resizeWindowFromEdge,
      updateClock,
      getIconDragController: function () {
        return state.iconDrag;
      },
      getState: function () {
        return Object.assign({}, state);
      },
    };
  }

  function initDesktop() {
    const elements = readElements(document);
    if (!elements.desktopShell) {
      return;
    }

    window.homeDesktop = createDesktopController(elements);
    window.homeDesktop.init();
  }

  window.HomeDesktop = {
    createDesktopIconDrag,
    createDesktopController,
    readElements,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktop, { once: true });
  } else {
    initDesktop();
  }
}());
