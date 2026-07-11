const API_BASE_URL = '';
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
  currentArticle: null,
  currentPageKey: 'home',
  articlesCache: {},
  pendingLists: {},
  requestVersion: 0,
  publishing: false,
  deleting: false,
  deleteDialog: null,
  readingCleanup: null,
  allArticlesCache: null,
  allArticlesRequest: null,
  searchQuery: '',
  searchResults: [],
  searchOrigin: null,
  detailReturnView: null,
  searchVersion: 0,
  commentsVersion: 0,
  commentsSection: null,
};

const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggleBtn');
const themeToggle = document.getElementById('themeToggle');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('pageTitle');
const pageSummary = document.getElementById('pageSummary');
const pageContent = document.getElementById('pageContent');
const pageActions = document.getElementById('pageActions');
const articleSearchInput = document.getElementById('articleSearchInput');

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

function getCurrentUser() {
  const auth = getAuthManager();
  return auth && typeof auth.getCurrentUser === 'function'
    ? auth.getCurrentUser()
    : (auth && auth.state ? auth.state.user : null);
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
  cleanupReadingEnhancements();
  blogState.commentsVersion += 1;
  blogState.commentsSection = null;
  const article = document.createElement('article');
  article.className = 'card';
  pageContent.replaceChildren(article);
  pageContent.scrollTop = 0;
  return article;
}

function cleanupReadingEnhancements() {
  if (typeof blogState.readingCleanup === 'function') {
    blogState.readingCleanup();
  }
  blogState.readingCleanup = null;
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
  blogState.currentArticle = null;
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

function appendInlineMarkdown(container, text) {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const token = match[0];
    let element;
    if (token.startsWith('`')) {
      element = document.createElement('code');
      element.textContent = token.slice(1, -1);
    } else if (token.startsWith('**')) {
      element = document.createElement('strong');
      element.textContent = token.slice(2, -2);
    } else {
      element = document.createElement('em');
      element.textContent = token.slice(1, -1);
    }
    container.appendChild(element);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function createHeadingId(text, slugCounts) {
  const normalized = String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '') || 'section';
  const count = (slugCounts[normalized] || 0) + 1;
  slugCounts[normalized] = count;
  return count === 1 ? normalized : normalized + '-' + count;
}

async function copyCodeText(text, button) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard');
    await navigator.clipboard.writeText(text);
    button.textContent = '已复制';
  } catch (error) {
    button.textContent = '复制失败';
  }
  window.setTimeout(() => { button.textContent = '复制'; }, 1500);
}

function renderMarkdown(markdown, container) {
  container.replaceChildren();
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const headings = [];
  const slugCounts = {};
  let paragraphLines = [];
  let codeLines = [];
  let codeLanguage = '';
  let inCodeBlock = false;

  function flushParagraph() {
    if (!paragraphLines.length) return;
    const paragraph = document.createElement('p');
    appendInlineMarkdown(paragraph, paragraphLines.join(' '));
    container.appendChild(paragraph);
    paragraphLines = [];
  }

  function flushCodeBlock() {
    const pre = document.createElement('pre');
    pre.className = 'markdown-code-block';
    const code = document.createElement('code');
    const codeText = codeLines.join('\n');
    if (codeLanguage) code.setAttribute('data-language', codeLanguage);
    code.textContent = codeText;
    const copyButton = document.createElement('button');
    copyButton.className = 'code-copy-button';
    copyButton.type = 'button';
    copyButton.textContent = '复制';
    copyButton.addEventListener('click', () => copyCodeText(codeText, copyButton));
    pre.append(copyButton, code);
    container.appendChild(pre);
    codeLines = [];
    codeLanguage = '';
  }

  lines.forEach((line) => {
    const fence = line.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushParagraph();
        inCodeBlock = true;
        codeLanguage = fence[1] || '';
      }
      return;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const element = document.createElement('h' + heading[1].length);
      const headingText = heading[2].replace(/[`*_]/g, '').trim();
      element.id = createHeadingId(headingText, slugCounts);
      appendInlineMarkdown(element, heading[2]);
      container.appendChild(element);
      headings.push({
        id: element.id,
        level: heading[1].length,
        text: headingText,
        element,
      });
      return;
    }
    paragraphLines.push(line.trim());
  });

  flushParagraph();
  if (inCodeBlock || codeLines.length) flushCodeBlock();
  return headings;
}

function createArticleToc(headings, mobile) {
  const container = document.createElement(mobile ? 'details' : 'aside');
  container.className = mobile ? 'article-toc-mobile' : 'article-toc-desktop';
  if (mobile) {
    const summary = document.createElement('summary');
    summary.textContent = '文章目录';
    container.appendChild(summary);
  } else {
    const title = document.createElement('div');
    title.className = 'article-toc-title';
    title.textContent = '文章目录';
    container.appendChild(title);
  }

  const nav = document.createElement('nav');
  nav.className = 'article-toc-nav';
  const links = [];
  headings.forEach((heading) => {
    const link = document.createElement('a');
    link.className = 'article-toc-link level-' + heading.level;
    link.href = '#' + heading.id;
    link.textContent = heading.text;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      if (heading.element.scrollIntoView) {
        heading.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (mobile) container.open = false;
    });
    nav.appendChild(link);
    links.push({ id: heading.id, link });
  });
  container.appendChild(nav);
  return { element: container, links };
}

function setupReadingEnhancements(headings, tocGroups) {
  const progress = document.createElement('div');
  progress.className = 'reading-progress';
  progress.setAttribute('aria-hidden', 'true');
  const progressValue = document.createElement('span');
  progress.appendChild(progressValue);
  document.body.appendChild(progress);

  let frameId = null;
  function updateProgress() {
    frameId = null;
    const maxScroll = Math.max(0, pageContent.scrollHeight - pageContent.clientHeight);
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, pageContent.scrollTop / maxScroll)) : 0;
    progressValue.style.width = Math.round(ratio * 100) + '%';
  }
  function handleScroll() {
    if (frameId !== null) return;
    const schedule = window.requestAnimationFrame || function (callback) { callback(); return 0; };
    frameId = schedule(updateProgress);
  }
  pageContent.addEventListener('scroll', handleScroll, { passive: true });
  updateProgress();

  const allLinks = tocGroups.flatMap((group) => group.links);
  function setActiveHeading(id) {
    allLinks.forEach((item) => item.link.classList.toggle('active', item.id === id));
  }
  if (headings.length) setActiveHeading(headings[0].id);

  let observer = null;
  if (headings.length && window.IntersectionObserver) {
    observer = new window.IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActiveHeading(visible[0].target.id);
    }, {
      root: pageContent,
      rootMargin: '-8% 0px -76% 0px',
      threshold: [0, 1],
    });
    headings.forEach((heading) => observer.observe(heading.element));
  }

  blogState.readingCleanup = function () {
    pageContent.removeEventListener('scroll', handleScroll);
    if (observer) observer.disconnect();
    if (frameId !== null && window.cancelAnimationFrame) window.cancelAnimationFrame(frameId);
    progress.remove();
  };
}

function formatCommentDate(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}` : value;
}

function renderCommentComposer(section, articleId) {
  const user = getCurrentUser();
  if (!user || user.role === 'guest') {
    const prompt = document.createElement('p');
    prompt.className = 'comment-login-prompt';
    prompt.textContent = '登录后可以发表评论。';
    section.appendChild(prompt);
    return;
  }

  const form = document.createElement('form');
  form.className = 'comment-form';
  const label = document.createElement('label');
  label.textContent = '发表评论';
  const input = document.createElement('textarea');
  input.className = 'comment-input';
  input.maxLength = 2000;
  input.rows = 4;
  input.placeholder = '输入评论内容……';
  const message = document.createElement('p');
  message.className = 'comment-message';
  message.setAttribute('role', 'alert');
  const button = document.createElement('button');
  button.className = 'comment-submit-button';
  button.type = 'submit';
  button.textContent = '发表评论';
  label.appendChild(input);
  form.append(label, message, button);
  form.addEventListener('submit', (event) => submitComment(event, articleId, input, message, button, null));
  section.appendChild(form);
}

function findDirectChildByClass(element, className) {
  return Array.from(element.children || []).find((child) => (
    child.className && child.className.split(/\s+/).includes(className)
  ));
}

function toggleReplyComposer(container, articleId, comment) {
  const existing = findDirectChildByClass(container, 'comment-reply-form');
  if (existing) {
    existing.remove();
    return;
  }

  const form = document.createElement('form');
  form.className = 'comment-reply-form';
  const label = document.createElement('label');
  const username = comment.author && comment.author.username ? comment.author.username : '用户';
  label.textContent = '回复 @' + username;
  const input = document.createElement('textarea');
  input.className = 'comment-input comment-reply-input';
  input.maxLength = 2000;
  input.rows = 3;
  input.placeholder = '输入回复内容...';
  const message = document.createElement('p');
  message.className = 'comment-message';
  message.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'comment-reply-actions';
  const cancel = document.createElement('button');
  cancel.className = 'comment-reply-cancel';
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => form.remove());
  const submit = document.createElement('button');
  submit.className = 'comment-submit-button';
  submit.type = 'submit';
  submit.textContent = '发送回复';
  actions.append(cancel, submit);
  label.appendChild(input);
  form.append(label, message, actions);
  form.addEventListener('submit', (event) => (
    submitComment(event, articleId, input, message, submit, comment.id)
  ));
  container.appendChild(form);
  input.focus();
}

function createCommentItem(comment, articleId, section, isReply) {
  const item = document.createElement('article');
  item.className = isReply ? 'comment-item comment-reply-item' : 'comment-item';
  const header = document.createElement('div');
  header.className = 'comment-header';
  const author = document.createElement('strong');
  author.textContent = comment.author && comment.author.username
    ? comment.author.username
    : '未知用户';
  const time = document.createElement('time');
  time.textContent = formatCommentDate(comment.created_at);
  header.append(author, time);

  const currentUser = getCurrentUser();
  if (!isReply && currentUser && currentUser.role !== 'guest') {
    const replyButton = document.createElement('button');
    replyButton.className = 'comment-reply-button';
    replyButton.type = 'button';
    replyButton.textContent = '回复';
    replyButton.addEventListener('click', () => toggleReplyComposer(item, articleId, comment));
    header.appendChild(replyButton);
  }
  if (isCurrentUserAdmin()) {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'comment-delete-button';
    deleteButton.type = 'button';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', () => showDeleteCommentConfirmation(comment, articleId, section));
    header.appendChild(deleteButton);
  }

  const content = document.createElement('p');
  content.className = 'comment-content';
  content.textContent = typeof comment.content === 'string' ? comment.content : '';
  item.append(header, content);
  if (!isReply && Array.isArray(comment.replies) && comment.replies.length) {
    const replies = document.createElement('div');
    replies.className = 'comment-replies';
    comment.replies.forEach((reply) => {
      replies.appendChild(createCommentItem(reply, articleId, section, true));
    });
    item.appendChild(replies);
  }
  return item;
}

function renderComments(section, articleId, comments) {
  section.replaceChildren();
  const heading = document.createElement('h3');
  heading.className = 'comments-title';
  heading.textContent = '评论 ' + comments.length;
  section.appendChild(heading);

  if (!comments.length) {
    const empty = document.createElement('p');
    empty.className = 'comments-empty';
    empty.textContent = '暂无评论。';
    section.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'comment-list';
    comments.forEach((comment) => {
      const item = document.createElement('article');
      item.className = 'comment-item';
      const header = document.createElement('div');
      header.className = 'comment-header';
      const author = document.createElement('strong');
      author.textContent = comment.author && comment.author.username
        ? comment.author.username
        : '未知用户';
      const time = document.createElement('time');
      time.textContent = formatCommentDate(comment.created_at);
      header.append(author, time);
      const currentUser = getCurrentUser();
      if (currentUser && currentUser.role !== 'guest') {
        const replyButton = document.createElement('button');
        replyButton.className = 'comment-reply-button';
        replyButton.type = 'button';
        replyButton.textContent = '回复';
        replyButton.addEventListener('click', () => toggleReplyComposer(item, articleId, comment));
        header.appendChild(replyButton);
      }
      if (isCurrentUserAdmin()) {
        const deleteButton = document.createElement('button');
        deleteButton.className = 'comment-delete-button';
        deleteButton.type = 'button';
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => showDeleteCommentConfirmation(comment, articleId, section));
        header.appendChild(deleteButton);
      }
      const content = document.createElement('p');
      content.className = 'comment-content';
      content.textContent = typeof comment.content === 'string' ? comment.content : '';
      item.append(header, content);
      if (Array.isArray(comment.replies) && comment.replies.length) {
        const replies = document.createElement('div');
        replies.className = 'comment-replies';
        comment.replies.forEach((reply) => {
          replies.appendChild(createCommentItem(reply, articleId, section, true));
        });
        item.appendChild(replies);
      }
      list.appendChild(item);
    });
    section.appendChild(list);
  }
  renderCommentComposer(section, articleId);
}

async function loadComments(articleId, section) {
  const version = ++blogState.commentsVersion;
  section.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'comments-status';
  loading.textContent = '正在加载评论...';
  section.appendChild(loading);
  try {
    const data = await apiRequest('/api/articles/' + encodeURIComponent(articleId) + '/comments');
    if (!Array.isArray(data.comments)) throw new Error('invalid-data');
    if (version !== blogState.commentsVersion || blogState.currentArticleId !== articleId) return;
    renderComments(section, articleId, data.comments);
  } catch (error) {
    if (version !== blogState.commentsVersion || blogState.currentArticleId !== articleId) return;
    section.replaceChildren();
    const message = document.createElement('p');
    message.className = 'comments-status is-error';
    message.textContent = '评论加载失败，请稍后重试。';
    section.appendChild(message);
    renderCommentComposer(section, articleId);
  }
}

async function submitComment(event, articleId, input, message, button, parentId) {
  event.preventDefault();
  const content = input.value.trim();
  if (!content) {
    message.textContent = '请输入评论内容。';
    input.focus();
    return;
  }
  const token = getSessionToken();
  if (!token) {
    message.textContent = '登录已失效，请重新登录';
    await handleInvalidSession();
    return;
  }

  button.disabled = true;
  button.textContent = '正在发表...';
  message.textContent = '';
  try {
    await apiRequest('/api/articles/' + encodeURIComponent(articleId) + '/comments', {
      method: 'POST',
      token,
      body: parentId ? { content, parent_id: parentId } : { content },
    });
    input.value = '';
    if (blogState.commentsSection) await loadComments(articleId, blogState.commentsSection);
  } catch (error) {
    if (error.status === 401) {
      message.textContent = '登录已失效，请重新登录';
      await handleInvalidSession();
    } else if (error.status === 403) {
      message.textContent = '无权限执行此操作';
    } else if (error.status === 404) {
      message.textContent = '文章或评论不存在';
    } else if (error.status === 400) {
      message.textContent = error.apiMessage || '评论内容不符合要求';
    } else if (error.code === 'network') {
      message.textContent = '无法连接服务器，请稍后重试';
    } else {
      message.textContent = '操作失败，请稍后重试';
    }
  } finally {
    button.disabled = false;
    button.textContent = '发表评论';
  }
}

function showDeleteCommentConfirmation(comment, articleId, section) {
  if (!isCurrentUserAdmin()) return;
  const overlay = document.createElement('div');
  overlay.className = 'delete-confirm-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const panel = document.createElement('section');
  panel.className = 'delete-confirm-dialog';
  const title = document.createElement('h2');
  title.textContent = '删除评论？';
  const prompt = document.createElement('p');
  prompt.textContent = '确定要删除这条评论吗？';
  const message = document.createElement('p');
  message.className = 'delete-confirm-message';
  const actions = document.createElement('div');
  actions.className = 'delete-confirm-actions';
  const cancel = document.createElement('button');
  cancel.className = 'delete-confirm-button secondary';
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => overlay.remove());
  const confirm = document.createElement('button');
  confirm.className = 'delete-confirm-button danger';
  confirm.type = 'button';
  confirm.textContent = '确认删除';
  confirm.addEventListener('click', () => deleteComment(comment.id, articleId, section, overlay, message, cancel, confirm));
  actions.append(cancel, confirm);
  panel.append(title, prompt, message, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  confirm.focus();
}

async function deleteComment(commentId, articleId, section, overlay, message, cancel, confirm) {
  const token = getSessionToken();
  if (!token) {
    overlay.remove();
    await handleInvalidSession();
    return;
  }
  cancel.disabled = true;
  confirm.disabled = true;
  confirm.textContent = '正在删除...';
  try {
    await apiRequest('/api/comments/' + encodeURIComponent(commentId), {
      method: 'DELETE',
      token,
    });
    overlay.remove();
    await loadComments(articleId, section);
  } catch (error) {
    if (error.status === 401) {
      overlay.remove();
      await handleInvalidSession();
    } else if (error.status === 403) {
      message.textContent = '无权限执行此操作';
    } else if (error.status === 404) {
      message.textContent = '文章或评论不存在';
    } else if (error.code === 'network') {
      message.textContent = '无法连接服务器，请稍后重试';
    } else {
      message.textContent = '操作失败，请稍后重试';
    }
  } finally {
    cancel.disabled = false;
    confirm.disabled = false;
    confirm.textContent = '确认删除';
  }
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
    title.addEventListener('click', () => loadArticleDetail(article.id, { returnView: null }));

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

function getCategoryLabel(category) {
  const pageKey = PAGE_BY_CATEGORY[category];
  return pageKey && pageInfo[pageKey] ? pageInfo[pageKey].title : category || '';
}

function appendHighlightedText(container, text, query) {
  const source = String(text || '');
  const needle = String(query || '').toLowerCase();
  if (!needle) {
    container.textContent = source;
    return;
  }

  const lowerSource = source.toLowerCase();
  let cursor = 0;
  let matchIndex = lowerSource.indexOf(needle, cursor);
  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      container.appendChild(document.createTextNode(source.slice(cursor, matchIndex)));
    }
    const mark = document.createElement('mark');
    mark.className = 'search-highlight';
    mark.textContent = source.slice(matchIndex, matchIndex + needle.length);
    container.appendChild(mark);
    cursor = matchIndex + needle.length;
    matchIndex = lowerSource.indexOf(needle, cursor);
  }
  if (cursor < source.length) {
    container.appendChild(document.createTextNode(source.slice(cursor)));
  }
}

function filterArticles(articles, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return [];
  return articles.filter((article) => [
    article.title,
    article.summary,
    article.author,
    getCategoryLabel(article.category),
  ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)));
}

async function loadAllArticles() {
  if (blogState.allArticlesCache) return blogState.allArticlesCache;
  if (!blogState.allArticlesRequest) {
    blogState.allArticlesRequest = apiRequest('/api/articles');
  }
  try {
    const data = await blogState.allArticlesRequest;
    if (!Array.isArray(data.articles)) throw new Error('invalid-data');
    blogState.allArticlesCache = data.articles;
    return data.articles;
  } finally {
    blogState.allArticlesRequest = null;
  }
}

function captureSearchOrigin() {
  if (blogState.searchOrigin) return;
  blogState.searchOrigin = {
    section: blogState.currentSection,
    pageKey: blogState.currentPageKey,
    article: blogState.currentArticle,
  };
}

function renderSearchResults(query, articles) {
  blogState.currentSection = 'search-results';
  blogState.searchQuery = query;
  blogState.searchResults = articles;
  blogState.currentArticleId = null;
  blogState.currentArticle = null;
  blogState.detailReturnView = null;
  pageTitle.textContent = '搜索结果';
  pageSummary.textContent = '搜索：“' + query + '”';
  clearPageActions();
  setActiveNavigation(null);
  const shell = createContentShell();

  const count = document.createElement('p');
  count.className = 'search-result-count';
  count.textContent = articles.length ? '找到 ' + articles.length + ' 篇文章' : '未找到相关文章。';
  shell.appendChild(count);
  if (!articles.length) return;

  const list = document.createElement('div');
  list.className = 'article-list search-result-list';
  articles.forEach((article) => {
    const item = document.createElement('section');
    item.className = 'article-list-item';
    const title = document.createElement('button');
    title.className = 'article-title-button';
    title.type = 'button';
    appendHighlightedText(title, article.title || '未命名文章', query);
    title.addEventListener('click', () => loadArticleDetail(article.id, {
      returnView: 'search-results',
    }));

    const summary = document.createElement('p');
    summary.className = 'article-summary';
    appendHighlightedText(summary, article.summary || '暂无摘要', query);

    const meta = document.createElement('p');
    meta.className = 'article-meta';
    const author = article.author || '未知作者';
    const date = formatDate(article.created_at);
    meta.textContent = author + ' · ' + getCategoryLabel(article.category) + (date ? ' · ' + date : '');
    item.append(title, summary, meta);
    list.appendChild(item);
  });
  shell.appendChild(list);
}

async function executeSearch(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    exitSearch();
    return;
  }
  captureSearchOrigin();
  const searchVersion = ++blogState.searchVersion;
  blogState.searchQuery = query;
  if (articleSearchInput) articleSearchInput.value = query;
  pageTitle.textContent = '搜索结果';
  pageSummary.textContent = '搜索：“' + query + '”';
  clearPageActions();
  setActiveNavigation(null);
  renderStatus('正在搜索文章...');

  try {
    const articles = await loadAllArticles();
    if (searchVersion !== blogState.searchVersion || blogState.searchQuery !== query) return;
    renderSearchResults(query, filterArticles(articles, query));
  } catch (error) {
    if (searchVersion !== blogState.searchVersion) return;
    blogState.currentSection = 'search-results';
    renderStatus('无法加载文章，请稍后重试。', 'is-error');
  }
}

function exitSearch() {
  blogState.searchVersion += 1;
  blogState.searchQuery = '';
  blogState.searchResults = [];
  blogState.detailReturnView = null;
  if (articleSearchInput) articleSearchInput.value = '';
  const origin = blogState.searchOrigin;
  blogState.searchOrigin = null;
  if (!origin) return;

  if (origin.section === 'article-detail' && origin.article) {
    const pageKey = PAGE_BY_CATEGORY[origin.article.category] || origin.pageKey;
    blogState.currentPageKey = pageKey;
    blogState.currentCategory = origin.article.category;
    setActiveNavigation(pageKey);
    renderArticleDetail(origin.article);
  } else if (origin.section === 'article-list' && pageInfo[origin.pageKey]) {
    loadArticleList(origin.pageKey);
  } else {
    renderStaticPage(pageInfo[origin.pageKey] ? origin.pageKey : 'home');
  }
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
  blogState.currentArticle = null;
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
  blogState.currentSection = 'article-detail';
  blogState.currentArticleId = article.id;
  blogState.currentArticle = article;
  pageTitle.textContent = article.title || page.title;
  pageSummary.textContent = '';
  renderArticleAdminActions(article);
  const shell = createContentShell();

  const back = document.createElement('button');
  back.className = 'article-back';
  back.type = 'button';
  back.textContent = '← 返回' + page.title;
  back.addEventListener('click', returnFromArticleDetail);

  const title = document.createElement('h2');
  title.className = 'article-detail-title';
  title.textContent = typeof article.title === 'string' ? article.title : '未命名文章';

  const body = document.createElement('div');
  body.className = 'article-body';
  const headings = renderMarkdown(typeof article.content === 'string' ? article.content : '', body);

  const main = document.createElement('div');
  main.className = 'article-detail-main';
  const commentsSection = document.createElement('section');
  commentsSection.className = 'article-comments';
  main.append(title, createArticleMeta(article), body, commentsSection);

  const layout = document.createElement('div');
  layout.className = 'article-detail-layout';
  const tocGroups = [];
  if (headings.length) {
    const desktopToc = createArticleToc(headings, false);
    const mobileToc = createArticleToc(headings, true);
    layout.append(main, desktopToc.element);
    shell.append(back, mobileToc.element, layout);
    tocGroups.push(desktopToc, mobileToc);
  } else {
    layout.appendChild(main);
    shell.append(back, layout);
  }

  setupReadingEnhancements(headings, tocGroups);
  blogState.commentsSection = commentsSection;
  loadComments(article.id, commentsSection);
}

function renderArticleAdminActions(article) {
  clearPageActions();
  if (!pageActions || !article || !isCurrentUserAdmin()) return;
  const editButton = document.createElement('button');
  editButton.className = 'create-article-button';
  editButton.type = 'button';
  editButton.textContent = '编辑文章';
  editButton.addEventListener('click', () => renderArticleEdit(article));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-article-button';
  deleteButton.type = 'button';
  deleteButton.textContent = '删除文章';
  deleteButton.addEventListener('click', () => showDeleteConfirmation(article));
  pageActions.append(editButton, deleteButton);
}

function closeDeleteConfirmation() {
  const dialog = blogState.deleteDialog;
  if (dialog && typeof dialog.remove === 'function') dialog.remove();
  blogState.deleteDialog = null;
}

function showDeleteConfirmation(article) {
  if (!article || article.id === undefined || !isCurrentUserAdmin()) return;
  closeDeleteConfirmation();

  const overlay = document.createElement('div');
  overlay.className = 'delete-confirm-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'deleteConfirmTitle');

  const panel = document.createElement('section');
  panel.className = 'delete-confirm-dialog';
  const title = document.createElement('h2');
  title.id = 'deleteConfirmTitle';
  title.textContent = '删除文章？';
  const prompt = document.createElement('p');
  prompt.textContent = '确定要删除：';
  const articleTitle = document.createElement('strong');
  articleTitle.className = 'delete-confirm-article-title';
  articleTitle.textContent = '《' + (article.title || '未命名文章') + '》';
  const warning = document.createElement('p');
  warning.className = 'delete-confirm-warning';
  warning.textContent = '删除后无法恢复。';
  const message = document.createElement('p');
  message.className = 'delete-confirm-message';
  message.setAttribute('role', 'alert');
  message.setAttribute('aria-live', 'polite');

  const cancelButton = document.createElement('button');
  cancelButton.className = 'delete-confirm-button secondary';
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', closeDeleteConfirmation);

  const confirmButton = document.createElement('button');
  confirmButton.className = 'delete-confirm-button danger';
  confirmButton.type = 'button';
  confirmButton.textContent = '确认删除';

  const actions = document.createElement('div');
  actions.className = 'delete-confirm-actions';
  actions.append(cancelButton, confirmButton);
  panel.append(title, prompt, articleTitle, warning, message, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const controls = { overlay, message, cancelButton, confirmButton };
  confirmButton.addEventListener('click', () => deleteArticle(article, controls));
  blogState.deleteDialog = overlay;
  confirmButton.focus();
}

async function deleteArticle(article, controls) {
  if (blogState.deleting) return;
  if (!isCurrentUserAdmin()) {
    controls.message.textContent = '无管理员权限';
    return;
  }

  const token = getSessionToken();
  if (!token) {
    controls.message.textContent = '登录已失效，请重新登录';
    closeDeleteConfirmation();
    await handleInvalidSession();
    return;
  }

  blogState.deleting = true;
  controls.confirmButton.disabled = true;
  controls.cancelButton.disabled = true;
  controls.confirmButton.textContent = '正在删除...';
  controls.message.textContent = '';

  const category = PAGE_BY_CATEGORY[article.category]
    ? article.category
    : blogState.currentCategory;
  const pageKey = PAGE_BY_CATEGORY[category] || blogState.currentPageKey;
  const returnToSearch = blogState.detailReturnView === 'search-results' && blogState.searchQuery;

  try {
    await apiRequest('/api/articles/' + encodeURIComponent(article.id), {
      method: 'DELETE',
      token,
    });
    delete blogState.articlesCache[category];
    blogState.allArticlesCache = null;
    blogState.allArticlesRequest = null;
    blogState.currentArticleId = null;
    blogState.currentArticle = null;
    closeDeleteConfirmation();
    if (returnToSearch) {
      await executeSearch(blogState.searchQuery);
    } else {
      await loadArticleList(pageKey, { force: true });
    }
  } catch (error) {
    if (error.status === 401) {
      controls.message.textContent = '登录已失效，请重新登录';
      closeDeleteConfirmation();
      await handleInvalidSession();
    } else if (error.status === 403) {
      controls.message.textContent = '无管理员权限';
    } else if (error.status === 404) {
      delete blogState.articlesCache[category];
      blogState.allArticlesCache = null;
      blogState.allArticlesRequest = null;
      blogState.currentArticleId = null;
      blogState.currentArticle = null;
      closeDeleteConfirmation();
      if (returnToSearch) {
        await executeSearch(blogState.searchQuery);
      } else {
        await loadArticleList(pageKey, { force: true });
      }
    } else if (error.code === 'network') {
      controls.message.textContent = '无法连接服务器，请稍后重试';
    } else {
      controls.message.textContent = '文章删除失败，请稍后重试';
    }
  } finally {
    blogState.deleting = false;
    controls.confirmButton.disabled = false;
    controls.cancelButton.disabled = false;
    controls.confirmButton.textContent = '确认删除';
  }
}

function createEditorField(labelText, control) {
  const label = document.createElement('label');
  label.className = 'article-editor-field';
  const labelName = document.createElement('span');
  labelName.textContent = labelText;
  label.append(labelName, control);
  return label;
}

function createMarkdownWorkspace(contentInput) {
  const field = document.createElement('div');
  field.className = 'article-editor-field article-markdown-field';
  const label = document.createElement('span');
  label.textContent = '正文';

  const workspace = document.createElement('div');
  workspace.className = 'markdown-workspace';
  const editorPane = document.createElement('section');
  editorPane.className = 'markdown-pane markdown-editor-pane';
  const editorTitle = document.createElement('div');
  editorTitle.className = 'markdown-pane-title';
  editorTitle.textContent = 'Markdown';
  editorPane.append(editorTitle, contentInput);

  const previewPane = document.createElement('section');
  previewPane.className = 'markdown-pane markdown-preview-pane';
  const previewTitle = document.createElement('div');
  previewTitle.className = 'markdown-pane-title';
  previewTitle.textContent = '预览';
  const preview = document.createElement('div');
  preview.className = 'article-body markdown-preview';
  preview.setAttribute('aria-live', 'polite');
  previewPane.append(previewTitle, preview);
  workspace.append(editorPane, previewPane);
  field.append(label, workspace);

  function updatePreview() {
    renderMarkdown(contentInput.value, preview);
    if (!contentInput.value.trim()) {
      const empty = document.createElement('p');
      empty.className = 'markdown-preview-empty';
      empty.textContent = '预览将在这里显示';
      preview.appendChild(empty);
    }
  }

  contentInput.addEventListener('input', updatePreview);
  updatePreview();
  return field;
}

function renderArticleCreate(pageKey) {
  const page = pageInfo[pageKey];
  if (!page || !page.category || !isCurrentUserAdmin()) return;

  renderArticleEditor('create', pageKey, null);
}

function renderArticleEdit(article) {
  if (!article || article.id === undefined || !isCurrentUserAdmin()) return;
  const pageKey = PAGE_BY_CATEGORY[article.category] || blogState.currentPageKey;
  renderArticleEditor('edit', pageKey, article);
}

function renderArticleEditor(mode, pageKey, article) {
  const page = pageInfo[pageKey];
  const isEdit = mode === 'edit';
  if (!page || !page.category || !isCurrentUserAdmin()) return;

  blogState.requestVersion += 1;
  blogState.currentSection = isEdit ? 'article-edit' : 'article-create';
  blogState.currentCategory = page.category;
  blogState.currentArticleId = isEdit ? article.id : null;
  blogState.currentArticle = isEdit ? article : null;
  blogState.currentPageKey = pageKey;
  blogState.publishing = false;
  pageTitle.textContent = isEdit ? '编辑文章' : '新建文章';
  pageSummary.textContent = (isEdit ? '修改' : '发布到') + page.title;
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
  titleInput.value = isEdit && typeof article.title === 'string' ? article.title : '';

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
  categorySelect.value = isEdit && PAGE_BY_CATEGORY[article.category]
    ? article.category
    : page.category;

  const summaryInput = document.createElement('textarea');
  summaryInput.className = 'article-editor-input article-editor-summary';
  summaryInput.maxLength = 500;
  summaryInput.rows = 3;
  summaryInput.value = isEdit && typeof article.summary === 'string' ? article.summary : '';

  const contentInput = document.createElement('textarea');
  contentInput.className = 'article-editor-input article-editor-content';
  contentInput.rows = 12;
  contentInput.placeholder = '使用 Markdown 编写正文...';
  contentInput.value = isEdit && typeof article.content === 'string' ? article.content : '';

  const message = document.createElement('p');
  message.className = 'article-editor-message';
  message.setAttribute('role', 'alert');
  message.setAttribute('aria-live', 'polite');

  const cancelButton = document.createElement('button');
  cancelButton.className = 'article-editor-button secondary';
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', () => {
    if (isEdit) {
      renderArticleDetail(article);
    } else {
      returnToArticleList();
    }
  });

  const publishButton = document.createElement('button');
  publishButton.className = 'article-editor-button primary';
  publishButton.type = 'submit';
  publishButton.textContent = isEdit ? '保存修改' : '发布文章';

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
    createMarkdownWorkspace(contentInput),
    message,
    actions
  );
  const editorContext = { mode, article };
  form.addEventListener('submit', (event) => submitArticleEditor(event, fields, editorContext));
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
  return submitArticleEditor(event, fields, { mode: 'create', article: null });
}

async function updateArticle(event, fields, article) {
  return submitArticleEditor(event, fields, { mode: 'edit', article });
}

async function submitArticleEditor(event, fields, editorContext) {
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
  const isEdit = editorContext.mode === 'edit';
  fields.publishButton.textContent = isEdit ? '正在保存...' : '正在发布...';
  setEditorMessage(fields, '');

  try {
    const originalArticle = editorContext.article;
    const originalCategory = isEdit && originalArticle ? originalArticle.category : null;
    const endpoint = isEdit
      ? '/api/articles/' + encodeURIComponent(originalArticle.id)
      : '/api/articles';
    const data = await apiRequest(endpoint, {
      method: isEdit ? 'PUT' : 'POST',
      token,
      body: { title, summary, content, category },
    });
    if (!data.article || typeof data.article !== 'object' || data.article.id === undefined) {
      throw new Error('invalid-data');
    }

    const articleCategory = PAGE_BY_CATEGORY[data.article.category] ? data.article.category : category;
    const articlePageKey = PAGE_BY_CATEGORY[articleCategory];
    if (originalCategory && PAGE_BY_CATEGORY[originalCategory]) {
      delete blogState.articlesCache[originalCategory];
    }
    delete blogState.articlesCache[articleCategory];
    blogState.allArticlesCache = null;
    blogState.allArticlesRequest = null;
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
    } else if (error.status === 404 && isEdit) {
      setEditorMessage(fields, '文章不存在或已被删除');
    } else if (error.code === 'network') {
      setEditorMessage(fields, '无法连接服务器，请稍后重试');
    } else {
      setEditorMessage(fields, isEdit
        ? '文章修改失败，请稍后重试'
        : '文章发布失败，请稍后重试');
    }
  } finally {
    blogState.publishing = false;
    fields.publishButton.disabled = false;
    fields.cancelButton.disabled = false;
    fields.publishButton.textContent = isEdit ? '保存修改' : '发布文章';
  }
}

async function loadArticleDetail(articleId, options) {
  if (articleId === undefined || articleId === null) return;
  const settings = options || {};
  const requestVersion = ++blogState.requestVersion;
  blogState.currentSection = 'article-detail';
  blogState.currentArticleId = articleId;
  blogState.currentArticle = null;
  blogState.detailReturnView = settings.returnView || null;
  renderStatus('正在加载文章内容...');

  try {
    const data = await apiRequest('/api/articles/' + encodeURIComponent(articleId));
    if (!data.article || typeof data.article !== 'object') throw new Error('invalid-data');
    if (requestVersion !== blogState.requestVersion || blogState.currentArticleId !== articleId) return;
    if (PAGE_BY_CATEGORY[data.article.category]) {
      blogState.currentCategory = data.article.category;
      blogState.currentPageKey = PAGE_BY_CATEGORY[data.article.category];
      setActiveNavigation(blogState.currentPageKey);
    }
    renderArticleDetail(data.article);
  } catch (error) {
    if (requestVersion !== blogState.requestVersion || blogState.currentArticleId !== articleId) return;
    renderStatus(error.status === 404
      ? '文章不存在或已被删除。'
      : '无法加载文章，请稍后重试。', 'is-error');
  }
}

function returnFromArticleDetail() {
  if (blogState.detailReturnView === 'search-results' && blogState.searchQuery) {
    renderSearchResults(blogState.searchQuery, blogState.searchResults);
    return;
  }
  returnToArticleList();
}

function returnToArticleList() {
  blogState.detailReturnView = null;
  const pageKey = blogState.currentPageKey;
  const page = pageInfo[pageKey];
  if (!page || !page.category) return;
  blogState.requestVersion += 1;
  blogState.currentSection = 'article-list';
  blogState.currentArticleId = null;
  blogState.currentArticle = null;
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

  blogState.searchVersion += 1;
  blogState.searchQuery = '';
  blogState.searchResults = [];
  blogState.searchOrigin = null;
  blogState.detailReturnView = null;
  if (articleSearchInput) articleSearchInput.value = '';
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

let searchDebounceTimer = null;
if (articleSearchInput) {
  articleSearchInput.addEventListener('input', () => {
    if (searchDebounceTimer !== null) window.clearTimeout(searchDebounceTimer);
    if (!articleSearchInput.value.trim()) {
      searchDebounceTimer = null;
      exitSearch();
      return;
    }
    searchDebounceTimer = window.setTimeout(() => {
      searchDebounceTimer = null;
      executeSearch(articleSearchInput.value);
    }, 220);
  });

  articleSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (searchDebounceTimer !== null) window.clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
      executeSearch(articleSearchInput.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (searchDebounceTimer !== null) window.clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
      exitSearch();
      articleSearchInput.focus();
    }
  });
}

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
    if (!isCurrentUserAdmin()) closeDeleteConfirmation();
    if (blogState.currentSection === 'article-list') {
      renderCreateArticleAction(blogState.currentPageKey);
    } else if (blogState.currentSection === 'article-detail') {
      renderArticleAdminActions(blogState.currentArticle);
      if (blogState.currentArticle && blogState.commentsSection) {
        loadComments(blogState.currentArticle.id, blogState.commentsSection);
      }
    } else if (!isCurrentUserAdmin() && blogState.currentSection === 'article-edit') {
      renderArticleDetail(blogState.currentArticle);
    } else if (!isCurrentUserAdmin() && blogState.currentSection === 'article-create') {
      returnToArticleList();
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
  loadAllArticles,
  executeSearch,
  exitSearch,
  filterArticles,
  returnToArticleList,
  renderArticleCreate,
  renderArticleEdit,
  showDeleteConfirmation,
  deleteArticle,
  loadComments,
  submitComment,
  deleteComment,
  publishArticle,
  updateArticle,
  isCurrentUserAdmin,
  getSessionToken,
  setPage,
  formatDate,
  renderMarkdown,
};
