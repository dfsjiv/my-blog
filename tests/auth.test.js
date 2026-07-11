const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const authPath = path.join(rootDir, 'auth.js');
const indexPath = path.join(rootDir, 'index.html');
const source = fs.readFileSync(authPath, 'utf8');

function loadAuthModule() {
  const listeners = {};
  const document = {
    readyState: 'loading',
    addEventListener(eventName, handler) {
      listeners[eventName] = handler;
    },
  };
  const window = { document };
  const sandbox = {
    window,
    document,
    console,
    Set,
    Error,
    JSON,
    Object,
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
  assert.ok(BlogAuth);
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
    assert.strictEqual(storage.values.blogAuthSessionToken, 'admin-token');
    assert.strictEqual(storage.values.blogAuthExpiresAt, '2026-07-12T00:00:00Z');
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
    const auth = BlogAuth.createAuthManager({
      storage,
      fetch: async () => response(401, { success: false, message: 'invalid' }),
    });
    await assert.rejects(auth.login('dfsjiv', 'wrong-password'), /用户名或密码错误/);
    assert.strictEqual(storage.values.blogAuthSessionToken, undefined);
  }

  {
    const storage = createStorage({ blogAuthSessionToken: 'user-token' });
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
      blogAuthSessionToken: 'invalid-token',
      blogAuthUser: JSON.stringify({ username: 'fake', role: 'admin' }),
    });
    const auth = BlogAuth.createAuthManager({
      storage,
      fetch: async () => response(401, { success: false }),
    });
    const result = await auth.restoreSession();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'expired');
    assert.strictEqual(auth.getCurrentUser(), null);
    assert.strictEqual(storage.values.blogAuthSessionToken, undefined);
    assert.strictEqual(storage.values.blogAuthUser, undefined);
  }

  {
    const storage = createStorage();
    const auth = BlogAuth.createAuthManager({ storage, fetch: async () => response(200, {}) });
    const guest = auth.enterAsGuest();
    assert.strictEqual(guest.username, 'Guest');
    assert.strictEqual(guest.role, 'guest');
    assert.strictEqual(auth.isGuest(), true);
    assert.strictEqual(storage.values.blogAuthSessionToken, undefined);
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
    assert.strictEqual(storage.values.blogAuthSessionToken, undefined);
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
  assert.match(indexHtml, /id="guestButton"/);
  assert.match(indexHtml, /id="logoutButton"/);
  assert.match(indexHtml, /<script src="auth\.js"><\/script>/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /console\.(log|debug).*password/i);

  console.log('auth tests passed');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
