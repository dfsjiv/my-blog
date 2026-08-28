(function () {
  const THEME_KEY = 'knowledge-site-theme';
  const VIEW_MODE_KEY = 'knowledge-site-view-mode';
  const LANGUAGE_KEY = 'knowledge-site-language';
  const PAGE_SIZE = 10;
  const URL_KEYS = [
    'knowledge', 'slug', 'q', 'type', 'category', 'tag', 'sort',
    'featured', 'pinned', 'page', 'archive', 'channel', 'postId', 'status',
  ];
  const navigationLinks = Object.freeze({
    socialLinks: Object.freeze({
      bilibili: 'https://space.bilibili.com/3546789605018414',
      github: 'https://github.com/dfsjiv',
      zhihu: 'https://www.zhihu.com/people/study-32-31',
      nowcoder: 'https://www.nowcoder.com/users/412412995',
    }),
    aboutLinks: Object.freeze({
      games: 'games',
      anime: 'anime',
      manga: 'manga',
      novels: 'novels',
    }),
  });
  const staticTextSources = new WeakMap();
  const staticAttributeSources = new WeakMap();
  const shell = document.getElementById('elegantShell');
  const homeView = document.getElementById('knowledgeHomeView');
  const routeView = document.getElementById('knowledgeRouteView');
  const navLinks = document.getElementById('knowledgeNavLinks');
  const menuToggle = document.getElementById('knowledgeMenuToggle');
  const themeButton = document.getElementById('knowledgeThemeButton');
  const languageButton = document.getElementById('knowledgeLanguageButton');
  const searchButton = document.getElementById('knowledgeSearchButton');
  const authorTools = document.getElementById('knowledgeAuthorTools');
  const settingsMenu = document.getElementById('knowledgeSettingsMenu');
  const logoutButton = document.getElementById('knowledgeLogoutButton');
  const accountMenu = shell ? shell.querySelector('.knowledge-account-menu') : null;
  const accountSummary = accountMenu ? accountMenu.querySelector('summary') : null;
  const navMenus = Array.from(document.querySelectorAll('[data-knowledge-nav-menu]'));
  const heroSlides = Array.from(document.querySelectorAll('[data-knowledge-hero-slide]'));
  const repository = window.KnowledgeRepository;
  const markdown = window.KnowledgeMarkdown;
  const data = window.KnowledgeMockData;
  const i18n = window.KnowledgeI18n;
  if (!shell || !homeView || !routeView || !repository || !markdown || !data || !i18n) return;

  const savedTheme = readStorage(THEME_KEY);
  const savedLanguage = readStorage(LANGUAGE_KEY);
  const state = {
    route: 'home',
    routePayload: {},
    viewMode: readStorage(VIEW_MODE_KEY) === 'grid' ? 'grid' : 'list',
    theme: ['system', 'light', 'dark'].includes(savedTheme) ? savedTheme : 'system',
    language: savedLanguage === 'zh' ? 'zh' : 'en',
    routeController: null,
    homeController: null,
    sectionObserver: null,
    gameCleanup: null,
    contestCleanup: null,
    routeTransitionActive: false,
    pendingNavigation: null,
    facets: null,
    homeLatestPage: 1,
    homeLatestHasNext: false,
    homeLatestLoading: false,
    homeLatestError: false,
    homeLatestSlugs: new Set(),
  };
  shell.dataset.language = state.language;

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Storage is an enhancement; the page remains usable without it.
    }
  }

  function setupHeroCarousel() {
    if (heroSlides.length < 2) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let activeIndex = 0;
    let timer = 0;

    function showSlide(index) {
      activeIndex = index;
      heroSlides.forEach(function (slide, slideIndex) {
        slide.classList.toggle('is-active', slideIndex === activeIndex);
      });
    }

    function stop() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = 0;
    }

    function start() {
      stop();
      if (document.hidden || reducedMotion.matches) return;
      timer = window.setInterval(function () {
        showSlide((activeIndex + 1) % heroSlides.length);
      }, 7000);
    }

    document.addEventListener('visibilitychange', start);
    if (typeof reducedMotion.addEventListener === 'function') {
      reducedMotion.addEventListener('change', start);
    }
    showSlide(0);
    start();
  }

  function t(value) {
    return i18n.translate(value, state.language);
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = t(text);
    return node;
  }

  function contentElement(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function button(text, className) {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
  }

  function contentButton(text, className) {
    const node = contentElement('button', className, text);
    node.type = 'button';
    return node;
  }

  function typeLabel(type) {
    const labels = {
      article: '技术文章',
      solution: '算法题解',
      note: '学习笔记',
      project: '项目记录',
      essay: '思考随笔',
    };
    return t(labels[type] || '内容');
  }

  function tagName(tag) {
    return typeof tag === 'string' ? tag : (tag && tag.name) || '';
  }

  function appendTags(container, tags) {
    (tags || []).forEach(function (tag) {
      const name = tagName(tag);
      if (name) container.appendChild(contentElement('span', 'knowledge-tag', name));
    });
  }

  function formatDate(value, includeTime) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(state.language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: includeTime ? '2-digit' : undefined,
      minute: includeTime ? '2-digit' : undefined,
    }).format(date);
  }

  function setNavOpen(open) {
    navLinks.classList.toggle('is-open', Boolean(open));
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', t(open ? '关闭导航菜单' : '打开导航菜单'));
    if (!open) closeNavMenus();
  }

  function closeNavMenus(exceptName) {
    navMenus.forEach(function (menu) {
      if (exceptName && menu.dataset.knowledgeNavMenu === exceptName) return;
      menu.classList.remove('is-open');
      const trigger = menu.querySelector('.knowledge-nav-menu-trigger');
      const submenu = menu.querySelector('.knowledge-nav-submenu');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (submenu) submenu.hidden = true;
    });
  }

  function setNavMenuOpen(menu, open) {
    if (!menu) return;
    const name = menu.dataset.knowledgeNavMenu;
    const trigger = menu.querySelector('.knowledge-nav-menu-trigger');
    const submenu = menu.querySelector('.knowledge-nav-submenu');
    if (!trigger || !submenu) return;
    if (open) closeNavMenus(name);
    menu.classList.toggle('is-open', Boolean(open));
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    submenu.hidden = !open;
  }

  function configureNavigationLinks() {
    navLinks.querySelectorAll('[data-social-link]').forEach(function (link) {
      const url = safeExternalUrl(navigationLinks.socialLinks[link.dataset.socialLink]);
      if (url) {
        link.href = url;
        link.removeAttribute('aria-disabled');
        link.removeAttribute('tabindex');
        return;
      }
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
      link.title = t('链接待补充');
    });
    navLinks.querySelectorAll('[data-about-link]').forEach(function (item) {
      const channel = navigationLinks.aboutLinks[item.dataset.aboutLink];
      item.disabled = !channel;
      if (channel) {
        item.dataset.knowledgeRoute = 'all';
        item.dataset.channel = channel;
      } else {
        delete item.dataset.knowledgeRoute;
        delete item.dataset.channel;
      }
    });
  }

  function setupNavigationMenus() {
    navMenus.forEach(function (menu) {
      const trigger = menu.querySelector('.knowledge-nav-menu-trigger');
      if (!trigger) return;
      trigger.addEventListener('click', function () {
        const isCompact = window.matchMedia('(max-width: 1040px)').matches;
        setNavMenuOpen(menu, isCompact ? !menu.classList.contains('is-open') : true);
      });
      menu.addEventListener('mouseenter', function () {
        if (!window.matchMedia('(max-width: 1040px)').matches) setNavMenuOpen(menu, true);
      });
      menu.addEventListener('mouseleave', function () {
        if (!window.matchMedia('(max-width: 1040px)').matches
          && !menu.contains(document.activeElement)) {
          setNavMenuOpen(menu, false);
        }
      });
      menu.addEventListener('focusin', function () {
        if (!window.matchMedia('(max-width: 1040px)').matches) {
          setNavMenuOpen(menu, true);
        }
      });
      menu.addEventListener('focusout', function (event) {
        if (!window.matchMedia('(max-width: 1040px)').matches
          && !menu.contains(event.relatedTarget)) {
          setNavMenuOpen(menu, false);
        }
      });
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('[data-knowledge-nav-menu]')) closeNavMenus();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      const openMenu = navMenus.find(function (menu) { return menu.classList.contains('is-open'); });
      if (!openMenu) return;
      openMenu.querySelector('.knowledge-nav-menu-trigger')?.focus();
      setNavMenuOpen(openMenu, false);
    });
  }

  function closeNavigation() {
    setNavOpen(false);
    closeNavMenus();
    shell.querySelectorAll('.knowledge-author-tools[open], .knowledge-account-menu[open]')
      .forEach(function (details) { details.removeAttribute('open'); });
  }

  function currentUser() {
    return window.authManager && window.authManager.getCurrentUser
      ? window.authManager.getCurrentUser()
      : null;
  }

  function isAuthor() {
    return Boolean(currentUser() && currentUser().role === 'admin');
  }

  function currentToken() {
    return window.authManager && window.authManager.state
      ? window.authManager.state.token
      : null;
  }

  function refreshIdentity(user) {
    const activeUser = user || currentUser();
    const username = activeUser && activeUser.username ? activeUser.username : t('当前用户');
    const accountName = document.getElementById('knowledgeAccountName');
    const accountInitial = document.getElementById('knowledgeAccountInitial');
    if (accountName) accountName.textContent = username;
    if (accountInitial) accountInitial.textContent = username.slice(0, 1).toUpperCase() || 'U';
    if (accountSummary) {
      const isGuest = Boolean(activeUser && activeUser.role === 'guest');
      const label = isGuest ? t('登录账户') : t('打开账户菜单');
      accountSummary.setAttribute('aria-label', label);
      accountSummary.title = label;
    }
    authorTools.hidden = !(activeUser && activeUser.role === 'admin');
    if (settingsMenu) settingsMenu.hidden = !(activeUser && activeUser.role === 'admin');
  }

  function applyTheme() {
    if (state.theme === 'system') shell.removeAttribute('data-theme');
    else shell.dataset.theme = state.theme;
    const labels = {
      system: '主题：跟随系统',
      light: '主题：浅色',
      dark: '主题：深色',
    };
    themeButton.textContent = state.theme === 'dark' ? '☾' : (state.theme === 'light' ? '☀' : '◐');
    themeButton.setAttribute('aria-label', t(labels[state.theme] + '，点击切换'));
    themeButton.title = themeButton.getAttribute('aria-label');
  }

  function cycleTheme() {
    state.theme = state.theme === 'system' ? 'light' : (state.theme === 'light' ? 'dark' : 'system');
    writeStorage(THEME_KEY, state.theme);
    applyTheme();
  }

  function translateStaticTree() {
    const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      const value = node.nodeValue;
      const trimmed = value.trim();
      if (!trimmed) return;
      const source = staticTextSources.get(node) || trimmed;
      if (!staticTextSources.has(node)) staticTextSources.set(node, source);
      node.nodeValue = value.replace(trimmed, t(source));
    });
    [shell].concat(Array.from(shell.querySelectorAll('[placeholder], [aria-label], [title]')))
      .forEach(function (node) {
        const sources = staticAttributeSources.get(node) || {};
        ['placeholder', 'aria-label', 'title'].forEach(function (attribute) {
          if (!node.hasAttribute(attribute)) return;
          if (!Object.prototype.hasOwnProperty.call(sources, attribute)) {
            sources[attribute] = node.getAttribute(attribute);
          }
          node.setAttribute(attribute, t(sources[attribute]));
        });
        staticAttributeSources.set(node, sources);
      });
  }

  function updateLanguageButton() {
    languageButton.textContent = state.language === 'en' ? '中文' : 'EN';
    languageButton.setAttribute(
      'aria-label',
      state.language === 'en' ? 'Switch to Chinese' : '切换到英文'
    );
    languageButton.title = languageButton.getAttribute('aria-label');
  }

  async function toggleLanguage() {
    state.language = state.language === 'en' ? 'zh' : 'en';
    writeStorage(LANGUAGE_KEY, state.language);
    shell.dataset.language = state.language;
    translateStaticTree();
    updateLanguageButton();
    applyTheme();
    refreshIdentity();
    await renderCurrentRoute({ replace: true, preserveScroll: true });
  }

  function safeExternalUrl(value) {
    const safe = markdown.safeUrl(value, false);
    if (!safe) return null;
    const parsed = new URL(safe, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? safe : null;
  }

  function coverNode(post) {
    const cover = element('div', 'knowledge-cover-placeholder');
    const safe = safeExternalUrl(post.coverUrl);
    if (!safe) {
      cover.textContent = t('暂无封面');
      return cover;
    }
    const image = document.createElement('img');
    image.src = safe;
    image.alt = post.title;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', function () {
      cover.replaceChildren(document.createTextNode(t('封面加载失败')));
    }, { once: true });
    cover.appendChild(image);
    return cover;
  }

  function detailCoverNode(post) {
    const safe = safeExternalUrl(post.coverUrl);
    if (!safe) return null;
    const figure = element('figure', 'knowledge-detail-cover');
    const image = document.createElement('img');
    image.src = safe;
    image.alt = post.title;
    image.decoding = 'async';
    image.addEventListener('error', function () {
      figure.remove();
    }, { once: true });
    figure.appendChild(image);
    return figure;
  }

  function appendIf(container, label, value) {
    if (value === null || value === undefined || value === '') return;
    container.appendChild(contentElement('span', '', label + value));
  }

  function makeContentCard(post) {
    const card = element('article', 'knowledge-content-card');
    card.dataset.postSlug = post.slug;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', t('打开文章：') + post.title);
    const body = element('div', 'knowledge-content-body');
    const top = element('div', 'knowledge-card-tags');
    top.appendChild(element('span', 'knowledge-type-badge', typeLabel(post.type)));
    const tags = element('div', 'knowledge-card-tags');
    appendTags(tags, post.tags);
    const meta = element('div', 'knowledge-card-meta');
    appendIf(meta, '', post.category);
    appendIf(meta, t('发布：'), formatDate(post.publishedAt));
    appendIf(meta, t('更新：'), formatDate(post.updatedAt));
    appendIf(meta, '', post.readingTimeMinutes ? post.readingTimeMinutes + ' ' + t('分钟') : '');
    appendIf(meta, '', post.wordCount ? post.wordCount + ' ' + t('字') : '');
    const flags = element('span', 'knowledge-card-flags');
    if (post.isPinned) flags.appendChild(element('span', 'knowledge-state-badge', '置顶'));
    if (post.isFeatured) flags.appendChild(element('span', 'knowledge-state-badge', '精选'));
    meta.appendChild(flags);
    body.append(top, contentElement('h3', '', post.title), contentElement('p', '', post.summary), tags, meta);
    card.append(coverNode(post), body);
    return card;
  }

  function makeFeaturedCard(post) {
    const card = element('article', 'knowledge-featured-card');
    card.dataset.postSlug = post.slug;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const tags = element('div', 'knowledge-card-tags');
    appendTags(tags, post.tags);
    card.append(
      element('span', 'knowledge-type-badge', typeLabel(post.type)),
      contentElement('h3', '', post.title),
      contentElement('p', '', post.summary),
      tags
    );
    return card;
  }

  function makeSolutionCard(post) {
    const solution = post.solution || {};
    const card = element('article', 'knowledge-solution-card');
    card.dataset.postSlug = post.slug;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', t('打开题解：') + post.title);
    const identity = element('div', 'knowledge-solution-identity');
    appendIf(identity, '', solution.platform);
    appendIf(identity, '', solution.problemId);
    appendIf(identity, '', solution.difficulty);
    const body = element('div', 'knowledge-solution-body');
    const tags = element('div', 'knowledge-card-tags');
    appendTags(tags, solution.algorithms);
    const meta = element('div', 'knowledge-solution-meta');
    appendIf(meta, t('语言：'), solution.language);
    appendIf(meta, t('时间：'), solution.timeComplexity);
    appendIf(meta, t('发布：'), formatDate(post.publishedAt));
    body.append(
      element('span', 'knowledge-type-badge', typeLabel(post.type)),
      contentElement('h3', '', solution.problemTitle || post.title),
      contentElement('p', '', post.summary),
      tags,
      meta
    );
    const problemUrl = safeExternalUrl(solution.problemUrl);
    if (problemUrl) {
      const link = element('a', 'knowledge-problem-link', '查看原题');
      link.href = problemUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      body.appendChild(link);
    }
    const visual = safeExternalUrl(post.coverUrl) ? coverNode(post) : identity;
    card.append(visual, body);
    return card;
  }

  function makeEmptyState(title, description, authorAction) {
    const empty = element('div', 'knowledge-empty-state');
    empty.append(element('strong', '', title), element('span', '', description));
    if (authorAction && isAuthor()) {
      const action = button('发布第一篇文章', 'knowledge-route-button');
      action.dataset.knowledgeRoute = 'writer';
      empty.appendChild(action);
    }
    return empty;
  }

  function makeLoadingState(label) {
    const loading = element('div', 'knowledge-loading-state');
    loading.setAttribute('role', 'status');
    loading.append(
      element('span', 'knowledge-loading-line'),
      element('span', 'knowledge-loading-line'),
      element('small', '', label || '正在加载…')
    );
    return loading;
  }

  function makeErrorState(retry) {
    const error = element('div', 'knowledge-error-state');
    error.appendChild(element('strong', '', '内容暂时无法加载。'));
    const retryButton = button('重新加载', 'knowledge-route-button');
    retryButton.addEventListener('click', retry);
    error.appendChild(retryButton);
    return error;
  }

  function renderCollection(container, posts, factory, emptyTitle) {
    container.replaceChildren();
    if (!posts.length) {
      container.appendChild(makeEmptyState(
        emptyTitle || '这里暂时还没有发布内容。',
        '发布后的内容会显示在这里。',
        true
      ));
      return;
    }
    posts.forEach(function (post) { container.appendChild(factory(post)); });
  }

  function renderHomeTypeLinks() {
    const typeLinks = document.getElementById('knowledgeTypeLinks');
    typeLinks.replaceChildren();
    data.contentTypes.forEach(function (contentType) {
      const item = button(contentType.label);
      item.dataset.knowledgeRoute = 'all';
      item.dataset.contentType = contentType.id;
      typeLinks.appendChild(item);
    });
  }

  function renderExternalPlatforms() {
    const platforms = document.getElementById('knowledgePlatformList');
    platforms.replaceChildren();
    data.platforms.forEach(function (platform) {
      if (!platform.href) return;
      const link = element('a', '', platform.label);
      link.href = platform.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      platforms.appendChild(link);
    });
  }

  function renderFacets(facets) {
    state.facets = facets;
    const categories = document.getElementById('knowledgeCategoryList');
    const domains = document.getElementById('knowledgeDomainList');
    const topics = document.getElementById('knowledgeTopicList');
    const tags = document.getElementById('knowledgeTagCloud');
    const archives = document.getElementById('knowledgeArchivePreview');
    const stats = document.getElementById('knowledgeStats');
    [categories, domains, topics, tags, archives, stats].forEach(function (node) {
      node.replaceChildren();
    });

    facets.categories.forEach(function (category) {
      const item = button('');
      item.dataset.knowledgeRoute = 'all';
      item.dataset.category = category.slug;
      item.append(contentElement('span', '', category.name), contentElement('span', '', String(category.count)));
      categories.appendChild(item);
    });
    facets.tags.slice(0, 12).forEach(function (tag, index) {
      const domain = contentButton(tag.name);
      domain.dataset.knowledgeRoute = 'all';
      domain.dataset.tag = tag.slug;
      domains.appendChild(domain);
      const cloudTag = contentButton(tag.name);
      cloudTag.dataset.knowledgeRoute = 'all';
      cloudTag.dataset.tag = tag.slug;
      tags.appendChild(cloudTag);
      if (index < 5) {
        const topic = button('');
        topic.dataset.knowledgeRoute = 'all';
        topic.dataset.tag = tag.slug;
        topic.append(contentElement('span', '', tag.name), element('span', '', '›'));
        topics.appendChild(topic);
      }
    });
    facets.archives.slice(0, 8).forEach(function (archive) {
      const item = button('');
      item.dataset.knowledgeRoute = 'all';
      item.dataset.archive = archive.year + '-' + String(archive.month).padStart(2, '0');
      item.append(
        element('span', '', archive.year + ' · ' + String(archive.month).padStart(2, '0')),
        element('span', '', String(archive.count))
      );
      archives.appendChild(item);
    });
    const statItems = [
      ['文章数量', facets.stats.posts],
      ['题解数量', facets.stats.solutions],
      ['分类数量', facets.categories.length],
      ['标签数量', facets.tags.length],
      ['总字数', facets.stats.words],
      ['最后更新', formatDate(facets.stats.lastUpdatedAt)],
    ];
    statItems.forEach(function (entry) {
      const item = element('div');
      item.append(element('dt', '', entry[0]), element('dd', '', entry[1] === '' ? '0' : String(entry[1] ?? 0)));
      stats.appendChild(item);
    });
    const authorCount = shell.querySelector('.knowledge-author-meta strong');
    if (authorCount) authorCount.textContent = String(facets.stats.posts || 0);
  }

  function renderFacetError() {
    ['knowledgeCategoryList', 'knowledgeDomainList', 'knowledgeTopicList',
      'knowledgeTagCloud', 'knowledgeArchivePreview', 'knowledgeStats']
      .forEach(function (id) {
        const node = document.getElementById(id);
        node.replaceChildren(element('span', 'knowledge-data-unavailable', '--'));
      });
  }

  function renderRecentUpdates(posts) {
    const updates = document.getElementById('knowledgeUpdateList');
    updates.replaceChildren();
    if (!posts.length) {
      updates.appendChild(element('li', '', '这里暂时还没有发布内容。'));
      return;
    }
    posts.forEach(function (post) {
      const item = element('li');
      item.dataset.postSlug = post.slug;
      item.tabIndex = 0;
      item.append(
        element('time', '', formatDate(post.updatedAt, true)),
        contentElement('strong', '', post.title),
        element('small', '', typeLabel(post.type))
      );
      updates.appendChild(item);
    });
  }

  function updateHomeLoadMoreButton() {
    const control = document.getElementById('knowledgeLoadMore');
    control.hidden = !state.homeLatestHasNext;
    control.disabled = state.homeLatestLoading;
    control.textContent = t(
      state.homeLatestLoading
        ? '正在加载更多…'
        : state.homeLatestError ? '加载失败，点击重试' : '加载更多'
    );
  }

  function appendLatestPosts(container, posts) {
    posts.forEach(function (post) {
      if (state.homeLatestSlugs.has(post.slug)) return;
      state.homeLatestSlugs.add(post.slug);
      container.appendChild(makeContentCard(post));
    });
  }

  async function loadMoreLatest() {
    if (state.homeLatestLoading || !state.homeLatestHasNext || !state.homeController) return;
    const latest = document.getElementById('knowledgeLatestList');
    const controller = state.homeController;
    state.homeLatestLoading = true;
    state.homeLatestError = false;
    updateHomeLoadMoreButton();
    try {
      const result = await repository.getPosts({
        page: state.homeLatestPage + 1,
        pageSize: 5,
        sort: 'latest',
      }, { signal: controller.signal });
      if (controller.signal.aborted || state.homeController !== controller) return;
      appendLatestPosts(latest, result.items);
      state.homeLatestPage = result.pagination.page;
      state.homeLatestHasNext = Boolean(result.pagination.hasNext);
      applyViewMode();
    } catch (error) {
      if (controller.signal.aborted) return;
      state.homeLatestError = true;
    } finally {
      if (state.homeController === controller) {
        state.homeLatestLoading = false;
        updateHomeLoadMoreButton();
      }
    }
  }

  async function loadHome(options) {
    if (state.homeController) state.homeController.abort();
    const controller = new AbortController();
    state.homeController = controller;
    renderHomeTypeLinks();
    renderExternalPlatforms();
    const featured = document.getElementById('knowledgeFeaturedList');
    const latest = document.getElementById('knowledgeLatestList');
    const solutions = document.getElementById('knowledgeSolutionList');
    const updates = document.getElementById('knowledgeUpdateList');
    state.homeLatestPage = 1;
    state.homeLatestHasNext = false;
    state.homeLatestLoading = false;
    state.homeLatestError = false;
    state.homeLatestSlugs = new Set();
    updateHomeLoadMoreButton();
    [featured, latest, solutions, updates].forEach(function (container) {
      container.replaceChildren(makeLoadingState('正在加载…'));
    });

    const settings = { signal: controller.signal, refresh: Boolean(options && options.refresh) };
    const jobs = [
      repository.getFacets(settings),
      repository.getPosts({ page: 1, pageSize: 3, featured: true, sort: 'latest' }, settings),
      repository.getPosts({ page: 1, pageSize: 5, sort: 'latest' }, settings),
      repository.getPosts({ page: 1, pageSize: 4, type: 'solution', sort: 'latest' }, settings),
      repository.getPosts({ page: 1, pageSize: 5, sort: 'updated' }, settings),
    ];
    const results = await Promise.allSettled(jobs);
    if (controller.signal.aborted) return;
    if (results[0].status === 'fulfilled') renderFacets(results[0].value);
    else renderFacetError();
    if (results[1].status === 'fulfilled') {
      const featuredPosts = results[1].value.items;
      featured.closest('.knowledge-feed-section').hidden = !featuredPosts.length;
      if (featuredPosts.length) renderCollection(featured, featuredPosts, makeFeaturedCard);
      else featured.replaceChildren();
    } else {
      featured.closest('.knowledge-feed-section').hidden = false;
      featured.replaceChildren(makeErrorState(function () { loadHome({ refresh: true }); }));
    }
    if (results[2].status === 'fulfilled') {
      latest.replaceChildren();
      appendLatestPosts(latest, results[2].value.items);
      if (!results[2].value.items.length) {
        latest.appendChild(makeEmptyState(
          '这里暂时还没有发布内容。',
          '发布后的内容会显示在这里。',
          true
        ));
      }
      state.homeLatestPage = results[2].value.pagination.page;
      state.homeLatestHasNext = Boolean(results[2].value.pagination.hasNext);
      updateHomeLoadMoreButton();
      applyViewMode();
    } else {
      state.homeLatestHasNext = false;
      updateHomeLoadMoreButton();
      latest.replaceChildren(makeErrorState(function () { loadHome({ refresh: true }); }));
    }
    if (results[3].status === 'fulfilled') {
      renderCollection(solutions, results[3].value.items, makeSolutionCard);
    } else solutions.replaceChildren(makeErrorState(function () { loadHome({ refresh: true }); }));
    if (results[4].status === 'fulfilled') renderRecentUpdates(results[4].value.items);
    else updates.replaceChildren(makeErrorState(function () { loadHome({ refresh: true }); }));
  }

  function applyViewMode() {
    shell.querySelectorAll('.knowledge-post-list, .knowledge-search-results').forEach(function (list) {
      list.classList.toggle('is-grid', state.viewMode === 'grid');
    });
    shell.querySelectorAll('[data-view-mode]').forEach(function (control) {
      control.classList.toggle('is-active', control.dataset.viewMode === state.viewMode);
    });
  }

  function setViewMode(mode) {
    state.viewMode = mode === 'grid' ? 'grid' : 'list';
    writeStorage(VIEW_MODE_KEY, state.viewMode);
    applyViewMode();
  }

  function routeHeader(kicker, title, description) {
    const header = element('header', 'knowledge-route-header');
    header.append(
      element('span', 'knowledge-route-kicker', kicker),
      element('h1', '', title),
      element('p', '', description)
    );
    return header;
  }

  function showRouteShell(kicker, title, description) {
    homeView.hidden = true;
    routeView.hidden = false;
    routeView.replaceChildren();
    const node = element('div', 'knowledge-route-shell');
    node.appendChild(routeHeader(kicker, title, description));
    routeView.appendChild(node);
    return node;
  }

  function updateActiveNav(route, payload) {
    shell.querySelectorAll('[data-knowledge-route]').forEach(function (item) {
      const target = item.dataset.knowledgeRoute;
      let active = target === route;
      if (route === 'all') {
        if (item.dataset.channel) {
          active = item.dataset.channel === payload.channel;
        } else if (target === 'articles') {
          active = payload.type === 'article';
        } else if (target === 'solutions') {
          active = payload.type === 'solution';
        } else if (target === 'notes') {
          active = payload.type === 'note';
        } else if (target === 'projects') {
          active = payload.type === 'project';
        } else if (target === 'all') {
          active = !payload.type && !payload.channel;
        }
      }
      item.classList.toggle('is-active', active);
    });
    navMenus.forEach(function (menu) {
      const trigger = menu.querySelector('.knowledge-nav-menu-trigger');
      if (trigger) {
        trigger.classList.toggle(
          'is-active',
          Boolean(menu.querySelector('[data-knowledge-route].is-active'))
        );
      }
    });
  }

  function parsePage(value) {
    const page = Number.parseInt(value || '1', 10);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  function parseOptionalId(value) {
    const id = Number.parseInt(value || '', 10);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function routeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const routeName = params.get('knowledge') || 'home';
    if (routeName === 'post') {
      return { route: 'detail', payload: { slug: params.get('slug') || '' } };
    }
    const route = ['home', 'games', 'contests', 'all', 'categories', 'tags', 'archives', 'about',
      'writer', 'drafts', 'manage', 'mover', 'invitations'].includes(routeName) ? routeName : 'home';
    return {
      route,
      payload: {
        q: params.get('q') || '',
        type: params.get('type') || '',
        category: params.get('category') || '',
        tag: params.get('tag') || '',
        sort: params.get('sort') || 'latest',
        featured: params.get('featured') || '',
        pinned: params.get('pinned') || '',
        page: parsePage(params.get('page')),
        archive: params.get('archive') || '',
        channel: params.get('channel') || '',
        postId: parseOptionalId(params.get('postId')),
        status: params.get('status') || '',
      },
    };
  }

  function writeRouteUrl(route, payload, replace) {
    const url = new URL(window.location.href);
    URL_KEYS.forEach(function (key) { url.searchParams.delete(key); });
    if (route === 'detail') {
      url.searchParams.set('knowledge', 'post');
      url.searchParams.set('slug', payload.slug);
    } else if (route !== 'home') {
      url.searchParams.set('knowledge', route);
      if (route === 'writer' && payload.postId) {
        url.searchParams.set('postId', String(payload.postId));
      } else if (route !== 'writer') {
        ['q', 'type', 'category', 'tag', 'sort', 'featured', 'pinned', 'archive', 'channel', 'status']
          .forEach(function (key) {
            if (payload[key]) url.searchParams.set(key, payload[key]);
          });
        if (payload.page && payload.page > 1) url.searchParams.set('page', String(payload.page));
      }
    }
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ knowledgeRoute: route }, '', url.pathname + url.search + url.hash);
  }

  function abortRouteWork() {
    if (state.routeController) state.routeController.abort();
    if (state.route !== 'home' && state.homeController) state.homeController.abort();
    if (state.sectionObserver) {
      state.sectionObserver.disconnect();
      state.sectionObserver = null;
    }
    if (state.gameCleanup) {
      state.gameCleanup();
      state.gameCleanup = null;
    }
    if (state.contestCleanup) {
      state.contestCleanup();
      state.contestCleanup = null;
    }
    state.routeController = new AbortController();
    return state.routeController;
  }

  function routeNeedsTransition(route, details, settings) {
    if (settings.refresh || settings.skipTransition) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (route !== state.route) return true;
    return route === 'detail' && details.slug !== state.routePayload.slug;
  }

  function waitForRouteSlide(node) {
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (event) {
        if (event && (event.target !== node || !event.animationName.startsWith('knowledge-page-slide-'))) {
          return;
        }
        if (done) return;
        done = true;
        node.removeEventListener('animationend', finish);
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(finish, 540);
      node.addEventListener('animationend', finish, { once: true });
    });
  }

  function resetRouteScroll() {
    shell.scrollTop = 0;
    shell.scrollLeft = 0;
    routeView.scrollTop = 0;
  }

  function waitForRouteLayout() {
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  async function runFallbackRouteTransition(updateRoute) {
    const main = shell.querySelector('.knowledge-main');
    const previousRoute = shell.dataset.route || state.route || 'home';
    const rect = main.getBoundingClientRect();
    const previousPage = main.cloneNode(true);
    let nextPage = null;
    previousPage.querySelectorAll('[id]').forEach(function (node) { node.removeAttribute('id'); });
    previousPage.removeAttribute('id');
    previousPage.setAttribute('aria-hidden', 'true');
    previousPage.classList.add('knowledge-route-snapshot');
    previousPage.dataset.snapshotRoute = previousRoute;
    Object.assign(previousPage.style, {
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
    main.style.visibility = 'hidden';
    shell.classList.add('knowledge-route-transitioning');
    shell.appendChild(previousPage);

    try {
      const hydrationPromise = updateRoute();
      hydrationPromise.catch(function (error) {
        if (error && error.name === 'AbortError') return;
        console.error('Knowledge route hydration failed:', error);
      });
      resetRouteScroll();
      await waitForRouteLayout();
      const nextRect = main.getBoundingClientRect();
      nextPage = main.cloneNode(true);
      nextPage.querySelectorAll('[id]').forEach(function (node) { node.removeAttribute('id'); });
      nextPage.removeAttribute('id');
      nextPage.setAttribute('aria-hidden', 'true');
      nextPage.classList.add('knowledge-route-snapshot', 'knowledge-route-next');
      nextPage.dataset.snapshotRoute = shell.dataset.route || state.route;
      nextPage.style.removeProperty('visibility');
      Object.assign(nextPage.style, {
        top: nextRect.top + 'px',
        left: nextRect.left + 'px',
        width: nextRect.width + 'px',
        height: nextRect.height + 'px',
      });
      shell.appendChild(nextPage);
      previousPage.classList.add('knowledge-route-leaving');
      nextPage.classList.add('knowledge-route-entering');
      await Promise.all([waitForRouteSlide(nextPage), waitForRouteSlide(previousPage)]);
    } finally {
      resetRouteScroll();
      main.style.removeProperty('visibility');
      if (nextPage) nextPage.remove();
      previousPage.remove();
      shell.classList.remove('knowledge-route-transitioning');
    }
  }

  async function performNavigation(route, details, settings) {
    const shouldTransition = routeNeedsTransition(route, details, settings);
    closeNavigation();

    const updateRoute = async function () {
      state.route = route;
      state.routePayload = details;
      if (!settings.fromHistory) writeRouteUrl(route, details, Boolean(settings.replace));
      updateActiveNav(route, details);
      if (!settings.preserveScroll) resetRouteScroll();
      const result = await renderCurrentRoute(settings);
      if (!settings.preserveScroll) resetRouteScroll();
      return result;
    };

    if (!shouldTransition) {
      return updateRoute();
    }

    return runFallbackRouteTransition(updateRoute);
  }

  async function navigate(route, payload, options) {
    const settings = options || {};
    const details = Object.assign({}, payload || {});
    if (state.routeTransitionActive) {
      state.pendingNavigation = { route, details, settings };
      return;
    }

    state.routeTransitionActive = true;
    try {
      return await performNavigation(route, details, settings);
    } finally {
      state.routeTransitionActive = false;
      const pending = state.pendingNavigation;
      state.pendingNavigation = null;
      if (pending) navigate(pending.route, pending.details, pending.settings);
    }
  }

  async function renderCurrentRoute(options) {
    const controller = abortRouteWork();
    const route = state.route;
    const details = state.routePayload;
    shell.dataset.route = route;
    if (route !== 'writer') {
      shell.classList.remove('knowledge-writing-mode');
      window.KnowledgeWriter?.destroy?.();
    }
    if (route === 'home') {
      homeView.hidden = false;
      routeView.hidden = true;
      await loadHome(options);
      return;
    }
    if (route === 'games') return renderGameGallery();
    if (route === 'contests') return renderContestPage(controller);
    if (route === 'all') return renderPostIndex(details, controller);
    if (route === 'categories') return renderFacetIndex('categories', controller);
    if (route === 'tags') return renderFacetIndex('tags', controller);
    if (route === 'archives') return renderFacetIndex('archives', controller);
    if (route === 'about') return renderAbout();
    if (route === 'detail') return renderDetail(details.slug, controller);
    if (route === 'mover') return renderArticleMover();
    if (route === 'writer') return renderWriter(details);
    if (route === 'drafts' || route === 'manage') return renderAdminPosts(route, details, controller);
    if (route === 'invitations') return renderInvitations(controller);
    return navigate('home', {}, { replace: true });
  }

  function renderGameGallery() {
    homeView.hidden = true;
    routeView.hidden = false;
    routeView.replaceChildren();

    const games = [
      { number: '01', title: '2048', tone: 'cyan', type: '2048' },
    ];
    const gallery = element('section', 'knowledge-game-gallery');
    gallery.setAttribute('aria-label', t('小游戏'));
    const rail = element('div', 'knowledge-game-rail');
    rail.tabIndex = 0;
    rail.setAttribute('aria-label', t('游戏陈列室'));
    const pagination = element('nav', 'knowledge-game-pagination');
    pagination.setAttribute('aria-label', t('游戏陈列室'));

    games.forEach(function (game, index) {
      const slide = element('article', 'knowledge-game-slide');
      slide.dataset.gameIndex = String(index);
      slide.dataset.tone = game.tone;

      const heading = element('header', 'knowledge-game-heading');
      heading.append(
        element('span', 'knowledge-route-kicker', '游戏陈列室'),
        element('h1', '', game.title),
        element('p', '', '合并相同数字，尝试得到 2048。支持方向键、WASD 和触摸滑动。')
      );

      const windowFrame = element('div', 'knowledge-game-window');
      const titleBar = element('div', 'knowledge-game-titlebar');
      const windowIdentity = element('div', 'knowledge-game-window-identity');
      const appIcon = element('span', 'knowledge-game-app-icon', game.number);
      windowIdentity.append(appIcon, element('strong', '', game.title));
      const windowState = element('span', 'knowledge-game-state', '可游玩');
      titleBar.append(windowIdentity, windowState);

      const stage = element('div', 'knowledge-game-stage');
      if (game.type === '2048') {
        stage.classList.add('is-2048');
        const gameRoot = element('div', 'knowledge-2048-mount');
        stage.appendChild(gameRoot);
        if (window.KnowledgeGame2048?.mount) {
          state.gameCleanup = window.KnowledgeGame2048.mount(gameRoot, { translate: t });
        }
      }

      const statusBar = element('div', 'knowledge-game-statusbar');
      statusBar.append(
        element('span', '', game.number + ' / ' + String(games.length).padStart(2, '0')),
        element('span', '', games.length > 1 ? '使用滚轮切换' : '方向键 / WASD / 触摸滑动')
      );
      windowFrame.append(titleBar, stage, statusBar);
      slide.append(heading, windowFrame);
      rail.appendChild(slide);

      const pageButton = button(game.number, index === 0 ? 'is-active' : '');
      pageButton.setAttribute('aria-label', t('第 ' + (index + 1) + ' 个游戏'));
      pageButton.addEventListener('click', function () {
        slide.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      pagination.appendChild(pageButton);
    });

    const wheelHint = element('div', 'knowledge-game-wheel-hint');
    wheelHint.setAttribute('aria-hidden', 'true');
    wheelHint.append(element('span', '', '↓'), element('small', '', '使用滚轮切换'));
    gallery.appendChild(rail);
    if (games.length > 1) gallery.append(pagination, wheelHint);
    routeView.appendChild(gallery);

    const slides = Array.from(rail.querySelectorAll('.knowledge-game-slide'));
    const pageButtons = Array.from(pagination.querySelectorAll('button'));
    if ('IntersectionObserver' in window) {
      state.sectionObserver = new IntersectionObserver(function (entries) {
        const visible = entries
          .filter(function (entry) { return entry.isIntersecting; })
          .sort(function (left, right) { return right.intersectionRatio - left.intersectionRatio; })[0];
        if (!visible) return;
        const activeIndex = Number(visible.target.dataset.gameIndex);
        pageButtons.forEach(function (item, index) {
          const active = index === activeIndex;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-current', active ? 'page' : 'false');
        });
        wheelHint.hidden = activeIndex === slides.length - 1;
      }, { root: rail, threshold: [0.55, 0.8] });
      slides.forEach(function (slide) { state.sectionObserver.observe(slide); });
    }
  }

  function renderContestPage(controller) {
    const node = showRouteShell(
      'CONTEST CALENDAR',
      '竞赛中心',
      '聚合原有竞赛，并单独标记官方 XCPC 线上与线下赛事。'
    );
    node.classList.add('knowledge-contest-shell');

    const stateNode = {
      contests: [],
      scope: 'all',
      status: 'active',
      keyword: '',
      loading: true,
      error: false,
      warnings: [],
    };
    const toolbar = element('div', 'knowledge-contest-toolbar');
    const scopeSelect = element('select', 'knowledge-contest-select');
    scopeSelect.setAttribute('aria-label', t('赛事范围'));
    scopeSelect.append(
      new Option(t('全部竞赛'), 'all'),
      new Option(t('官方 XCPC'), 'xcpc')
    );
    const statusSelect = element('select', 'knowledge-contest-select');
    statusSelect.setAttribute('aria-label', t('比赛状态'));
    statusSelect.append(
      new Option(t('进行中与即将开始'), 'active'),
      new Option(t('仅即将开始'), 'upcoming'),
      new Option(t('全部状态'), 'all')
    );
    const search = element('input', 'knowledge-contest-search');
    search.type = 'search';
    search.placeholder = t('搜索比赛或平台');
    search.setAttribute('aria-label', search.placeholder);
    const refresh = button('刷新', 'knowledge-contest-refresh');
    toolbar.append(scopeSelect, statusSelect, search, refresh);

    const summary = element('div', 'knowledge-contest-summary');
    const notice = element('p', 'knowledge-contest-notice');
    const list = element('div', 'knowledge-contest-list');
    list.setAttribute('aria-live', 'polite');
    node.append(toolbar, summary, notice, list);

    function contestStatus(contest) {
      if (contest.dateTba || !contest.startTime) return 'upcoming';
      const now = Date.now();
      const start = Date.parse(contest.startTime);
      const end = contest.endTime ? Date.parse(contest.endTime) : NaN;
      if (now < start) return 'upcoming';
      if (!Number.isFinite(end) || now < end) return 'running';
      return 'finished';
    }

    function isXcpc(contest) {
      return ['ICPC', 'CCPC', 'XCPC'].includes(String(contest.series || '').toUpperCase());
    }

    function formatContestTime(value) {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return t('日期待定');
      return new Intl.DateTimeFormat(state.language === 'zh' ? 'zh-CN' : 'en-GB', {
        timeZone: 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date);
    }

    function formatContestDuration(seconds) {
      const minutes = Math.round(Number(seconds) / 60);
      if (!Number.isFinite(minutes) || minutes < 1) return t('时长待定');
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return hours ? hours + 'h' + (rest ? ' ' + rest + 'm' : '') : rest + 'm';
    }

    function statusLabel(status) {
      return t({ upcoming: '即将开始', running: '进行中', finished: '已结束' }[status]);
    }

    function filteredContests() {
      const keyword = stateNode.keyword.toLocaleLowerCase();
      return stateNode.contests.filter(function (contest) {
        const status = contestStatus(contest);
        if (stateNode.scope === 'xcpc' && !isXcpc(contest)) return false;
        if (stateNode.status === 'active' && status === 'finished') return false;
        if (stateNode.status === 'upcoming' && status !== 'upcoming') return false;
        const searchable = [contest.title, contest.platform, contest.series, contest.location].filter(Boolean).join(' ');
        if (keyword && !searchable.toLocaleLowerCase().includes(keyword)) return false;
        return true;
      });
    }

    function makeContestCard(contest) {
      const status = contestStatus(contest);
      const card = element('article', 'knowledge-contest-card');
      card.dataset.status = status;
      const date = element('div', 'knowledge-contest-date');
      const formattedTime = formatContestTime(contest.startTime);
      const timeParts = formattedTime.split(' ');
      date.append(
        element('strong', '', contest.dateTba ? t('待定') : timeParts[0]),
        element('span', '', contest.dateTba ? t('官方赛程') : timeParts.slice(1).join(' '))
      );
      const body = element('div', 'knowledge-contest-card-body');
      const meta = element('div', 'knowledge-contest-meta');
      meta.append(
        element('span', 'knowledge-contest-platform', contest.platform),
        element('span', 'knowledge-contest-status', statusLabel(status)),
        isXcpc(contest) ? element('span', 'knowledge-contest-xcpc', 'XCPC') : document.createDocumentFragment(),
        contest.eventMode && contest.eventMode !== 'unknown'
          ? element('span', 'knowledge-contest-mode', t({ online: '线上', onsite: '线下', hybrid: '线上与线下' }[contest.eventMode]))
          : document.createDocumentFragment()
      );
      body.append(meta, element('h2', '', contest.title));
      const detailParts = [formattedTime];
      if (!contest.dateTba) detailParts.push(formatContestDuration(contest.durationSeconds));
      if (contest.location) detailParts.push(t('地点') + ': ' + contest.location);
      const details = element('p', '', detailParts.join(' · '));
      body.appendChild(details);
      const link = element('a', 'knowledge-contest-link', '查看官网');
      const safeUrl = safeExternalUrl(contest.url);
      if (safeUrl) {
        link.href = safeUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      } else {
        link.hidden = true;
      }
      card.append(date, body, link);
      return card;
    }

    function render() {
      list.replaceChildren();
      summary.replaceChildren();
      if (stateNode.loading) {
        list.appendChild(element('div', 'knowledge-contest-state', '正在获取竞赛信息……'));
        return;
      }
      if (stateNode.error) {
        list.appendChild(element('div', 'knowledge-contest-state is-error', '竞赛信息加载失败，请稍后重试。'));
        return;
      }
      const visible = filteredContests();
      const activeCount = stateNode.contests.filter(function (contest) {
        return contestStatus(contest) !== 'finished';
      }).length;
      summary.append(
        element('div', '', String(visible.length) + '\n' + t('当前结果')),
        element('div', '', String(activeCount) + '\n' + t('活跃竞赛')),
        element('div', '', String(stateNode.contests.filter(isXcpc).length) + '\n' + t('官方 XCPC'))
      );
      notice.textContent = stateNode.warnings.length
        ? t('部分数据源暂时不可用，已展示其余来源。')
        : '';
      if (!visible.length) {
        const empty = element('div', 'knowledge-contest-state');
        empty.append(
          element('strong', '', stateNode.scope === 'xcpc'
            ? '暂未抓取到符合条件的 XCPC 正式赛事。'
            : '没有符合条件的比赛。'),
          element('span', '', '可以切换状态或稍后刷新重试。')
        );
        list.appendChild(empty);
        return;
      }
      visible.forEach(function (contest) { list.appendChild(makeContestCard(contest)); });
    }

    async function load() {
      stateNode.loading = true;
      stateNode.error = false;
      render();
      try {
        const response = await fetch('/api/contests', {
          cache: 'no-cache',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || payload?.success !== true || !Array.isArray(payload.contests)) {
          throw new Error('invalid contest response');
        }
        stateNode.contests = payload.contests.filter(function (contest) {
          return contest && contest.id && contest.platform && contest.title && (contest.startTime || contest.dateTba);
        });
        stateNode.warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
      } catch (error) {
        if (error.name === 'AbortError') return;
        stateNode.error = true;
      } finally {
        stateNode.loading = false;
        render();
      }
    }

    scopeSelect.addEventListener('change', function () { stateNode.scope = scopeSelect.value; render(); });
    statusSelect.addEventListener('change', function () { stateNode.status = statusSelect.value; render(); });
    search.addEventListener('input', debounce(function () { stateNode.keyword = search.value.trim(); render(); }, 120));
    refresh.addEventListener('click', load);
    state.contestCleanup = function () { stateNode.contests = []; };
    load();
  }

  function selectControl(label, values, selected) {
    const select = element('select');
    select.setAttribute('aria-label', t(label));
    select.appendChild(new Option(t(label), ''));
    values.forEach(function (entry) {
      const option = typeof entry === 'object' ? entry : { label: entry, value: entry };
      select.appendChild(new Option(t(option.label), option.value));
    });
    select.value = selected || '';
    return select;
  }

  function listTitle(filters) {
    const channelTitles = {
      games: '游戏',
      anime: '动漫',
      manga: '漫画',
      novels: '小说',
    };
    if (filters.channel && channelTitles[filters.channel]) return t(channelTitles[filters.channel]);
    if (filters.archive) return filters.archive + ' ' + t('文章归档');
    if (filters.type) return typeLabel(filters.type);
    if (filters.q) return t('搜索结果');
    return t('全部文章');
  }

  function channelDescription(channel) {
    const descriptions = {
      games: '游戏记录与相关内容。',
      anime: '动漫记录与相关内容。',
      manga: '漫画记录与相关内容。',
      novels: '小说记录与相关内容。',
    };
    return t(descriptions[channel]
      || '浏览已发布的文章、题解、笔记、项目记录和随笔。');
  }

  function channelEmptyTitle(channel) {
    const labels = {
      games: '这里暂时还没有发布游戏内容。',
      anime: '这里暂时还没有发布动漫内容。',
      manga: '这里暂时还没有发布漫画内容。',
      novels: '这里暂时还没有发布小说内容。',
    };
    return labels[channel] || '这里暂时还没有发布内容。';
  }

  async function renderPostIndex(initialFilters, controller) {
    if (initialFilters?.channel === 'anime' || initialFilters?.channel === 'games') {
      const kind = initialFilters.channel === 'games' ? 'game' : 'anime';
      const node = showRouteShell(
        kind === 'game' ? 'GAMES' : 'ANIME',
        state.language === 'zh' ? (kind === 'game' ? '游戏' : '动漫') : (kind === 'game' ? 'Games' : 'Anime'),
        state.language === 'zh'
          ? (kind === 'game' ? '我喜欢的游戏，以及可以了解或体验它们的平台。' : '我喜欢的动漫，以及可以观看或了解它们的平台。')
          : (kind === 'game' ? 'Games I enjoy and where to find them.' : 'Anime I enjoy and where to watch or learn more.')
      );
      return window.KnowledgeFavorites.render(node, {
        kind,
        language: state.language,
        isAdmin: isAuthor(),
        token: currentToken(),
        repository,
        signal: controller.signal,
      });
    }
    const filters = Object.assign({
      q: '',
      type: '',
      category: '',
      tag: '',
      sort: 'latest',
      featured: '',
      pinned: '',
      page: 1,
      archive: '',
      channel: '',
    }, initialFilters || {});
    const shellNode = showRouteShell(
      'CONTENT',
      listTitle(filters),
      channelDescription(filters.channel)
    );
    const controls = element('div', 'knowledge-search-controls');
    const keyword = element('input');
    keyword.type = 'search';
    keyword.placeholder = t('关键词');
    keyword.value = filters.q;
    controls.appendChild(keyword);
    const results = element('div', 'knowledge-search-results');
    const summary = element('div', 'knowledge-result-summary');
    const pagination = element('nav', 'knowledge-pagination');
    shellNode.append(controls, summary, results, pagination);
    results.appendChild(makeLoadingState('正在加载文章…'));

    let facets = state.facets;
    try {
      facets = facets || await repository.getFacets({ signal: controller.signal });
      state.facets = facets;
    } catch (error) {
      facets = { categories: [], tags: [] };
    }
    if (controller.signal.aborted) return;
    const type = selectControl('内容类型', data.contentTypes.map(function (item) {
      return { label: item.label, value: item.id };
    }), filters.type);
    const category = selectControl('分类', facets.categories.map(function (item) {
      return { label: item.name, value: item.slug };
    }), filters.category);
    const tag = selectControl('标签', facets.tags.map(function (item) {
      return { label: item.name, value: item.slug };
    }), filters.tag);
    const sort = selectControl('排序', [
      { label: '最新发布', value: 'latest' },
      { label: '最近更新', value: 'updated' },
      { label: '最早发布', value: 'oldest' },
    ], filters.sort);
    const featuredLabel = element('label', 'knowledge-check-filter');
    const featured = document.createElement('input');
    featured.type = 'checkbox';
    featured.checked = filters.featured === 'true';
    featuredLabel.append(featured, document.createTextNode(t('仅看精选')));
    const pinnedLabel = element('label', 'knowledge-check-filter');
    const pinned = document.createElement('input');
    pinned.type = 'checkbox';
    pinned.checked = filters.pinned === 'true';
    pinnedLabel.append(pinned, document.createTextNode(t('仅看置顶')));
    const viewToggle = element('div', 'knowledge-view-toggle');
    const listView = button('列表');
    listView.dataset.viewMode = 'list';
    const gridView = button('网格');
    gridView.dataset.viewMode = 'grid';
    viewToggle.append(listView, gridView);
    controls.append(type, category, tag, sort, featuredLabel, pinnedLabel, viewToggle);
    applyViewMode();

    function nextFilters(page) {
      return {
        q: keyword.value.trim(),
        type: type.value,
        category: category.value,
        tag: tag.value,
        sort: sort.value || 'latest',
        featured: featured.checked ? 'true' : '',
        pinned: pinned.checked ? 'true' : '',
        page: page || 1,
        archive: filters.archive,
        channel: filters.channel,
      };
    }

    const updateKeyword = debounce(function () {
      navigate('all', nextFilters(1), { replace: true });
    }, 380);
    keyword.addEventListener('input', updateKeyword);
    [type, category, tag, sort, featured, pinned].forEach(function (control) {
      control.addEventListener('change', function () {
        navigate('all', nextFilters(1));
      });
    });

    try {
      let response;
      if (filters.archive) {
        const parts = filters.archive.split('-').map(Number);
        const allArchivePosts = await repository.getArchivePosts(parts[0], parts[1], {
          signal: controller.signal,
        });
        const start = (filters.page - 1) * PAGE_SIZE;
        response = {
          items: allArchivePosts.slice(start, start + PAGE_SIZE),
          pagination: {
            page: filters.page,
            pageSize: PAGE_SIZE,
            total: allArchivePosts.length,
            totalPages: Math.ceil(allArchivePosts.length / PAGE_SIZE),
            hasPrevious: filters.page > 1,
            hasNext: start + PAGE_SIZE < allArchivePosts.length,
          },
        };
      } else {
        response = await repository.getPosts({
          page: filters.page,
          pageSize: PAGE_SIZE,
          q: filters.q,
          type: filters.type,
          category: filters.category,
          tag: filters.tag,
          sort: filters.sort,
          featured: filters.featured,
          pinned: filters.pinned,
          channel: filters.channel,
        }, { signal: controller.signal });
      }
      if (controller.signal.aborted) return;
      results.replaceChildren();
      response.items.forEach(function (post) {
        results.appendChild(post.type === 'solution' ? makeSolutionCard(post) : makeContentCard(post));
      });
      applyViewMode();
      if (!response.items.length) {
        results.appendChild(makeEmptyState(
          filters.q ? '没有找到匹配内容。' : channelEmptyTitle(filters.channel),
          filters.q ? '请修改关键词或筛选条件。' : '发布后的内容会显示在这里。',
          !filters.q
        ));
      }
      summary.textContent = t('当前结果') + ' ' + response.items.length
        + ' / ' + t('总文章') + ' ' + response.pagination.total;
      renderPagination(pagination, response.pagination, function (page) {
        navigate('all', Object.assign({}, nextFilters(page), { page }));
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('Knowledge posts request failed:', error.message);
      results.replaceChildren(makeErrorState(function () {
        navigate('all', filters, { replace: true });
      }));
      summary.textContent = '--';
    }
  }

  function renderPagination(container, pagination, onPage) {
    container.replaceChildren();
    if (!pagination.totalPages || pagination.totalPages <= 1) return;
    const previous = button('上一页');
    previous.disabled = !pagination.hasPrevious;
    previous.addEventListener('click', function () { onPage(pagination.page - 1); });
    container.appendChild(previous);
    const start = Math.max(1, pagination.page - 2);
    const end = Math.min(pagination.totalPages, pagination.page + 2);
    for (let page = start; page <= end; page += 1) {
      const item = button(String(page));
      item.classList.toggle('is-active', page === pagination.page);
      item.setAttribute('aria-current', page === pagination.page ? 'page' : 'false');
      item.addEventListener('click', function () { onPage(page); });
      container.appendChild(item);
    }
    const next = button('下一页');
    next.disabled = !pagination.hasNext;
    next.addEventListener('click', function () { onPage(pagination.page + 1); });
    container.appendChild(next);
    container.appendChild(element(
      'span',
      'knowledge-page-status',
      t('第') + ' ' + pagination.page + ' / ' + pagination.totalPages + ' ' + t('页')
    ));
  }

  async function renderFacetIndex(kind, controller) {
    const titles = {
      categories: ['CATEGORIES', '内容分类', '按分类浏览已发布文章。'],
      tags: ['TAGS', '标签索引', '按标签浏览已发布文章。'],
      archives: ['ARCHIVES', '文章归档', '按年份和月份浏览已发布文章。'],
    };
    const title = titles[kind];
    const shellNode = showRouteShell(title[0], title[1], title[2]);
    const grid = element('div', 'knowledge-index-grid');
    grid.appendChild(makeLoadingState('正在加载…'));
    shellNode.appendChild(grid);
    try {
      const facets = await repository.getFacets({ signal: controller.signal });
      if (controller.signal.aborted) return;
      state.facets = facets;
      grid.replaceChildren();
      const items = facets[kind] || [];
      items.forEach(function (entry) {
        const item = button('', 'knowledge-index-item');
        item.dataset.knowledgeRoute = 'all';
        if (kind === 'categories') {
          item.dataset.category = entry.slug;
          item.append(contentElement('strong', '', entry.name), element('span', '', entry.count + ' ' + t('篇')));
        } else if (kind === 'tags') {
          item.dataset.tag = entry.slug;
          item.append(contentElement('strong', '', '# ' + entry.name), element('span', '', entry.count + ' ' + t('篇')));
        } else {
          item.dataset.archive = entry.year + '-' + String(entry.month).padStart(2, '0');
          item.append(
            element('strong', '', entry.year + ' / ' + String(entry.month).padStart(2, '0')),
            element('span', '', entry.count + ' ' + t('篇'))
          );
        }
        grid.appendChild(item);
      });
      if (!items.length) grid.appendChild(makeEmptyState('这里暂时还没有发布内容。', '发布后的内容会显示在这里。'));
    } catch (error) {
      if (!controller.signal.aborted) {
        grid.replaceChildren(makeErrorState(function () {
          navigate(kind, {}, { replace: true });
        }));
      }
    }
  }

  function renderAbout() {
    const shellNode = showRouteShell('ABOUT', '关于 Lee Ethan', '作者介绍与知识站说明。');
    const content = element('div', 'knowledge-detail-body');
    content.append(
      element('h2', '', '网站定位'),
      element('p', '', '这里集中整理技术文章、算法题解、学习笔记、项目记录与个人思考。'),
      element('h2', '', '作者信息'),
      element('p', '', '作者：Lee Ethan。'),
      element('h2', '', '内容声明'),
      element('p', '', '页面只展示已经发布且未删除的知识文章。')
    );
    shellNode.appendChild(content);
  }

  async function renderInvitations(controller) {
    if (!isAuthor()) return navigate('home', {}, { replace: true });
    const node = showRouteShell(
      'ADMIN',
      t('邀请码'),
      t('创建一次性邀请码并设置有效时间。邀请码明文只在创建成功时显示一次。')
    );
    const workspace = element('div', 'knowledge-invitation-workspace');
    const form = element('form', 'knowledge-invitation-form');
    const codeLabel = element('label');
    codeLabel.append(element('span', '', t('邀请码')));
    const codeInput = element('input');
    codeInput.name = 'code';
    codeInput.type = 'text';
    codeInput.inputMode = 'text';
    codeInput.autocomplete = 'off';
    codeInput.maxLength = 64;
    codeInput.pattern = '[A-Za-z0-9]+';
    codeInput.placeholder = t('仅限英文字母和数字');
    codeLabel.appendChild(codeInput);

    const expiryLabel = element('label');
    expiryLabel.append(element('span', '', t('有效时间')));
    const expiryInput = element('input');
    expiryInput.name = 'expiresAt';
    expiryInput.type = 'datetime-local';
    const defaultExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expiryInput.value = localDateTimeValue(defaultExpiry);
    expiryLabel.appendChild(expiryInput);

    const createButton = button(t('创建邀请码'), 'knowledge-route-button is-primary');
    createButton.type = 'submit';
    const message = element('p', 'knowledge-invitation-message');
    message.setAttribute('role', 'status');
    const reveal = element('div', 'knowledge-invitation-reveal');
    reveal.hidden = true;
    form.append(codeLabel, expiryLabel, createButton, message, reveal);

    const heading = element('div', 'knowledge-section-heading');
    heading.append(element('h2', '', t('邀请码记录')));
    const list = element('div', 'knowledge-invitation-list');
    list.appendChild(makeLoadingState(t('正在加载邀请码…')));
    workspace.append(form, heading, list);
    node.appendChild(workspace);

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (createButton.disabled) return;
      const code = codeInput.value.trim();
      const expiry = new Date(expiryInput.value);
      if (!/^[A-Za-z0-9]{1,64}$/.test(code)) {
        message.textContent = t('邀请码只能包含英文字母和数字');
        message.classList.add('is-error');
        return;
      }
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        message.textContent = t('请选择晚于当前时间的有效期');
        message.classList.add('is-error');
        return;
      }
      createButton.disabled = true;
      message.classList.remove('is-error');
      message.textContent = t('正在创建…');
      try {
        const invitation = await repository.createInvitation({
          code,
          expiresAt: expiry.toISOString(),
        }, { token: currentToken(), signal: controller.signal });
        if (controller.signal.aborted) return;
        message.textContent = t('邀请码已创建，请立即保存。');
        reveal.replaceChildren();
        const value = element('code', '', invitation.code);
        const copyButton = button(t('复制'), 'knowledge-route-button');
        copyButton.addEventListener('click', function () {
          navigator.clipboard?.writeText(invitation.code);
          copyButton.textContent = t('已复制');
        });
        reveal.append(value, copyButton);
        reveal.hidden = false;
        codeInput.value = '';
        await loadInvitationList();
      } catch (error) {
        if (controller.signal.aborted) return;
        message.textContent = error.message || t('邀请码创建失败');
        message.classList.add('is-error');
      } finally {
        createButton.disabled = false;
      }
    });

    async function loadInvitationList() {
      list.replaceChildren(makeLoadingState(t('正在加载邀请码…')));
      try {
        const items = await repository.getInvitations({
          token: currentToken(),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        list.replaceChildren();
        if (!items.length) {
          list.appendChild(makeEmptyState(t('暂无邀请码'), t('创建的邀请码会显示在这里。')));
          return;
        }
        items.forEach(function (invitation) {
          const row = element('article', 'knowledge-invitation-row');
          const info = element('div');
          const title = element('div', 'knowledge-invitation-title');
          title.append(
            element('code', '', invitation.codePreview),
            element('span', 'knowledge-admin-status is-' + invitation.status, invitationStatus(invitation.status))
          );
          info.append(
            title,
            element('p', '', t('创建：') + formatDate(invitation.createdAt, true)
              + ' · ' + t('过期：') + formatDate(invitation.expiresAt, true))
          );
          row.appendChild(info);
          if (invitation.status === 'active') {
            const revoke = button(t('作废'), 'knowledge-route-button is-danger');
            revoke.addEventListener('click', async function () {
              revoke.disabled = true;
              try {
                await repository.revokeInvitation(invitation.id, { token: currentToken() });
                await loadInvitationList();
              } catch (error) {
                message.textContent = error.message || t('邀请码作废失败');
                message.classList.add('is-error');
                revoke.disabled = false;
              }
            });
            row.appendChild(revoke);
          }
          list.appendChild(row);
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        list.replaceChildren(makeErrorState(loadInvitationList));
      }
    }

    await loadInvitationList();
  }

  function localDateTimeValue(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function invitationStatus(status) {
    return t({ active: '有效', used: '已使用', expired: '已过期', revoked: '已作废' }[status] || status);
  }

  async function renderAdminPosts(route, initialFilters, controller) {
    if (!isAuthor()) return navigate('home', {}, { replace: true });
    const isDrafts = route === 'drafts';
    const filters = Object.assign({
      q: '',
      status: isDrafts ? 'draft' : '',
      sort: 'updated',
      page: 1,
    }, initialFilters || {});
    if (isDrafts) filters.status = 'draft';

    const node = showRouteShell(
      'AUTHOR',
      isDrafts ? '草稿箱' : '文章管理',
      isDrafts
        ? '继续编辑、发布或删除尚未公开的文章。'
        : '集中管理草稿、已发布、已归档和已删除文章。'
    );
    const header = node.querySelector('.knowledge-route-header');
    const headerActions = element('div', 'knowledge-route-actions');
    const createButton = button('新建文章', 'knowledge-route-button is-primary');
    createButton.addEventListener('click', function () {
      navigate('writer', { returnRoute: route });
    });
    headerActions.appendChild(createButton);
    header.appendChild(headerActions);

    const controls = element('div', 'knowledge-admin-controls');
    const keyword = element('input');
    keyword.type = 'search';
    keyword.placeholder = t('搜索标题或正文');
    keyword.value = filters.q || '';
    controls.appendChild(keyword);
    let statusControl = null;
    if (!isDrafts) {
      statusControl = selectControl('全部状态', [
        { label: '草稿', value: 'draft' },
        { label: '已发布', value: 'published' },
        { label: '已归档', value: 'archived' },
        { label: '已删除', value: 'deleted' },
      ], filters.status);
      controls.appendChild(statusControl);
    }
    const resultSummary = element('div', 'knowledge-result-summary');
    const results = element('div', 'knowledge-admin-list');
    const pagination = element('nav', 'knowledge-pagination');
    results.appendChild(makeLoadingState('正在加载文章…'));
    node.append(controls, resultSummary, results, pagination);

    function nextFilters(page) {
      return {
        q: keyword.value.trim(),
        status: isDrafts ? 'draft' : (statusControl?.value || ''),
        sort: 'updated',
        page: page || 1,
      };
    }

    keyword.addEventListener('input', debounce(function () {
      navigate(route, nextFilters(1), { replace: true });
    }, 380));
    statusControl?.addEventListener('change', function () {
      navigate(route, nextFilters(1));
    });

    try {
      const response = await repository.getAdminPosts({
        page: filters.page,
        pageSize: PAGE_SIZE,
        q: filters.q,
        status: filters.status,
        sort: 'updated',
      }, {
        token: currentToken(),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      results.replaceChildren();
      response.items.forEach(function (post) {
        results.appendChild(makeAdminPostRow(post, route));
      });
      if (!response.items.length) {
        results.appendChild(makeEmptyState(
          isDrafts ? '草稿箱是空的。' : '没有符合条件的文章。',
          isDrafts ? '新建或导入的草稿会显示在这里。' : '请调整搜索词或状态筛选。'
        ));
      }
      resultSummary.textContent = t('当前结果') + ' ' + response.items.length
        + ' / ' + t('总文章') + ' ' + response.pagination.total;
      renderPagination(pagination, response.pagination, function (page) {
        navigate(route, nextFilters(page));
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('Knowledge admin posts request failed:', error.message);
      results.replaceChildren(makeErrorState(function () {
        navigate(route, filters, { replace: true });
      }));
      resultSummary.textContent = '--';
    }
  }

  function makeAdminPostRow(post, returnRoute) {
    const row = element('article', 'knowledge-admin-row');
    const content = element('div', 'knowledge-admin-row-content');
    const titleLine = element('div', 'knowledge-admin-row-title');
    titleLine.append(
      contentElement('h2', '', post.title),
      element('span', 'knowledge-admin-status is-' + post.status, statusLabel(post.status))
    );
    const meta = element('div', 'knowledge-admin-row-meta');
    appendIf(meta, '', typeLabel(post.type));
    appendIf(meta, t('分类：'), post.category);
    appendIf(meta, t('更新：'), formatDate(post.updatedAt, true));
    appendIf(meta, '', post.wordCount + ' ' + t('字'));
    content.append(titleLine, contentElement('p', '', post.summary || t('暂无摘要')), meta);

    const actions = element('div', 'knowledge-admin-row-actions');
    const edit = button(
      post.source === 'legacy-blog' ? '转换并编辑' : '编辑',
      'knowledge-route-button'
    );
    edit.addEventListener('click', function () {
      openPostEditor(post, returnRoute, edit);
    });
    actions.appendChild(edit);
    if (post.status === 'published') {
      const view = button('查看', 'knowledge-route-button');
      view.addEventListener('click', function () {
        navigate('detail', { slug: post.slug });
      });
      const copy = button('复制分享链接', 'knowledge-route-button');
      copy.addEventListener('click', function () {
        copyShareLink(post, copy);
      });
      actions.append(view, copy);
    }
    appendAdminStateActions(actions, post, returnRoute);
    row.append(content, actions);
    return row;
  }

  async function openPostEditor(post, returnRoute, control) {
    if (post.source !== 'legacy-blog') {
      navigate('writer', { postId: post.id, returnRoute });
      return;
    }
    control.disabled = true;
    control.textContent = '正在转换...';
    try {
      const editable = await repository.createEditableLegacyPost(post.legacyId || post.sourceId, {
        token: currentToken(),
      });
      navigate('writer', { postId: editable.id, returnRoute });
    } catch (error) {
      console.error('Legacy post conversion failed:', error.message);
      control.disabled = false;
      control.textContent = '转换失败，重试';
    }
  }

  function statusLabel(status) {
    return t({
      draft: '草稿',
      published: '已发布',
      archived: '已归档',
      deleted: '已删除',
    }[status] || status);
  }

  function appendAdminStateActions(container, post, returnRoute) {
    if (post.status === 'draft' || post.status === 'archived') {
      container.appendChild(adminActionButton('发布', post, 'publish', returnRoute));
    }
    if (post.status === 'published') {
      container.append(
        adminActionButton('撤回', post, 'unpublish', returnRoute),
        adminActionButton('归档', post, 'archive', returnRoute)
      );
    }
    if (post.status === 'deleted') {
      container.appendChild(adminActionButton('恢复', post, 'restore', returnRoute));
      return;
    }
    const remove = button('删除', 'knowledge-route-button is-danger');
    let armed = false;
    let resetTimer = 0;
    remove.addEventListener('click', async function () {
      if (!armed) {
        armed = true;
        remove.textContent = t('确认删除');
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(function () {
          armed = false;
          remove.textContent = t('删除');
        }, 5000);
        return;
      }
      window.clearTimeout(resetTimer);
      await runAdminAction(remove, function () {
        return repository.deletePost(post.id, { token: currentToken() });
      }, returnRoute);
    });
    container.appendChild(remove);
  }

  function adminActionButton(label, post, action, returnRoute) {
    const actionButton = button(label, 'knowledge-route-button');
    actionButton.addEventListener('click', function () {
      runAdminAction(actionButton, function () {
        return repository.changePostState(post.id, action, { token: currentToken() });
      }, returnRoute);
    });
    return actionButton;
  }

  async function runAdminAction(control, operation, returnRoute) {
    const original = control.textContent;
    control.disabled = true;
    control.textContent = t('处理中…');
    try {
      await operation();
      navigate(returnRoute, state.routePayload, { replace: true });
    } catch (error) {
      control.disabled = false;
      control.textContent = original;
      const row = control.closest('.knowledge-admin-row');
      let notice = row?.querySelector('.knowledge-admin-row-error');
      if (!notice && row) {
        notice = element('p', 'knowledge-admin-row-error');
        row.appendChild(notice);
      }
      if (notice) notice.textContent = error.message || t('操作失败，请稍后重试。');
    }
  }

  async function renderWriter(details) {
    if (!isAuthor()) return navigate('home', {}, { replace: true });
    const writer = window.KnowledgeWriter;
    homeView.hidden = true;
    routeView.hidden = false;
    routeView.replaceChildren();
    shell.classList.add('knowledge-writing-mode');
    if (!writer || typeof writer.render !== 'function') {
      shell.classList.remove('knowledge-writing-mode');
      const node = showRouteShell('AUTHOR', '写文章', '编辑器模块暂时无法加载。');
      node.appendChild(makeErrorState(function () {
        navigate('writer', details, { replace: true });
      }));
      return;
    }
    await writer.render(routeView, {
      postId: details.postId || null,
      onBack: function () {
        navigate(details.returnRoute || 'home', {});
      },
    });
  }

  function renderArticleMover() {
    if (!isAuthor()) return navigate('home', {}, { replace: true });
    const mover = window.KnowledgeArticleMover;
    const node = showRouteShell(
      'AUTHOR TOOL',
      '文章搬家',
      '复制公开的牛客题解与知乎文章，检查后导入为知识站草稿。'
    );
    if (!mover || typeof mover.render !== 'function') {
      node.appendChild(makeEmptyState('文章搬家暂时不可用', '页面模块未能正确加载。'));
      return;
    }
    mover.render(node);
  }

  async function renderDetail(slug, controller) {
    homeView.hidden = true;
    routeView.hidden = false;
    const loadingLayout = element('div', 'knowledge-detail-layout');
    const loadingArticle = element('article', 'knowledge-article');
    const loadingHeader = element('header', 'knowledge-detail-header');
    const loadingBody = element('div', 'knowledge-detail-body');
    const loadingAside = element('aside', 'knowledge-detail-aside');
    loadingHeader.appendChild(makeLoadingState('正在加载文章信息…'));
    loadingBody.appendChild(makeLoadingState('正在加载正文…'));
    loadingAside.appendChild(makeLoadingState('正在生成目录…'));
    loadingArticle.append(loadingHeader, loadingBody);
    loadingLayout.append(loadingArticle, loadingAside);
    routeView.replaceChildren(loadingLayout);
    let post;
    try {
      post = await repository.getPostBySlug(slug, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 404) {
        const notFound = showRouteShell('404', '文章不存在或尚未发布。', '请检查链接或返回首页。');
        notFound.appendChild(makeBackToTopPanel());
      } else {
        const failed = showRouteShell('ERROR', '内容暂时无法加载。', '文章请求失败，请稍后重试。');
        failed.appendChild(makeErrorState(function () {
          repository.getPostBySlug(slug, { refresh: true }).catch(function () {});
          navigate('detail', { slug }, { replace: true });
        }));
      }
      return;
    }
    if (controller.signal.aborted) return;

    routeView.replaceChildren();
    const layout = element('div', 'knowledge-detail-layout');
    const main = element('article', 'knowledge-article');
    const header = element('header', 'knowledge-detail-header');
    const badges = element('div', 'knowledge-card-tags');
    badges.appendChild(element('span', 'knowledge-type-badge', typeLabel(post.type)));
    if (post.isPinned) badges.appendChild(element('span', 'knowledge-state-badge', '置顶'));
    if (post.isFeatured) badges.appendChild(element('span', 'knowledge-state-badge', '精选'));
    const tags = element('div', 'knowledge-card-tags');
    appendTags(tags, post.tags);
    const meta = element('div', 'knowledge-detail-meta');
    appendIf(meta, t('作者：'), 'Lee Ethan');
    appendIf(meta, t('发布：'), formatDate(post.publishedAt));
    appendIf(meta, t('更新：'), formatDate(post.updatedAt));
    appendIf(meta, t('分类：'), post.category);
    appendIf(meta, '', post.readingTimeMinutes + ' ' + t('分钟'));
    appendIf(meta, '', post.wordCount + ' ' + t('字'));
    header.append(badges, contentElement('h1', '', post.title), contentElement('p', '', post.summary), tags, meta);
    const sourceUrl = safeExternalUrl(post.sourceUrl);
    if (sourceUrl) {
      const sourceLink = element('a', 'knowledge-source-link', '查看来源');
      sourceLink.href = sourceUrl;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      header.appendChild(sourceLink);
    }
    header.appendChild(makeShareLink(post));
    if (isAuthor()) {
      const authorActions = element('div', 'knowledge-detail-author-actions');
      const edit = button(
        post.source === 'legacy-blog' ? '转换并编辑' : '编辑文章',
        'knowledge-route-button'
      );
      edit.addEventListener('click', function () {
        openPostEditor(post, 'detail', edit);
      });
      authorActions.appendChild(edit);
      header.appendChild(authorActions);
    }
    main.appendChild(header);
    const detailCover = detailCoverNode(post);
    if (detailCover) main.appendChild(detailCover);
    if (post.type === 'solution') main.appendChild(makeSolutionInfo(post));
    const body = element('div', 'knowledge-detail-body');
    let renderedHeadings = [];
    let detailAside = null;
    const originalContent = post.originalContent || post.content || post.contentMarkdown;
    if (originalContent.trim()) {
      const rendered = post.contentFormat === 'html' && markdown.renderHtml
        ? markdown.renderHtml(originalContent, body)
        : markdown.render(post.contentMarkdown || originalContent, body);
      renderedHeadings = rendered.headings;
      main.appendChild(body);
      const aside = element('aside', 'knowledge-detail-aside');
      aside.append(makeToc(rendered.headings), makeBackToTopPanel());
      detailAside = aside;
      layout.append(main, aside);
    } else {
      body.appendChild(makeEmptyState('正文暂时为空。', '作者尚未补充正文。'));
      main.appendChild(body);
      layout.append(main, makeBackToTopPanel());
    }
    const navigation = element('nav', 'knowledge-detail-navigation');
    navigation.appendChild(makeLoadingState('正在加载相邻文章…'));
    main.appendChild(navigation);
    const related = element('section', 'knowledge-related-section');
    related.append(element('h2', '', '相关文章'), makeLoadingState('正在加载相关文章…'));
    main.appendChild(related);
    routeView.appendChild(layout);
    if (detailAside) setupSectionObserver(renderedHeadings, detailAside);
    loadDetailExtras(post, navigation, related, controller);
  }

  function makeSolutionInfo(post) {
    const solution = post.solution || {};
    const section = element('section', 'knowledge-solution-info');
    section.appendChild(element('h2', '', '题目信息'));
    const details = element('dl');
    [
      ['OJ 平台', solution.platform],
      ['题号', solution.problemId],
      ['题目名称', solution.problemTitle],
      ['难度', solution.difficulty],
      ['使用语言', solution.language],
      ['时间复杂度', solution.timeComplexity],
      ['空间复杂度', solution.spaceComplexity],
      ['是否 AC', solution.accepted === true ? t('已通过') : (solution.accepted === false ? t('未通过') : '')],
    ].forEach(function (entry) {
      if (entry[1] === '' || entry[1] === null || entry[1] === undefined) return;
      const item = element('div');
      item.append(element('dt', '', entry[0]), contentElement('dd', '', entry[1]));
      details.appendChild(item);
    });
    section.appendChild(details);
    const algorithms = element('div', 'knowledge-card-tags');
    appendTags(algorithms, solution.algorithms);
    if (algorithms.childElementCount) section.appendChild(algorithms);
    const problemUrl = safeExternalUrl(solution.problemUrl);
    if (problemUrl) {
      const link = element('a', 'knowledge-problem-link', '查看原题');
      link.href = problemUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      section.appendChild(link);
    }
    return section;
  }

  function shareUrl(post) {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('knowledge', 'post');
    url.searchParams.set('slug', post.slug);
    return url.toString();
  }

  function makeShareLink(post) {
    const share = element('div', 'knowledge-share-link');
    const label = element('span', '', '分享链接');
    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = shareUrl(post);
    input.setAttribute('aria-label', t('分享链接'));
    const copy = button('复制链接', 'knowledge-route-button');
    const status = element('span', 'knowledge-share-status');
    status.setAttribute('aria-live', 'polite');
    copy.addEventListener('click', function () {
      copyShareLink(post, copy, status, input);
    });
    share.append(label, input, copy, status);
    return share;
  }

  async function copyShareLink(post, control, status, input) {
    const value = shareUrl(post);
    try {
      await navigator.clipboard.writeText(value);
      if (status) status.textContent = t('已复制');
      control.textContent = t('已复制');
    } catch (error) {
      if (input) {
        input.focus();
        input.select();
      }
      if (status) status.textContent = t('请手动复制链接');
      control.textContent = t('请手动复制');
    }
    window.setTimeout(function () {
      control.textContent = t(input ? '复制链接' : '复制分享链接');
      if (status) status.textContent = '';
    }, 1800);
  }

  function makeToc(headings) {
    const toc = element('details', 'knowledge-toc');
    toc.open = window.innerWidth > 780;
    toc.appendChild(element('summary', '', '文章目录'));
    const nav = element('nav');
    headings.forEach(function (heading) {
      const item = contentButton(heading.text);
      item.dataset.knowledgeHeading = heading.id;
      item.dataset.level = String(heading.level);
      nav.appendChild(item);
    });
    if (!headings.length) nav.appendChild(element('span', 'knowledge-toc-empty', '本文暂无目录'));
    toc.appendChild(nav);
    return toc;
  }

  function setupSectionObserver(headings, aside) {
    if (!headings.length || !('IntersectionObserver' in window)) return;
    const links = new Map(Array.from(aside.querySelectorAll('[data-knowledge-heading]')).map(function (item) {
      return [item.dataset.knowledgeHeading, item];
    }));
    state.sectionObserver = new IntersectionObserver(function (entries) {
      const visible = entries
        .filter(function (entry) { return entry.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (!visible.length) return;
      links.forEach(function (item) { item.classList.remove('is-active'); });
      links.get(visible[0].target.id)?.classList.add('is-active');
    }, {
      root: shell,
      rootMargin: '-18% 0px -68% 0px',
      threshold: [0, 1],
    });
    headings.forEach(function (heading) { state.sectionObserver.observe(heading.element); });
  }

  function makeBackToTopPanel() {
    const panel = element('div', 'knowledge-panel');
    const top = button('返回顶部', 'knowledge-route-button');
    top.dataset.knowledgeAction = 'top';
    const back = button('返回首页', 'knowledge-route-button');
    back.dataset.knowledgeRoute = 'home';
    panel.append(top, back);
    return panel;
  }

  async function loadDetailExtras(post, navigation, related, controller) {
    const [contextResult, relatedResult] = await Promise.allSettled([
      repository.getPostContext(post, { signal: controller.signal }),
      repository.getRelatedPosts(post, { signal: controller.signal }),
    ]);
    if (controller.signal.aborted) return;
    navigation.replaceChildren();
    if (contextResult.status === 'fulfilled') {
      const context = contextResult.value;
      if (context.previous) {
        const previous = contentButton(t('上一篇') + '\n' + context.previous.title);
        previous.dataset.postSlug = context.previous.slug;
        navigation.appendChild(previous);
      }
      if (context.next) {
        const next = contentButton(t('下一篇') + '\n' + context.next.title);
        next.dataset.postSlug = context.next.slug;
        navigation.appendChild(next);
      }
    }
    if (!navigation.childElementCount) navigation.hidden = true;
    related.querySelectorAll(':scope > :not(h2)').forEach(function (node) { node.remove(); });
    if (relatedResult.status === 'fulfilled' && relatedResult.value.length) {
      const grid = element('div', 'knowledge-related-grid');
      relatedResult.value.forEach(function (item) {
        const card = button('', 'knowledge-related-card');
        card.dataset.postSlug = item.slug;
        card.append(
          element('span', 'knowledge-type-badge', typeLabel(item.type)),
          contentElement('h3', '', item.title)
        );
        grid.appendChild(card);
      });
      related.appendChild(grid);
    } else {
      related.hidden = true;
    }
  }

  function debounce(callback, delay) {
    let timer = 0;
    return function () {
      window.clearTimeout(timer);
      const args = arguments;
      timer = window.setTimeout(function () { callback.apply(null, args); }, delay);
    };
  }

  function routePayloadFromTarget(target) {
    const routeType = {
      articles: 'article',
      solutions: 'solution',
      notes: 'note',
      projects: 'project',
    }[target.dataset.knowledgeRoute] || '';
    return {
      q: target.dataset.keyword || '',
      type: target.dataset.contentType || routeType,
      category: target.dataset.category || '',
      tag: target.dataset.tag || '',
      sort: 'latest',
      featured: '',
      pinned: '',
      page: 1,
      archive: target.dataset.archive || '',
      channel: target.dataset.channel || '',
    };
  }

  function handleSearchSubmit(form) {
    const input = form.elements.keyword;
    navigate('all', {
      q: input ? input.value.trim() : '',
      page: 1,
      sort: 'latest',
    });
  }

  shell.addEventListener('click', function (event) {
    if (event.target.closest('a[href]')) return;
    const postTarget = event.target.closest('[data-post-slug]');
    const routeTarget = event.target.closest('[data-knowledge-route]');
    const actionTarget = event.target.closest('[data-knowledge-action]');
    const headingTarget = event.target.closest('[data-knowledge-heading]');
    const viewModeTarget = event.target.closest('[data-view-mode]');
    if (postTarget && !postTarget.disabled) {
      navigate('detail', { slug: postTarget.dataset.postSlug });
      return;
    }
    if (routeTarget && !routeTarget.disabled) {
      const targetRoute = routeTarget.dataset.knowledgeRoute;
      navigate(
        ['articles', 'solutions', 'notes', 'projects', 'search'].includes(targetRoute) ? 'all' : targetRoute,
        routePayloadFromTarget(routeTarget)
      );
      return;
    }
    if (headingTarget) {
      document.getElementById(headingTarget.dataset.knowledgeHeading)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (viewModeTarget) {
      setViewMode(viewModeTarget.dataset.viewMode);
      return;
    }
    if (actionTarget?.dataset.knowledgeAction === 'top') {
      shell.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (actionTarget?.dataset.knowledgeAction === 'desktop') {
      const user = currentUser();
      if (user && window.authUi) {
        if (window.siteEntryLoader) {
          window.siteEntryLoader.play({ force: true, label: 'MY OS' });
        }
        window.authUi.showDesktop(user);
      }
    }
  });

  shell.addEventListener('keydown', function (event) {
    const target = event.target.closest('[data-post-slug][role="button"]');
    if (target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      navigate('detail', { slug: target.dataset.postSlug });
    }
  });

  document.getElementById('knowledgeHeroSearch').addEventListener('submit', function (event) {
    event.preventDefault();
    handleSearchSubmit(event.currentTarget);
  });
  document.getElementById('knowledgeSideSearch').addEventListener('submit', function (event) {
    event.preventDefault();
    handleSearchSubmit(event.currentTarget);
  });
  document.getElementById('knowledgeLoadMore').addEventListener('click', loadMoreLatest);
  menuToggle.addEventListener('click', function () {
    setNavOpen(!navLinks.classList.contains('is-open'));
  });
  themeButton.addEventListener('click', cycleTheme);
  languageButton.addEventListener('click', toggleLanguage);
  searchButton.addEventListener('click', function () {
    navigate('all', { q: '', page: 1, sort: 'latest' });
  });
  if (accountSummary) {
    accountSummary.addEventListener('click', function (event) {
      const user = currentUser();
      if (!user || user.role !== 'guest') return;
      event.preventDefault();
      accountMenu.removeAttribute('open');
      if (window.authUi && typeof window.authUi.showElegantLogin === 'function') {
        window.authUi.showElegantLogin('');
      }
    });
  }
  logoutButton.addEventListener('click', function () {
    closeNavigation();
    if (window.authUi && window.authUi.logoutToLogin) window.authUi.logoutToLogin('');
  });
  window.addEventListener('resize', function () {
    closeNavMenus();
    if (window.innerWidth > 1040) setNavOpen(false);
  });
  window.addEventListener('popstate', function () {
    const parsed = routeFromUrl();
    navigate(parsed.route, parsed.payload, { fromHistory: true });
  });

  configureNavigationLinks();
  setupNavigationMenus();
  translateStaticTree();
  updateLanguageButton();
  applyTheme();
  setupHeroCarousel();
  refreshIdentity();
  const initialRoute = routeFromUrl();
  state.route = initialRoute.route;
  state.routePayload = initialRoute.payload;
  updateActiveNav(state.route, state.routePayload);
  renderCurrentRoute({ replace: true });

  window.elegantShell = {
    closeNavigation,
    refreshIdentity,
    navigate,
    refresh: function () {
      repository.clearCache();
      return renderCurrentRoute({ replace: true, refresh: true });
    },
  };
}());
