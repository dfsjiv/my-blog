const API_BASE_URL = 'https://blog-api.lilinzheng200811.workers.dev';
const STORAGE_KEY = 'myBlogDesktopState';
const AUTH_TOKEN_KEY = 'blog_session_token';
const PAGE_BY_CATEGORY = {
  algorithm: 'algorithm',
  computer: 'tech',
  essay: 'essay',
};

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
  publishing: false,
};

const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggleBtn');
const themeToggle = document.getElementById('themeToggle');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('pageTitle');
const pageSummary = document.getElementById('pageSummary');
const pageContent = document.getElementById('pageContent');
const pageActions = document.getElementById('pageActions');

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

async function apiRequest(path, requestOptions) {
  const options = requestOptions || {};
  const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };
  if (options.token) headers.Authorization = 'Bearer ' + options.token;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(API_BASE_URL + path, fetchOptions);
  } catch (error) {
    const networkError = new Error('network');
    networkError.code = 'network';
    throw networkError;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    const jsonError = new Error('invalid-json');
    jsonError.code = 'invalid-json';
    jsonError.status = response.status;
    throw jsonError;
  }

  if (!response.ok || !data || data.success !== true) {
    const error = new Error(response.status === 404 ? 'not-found' : 'api-error');
    error.status = response.status;
    error.apiMessage = data && typeof data.message === 'string' ? data.message : '';
    throw error;
  }
  return data;
}

function getParentWindow() {
  try {
    return window.parent && window.parent !== window ? window.parent : window;
  } catch (error) {
    return window;
  }
}

function getAuthManager() {
  try {
    const parentWindow = getParentWindow();
    return parentWindow.authManager || window.authManager || null;
  } catch (error) {
    return window.authManager || null;
  }
}

function isCurrentUserAdmin() {
  const auth = getAuthManager();
  return Boolean(auth && typeof auth.isAdmin === 'function' && auth.isAdmin());
}

function getSessionToken() {
  const auth = getAuthManager();
  if (auth && auth.state && typeof auth.state.token === 'string' && auth.state.token) {
    return auth.state.token;
  }
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch (error) {
    return '';
  }
}

function clearPageActions() {
  if (pageActions) pageActions.replaceChildren();
}

function renderCreateArticleAction(pageKey) {
  clearPageActions();
  const page = pageInfo[pageKey];
  if (!pageActions || !page || !page.category || !isCurrentUserAdmin()) return;

  const button = document.createElement('button');
  button.className = 'create-article-button';
  button.type = 'button';
  button.textContent = '＋ 新建文章';
  button.addEventListener('click', () => renderArticleCreate(pageKey));
  pageActions.appendChild(button);
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
  clearPageActions();
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
  renderCreateArticleAction(pageKey);
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
  renderCreateArticleAction(pageKey);

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
  clearPageActions();
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

function createEditorField(labelText, control) {
  const label = document.createElement('label');
  label.className = 'article-editor-field';
  const labelName = document.createElement('span');
  labelName.textContent = labelText;
  label.append(labelName, control);
  return label;
}

function renderArticleCreate(pageKey) {
  const page = pageInfo[pageKey];
  if (!page || !page.category || !isCurrentUserAdmin()) return;

  blogState.requestVersion += 1;
  blogState.currentSection = 'article-create';
  blogState.currentCategory = page.category;
  blogState.currentArticleId = null;
  blogState.currentPageKey = pageKey;
  blogState.publishing = false;
  pageTitle.textContent = '新建文章';
  pageSummary.textContent = '发布到' + page.title;
  setActiveNavigation(pageKey);
  clearPageActions();

  const shell = createContentShell();
  const form = document.createElement('form');
  form.className = 'article-editor';
  form.noValidate = true;

  const titleInput = document.createElement('input');
  titleInput.className = 'article-editor-input';
  titleInput.type = 'text';
  titleInput.maxLength = 200;

  const categorySelect = document.createElement('select');
  categorySelect.className = 'article-editor-input';
  [
    ['algorithm', '算法文章'],
    ['computer', '计算机技术'],
    ['essay', '个人随笔'],
  ].forEach(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    categorySelect.appendChild(option);
  });
  categorySelect.value = page.category;

  const summaryInput = document.createElement('textarea');
  summaryInput.className = 'article-editor-input article-editor-summary';
  summaryInput.maxLength = 500;
  summaryInput.rows = 3;

  const contentInput = document.createElement('textarea');
  contentInput.className = 'article-editor-input article-editor-content';
  contentInput.rows = 12;

  const message = document.createElement('p');
  message.className = 'article-editor-message';
  message.setAttribute('role', 'alert');
  message.setAttribute('aria-live', 'polite');

  const cancelButton = document.createElement('button');
  cancelButton.className = 'article-editor-button secondary';
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', returnToArticleList);

  const publishButton = document.createElement('button');
  publishButton.className = 'article-editor-button primary';
  publishButton.type = 'submit';
  publishButton.textContent = '发布文章';

  const actions = document.createElement('div');
  actions.className = 'article-editor-actions';
  actions.append(cancelButton, publishButton);

  const fields = {
    titleInput,
    categorySelect,
    summaryInput,
    contentInput,
    message,
    cancelButton,
    publishButton,
  };
  form.append(
    createEditorField('标题', titleInput),
    createEditorField('分类', categorySelect),
    createEditorField('摘要', summaryInput),
    createEditorField('正文', contentInput),
    message,
    actions
  );
  form.addEventListener('submit', (event) => publishArticle(event, fields));
  shell.appendChild(form);
  titleInput.focus();
}

function setEditorMessage(fields, message) {
  fields.message.textContent = message || '';
}

async function handleInvalidSession() {
  const parentWindow = getParentWindow();
  if (parentWindow.authUi && typeof parentWindow.authUi.logoutToLogin === 'function') {
    await parentWindow.authUi.logoutToLogin('登录已失效，请重新登录');
    return;
  }
  const auth = getAuthManager();
  if (auth && typeof auth.logout === 'function') await auth.logout();
}

async function publishArticle(event, fields) {
  event.preventDefault();
  if (blogState.publishing) return;

  if (!isCurrentUserAdmin()) {
    setEditorMessage(fields, '无管理员权限');
    return;
  }

  const title = fields.titleInput.value.trim();
  const summary = fields.summaryInput.value.trim();
  const content = fields.contentInput.value;
  const category = fields.categorySelect.value;
  if (!title) {
    setEditorMessage(fields, '请输入文章标题');
    fields.titleInput.focus();
    return;
  }
  if (!content.trim()) {
    setEditorMessage(fields, '请输入文章正文');
    fields.contentInput.focus();
    return;
  }
  if (!PAGE_BY_CATEGORY[category]) {
    setEditorMessage(fields, '请选择有效分类');
    fields.categorySelect.focus();
    return;
  }

  const token = getSessionToken();
  if (!token) {
    setEditorMessage(fields, '登录已失效，请重新登录');
    await handleInvalidSession();
    return;
  }

  blogState.publishing = true;
  fields.publishButton.disabled = true;
  fields.cancelButton.disabled = true;
  fields.publishButton.textContent = '正在发布...';
  setEditorMessage(fields, '');

  try {
    const data = await apiRequest('/api/articles', {
      method: 'POST',
      token,
      body: { title, summary, content, category },
    });
    if (!data.article || typeof data.article !== 'object' || data.article.id === undefined) {
      throw new Error('invalid-data');
    }

    const articleCategory = PAGE_BY_CATEGORY[data.article.category] ? data.article.category : category;
    const articlePageKey = PAGE_BY_CATEGORY[articleCategory];
    delete blogState.articlesCache[articleCategory];
    blogState.currentSection = 'article-detail';
    blogState.currentCategory = articleCategory;
    blogState.currentArticleId = data.article.id;
    blogState.currentPageKey = articlePageKey;
    saveStoredState({ blogPage: articlePageKey });
    setActiveNavigation(articlePageKey);
    renderArticleDetail(data.article);
  } catch (error) {
    if (error.status === 401) {
      setEditorMessage(fields, '登录已失效，请重新登录');
      await handleInvalidSession();
    } else if (error.status === 403) {
      setEditorMessage(fields, '无管理员权限');
    } else if (error.status === 400) {
      setEditorMessage(fields, error.apiMessage || '文章内容不符合要求');
    } else if (error.code === 'network') {
      setEditorMessage(fields, '无法连接服务器，请稍后重试');
    } else {
      setEditorMessage(fields, '文章发布失败，请稍后重试');
    }
  } finally {
    blogState.publishing = false;
    fields.publishButton.disabled = false;
    fields.cancelButton.disabled = false;
    fields.publishButton.textContent = '发布文章';
  }
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
  if (blogState.articlesCache[page.category]) {
    renderArticleList(pageKey, blogState.articlesCache[page.category]);
  } else {
    loadArticleList(pageKey);
  }
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

if (window.addEventListener) {
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'blog-auth-changed') return;
    if (blogState.currentSection === 'article-list') {
      renderCreateArticleAction(blogState.currentPageKey);
    }
  });
}

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
  renderArticleCreate,
  publishArticle,
  isCurrentUserAdmin,
  getSessionToken,
  setPage,
  formatDate,
};
