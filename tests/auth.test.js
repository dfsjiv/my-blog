const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const authPath = path.join(rootDir, 'auth.js');
const bridgePath = path.join(rootDir, 'login-mikutap-bridge.js');
const indexPath = path.join(rootDir, 'index.html');
const source = fs.readFileSync(authPath, 'utf8');
const bridgeSource = fs.readFileSync(bridgePath, 'utf8');

function loadAuthModule() {
  const listeners = {};
  const document = {
    readyState: 'loading',
    addEventListener(eventName, handler) {
      listeners[eventName] = handler;
    },
  };
  const window = { document, setTimeout, clearTimeout };
  const sandbox = {
    window,
    document,
    console,
    Set,
    Error,
    JSON,
    Object,
    AbortController,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: authPath });
  return window.BlogAuth;
}

function createStorage(initial = {}) {
  const values = { ...initial };
  return {
    values,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
    removeItem(key) {
      delete values[key];
    },
  };
}

function response(status, data, jsonError) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (jsonError) throw new Error('not json');
      return data;
    },
  };
}

(async function run() {
  const BlogAuth = loadAuthModule();
  {
    const format = BlogAuth.formatAuthError;
    const cases = [
      ['api_error', '该用户名已存在', 409, /username is already in use/],
      ['api_error', '密码长度需为 8 至 128 位', 400, /8–128 characters/],
      ['api_error', '邀请码无效或已失效', 400, /invalid or expired/],
      ['api_error', '邀请码已被使用或已经失效', 400, /used or expired/],
      ['api_error', '用户名需为 2 至 32 位中文、字母、数字或下划线', 400, /2–32/],
      ['api_error', '尝试次数过多，注册已暂停 2 小时', 429, /Too many attempts/],
      ['network', 'network down', 0, /Network request failed/],
      ['invalid_response', 'parse failure', 403, /Unexpected server response \(HTTP 403\)/],
      ['api_error', 'private database error details', 500, /temporarily unavailable \(HTTP 500\)/],
      ['invalid_credentials', 'username exists', 401, /^Invalid username or password\.$/],
    ];
    for (const [code, message, status, expected] of cases) {
      assert.match(format(new BlogAuth.AuthError(code, message, status), 'register'), expected);
    }
    assert.doesNotMatch(format(new BlogAuth.AuthError('api_error', 'private database error details', 500), 'register'), /private|database/);
    assert.doesNotMatch(format(new Error('sensitive implementation details'), 'register'), /sensitive/);
    assert.match(format(new BlogAuth.AuthError('api_error', '字段校验失败', 422), 'register'), /字段校验失败.*HTTP 422/);
    // Exercise the real request manager with mocked responses: no registration
    // requests, passwords or invitation codes are sent to the live service.
    const manager = BlogAuth.createAuthManager({ storage: createStorage(), fetch: async () => response(409, { success: false, message: '该用户名已存在' }) });
    await assert.rejects(manager.register('test_user', 'test-password', 'test-invitation'), error => {
      assert.match(format(error, 'register'), /username is already in use/);
      return true;
    });
    assert.match(source, /setMessage\(formatAuthError\(error, authMode\), false\)/);
    assert.match(source, /setMessage\(formatAuthError\(error, 'invitation'\), false\)/);
  }
  assert.ok(BlogAuth);
  assert.strictEqual(BlogAuth.TOKEN_KEY, 'blog_session_token');
  assert.strictEqual(typeof BlogAuth.createAuthManager, 'function');

  {
    let fetchCount = 0;
    const auth = BlogAuth.createAuthManager({
      storage: createStorage(),
      fetch: async () => {
        fetchCount += 1;
        return response(500, { success: false });
      },
    });
    await assert.rejects(auth.login('', 'secret'), /用户名不能为空/);
    await assert.rejects(auth.login('dfsjiv', ''), /密码不能为空/);
    assert.strictEqual(fetchCount, 0);
  }

  {
    const storage = createStorage();
    let request;
    const auth = BlogAuth.createAuthManager({
      storage,
      fetch: async (url, options) => {
        request = { url, options };
        return response(200, {
          success: true,
          user: { id: 1, username: 'dfsjiv', role: 'admin' },
          sessionToken: 'admin-token',
          expiresAt: '2026-07-12T00:00:00Z',
        });
      },
    });
    const user = await auth.login(' dfsjiv ', 'top-secret');
    assert.strictEqual(user.role, 'admin');
    assert.strictEqual(auth.isAdmin(), true);
    assert.strictEqual(storage.values.blog_session_token, 'admin-token');
    assert.strictEqual(auth.state.expiresAt, '2026-07-12T00:00:00Z');
    assert.strictEqual(request.url, BlogAuth.API_BASE_URL + '/api/login');
    assert.strictEqual(request.options.headers['Content-Type'], 'application/json');
    assert.deepStrictEqual(JSON.parse(request.options.body), {
      username: 'dfsjiv',
      password: 'top-secret',
    });
    assert.ok(!Object.values(storage.values).some((value) => value.includes('top-secret')));
  }

  {
    const storage = createStorage();
    const requests = [];
    const auth = BlogAuth.createAuthManager({
      storage,
      fetch: async (url, options) => {
        requests.push({ url, options });
        if (url.endsWith('/api/register/invitation')) {
          return response(200, { success: true, valid: true });
        }
        return response(201, {
          success: true,
          user: { id: 3, username: 'new_user', role: 'user' },
          sessionToken: 'register-token',
          expiresAt: '2026-08-26T00:00:00Z',
        });
      },
    });
    await auth.verifyInvitation(' Invite123 ');
    const user = await auth.register(' new_user ', 'register-secret', ' Invite123 ');
    assert.strictEqual(user.role, 'user');
    assert.strictEqual(storage.values.blog_session_token, 'register-token');
    assert.strictEqual(requests[0].url, BlogAuth.API_BASE_URL + '/api/register/invitation');
    assert.deepStrictEqual(JSON.parse(requests[0].options.body), { invitationCode: 'Invite123' });
    assert.strictEqual(requests[1].url, BlogAuth.API_BASE_URL + '/api/register');
    assert.deepStrictEqual(JSON.parse(requests[1].options.body), {
      username: 'new_user',
      password: 'register-secret',
      invitationCode: 'Invite123',
    });
    assert.ok(!Object.values(storage.values).some((value) => value.includes('register-secret')));
  }

  {
    const storage = createStorage();
    const auth = BlogAuth.createAuthManager({
      storage,
      fetch: async () => response(401, { success: false, message: 'invalid' }),
    });
    await assert.rejects(auth.login('dfsjiv', 'wrong-password'), /用户名或密码错误/);
    assert.strictEqual(storage.values.blog_session_token, undefined);
  }

  {
    const storage = createStorage({ blog_session_token: 'user-token' });
    let authorization;
    const auth = BlogAuth.createAuthManager({
      storage,
      fetch: async (url, options) => {
        authorization = options.headers.Authorization;
        return response(200, {
          success: true,
          user: { id: 2, username: 'reader', role: 'user' },
          expiresAt: '2026-07-12T00:00:00Z',
        });
      },
    });
    const result = await auth.restoreSession();
    assert.strictEqual(result.success, true);
    assert.strictEqual(auth.isUser(), true);
    assert.strictEqual(authorization, 'Bearer user-token');
  }

  {
    const storage = createStorage({
      blog_session_token: 'invalid-token',
    });
    const auth = BlogAuth.createAuthManager({
      storage,
      fetch: async () => response(401, { success: false }),
    });
    const result = await auth.restoreSession();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'expired');
    assert.strictEqual(auth.getCurrentUser(), null);
    assert.strictEqual(storage.values.blog_session_token, undefined);
  }

  {
    const storage = createStorage();
    const auth = BlogAuth.createAuthManager({ storage, fetch: async () => response(200, {}) });
    const guest = auth.enterAsGuest();
    assert.strictEqual(guest.id, null);
    assert.strictEqual(guest.username, 'Guest');
    assert.strictEqual(guest.role, 'guest');
    assert.strictEqual(auth.isGuest(), true);
    assert.strictEqual(storage.values.blog_session_token, undefined);
  }

  {
    const storage = createStorage();
    const auth = BlogAuth.createAuthManager({
      storage,
      fetch: async (url) => {
        if (url.endsWith('/api/login')) {
          return response(200, {
            success: true,
            user: { id: 1, username: 'dfsjiv', role: 'admin' },
            sessionToken: 'logout-token',
            expiresAt: '2026-07-12T00:00:00Z',
          });
        }
        throw new Error('network down');
      },
    });
    await auth.login('dfsjiv', 'secret');
    await assert.doesNotReject(auth.logout());
    assert.strictEqual(auth.getCurrentUser(), null);
    assert.strictEqual(storage.values.blog_session_token, undefined);
  }

  {
    const auth = BlogAuth.createAuthManager({
      storage: createStorage(),
      fetch: async () => response(200, null, true),
    });
    await assert.rejects(auth.login('dfsjiv', 'secret'), /无法识别的数据/);
  }

  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  assert.match(indexHtml, /id="loginForm"/);
  assert.match(indexHtml, /id="loginMikutapFrame"/);
  assert.match(indexHtml, /id="guestButton"/);
  assert.match(indexHtml, /id="registerInvitation"/);
  assert.match(indexHtml, /id="registerVerifyButton"/);
  assert.match(indexHtml, /id="loginModeSwitch"/);
  assert.match(indexHtml, /id="elegantShell"/);
  assert.match(indexHtml, /data-knowledge-action="desktop">我的系统/);
  assert.doesNotMatch(indexHtml, /id="versionSelector"/);
  assert.doesNotMatch(indexHtml, /id="elegantVersionSwitch"/);
  assert.match(indexHtml, /id="logoutButton"/);
  assert.match(indexHtml, /body\.auth-pending > \.login-screen,[\s\S]*body\.auth-pending > \.login-mikutap-frame[\s\S]*display:\s*none/);
  assert.match(indexHtml, /<script src="auth\.js\?v=20261027-request-timeout-1"><\/script>/);
  assert.match(indexHtml, /<h1>SIGN IN<\/h1>/);
  assert.match(indexHtml, /placeholder="USERNAME"/);
  assert.match(indexHtml, /placeholder="PASSWORD"/);
  assert.match(indexHtml, /placeholder="INVITATION CODE"/);
  assert.match(indexHtml, /id="knowledgeGuestAuth"[\s\S]*data-auth-mode="login"[\s\S]*data-auth-mode="register"/);
  assert.match(indexHtml, /data-src="assets\/vendor\/mikutap\/background\?auto=1&amp;v=20260807-17"/);
  assert.doesNotMatch(indexHtml, /\ssrc="assets\/vendor\/mikutap\/background\?auto=1/);
  assert.match(indexHtml, /id="loginScreen"[^>]*aria-hidden="true"/);
  assert.match(indexHtml, /<script src="login-mikutap-bridge\.js\?v=20260814-1"><\/script>/);
  assert.match(bridgeSource, /function ensureFrameLoaded/);
  assert.match(bridgeSource, /frame\.setAttribute\('src', frameSource\)/);
  assert.match(indexHtml, /Mikutap by daniwell/);
  assert.doesNotMatch(bridgeSource, /versionSelector/);
  assert.match(source, /showElegantVersion\(auth\.enterAsGuest\(\)\)/);
  assert.match(source, /showElegantVersion\(result\.user\)/);
  assert.match(source, /function showElegantLogin/);
  assert.match(source, /if \(mode === 'register'\) setAuthMode\('register'\)/);
  assert.match(source, /showAuthenticatedDestination\(auth\.enterAsGuest\(\)\)/);
  assert.match(source, /typeof window\.elegantShell\.refreshIdentity === 'function'/);
  assert.match(source, /showElegantVersion\(user\)/);
  assert.doesNotMatch(source, /showLoginScreen\(''\);\s*return;\s*}\s*setLoginPending/);
  assert.doesNotMatch(source, /PUBLIC_KNOWLEDGE_ROUTES|isPublicKnowledgeEntry/);
  assert.doesNotMatch(source, /showVersionSelector/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /console\.(log|debug).*password/i);

  console.log('auth tests passed');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
