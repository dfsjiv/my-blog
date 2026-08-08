(function () {
  'use strict';

  const shell = document.getElementById('elegantShell');
  if (!shell) return;

  const LIBRARY_SRC = 'assets/vendor/l2d-widget/index.min.js?v=0.1.1';
  let widget = null;
  let destroying = null;
  let libraryPromise = null;

  function isKnowledgeSiteVisible() {
    return shell.getAttribute('aria-hidden') !== 'true';
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

    widget = api.createWidget({
      model: {
        path: 'https://model.hacxy.cn/cat-black/model.json',
        scale: 1,
        volume: 0,
        tips: false,
      },
      position: 'bottom-left',
      size: window.matchMedia('(max-width: 720px)').matches ? 220 : 300,
      primaryColor: 'rgba(70, 132, 203, 0.92)',
      transitionDuration: 500,
      transitionType: 'fade',
      menus: {
        align: 'right',
        items: [
          {
            icon: 'mdi:chevron-down',
            label: '收起模型',
            onClick: function (currentWidget) {
              currentWidget.sleep();
            },
          },
        ],
      },
    });

    if (!isKnowledgeSiteVisible()) await destroyWidget();
  }

  function syncWidget() {
    if (isKnowledgeSiteVisible()) {
      void showWidget();
    } else {
      void destroyWidget();
    }
  }

  new MutationObserver(syncWidget).observe(shell, {
    attributes: true,
    attributeFilter: ['aria-hidden'],
  });

  window.addEventListener('pagehide', function () {
    void destroyWidget();
  });

  syncWidget();
}());
