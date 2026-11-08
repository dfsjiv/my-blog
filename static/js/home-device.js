(function () {
  const MOBILE_MAX_WIDTH = 767;
  const TOUCH_MAX_WIDTH = 1024;
  const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

  function getCurrentWindow() {
    return window;
  }

  function readDeviceContext() {
    const currentWindow = getCurrentWindow();
    const currentNavigator = currentWindow.navigator || {};
    const mediaQuery = currentWindow.matchMedia
      ? currentWindow.matchMedia('(pointer: coarse)')
      : { matches: false };

    return {
      width: currentWindow.innerWidth,
      userAgent: currentNavigator.userAgent || '',
      maxTouchPoints: currentNavigator.maxTouchPoints || 0,
      coarsePointer: Boolean(mediaQuery.matches),
    };
  }

  function getDeviceType(context) {
    const deviceContext = context || readDeviceContext();
    const width = Number(deviceContext.width) || 0;
    const userAgent = deviceContext.userAgent || '';
    const maxTouchPoints = Number(deviceContext.maxTouchPoints) || 0;
    const coarsePointer = Boolean(deviceContext.coarsePointer);

    if (width <= MOBILE_MAX_WIDTH) {
      return 'mobile';
    }

    if (MOBILE_USER_AGENT.test(userAgent)) {
      return 'mobile';
    }

    if (coarsePointer && maxTouchPoints > 0 && width <= TOUCH_MAX_WIDTH) {
      return 'mobile';
    }

    return 'desktop';
  }

  function setDeviceState(type) {
    const root = document.documentElement;
    const body = document.body;

    root.dataset.device = type;
    body.dataset.device = type;
    body.classList.toggle('is-mobile', type === 'mobile');
    body.classList.toggle('is-desktop', type === 'desktop');

    window.homeDevice = {
      type,
      isMobile: type === 'mobile',
      isDesktop: type === 'desktop',
      update: applyDeviceType,
    };
  }

  function applyDeviceType() {
    const type = getDeviceType();
    setDeviceState(type);
    return type;
  }

  window.HomeDevice = {
    getDeviceType,
    applyDeviceType,
  };

  function initDeviceDetection() {
    applyDeviceType();
    window.addEventListener('resize', applyDeviceType);
    window.addEventListener('orientationchange', applyDeviceType);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeviceDetection, { once: true });
  } else {
    initDeviceDetection();
  }
}());
