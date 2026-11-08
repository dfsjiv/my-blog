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
    nightPanel: document.getElementById('cityWorldNightPanel'),
    nightReset: document.getElementById('cityWorldNightReset'),
    rainPanel: document.getElementById('cityWorldRainPanel'),
    rainReset: document.getElementById('cityWorldRainReset'),
    rainSummary: document.getElementById('cityWorldRainSummary'),
    wetPanel: document.getElementById('cityWorldWetPanel'),
    wetReset: document.getElementById('cityWorldWetReset'),
    wetSummary: document.getElementById('cityWorldWetSummary'),
    wetInspectorPanel: document.getElementById('cityWorldWetInspectorPanel'),
    wetCandidates: document.getElementById('cityWorldWetCandidates'),
    wetAutoSelect: document.getElementById('cityWorldWetAutoSelect'),
    wetClearSelection: document.getElementById('cityWorldWetClearSelection'),
    wetSaveSelection: document.getElementById('cityWorldWetSaveSelection'),
    wetRestoreSelection: document.getElementById('cityWorldWetRestoreSelection'),
    panelExit: document.getElementById('cityWorldPanelExit'),
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
  let nightSettingsSaveTimer = null;
  let rainSettingsSaveTimer = null;
  let wetSettingsSaveTimer = null;
  let debugPanelInteraction = false;
  let ignoreEscapeUntil = 0;

  const nightControls = Array.from(document.querySelectorAll('[data-night-setting]'));
  const nightOutputs = new Map(Array.from(document.querySelectorAll('[data-night-output]')).map(
    (output) => [output.dataset.nightOutput, output],
  ));
  const rainControls = Array.from(document.querySelectorAll('[data-rain-setting]'));
  const rainOutputs = new Map(Array.from(document.querySelectorAll('[data-rain-output]')).map(
    (output) => [output.dataset.rainOutput, output],
  ));
  const wetControls = Array.from(document.querySelectorAll('[data-wet-setting]'));
  const wetOutputs = new Map(Array.from(document.querySelectorAll('[data-wet-output]')).map(
    (output) => [output.dataset.wetOutput, output],
  ));

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
    const clipping = stats.cameraClipping || {};
    const modelSize = stats.bounds?.size || {};
    const materialAudit = stats.materialAudit || {};
    const rain = stats.rainRendering || {};
    const wet = stats.wetSurfaceRendering || {};
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
      `Clipping: ${Number(clipping.near || 0).toFixed(3)} / ${Number(clipping.far || 0).toFixed(1)}`,
      `Model Size: ${(modelSize.x || 0).toFixed(1)}, ${(modelSize.y || 0).toFixed(1)}, ${(modelSize.z || 0).toFixed(1)}`,
      `Model Diagonal: ${(stats.bounds?.diagonal || 0).toFixed(1)}`,
      `Fog Density: ${Number(stats.fogDensity || 0).toExponential(3)}`,
      `Emissive: ${materialAudit.emissive || 0} / ${materialAudit.emissiveEnhanced || 0}`,
      `Materials S/P/B: ${materialAudit.standard || 0} / ${materialAudit.physical || 0} / ${materialAudit.basic || 0}`,
      `Maps R/N/M: ${materialAudit.roughnessMap || 0} / ${materialAudit.normalMap || 0} / ${materialAudit.metalnessMap || 0}`,
      `Rain: ${rain.dropCount || 0} / ${rain.maximumDropCount || 0}`,
      `Rain Draw Calls: ${rain.drawCalls || 0}`,
      `Wet Surfaces: ${wet.selectedSurfaceCount || 0} / ${wet.candidateCount || 0}`,
      `Wet Materials: ${wet.clonedMaterialCount || 0}`,
    ].join('\n');
    updateRainSummary(rain);
    updateWetSummary(wet);
  }

  function syncNightControls(settings) {
    if (!settings) return;
    nightControls.forEach((control) => {
      const key = control.dataset.nightSetting;
      if (!(key in settings)) return;
      if (control.type === 'checkbox') control.checked = Boolean(settings[key]);
      else control.value = settings[key];
      const output = nightOutputs.get(key);
      if (output) output.value = Number(settings[key]).toFixed(2);
    });
  }

  function applyNightControl(control, persist) {
    if (!world?.initialized) return;
    const key = control.dataset.nightSetting;
    const value = control.type === 'checkbox' ? control.checked : control.value;
    const state = world.updateNightSettings({ [key]: value }, persist);
    syncNightControls(state);
  }

  function scheduleNightSettingsSave() {
    window.clearTimeout(nightSettingsSaveTimer);
    nightSettingsSaveTimer = window.setTimeout(() => {
      nightSettingsSaveTimer = null;
      if (world?.initialized) world.updateNightSettings({}, true);
    }, 180);
  }

  function syncRainControls(settings) {
    if (!settings) return;
    rainControls.forEach((control) => {
      const key = control.dataset.rainSetting;
      if (!(key in settings)) return;
      if (control.type === 'checkbox') control.checked = Boolean(settings[key]);
      else control.value = settings[key];
      const output = rainOutputs.get(key);
      if (output) output.value = Number(settings[key]).toFixed(key.startsWith('volume') ? 0 : 2);
    });
    updateRainSummary(settings);
  }

  function updateRainSummary(settings) {
    if (!elements.rainSummary || !settings) return;
    elements.rainSummary.value = [
      `雨滴：${settings.dropCount} / ${settings.maximumDropCount}`,
      `绘制调用：${settings.drawCalls}`,
      `质量档位：${settings.qualityPreset}`,
    ].join('\n');
  }

  function applyRainControl(control, persist) {
    if (!world?.initialized) return;
    const key = control.dataset.rainSetting;
    const value = control.type === 'checkbox' ? control.checked : control.value;
    syncRainControls(world.updateRainSettings({ [key]: value }, persist));
  }

  function scheduleRainSettingsSave() {
    window.clearTimeout(rainSettingsSaveTimer);
    rainSettingsSaveTimer = window.setTimeout(() => {
      rainSettingsSaveTimer = null;
      if (world?.initialized) world.updateRainSettings({}, true);
    }, 180);
  }

  function syncWetControls(settings) {
    if (!settings) return;
    wetControls.forEach((control) => {
      const key = control.dataset.wetSetting;
      if (!(key in settings)) return;
      if (control.type === 'checkbox') control.checked = Boolean(settings[key]);
      else control.value = settings[key];
      const output = wetOutputs.get(key);
      if (output) output.value = Number(settings[key]).toFixed(2);
    });
    updateWetSummary(settings);
  }

  function updateWetSummary(settings) {
    if (!elements.wetSummary || !settings) return;
    elements.wetSummary.value = [
      `有效湿润度：${Number(settings.effectiveWetness || 0).toFixed(2)}`,
      `已选表面：${settings.selectedSurfaceCount || 0} / ${settings.candidateCount || 0}`,
      `克隆材质：${settings.clonedMaterialCount || 0}`,
      `Physical / Standard：${settings.physicalMaterialCount || 0} / ${settings.standardMaterialCount || 0}`,
      `湿润 Shader 类型：${settings.wetShaderPrograms || 0}`,
      `共享材质候选：${settings.sharedMaterialConflicts || 0}`,
      `湿润绘制调用差值：${settings.wetDrawCallDifference || 0}`,
    ].join('\n');
  }

  function applyWetControl(control, persist) {
    if (!world?.initialized) return;
    const key = control.dataset.wetSetting;
    const value = control.type === 'checkbox' ? control.checked : control.value;
    syncWetControls(world.updateWetSurfaceSettings({ [key]: value }, persist));
  }

  function scheduleWetSettingsSave() {
    window.clearTimeout(wetSettingsSaveTimer);
    wetSettingsSaveTimer = window.setTimeout(() => {
      wetSettingsSaveTimer = null;
      if (world?.initialized) world.updateWetSurfaceSettings({}, true);
    }, 180);
  }

  function renderWetCandidates() {
    if (!elements.wetCandidates || !world?.initialized) return;
    const candidates = world.getWetSurfaceCandidates();
    const fragment = document.createDocumentFragment();

    if (candidates.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'city-world-wet-empty';
      empty.textContent = '没有检测到符合条件的道路或地面候选。';
      fragment.append(empty);
    }

    candidates.forEach((candidate) => {
      const item = document.createElement('article');
      item.className = 'city-world-wet-candidate';
      item.classList.toggle('is-selected', candidate.selected);

      const title = document.createElement('label');
      title.className = 'city-world-wet-candidate-title';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = candidate.selected;
      checkbox.setAttribute('aria-label', `将 ${candidate.meshName} 作为湿润表面`);
      const name = document.createElement('span');
      name.textContent = candidate.meshName;
      name.title = candidate.path;
      const score = document.createElement('output');
      score.value = `评分 ${candidate.score}`;
      title.append(checkbox, name, score);

      const info = document.createElement('p');
      info.className = 'city-world-wet-candidate-info';
      info.textContent = [
        `材质：${candidate.materialName} (${candidate.materialType})`,
        `底部高度：${candidate.relativeBottom.toFixed(2)}  XZ面积：${candidate.xzArea.toFixed(1)}`,
        `包围盒：${candidate.bounds.min.map((value) => value.toFixed(1)).join(', ')} → ${candidate.bounds.max.map((value) => value.toFixed(1)).join(', ')}`,
        `水平面：${Math.round(candidate.horizontalRatio * 100)}%  粗糙度：${Number(candidate.roughness).toFixed(2)}  金属度：${Number(candidate.metalness).toFixed(2)}`,
        `贴图：粗糙度 ${candidate.hasRoughnessMap ? '有' : '无'} / 法线 ${candidate.hasNormalMap ? '有' : '无'}  共享材质：${candidate.sharedMaterial ? '是' : '否'}`,
        `依据：${candidate.reasons.join('、')}`,
        `路径：${candidate.path}`,
      ].join('\n');

      const actions = document.createElement('div');
      actions.className = 'city-world-wet-candidate-actions';
      const focusButton = document.createElement('button');
      focusButton.type = 'button';
      focusButton.textContent = '定位查看';
      const highlightButton = document.createElement('button');
      highlightButton.type = 'button';
      highlightButton.textContent = world.getWetSurfaceState()?.highlightedPath === candidate.path
        ? '取消高亮'
        : '临时高亮';
      actions.append(focusButton, highlightButton);

      checkbox.addEventListener('change', () => {
        world.selectWetSurface(candidate.path, checkbox.checked, false);
        syncWetControls(world.getWetSurfaceState());
        scheduleWetSettingsSave();
        renderWetCandidates();
      });
      focusButton.addEventListener('click', () => world.focusWetSurface(candidate.path));
      highlightButton.addEventListener('click', () => {
        world.highlightWetSurface(candidate.path);
        renderWetCandidates();
      });

      item.append(title, info, actions);
      fragment.append(item);
    });

    elements.wetCandidates.replaceChildren(fragment);
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
      return world.init().then((initializedWorld) => {
        syncNightControls(initializedWorld.getNightRenderingState());
        syncRainControls(initializedWorld.getRainRenderingState());
        syncWetControls(initializedWorld.getWetSurfaceState());
        renderWetCandidates();
        return initializedWorld;
      });
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
    debugPanelInteraction = false;
    ignoreEscapeUntil = 0;
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
      debugPanelInteraction = false;
      return;
    }

    if (pointerLockWasOwned) {
      pointerLockWasOwned = false;
      if (!isExiting && isOverlayOpen) {
        debugPanelInteraction = true;
        ignoreEscapeUntil = performance.now() + 400;
        elements.nightPanel?.setAttribute('open', '');
      }
    }
  }

  function handleEscape(event) {
    if (event.key === 'F2' && isOverlayOpen && !isExiting) {
      event.preventDefault();
      debugPanelInteraction = true;
      pointerLockWasOwned = false;
      if (document.pointerLockElement === elements.canvas) document.exitPointerLock();
      elements.nightPanel?.setAttribute('open', '');
      elements.nightPanel?.querySelector('input')?.focus();
      return;
    }
    if (event.key !== 'Escape' || !isOverlayOpen || isExiting) return;
    if (performance.now() < ignoreEscapeUntil) {
      event.preventDefault();
      return;
    }
    if (!debugPanelInteraction || pointerLockWasOwned || document.pointerLockElement === elements.canvas) {
      debugPanelInteraction = true;
      pointerLockWasOwned = false;
      ignoreEscapeUntil = performance.now() + 400;
      if (document.pointerLockElement === elements.canvas) document.exitPointerLock();
      elements.nightPanel?.setAttribute('open', '');
      return;
    }
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
  elements.panelExit?.addEventListener('click', exitCityWorld);
  elements.canvas.addEventListener('pointerdown', () => {
    if (!isWorldActive || document.pointerLockElement === elements.canvas) return;
    debugPanelInteraction = false;
    requestWorldPointerLock();
  });
  nightControls.forEach((control) => {
    control.addEventListener('input', () => {
      applyNightControl(control, false);
      scheduleNightSettingsSave();
    });
    control.addEventListener('change', () => applyNightControl(control, true));
  });
  elements.nightReset?.addEventListener('click', () => {
    if (!world?.initialized) return;
    syncNightControls(world.resetNightSettings());
  });
  rainControls.forEach((control) => {
    control.addEventListener('input', () => {
      applyRainControl(control, false);
      scheduleRainSettingsSave();
    });
    control.addEventListener('change', () => applyRainControl(control, true));
  });
  elements.rainReset?.addEventListener('click', () => {
    if (!world?.initialized) return;
    syncRainControls(world.resetRainSettings());
  });
  wetControls.forEach((control) => {
    control.addEventListener('input', () => {
      applyWetControl(control, false);
      scheduleWetSettingsSave();
    });
    control.addEventListener('change', () => applyWetControl(control, true));
  });
  elements.wetReset?.addEventListener('click', () => {
    if (!world?.initialized) return;
    syncWetControls(world.resetWetSurfaceSettings());
    renderWetCandidates();
  });
  elements.wetAutoSelect?.addEventListener('click', () => {
    if (!world?.initialized) return;
    syncWetControls(world.autoSelectWetSurfaces());
    renderWetCandidates();
  });
  elements.wetClearSelection?.addEventListener('click', () => {
    if (!world?.initialized) return;
    syncWetControls(world.clearWetSurfaces());
    renderWetCandidates();
  });
  elements.wetSaveSelection?.addEventListener('click', () => {
    if (!world?.initialized) return;
    syncWetControls(world.saveWetSurfaceSelection());
  });
  elements.wetRestoreSelection?.addEventListener('click', () => {
    if (!world?.initialized) return;
    syncWetControls(world.restoreDefaultWetSurfaces());
    renderWetCandidates();
  });
  document.addEventListener('pointerlockchange', handlePointerLockChange);
  window.addEventListener('keydown', handleEscape, true);
  window.addEventListener('pagehide', () => {
    window.clearTimeout(nightSettingsSaveTimer);
    window.clearTimeout(rainSettingsSaveTimer);
    window.clearTimeout(wetSettingsSaveTimer);
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
