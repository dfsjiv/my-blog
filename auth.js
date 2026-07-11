(function () {
  const API_BASE_URL = 'https://blog-api.lilinzheng200811.workers.dev';
  const TOKEN_KEY = 'blogAuthSessionToken';
  const USER_KEY = 'blogAuthUser';
  const EXPIRES_KEY = 'blogAuthExpiresAt';
  const ACCOUNT_ROLES = new Set(['admin', 'user']);

  class AuthError extends Error {
    constructor(code, message, status) {
      super(message);
      this.name = 'AuthError';
      this.code = code;
      this.status = status || 0;
    }
  }

  function getSessionStorage() {
    try {
      return window.sessionStorage || null;
    } catch (error) {
      return null;
    }
  }

  function createAuthManager(options) {
    const settings = options || {};
    const fetchImpl = settings.fetch || (window.fetch ? window.fetch.bind(window) : null);
    const storage = Object.prototype.hasOwnProperty.call(settings, 'storage')
      ? settings.storage
      : getSessionStorage();
    const state = {
      user: null,
      token: null,
      expiresAt: null,
      isAuthenticated: false,
    };

    function readStorage(key) {
      if (!storage) return null;
      try {
        return storage.getItem(key);
      } catch (error) {
        return null;
      }
    }

    function writeStorage(key, value) {
      if (!storage) return;
      try {
        storage.setItem(key, value);
      } catch (error) {
        // Authentication still works for the current page if sessionStorage is unavailable.
      }
    }

    function removeStorage(key) {
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch (error) {
        // Local logout must continue even when browser storage is unavailable.
      }
    }

    function clearStoredSession() {
      removeStorage(TOKEN_KEY);
      removeStorage(USER_KEY);
      removeStorage(EXPIRES_KEY);
    }

    function clearState() {
      state.user = null;
      state.token = null;
      state.expiresAt = null;
      state.isAuthenticated = false;
      clearStoredSession();
    }

    function normalizeAccountUser(user) {
      if (!user || typeof user !== 'object') return null;
      if (typeof user.username !== 'string' || !user.username.trim()) return null;
      if (!ACCOUNT_ROLES.has(user.role)) return null;

      return {
        id: user.id,
        username: user.username,
        role: user.role,
      };
    }

    function saveAccountSession(token, user, expiresAt) {
      state.token = token;
      state.user = user;
      state.expiresAt = typeof expiresAt === 'string' ? expiresAt : null;
      state.isAuthenticated = true;

      writeStorage(TOKEN_KEY, token);
      writeStorage(USER_KEY, JSON.stringify(user));
      writeStorage(EXPIRES_KEY, state.expiresAt || '');
    }

    async function apiRequest(path, requestOptions) {
      if (!fetchImpl) {
        throw new AuthError('network', '无法连接服务器，请稍后重试');
      }

      const options = requestOptions || {};
      const headers = Object.assign({}, options.headers || {});
      const fetchOptions = {
        method: options.method || 'GET',
        headers,
      };

      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(options.body);
      }
      if (options.token) {
        headers.Authorization = 'Bearer ' + options.token;
      }

      let response;
      try {
        response = await fetchImpl(API_BASE_URL + path, fetchOptions);
      } catch (error) {
        throw new AuthError('network', '无法连接服务器，请稍后重试');
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new AuthError('invalid_response', '服务器返回了无法识别的数据', response.status);
      }

      if (!response.ok || !data || data.success === false) {
        throw new AuthError('api_error', '请求失败', response.status);
      }

      return data;
    }

    async function login(username, password) {
      const normalizedUsername = typeof username === 'string' ? username.trim() : '';
      if (!normalizedUsername) {
        throw new AuthError('username_required', '用户名不能为空');
      }
      if (!password) {
        throw new AuthError('password_required', '密码不能为空');
      }

      let data;
      try {
        data = await apiRequest('/api/login', {
          method: 'POST',
          body: { username: normalizedUsername, password },
        });
      } catch (error) {
        if (error.code === 'network') throw error;
        if (error.code === 'invalid_response') throw error;
        if (error.status >= 500) {
          throw new AuthError('server_error', '无法连接服务器，请稍后重试', error.status);
        }
        throw new AuthError('invalid_credentials', '用户名或密码错误', error.status);
      }

      const user = normalizeAccountUser(data.user);
      if (!user || typeof data.sessionToken !== 'string' || !data.sessionToken) {
        throw new AuthError('invalid_response', '服务器返回了无法识别的数据');
      }

      saveAccountSession(data.sessionToken, user, data.expiresAt);
      return user;
    }

    function enterAsGuest() {
      clearStoredSession();
      state.user = { username: 'Guest', role: 'guest' };
      state.token = null;
      state.expiresAt = null;
      state.isAuthenticated = true;
      return state.user;
    }

    function hasStoredToken() {
      const token = readStorage(TOKEN_KEY);
      return typeof token === 'string' && token.length > 0;
    }

    async function restoreSession() {
      const token = readStorage(TOKEN_KEY);
      if (!token) {
        clearState();
        return { success: false, reason: 'no_session' };
      }

      try {
        const data = await apiRequest('/api/me', { token });
        const user = normalizeAccountUser(data.user);
        if (!user) {
          throw new AuthError('invalid_response', '服务器返回了无法识别的数据');
        }
        saveAccountSession(token, user, data.expiresAt);
        return { success: true, user };
      } catch (error) {
        clearState();
        return {
          success: false,
          reason: error.status === 401 || error.status === 403 ? 'expired' : 'unavailable',
        };
      }
    }

    async function logout() {
      const token = state.token || readStorage(TOKEN_KEY);
      const shouldNotifyServer = Boolean(token && state.user && state.user.role !== 'guest');

      try {
        if (shouldNotifyServer) {
          await apiRequest('/api/logout', { method: 'POST', token });
        }
      } catch (error) {
        // Server logout is best-effort; local logout must always complete.
      } finally {
        clearState();
      }
    }

    function getCurrentUser() {
      return state.user;
    }

    function getRole() {
      return state.user ? state.user.role : null;
    }

    return {
      state,
      apiRequest,
      login,
      enterAsGuest,
      restoreSession,
      logout,
      hasStoredToken,
      getCurrentUser,
      getRole,
      isAdmin: function () { return getRole() === 'admin'; },
      isUser: function () { return getRole() === 'user'; },
      isGuest: function () { return getRole() === 'guest'; },
    };
  }

  function initAuthUi() {
    const elements = {
      loginScreen: document.getElementById('loginScreen'),
      loginForm: document.getElementById('loginForm'),
      username: document.getElementById('loginUsername'),
      password: document.getElementById('loginPassword'),
      loginButton: document.getElementById('loginButton'),
      guestButton: document.getElementById('guestButton'),
      loginMessage: document.getElementById('loginMessage'),
      desktopShell: document.getElementById('desktopShell'),
      startUserName: document.getElementById('startUserName'),
      startUserRole: document.getElementById('startUserRole'),
      logoutButton: document.getElementById('logoutButton'),
    };
    if (!elements.loginForm || !elements.desktopShell) return;

    const auth = createAuthManager();
    let loginPending = false;
    window.authState = auth.state;
    window.authManager = auth;

    function setMessage(message, isStatus) {
      elements.loginMessage.textContent = message || '';
      elements.loginMessage.classList.toggle('is-status', Boolean(isStatus));
    }

    function setLoginPending(pending, message) {
      loginPending = pending;
      elements.username.disabled = pending;
      elements.password.disabled = pending;
      elements.loginButton.disabled = pending;
      elements.guestButton.disabled = pending;
      elements.loginButton.textContent = pending ? '正在登录...' : '登录';
      setMessage(message || '', pending);
    }

    function resetDesktopUi() {
      if (!window.homeDesktop) return;
      window.homeDesktop.closeBlogWindow();
      window.homeDesktop.closeStartMenu();
      window.homeDesktop.selectDesktopIcon(false);
    }

    function showLogin(message) {
      document.body.classList.remove('auth-pending', 'auth-desktop');
      document.body.classList.add('auth-login');
      elements.desktopShell.setAttribute('aria-hidden', 'true');
      elements.loginScreen.removeAttribute('aria-hidden');
      elements.password.value = '';
      setLoginPending(false, '');
      setMessage(message || '', false);
      elements.username.focus();
    }

    function showDesktop(user) {
      const roleLabel = user.role === 'admin'
        ? 'Administrator'
        : (user.role === 'user' ? '普通用户' : '游客模式');
      elements.startUserName.textContent = user.username;
      elements.startUserRole.textContent = roleLabel;
      document.body.classList.remove('auth-pending', 'auth-login');
      document.body.classList.add('auth-desktop');
      elements.desktopShell.setAttribute('aria-hidden', 'false');
      elements.loginScreen.setAttribute('aria-hidden', 'true');
      elements.password.value = '';
      setLoginPending(false, '');
    }

    elements.loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (loginPending) return;

      const username = elements.username.value.trim();
      const password = elements.password.value;
      if (!username) {
        setMessage('用户名不能为空', false);
        elements.username.focus();
        return;
      }
      if (!password) {
        setMessage('密码不能为空', false);
        elements.password.focus();
        return;
      }

      setLoginPending(true, '正在登录...');
      try {
        const user = await auth.login(username, password);
        showDesktop(user);
      } catch (error) {
        showLogin(error && error.message ? error.message : '无法连接服务器，请稍后重试');
      }
    });

    elements.guestButton.addEventListener('click', function () {
      if (loginPending) return;
      showDesktop(auth.enterAsGuest());
    });

    elements.logoutButton.addEventListener('click', async function () {
      elements.logoutButton.disabled = true;
      try {
        await auth.logout();
      } finally {
        resetDesktopUi();
        elements.logoutButton.disabled = false;
        showLogin('');
      }
    });

    (async function restoreOnStartup() {
      const hadToken = auth.hasStoredToken();
      if (!hadToken) {
        showLogin('');
        return;
      }

      setLoginPending(true, '正在验证登录状态...');
      const result = await auth.restoreSession();
      if (result.success) {
        showDesktop(result.user);
      } else {
        showLogin(result.reason === 'expired'
          ? '登录状态已失效，请重新登录'
          : '无法连接服务器，请稍后重试');
      }
    }());
  }

  window.BlogAuth = {
    API_BASE_URL,
    AuthError,
    createAuthManager,
    initAuthUi,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthUi, { once: true });
  } else {
    initAuthUi();
  }
}());
