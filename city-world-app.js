(function () {
  const elements = {
    icon: document.getElementById('cityDesktopIcon'),
    desktopShell: document.getElementById('desktopShell'),
    desktopSurface: document.getElementById('desktopSurface'),
    startMenu: document.getElementById('startMenu'),
    overlay: document.getElementById('cityWorldApp'),
    canvas: document.getElementById('cityWorldCanvas'),
    loading: document.getElementById('cityWorldLoading'),
    loadingTitle: document.getElementById('cityWorldLoadingTitle'),
    loadingProgress: document.getElementById('cityWorldLoadingProgress'),
    returnButton: document.getElementById('cityWorldReturn'),
    performanceOutput: document.getElementById('cityWorldPerformanceOutput'),
  };

  if (!elements.icon || !elements.overlay || !elements.canvas) return;

  let world = null;
  let worldPromise = null;
  let uiSnapshot = null;
  let isEntering = false;
  let isExiting = false;
  let isWorldActive = false;
  let isOverlayOpen = false;
  let pointerLockWasOwned = false;
  let iconDragRegistered = false;
  let enterStartedAt = 0;

  function setIconSelected(selected) {
    elements.icon.classList.toggle('is-selected', Boolean(selected));
    elements.icon.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  function captureUiState() {
    const wallpaper = window.gpuParticleWallpaper;
    return {
      bodyHadCityClass: document.body.classList.contains('city-world-active'),
      startMenuOpen: elements.startMenu?.classList.contains('is-open') || false,
      desktopAriaHidden: elements.desktopShell?.getAttribute('aria-hidden'),
      backgroundMode: wallpaper?.currentEffect || null,
      wallpaperWasRunning: Boolean(wallpaper && wallpaper.animationFrameId !== null),
    };
  }

  function suspendDesktop() {
    if (window.homeDesktop) window.homeDesktop.closeStartMenu();
    const wallpaper = window.gpuParticleWallpaper;
    if (wallpaper && typeof wallpaper.stop === 'function') wallpaper.stop();
    document.body.classList.add('city-world-active');
  }

  function restoreDesktop() {
    const snapshot = uiSnapshot;
    if (!snapshot) return;

    document.body.classList.toggle('city-world-active', snapshot.bodyHadCityClass);
    if (elements.desktopShell && snapshot.desktopAriaHidden !== null) {
      elements.desktopShell.setAttribute('aria-hidden', snapshot.desktopAriaHidden);
    }

    const wallpaper = window.gpuParticleWallpaper;
    if (wallpaper) {
      if (snapshot.backgroundMode && wallpaper.currentEffect !== snapshot.backgroundMode) {
        wallpaper.setEffect(snapshot.backgroundMode);
      }
      if (snapshot.wallpaperWasRunning && typeof wallpaper.start === 'function') {
        wallpaper.start();
      } else if (typeof wallpaper.stop === 'function') {
        wallpaper.stop();
      }
    }

    if (snapshot.startMenuOpen && window.homeDesktop) {
      window.homeDesktop.toggleStartMenu();
    }
    uiSnapshot = null;
  }

  function showOverlay() {
    isOverlayOpen = true;
    elements.overlay.classList.remove('is-hidden', 'is-ready', 'is-error');
    elements.overlay.setAttribute('aria-hidden', 'false');
    elements.loadingTitle.textContent = '正在进入城市……';
    elements.loadingProgress.textContent = world?.initialized
      ? '城市资源已就绪'
      : '模型加载中：0%';
    elements.returnButton.classList.add('is-hidden');
  }

  function hideOverlay() {
    isOverlayOpen = false;
    elements.overlay.classList.add('is-hidden');
    elements.overlay.classList.remove('is-ready', 'is-error');
    elements.overlay.setAttribute('aria-hidden', 'true');
  }

  function showLoadFailure(error) {
    console.error('City world failed to load:', error);
    elements.overlay.classList.add('is-error');
    elements.loadingTitle.textContent = '城市加载失败';
    elements.loadingProgress.textContent = '';
    elements.returnButton.classList.remove('is-hidden');
  }

  function requestWorldPointerLock() {
    try {
      const request = elements.canvas.requestPointerLock();
      if (request?.catch) request.catch(() => {});
    } catch (error) {
      // Pointer Lock may be unavailable; CityWorld keeps a mouse-move fallback.
    }
  }

  function renderPerformance(stats) {
    if (!elements.performanceOutput || !isOverlayOpen || !stats) return;
    const camera = stats.cameraPosition || {};
    elements.performanceOutput.textContent = [
      `FPS: ${stats.fps}`,
      `Frame: ${stats.frameTime.toFixed(1)} ms`,
      `Max Frame: ${stats.maxFrameTime.toFixed(1)} ms`,
      `Triangles: ${stats.triangles}`,
      `Draw Calls: ${stats.drawCalls}`,
      `Shader Programs: ${stats.shaderPrograms}`,
      `Geometries: ${stats.geometries}`,
      `Textures: ${stats.textures}`,
      `Pixel Ratio: ${stats.pixelRatio.toFixed(2)}`,
      `Rendering: ${stats.isRendering}`,
      `World Active: ${stats.worldActive}`,
      `Model Loaded: ${stats.modelLoaded}`,
      `Model Loads: ${stats.modelLoadCount}`,
      `Camera: ${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}, ${camera.z.toFixed(1)}`,
    ].join('\n');
  }

  function createWorld() {
    if (worldPromise) return worldPromise;

    worldPromise = import('./city-world.js').then(({ CityWorld }) => {
      world = new CityWorld({
        canvas: elements.canvas,
        initializationStartedAt: enterStartedAt,
        onProgress(progress) {
          if (!isOverlayOpen) return;
          elements.loadingProgress.textContent = progress.percent === null
            ? `模型加载中：${(progress.loaded / 1024 / 1024).toFixed(1)} MB`
            : `模型加载中：${progress.percent}%`;
        },
        onStatus(status) {
          if (!isOverlayOpen) return;
          const stages = {
            'loading-model': '正在加载城市模型……',
            'parsing-model': '正在解析模型……',
            'preparing-textures': '正在准备纹理……',
            'compiling-shaders': '正在编译 Shader……',
            'warming-up': '正在准备首帧……',
            entering: '正在进入城市……',
          };
          if (stages[status]) elements.loadingProgress.textContent = stages[status];
        },
        onStats: renderPerformance,
        onExitRequest: exitCityWorld,
      });
      return world.init();
    }).catch((error) => {
      if (world) world.dispose();
      world = null;
      worldPromise = null;
      throw error;
    });

    return worldPromise;
  }

  async function enterCityWorld() {
    if (isEntering || isWorldActive || isExiting) return;

    isEntering = true;
    enterStartedAt = performance.now();
    uiSnapshot = captureUiState();
    setIconSelected(false);
    showOverlay();
    suspendDesktop();

    // This stays in the original user gesture; waiting for the city model would
    // otherwise lose permission to request Pointer Lock.
    requestWorldPointerLock();

    try {
      await createWorld();
      if (!isEntering || isExiting || !isOverlayOpen) return;
      isEntering = false;
      isWorldActive = true;
      elements.overlay.classList.add('is-ready');
      world.start({ mode: 'walk' });
    } catch (error) {
      isEntering = false;
      isWorldActive = false;
      if (isOverlayOpen) showLoadFailure(error);
    }
  }

  function exitCityWorld() {
    if (isExiting || !isOverlayOpen) return;
    isExiting = true;
    isEntering = false;
    isWorldActive = false;

    if (world) world.stop();
    if (document.pointerLockElement === elements.canvas) {
      document.exitPointerLock();
    }

    pointerLockWasOwned = false;
    hideOverlay();
    restoreDesktop();
    window.setTimeout(() => {
      isExiting = false;
    }, 0);
  }

  function handlePointerLockChange() {
    if (document.pointerLockElement === elements.canvas) {
      pointerLockWasOwned = true;
      return;
    }

    if (pointerLockWasOwned) {
      pointerLockWasOwned = false;
      if (!isExiting && isOverlayOpen) exitCityWorld();
    }
  }

  function handleEscape(event) {
    if (event.key !== 'Escape' || !isOverlayOpen || isExiting) return;
    if (document.pointerLockElement !== elements.canvas) exitCityWorld();
  }

  function registerIconDrag() {
    if (iconDragRegistered || !window.homeDesktop
      || typeof window.homeDesktop.getIconDragController !== 'function') return;
    const iconDrag = window.homeDesktop.getIconDragController();
    if (!iconDrag) return;
    iconDrag.registerIcon(elements.icon, {
      onDragStart() {
        setIconSelected(true);
        window.homeDesktop.closeStartMenu();
      },
    });
    iconDragRegistered = true;
  }

  elements.icon.addEventListener('click', (event) => {
    event.stopPropagation();
    setIconSelected(true);
    if (window.homeDesktop) window.homeDesktop.closeStartMenu();
  });
  elements.icon.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    enterCityWorld();
  });
  elements.icon.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') enterCityWorld();
  });
  elements.desktopSurface?.addEventListener('click', (event) => {
    if (event.target === elements.desktopSurface) setIconSelected(false);
  });
  elements.returnButton.addEventListener('click', exitCityWorld);
  document.addEventListener('pointerlockchange', handlePointerLockChange);
  window.addEventListener('keydown', handleEscape, true);
  window.addEventListener('pagehide', () => {
    if (world) world.dispose();
  }, { once: true });

  registerIconDrag();
  window.setTimeout(registerIconDrag, 0);

  window.cityWorldApp = {
    enterCityWorld,
    exitCityWorld,
    getState() {
      return {
        isEntering,
        isExiting,
        isWorldActive,
        isOverlayOpen,
        modelLoaded: Boolean(world?.initialized),
        animationRunning: Boolean(world && world.animationFrameId !== null),
        world: world?.getDebugState() || null,
      };
    },
  };
}());
