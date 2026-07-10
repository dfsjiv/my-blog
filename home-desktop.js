(function () {
  const TASKBAR_HEIGHT = 40;
  const MIN_WINDOW_WIDTH = 320;
  const MIN_WINDOW_HEIGHT = 220;
  const BLOG_URL = 'blog.html';

  function padTime(value) {
    return String(value).padStart(2, '0');
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
      clockTime: doc.getElementById('clockTime'),
      clockDate: doc.getElementById('clockDate'),
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

    function bindEvents() {
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
      updateClock,
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
    createDesktopController,
    readElements,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktop, { once: true });
  } else {
    initDesktop();
  }
}());
