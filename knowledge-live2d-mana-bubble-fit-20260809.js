(function () {
  'use strict';

  const shell = document.getElementById('elegantShell');
  if (!shell) return;

  const LIBRARY_SRC = 'assets/vendor/l2d-widget/index.min.js?v=0.1.1';
  const MODEL_ROOT = 'assets/live2d/mana-chibi/';
  const MOBILE_VIEWPORT = window.matchMedia('(max-width: 720px)');
  let widget = null;
  let widgetLanguage = null;
  let statusElement = null;
  let destroying = null;
  let libraryPromise = null;
  let syncQueue = Promise.resolve();

  function isKnowledgeSiteVisible() {
    return shell.getAttribute('aria-hidden') !== 'true';
  }

  function getLanguage() {
    return shell.dataset.language === 'zh' ? 'zh' : 'en';
  }

  function getCopy(language) {
    if (language === 'zh') {
      return {
        rest: '休息中',
        sleep: '让模型休息',
        welcome: ['你好，欢迎来到我的知识站。'],
        messages: ['你在做什么？', '今天想看些什么？', '学习累了就休息一下吧。'],
      };
    }

    return {
      rest: 'Resting',
      sleep: 'Let the model rest',
      welcome: ['Hello, welcome to my knowledge site.'],
      messages: ['What are you doing?', 'What would you like to read?', 'Take a short break when you need one.'],
    };
  }

  function getModelPath() {
    if (MOBILE_VIEWPORT.matches) {
      return MODEL_ROOT + 'Mana_chan_Chibi.mobile.model3.json';
    }

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const maxTextureSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0;
    const loseContext = gl && gl.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();

    return MODEL_ROOT + (
      maxTextureSize >= 8192
        ? 'Mana_chan_Chibi.model3.json'
        : 'Mana_chan_Chibi.mobile.model3.json'
    );
  }

  function loadLibrary() {
    if (window.L2D_WIDGET && typeof window.L2D_WIDGET.createWidget === 'function') {
      return Promise.resolve(window.L2D_WIDGET);
    }
    if (libraryPromise) return libraryPromise;

    libraryPromise = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = LIBRARY_SRC;
      script.async = true;
      script.onload = function () {
        if (window.L2D_WIDGET && typeof window.L2D_WIDGET.createWidget === 'function') {
          resolve(window.L2D_WIDGET);
          return;
        }
        reject(new Error('Live2D widget API was not exposed'));
      };
      script.onerror = function () {
        reject(new Error('Live2D widget library failed to load'));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      libraryPromise = null;
      throw error;
    });

    return libraryPromise;
  }

  async function destroyWidget() {
    if (!widget) return;
    const currentWidget = widget;
    widget = null;
    widgetLanguage = null;
    statusElement = null;

    try {
      destroying = currentWidget.destroy();
      await destroying;
    } catch (error) {
      console.error('Live2D widget cleanup failed:', error);
    } finally {
      destroying = null;
    }
  }

  async function showWidget() {
    if (!isKnowledgeSiteVisible() || widget) return;
    if (destroying) await destroying;
    if (!isKnowledgeSiteVisible() || widget) return;

    let api;
    try {
      api = await loadLibrary();
    } catch (error) {
      console.error('Live2D widget library is unavailable:', error);
      return;
    }
    if (!isKnowledgeSiteVisible() || widget) return;

    const language = getLanguage();
    const copy = getCopy(language);
    const bodyChildren = new Set(document.body.children);

    widget = api.createWidget({
      model: {
        path: getModelPath(),
        scale: 1,
        volume: 0,
        tips: {
          welcomeMessage: copy.welcome,
          messages: copy.messages,
          duration: 4200,
          interval: 12000,
          style: {
            fontFamily: 'Microsoft YaHei UI, PingFang SC, Segoe UI, sans-serif',
            fontSize: MOBILE_VIEWPORT.matches ? '12px' : '13px',
            fontWeight: '600',
            lineHeight: '1.55',
            letterSpacing: '0',
            padding: '10px 16px',
            borderRadius: '10px',
            boxShadow: '0 6px 18px rgba(79, 28, 53, 0.24)',
            boxSizing: 'border-box',
            width: 'max-content',
            maxWidth: MOBILE_VIEWPORT.matches ? '170px' : '230px',
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
          },
        },
      },
      position: 'bottom-left',
      size: MOBILE_VIEWPORT.matches ? 180 : 300,
      primaryColor: 'rgba(224, 83, 142, 0.94)',
      transitionDuration: 900,
      transitionType: 'slide',
      menus: {
        align: 'right',
        items: [
          {
            icon: 'mdi:bed',
            label: copy.sleep,
            onClick: function (currentWidget) {
              currentWidget.sleep();
              if (statusElement) {
                const statusText = statusElement.querySelector('span');
                if (statusText) statusText.textContent = copy.rest;
              }
            },
          },
        ],
      },
    });
    widgetLanguage = language;

    const newBodyChildren = Array.from(document.body.children).filter(function (element) {
      return !bodyChildren.has(element);
    });
    statusElement = newBodyChildren.find(function (element) {
      return !element.querySelector('canvas');
    }) || null;

    // Hide the library's loading tab. Once loaded, restore the same element so
    // it remains available as the wake control after the model goes to sleep.
    if (statusElement) statusElement.style.visibility = 'hidden';
    const currentWidget = widget;
    currentWidget.l2d.on('loaded', function () {
      if (widget !== currentWidget) return;
      if (statusElement) statusElement.style.visibility = 'visible';
    });

    if (!isKnowledgeSiteVisible()) await destroyWidget();
  }

  async function syncWidget() {
    if (!isKnowledgeSiteVisible()) {
      await destroyWidget();
      return;
    }

    if (widget && widgetLanguage !== getLanguage()) {
      await destroyWidget();
    }
    await showWidget();
  }

  function scheduleSync() {
    syncQueue = syncQueue.then(syncWidget).catch(function (error) {
      console.error('Live2D widget synchronization failed:', error);
    });
  }

  new MutationObserver(scheduleSync).observe(shell, {
    attributes: true,
    attributeFilter: ['aria-hidden', 'data-language'],
  });

  window.addEventListener('pagehide', function () {
    void destroyWidget();
  });

  scheduleSync();
}());
