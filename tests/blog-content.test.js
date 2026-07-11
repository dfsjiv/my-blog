const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'script.js');
const stylePath = path.join(rootDir, 'style.css');
const source = fs.readFileSync(scriptPath, 'utf8');

class FakeClassList {
  constructor() {
    this.names = new Set();
  }
  toggle(name, enabled) {
    if (enabled) this.names.add(name);
    else this.names.delete(name);
  }
  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.classList = new FakeClassList();
    this.dataset = {};
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.type = '';
    this.title = '';
    this.style = {};
    this.scrollTop = 0;
    this._innerHTML = '';
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children = [];
  }
  get innerHTML() {
    return this._innerHTML;
  }
  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this._innerHTML = '';
    this.children = children;
  }
  querySelector(selector) {
    if (selector === '.card h2' && this._innerHTML.includes('<h2>')) {
      const heading = new FakeElement('h2');
      return heading;
    }
    return null;
  }
}

function textTree(element) {
  return [element.textContent]
    .concat(element.children.flatMap((child) => textTree(child)))
    .filter(Boolean)
    .join('\n');
}

function findByClass(element, className) {
  if (element.className.split(/\s+/).includes(className)) return element;
  for (const child of element.children) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

function createContext(fetchImpl) {
  const elements = {
    sidebar: new FakeElement('aside', 'sidebar'),
    toggleBtn: new FakeElement('button', 'toggleBtn'),
    themeToggle: new FakeElement('button', 'themeToggle'),
    pageTitle: new FakeElement('h1', 'pageTitle'),
    pageSummary: new FakeElement('p', 'pageSummary'),
    pageContent: new FakeElement('section', 'pageContent'),
  };
  const navItems = ['home', 'algorithm', 'tech', 'essay', 'mystery'].map((page) => {
    const item = new FakeElement('button');
    item.dataset.page = page;
    return item;
  });
  const document = {
    body: new FakeElement('body'),
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      return selector === '.nav-item' ? navItems : [];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
  const storageValues = {};
  const localStorage = {
    getItem(key) { return storageValues[key] || null; },
    setItem(key, value) { storageValues[key] = String(value); },
  };
  const window = { document, location: { href: '' } };
  const sandbox = {
    window,
    document,
    localStorage,
    fetch: fetchImpl,
    console,
    encodeURIComponent,
    Error,
    JSON,
    Object,
    Array,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: scriptPath });
  return { window, elements, navItems, storageValues };
}

function jsonResponse(status, data, invalidJson = false) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (invalidJson) throw new Error('invalid json');
      return data;
    },
  };
}

(async function run() {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    if (url.endsWith('/api/articles?category=algorithm')) {
      return jsonResponse(200, {
        success: true,
        articles: [{
          id: 1,
          title: '<b>二分查找学习记录</b>',
          summary: '整数二分与边界处理。',
          author: 'admin',
          created_at: '2026-07-11 04:56:15',
        }],
      });
    }
    if (url.endsWith('/api/articles/1')) {
      return jsonResponse(200, {
        success: true,
        article: {
          id: 1,
          title: '二分查找学习记录',
          content: '第一行\n<script>bad()</script>\n第三行',
          author: 'admin',
          created_at: '2026-07-11 04:56:15',
        },
      });
    }
    if (url.endsWith('/api/articles?category=computer')) {
      return jsonResponse(200, { success: true, articles: [] });
    }
    throw new Error('network');
  };

  const { window, elements, navItems } = createContext(fetchImpl);
  const BlogContent = window.BlogContent;
  assert.strictEqual(
    BlogContent.API_BASE_URL,
    'https://blog-api.lilinzheng200811.workers.dev'
  );
  assert.match(elements.pageContent.innerHTML, /欢迎来到我的博客/);

  await BlogContent.loadArticleList('algorithm', { force: true });
  assert.ok(requests[0].endsWith('/api/articles?category=algorithm'));
  assert.strictEqual(elements.pageTitle.textContent, '算法文章');
  assert.strictEqual(navItems[1].classList.contains('active'), true);
  assert.match(textTree(elements.pageContent), /<b>二分查找学习记录<\/b>/);
  assert.match(textTree(elements.pageContent), /admin · 2026\.07\.11/);
  assert.strictEqual(elements.pageContent.innerHTML, '');

  const titleButton = findByClass(elements.pageContent, 'article-title-button');
  await titleButton.listeners.click();
  assert.ok(requests[1].endsWith('/api/articles/1'));
  const detailText = textTree(elements.pageContent);
  assert.match(detailText, /第一行\n<script>bad\(\)<\/script>\n第三行/);
  assert.strictEqual(elements.pageContent.innerHTML, '');
  assert.strictEqual(BlogContent.blogState.currentSection, 'article-detail');
  assert.strictEqual(navItems[1].classList.contains('active'), true);

  const backButton = findByClass(elements.pageContent, 'article-back');
  backButton.listeners.click();
  assert.strictEqual(BlogContent.blogState.currentSection, 'article-list');
  assert.match(textTree(elements.pageContent), /整数二分与边界处理/);
  assert.strictEqual(requests.length, 2, 'return should use the cached list');

  await BlogContent.loadArticleList('tech', { force: true });
  assert.match(textTree(elements.pageContent), /暂无文章/);

  BlogContent.setPage('home');
  assert.match(elements.pageContent.innerHTML, /技术标签/);
  BlogContent.setPage('mystery');
  assert.match(elements.pageContent.innerHTML, /mystery-gallery/);

  const failure = createContext(async () => { throw new Error('offline'); });
  await failure.window.BlogContent.loadArticleList('essay', { force: true });
  assert.match(textTree(failure.elements.pageContent), /无法加载文章，请稍后重试/);

  const invalidJson = createContext(async () => jsonResponse(200, null, true));
  await invalidJson.window.BlogContent.loadArticleList('algorithm', { force: true });
  assert.match(textTree(invalidJson.elements.pageContent), /无法加载文章，请稍后重试/);

  {
    const pending = {};
    const switching = createContext((url) => new Promise((resolve) => {
      pending[url.includes('algorithm') ? 'algorithm' : 'computer'] = resolve;
    }));
    const algorithmLoad = switching.window.BlogContent.loadArticleList('algorithm', { force: true });
    const computerLoad = switching.window.BlogContent.loadArticleList('tech', { force: true });

    pending.algorithm(jsonResponse(200, {
      success: true,
      articles: [{ id: 9, title: '旧分类文章', summary: '', author: 'a' }],
    }));
    await algorithmLoad;
    assert.strictEqual(switching.elements.pageTitle.textContent, '计算机技术');
    assert.doesNotMatch(textTree(switching.elements.pageContent), /旧分类文章/);

    pending.computer(jsonResponse(200, { success: true, articles: [] }));
    await computerLoad;
    assert.match(textTree(switching.elements.pageContent), /暂无文章/);
  }

  const css = fs.readFileSync(stylePath, 'utf8');
  assert.match(css, /white-space:\s*pre-wrap/);
  assert.doesNotMatch(source, /article\.content\s*\}/);

  console.log('blog-content tests passed');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
