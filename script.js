const API_BASE_URL = 'https://blog-api.lilinzheng200811.workers.dev';
const STORAGE_KEY = 'myBlogDesktopState';

const pageInfo = {
  home: {
    title: '首页',
    summary: '算法、计算机技术、个人随笔，以及一些其他内容。',
    content: `
      <h2>欢迎来到我的博客</h2>
      <p>这里记录算法、计算机技术、个人随笔以及一些其他内容。所有文章都来自日常学习、实践和思考。</p>
      <h3>技术标签</h3>
      <ul class="tech-tags">
        <li>算法</li><li>数据结构</li><li>计算机系统</li><li>网络</li><li>开发实践</li>
      </ul>
    `,
  },
  algorithm: {
    title: '算法文章',
    summary: '记录算法与数据结构相关的学习内容。',
    category: 'algorithm',
  },
  tech: {
    title: '计算机技术',
    summary: '记录系统、网络与开发实践。',
    category: 'computer',
  },
  essay: {
    title: '个人随笔',
    summary: '记录个人思考、生活感悟和创意碎片。',
    category: 'essay',
  },
  mystery: {
    title: '神秘图片',
    summary: '收集一些喜欢的图片。',
    content: '<h2>神秘图片</h2><p>这里展示了一些神秘图片。点击标题可以进入完整图库。</p><div class="mystery-gallery"><div class="mystery-left"><img src="110944994_p0_master1200.jpg" alt="神秘图片 1" class="mystery-img" /><img src="125625696_p0_master1200.jpg" alt="神秘图片 2" class="mystery-img" /></div><div class="mystery-right"><img src="131135880_p0_master1200.jpg" alt="神秘图片 3" class="mystery-img tall" /></div></div>',
  },
};

const blogState = {
  currentSection: 'home',
  currentCategory: null,
  currentArticleId: null,
  currentPageKey: 'home',
  articlesCache: {},
  pendingLists: {},
  requestVersion: 0,
};

const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggleBtn');
const themeToggle = document.getElementById('themeToggle');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('pageTitle');
const pageSummary = document.getElementById('pageSummary');
const pageContent = document.getElementById('pageContent');

function readStoredState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveStoredState(updates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({}, readStoredState(), updates)));
  } catch (error) {
    // Keep navigation usable when storage is unavailable or contains invalid data.
  }
}

async function apiRequest(path) {
  let response;
  try {
    response = await fetch(API_BASE_URL + path, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new Error('network');
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error('invalid-json');
  }

  if (!response.ok || !data || data.success !== true) {
    const error = new Error(response.status === 404 ? 'not-found' : 'api-error');
    error.status = response.status;
    throw error;
  }
  return data;
}

function setHeader(page) {
  pageTitle.textContent = page.title;
  pageSummary.textContent = page.summary;
}

function setActiveNavigation(pageKey) {
  navItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.page === pageKey);
  });
}

function createContentShell() {
  const article = document.createElement('article');
  article.className = 'card';
  pageContent.replaceChildren(article);
  pageContent.scrollTop = 0;
  return article;
}

function renderStatus(message, className) {
  const shell = createContentShell();
  const status = document.createElement('p');
  status.className = 'article-status' + (className ? ' ' + className : '');
  status.textContent = message;
  shell.appendChild(status);
}

function formatDate(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? [match[1], match[2], match[3]].join('.') : '';
}

function renderStaticPage(pageKey) {
  const page = pageInfo[pageKey];
  blogState.requestVersion += 1;
  blogState.currentSection = pageKey === 'mystery' ? 'gallery' : 'home';
  blogState.currentCategory = null;
  blogState.currentArticleId = null;
  blogState.currentPageKey = pageKey;

  setHeader(page);
  pageContent.innerHTML = `<article class="card">${page.content}</article>`;
  pageContent.scrollTop = 0;
  setActiveNavigation(pageKey);

  if (pageKey === 'mystery') {
    const heading = pageContent.querySelector('.card h2');
    if (heading) {
      heading.style.cursor = 'pointer';
      heading.title = '点击进入神秘图库';
      heading.addEventListener('click', () => {
        window.location.href = 'gallery.html';
      });
    }
  }
}

function createArticleMeta(article) {
  const meta = document.createElement('p');
  meta.className = 'article-meta';
  const author = typeof article.author === 'string' && article.author ? article.author : '未知作者';
  const date = formatDate(article.created_at);
  meta.textContent = date ? author + ' · ' + date : author;
  return meta;
}

function renderArticleList(pageKey, articles) {
  const page = pageInfo[pageKey];
  setHeader(page);
  const shell = createContentShell();

  if (!articles.length) {
    const empty = document.createElement('p');
    empty.className = 'article-status';
    empty.textContent = '暂无文章';
    shell.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'article-list';
  articles.forEach((article) => {
    const item = document.createElement('section');
    item.className = 'article-list-item';

    const title = document.createElement('button');
    title.className = 'article-title-button';
    title.type = 'button';
    title.textContent = typeof article.title === 'string' ? article.title : '未命名文章';
    title.addEventListener('click', () => loadArticleDetail(article.id));

    const summary = document.createElement('p');
    summary.className = 'article-summary';
    summary.textContent = typeof article.summary === 'string' && article.summary
      ? article.summary
      : '暂无摘要';

    item.append(title, summary, createArticleMeta(article));
    list.appendChild(item);
  });
  shell.appendChild(list);
}

async function loadArticleList(pageKey, options) {
  const page = pageInfo[pageKey];
  if (!page || !page.category) return;

  const settings = options || {};
  const category = page.category;
  const requestVersion = ++blogState.requestVersion;
  blogState.currentSection = 'article-list';
  blogState.currentCategory = category;
  blogState.currentArticleId = null;
  blogState.currentPageKey = pageKey;
  setHeader(page);
  setActiveNavigation(pageKey);

  if (blogState.articlesCache[category] && !settings.force) {
    renderArticleList(pageKey, blogState.articlesCache[category]);
    return;
  }

  renderStatus('正在加载文章...');
  let request = blogState.pendingLists[category];
  if (!request) {
    request = apiRequest('/api/articles?category=' + encodeURIComponent(category));
    blogState.pendingLists[category] = request;
  }

  try {
    const data = await request;
    if (!Array.isArray(data.articles)) throw new Error('invalid-data');
    blogState.articlesCache[category] = data.articles;
    if (requestVersion !== blogState.requestVersion || blogState.currentCategory !== category) return;
    renderArticleList(pageKey, data.articles);
  } catch (error) {
    if (requestVersion !== blogState.requestVersion || blogState.currentCategory !== category) return;
    renderStatus('无法加载文章，请稍后重试。', 'is-error');
  } finally {
    if (blogState.pendingLists[category] === request) {
      delete blogState.pendingLists[category];
    }
  }
}

function renderArticleDetail(article) {
  const pageKey = blogState.currentPageKey;
  const page = pageInfo[pageKey];
  pageTitle.textContent = article.title || page.title;
  pageSummary.textContent = '';
  const shell = createContentShell();

  const back = document.createElement('button');
  back.className = 'article-back';
  back.type = 'button';
  back.textContent = '← 返回' + page.title;
  back.addEventListener('click', returnToArticleList);

  const title = document.createElement('h2');
  title.className = 'article-detail-title';
  title.textContent = typeof article.title === 'string' ? article.title : '未命名文章';

  const body = document.createElement('div');
  body.className = 'article-body';
  body.textContent = typeof article.content === 'string' ? article.content : '';

  shell.append(back, title, createArticleMeta(article), body);
}

async function loadArticleDetail(articleId) {
  if (articleId === undefined || articleId === null) return;
  const requestVersion = ++blogState.requestVersion;
  blogState.currentSection = 'article-detail';
  blogState.currentArticleId = articleId;
  renderStatus('正在加载文章内容...');

  try {
    const data = await apiRequest('/api/articles/' + encodeURIComponent(articleId));
    if (!data.article || typeof data.article !== 'object') throw new Error('invalid-data');
    if (requestVersion !== blogState.requestVersion || blogState.currentArticleId !== articleId) return;
    renderArticleDetail(data.article);
  } catch (error) {
    if (requestVersion !== blogState.requestVersion || blogState.currentArticleId !== articleId) return;
    renderStatus(error.status === 404
      ? '文章不存在或已被删除。'
      : '无法加载文章，请稍后重试。', 'is-error');
  }
}

function returnToArticleList() {
  const pageKey = blogState.currentPageKey;
  const page = pageInfo[pageKey];
  if (!page || !page.category) return;
  blogState.requestVersion += 1;
  blogState.currentSection = 'article-list';
  blogState.currentArticleId = null;
  setHeader(page);
  setActiveNavigation(pageKey);
  renderArticleList(pageKey, blogState.articlesCache[page.category] || []);
}

function setPage(pageKey, persist = true) {
  const page = pageInfo[pageKey];
  if (!page) return;

  if (persist) saveStoredState({ blogPage: pageKey });
  if (page.category) {
    loadArticleList(pageKey);
  } else {
    renderStaticPage(pageKey);
  }
}

navItems.forEach((item) => {
  item.addEventListener('click', () => setPage(item.dataset.page));
});

toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  saveStoredState({ theme: document.body.classList.contains('dark') ? 'dark' : 'light' });
});

const storedState = readStoredState();
document.body.classList.toggle('dark', storedState.theme !== 'light');
setPage(pageInfo[storedState.blogPage] ? storedState.blogPage : 'home', false);

window.BlogContent = {
  API_BASE_URL,
  blogState,
  apiRequest,
  loadArticleList,
  loadArticleDetail,
  returnToArticleList,
  setPage,
  formatDate,
};
