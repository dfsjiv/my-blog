(function () {
  const THEME_KEY = 'knowledge-site-theme';
  const VIEW_MODE_KEY = 'knowledge-site-view-mode';
  const LANGUAGE_KEY = 'knowledge-site-language';
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
  const logoutButton = document.getElementById('knowledgeLogoutButton');
  const repository = window.KnowledgeRepository;
  const data = window.KnowledgeMockData;
  const i18n = window.KnowledgeI18n;
  if (!shell || !homeView || !routeView || !repository || !data || !i18n || !languageButton) return;

  const savedTheme = readStorage(THEME_KEY);
  const savedLanguage = readStorage(LANGUAGE_KEY);
  const state = {
    route: 'home',
    routePayload: {},
    viewMode: readStorage(VIEW_MODE_KEY) === 'grid' ? 'grid' : 'list',
    theme: ['system', 'light', 'dark'].includes(savedTheme) ? savedTheme : 'system',
    language: savedLanguage === 'zh' ? 'zh' : 'en',
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
      // The current page still works when storage is unavailable.
    }
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = t(text);
    return node;
  }

  function t(value) {
    return i18n.translate(value, state.language);
  }

  function button(text, className) {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
  }

  function appendTags(container, tags) {
    tags.forEach(function (tag) {
      container.appendChild(element('span', 'knowledge-tag', tag));
    });
  }

  function typeLabel(type) {
    const item = data.contentTypes.find(function (contentType) {
      return contentType.id === type;
    });
    return t(item ? item.label : '内容');
  }

  function setNavOpen(open) {
    navLinks.classList.toggle('is-open', Boolean(open));
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', t(open ? '关闭导航菜单' : '打开导航菜单'));
  }

  function closeNavigation() {
    setNavOpen(false);
    shell.querySelectorAll('.knowledge-author-tools[open], .knowledge-account-menu[open]').forEach(function (details) {
      details.removeAttribute('open');
    });
  }

  function refreshIdentity(user) {
    const currentUser = user || (window.authManager && window.authManager.getCurrentUser
      ? window.authManager.getCurrentUser()
      : null);
    const username = currentUser && currentUser.username ? currentUser.username : t('当前用户');
    const initial = username.slice(0, 1).toUpperCase() || 'U';
    const accountName = document.getElementById('knowledgeAccountName');
    const accountInitial = document.getElementById('knowledgeAccountInitial');
    if (accountName) accountName.textContent = username;
    if (accountInitial) accountInitial.textContent = initial;

    // This only controls visibility. Future write APIs must verify owner/admin permission on the server.
    authorTools.hidden = !(currentUser && currentUser.role === 'admin');
  }

  function applyTheme() {
    if (state.theme === 'system') {
      shell.removeAttribute('data-theme');
    } else {
      shell.dataset.theme = state.theme;
    }
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

    [shell].concat(Array.from(shell.querySelectorAll('[placeholder], [aria-label], [title]'))).forEach(function (node) {
      const sources = staticAttributeSources.get(node) || {};
      ['placeholder', 'aria-label', 'title'].forEach(function (attribute) {
        if (node.hasAttribute(attribute)) {
          if (!Object.prototype.hasOwnProperty.call(sources, attribute)) {
            sources[attribute] = node.getAttribute(attribute);
          }
          node.setAttribute(attribute, t(sources[attribute]));
        }
      });
      staticAttributeSources.set(node, sources);
    });
  }

  function updateLanguageButton() {
    languageButton.textContent = state.language === 'en' ? '中文' : 'EN';
    languageButton.setAttribute('aria-label', state.language === 'en'
      ? 'Switch to Chinese'
      : '切换到英文');
    languageButton.title = state.language === 'en' ? 'Switch to Chinese' : '切换到英文';
  }

  async function toggleLanguage() {
    state.language = state.language === 'en' ? 'zh' : 'en';
    writeStorage(LANGUAGE_KEY, state.language);
    shell.dataset.language = state.language;
    translateStaticTree();
    updateLanguageButton();
    applyTheme();
    refreshIdentity();
    renderHomeStatic();
    await renderHomeContent();
    if (state.route !== 'home') await openRoute(state.route, state.routePayload);
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

  function makeContentCard(post) {
    const card = button('', 'knowledge-content-card');
    card.dataset.postSlug = post.slug;
    card.dataset.placeholder = String(Boolean(post.placeholder));
    card.setAttribute('aria-label', t('打开演示内容：' + post.title));

    const cover = element('div', 'knowledge-cover-placeholder', 'COVER PLACEHOLDER');
    cover.setAttribute('aria-label', t('封面占位'));
    const body = element('div', 'knowledge-content-body');
    const top = element('div', 'knowledge-card-tags');
    top.append(
      element('span', 'knowledge-demo-badge', '演示内容'),
      element('span', 'knowledge-type-badge', typeLabel(post.type))
    );
    const tags = element('div', 'knowledge-card-tags');
    appendTags(tags, post.tags);
    const meta = element('div', 'knowledge-card-meta');
    meta.append(
      element('span', '', post.category),
      element('span', '', '发布：' + post.publishedAt),
      element('span', '', '更新：' + post.updatedAt),
      element('span', '', post.readingTime),
      element('span', '', post.wordCount + ' 字')
    );
    const flags = element('span', 'knowledge-card-flags');
    if (post.isPinned) flags.appendChild(element('span', 'knowledge-state-badge', '置顶'));
    if (post.isFeatured) flags.appendChild(element('span', 'knowledge-state-badge', '精选'));
    meta.appendChild(flags);

    body.append(
      top,
      element('h3', '', post.title),
      element('p', '', post.summary),
      tags,
      meta
    );
    card.append(cover, body);
    return card;
  }

  function makeFeaturedCard(post) {
    const card = button('', 'knowledge-featured-card');
    card.dataset.postSlug = post.slug;
    card.dataset.placeholder = 'true';
    const tags = element('div', 'knowledge-card-tags');
    appendTags(tags, post.tags);
    card.append(
      element('span', 'knowledge-demo-badge', '精选 · 演示内容'),
      element('h3', '', post.title),
      element('p', '', post.summary),
      tags
    );
    return card;
  }

  function makeSolutionCard(post) {
    const solution = post.solution;
    const card = button('', 'knowledge-solution-card');
    card.dataset.postSlug = post.slug;
    card.dataset.placeholder = 'true';
    card.setAttribute('aria-label', t('打开演示题解：' + post.title));

    const identity = element('div', 'knowledge-solution-identity');
    identity.append(
      element('strong', '', solution.platform),
      element('span', '', solution.problemId),
      element('span', '', solution.difficulty)
    );
    const body = element('div', 'knowledge-solution-body');
    const tags = element('div', 'knowledge-card-tags');
    appendTags(tags, solution.algorithms);
    const meta = element('div', 'knowledge-solution-meta');
    meta.append(
      element('span', '', '语言：' + solution.language),
      element('span', '', '时间：' + solution.timeComplexity),
      element('span', '', '空间：' + solution.spaceComplexity),
      element('span', '', '发布：' + post.publishedAt)
    );
    body.append(
      element('span', 'knowledge-demo-badge', '演示题解'),
      element('h3', '', solution.problemTitle),
      element('p', '', post.summary),
      tags,
      meta
    );
    card.append(identity, body);
    return card;
  }

  function renderHomeStatic() {
    const typeLinks = document.getElementById('knowledgeTypeLinks');
    const categories = document.getElementById('knowledgeCategoryList');
    const domains = document.getElementById('knowledgeDomainList');
    const platforms = document.getElementById('knowledgePlatformList');
    const topics = document.getElementById('knowledgeTopicList');
    const tags = document.getElementById('knowledgeTagCloud');
    const archives = document.getElementById('knowledgeArchivePreview');
    const stats = document.getElementById('knowledgeStats');
    const updates = document.getElementById('knowledgeUpdateList');
    [typeLinks, categories, domains, platforms, topics, tags, archives, stats, updates]
      .forEach(function (container) {
        if (container) container.replaceChildren();
      });

    data.contentTypes.forEach(function (contentType) {
      const item = button(contentType.label);
      item.dataset.knowledgeRoute = contentType.id === 'solution' ? 'solutions' : 'all';
      item.dataset.contentType = contentType.id;
      typeLinks.appendChild(item);
    });

    data.categories.forEach(function (category) {
      const item = button('');
      item.dataset.knowledgeRoute = 'search';
      item.dataset.category = category.label;
      item.append(element('span', '', category.label), element('span', '', category.count));
      categories.appendChild(item);
    });

    data.domains.forEach(function (domain) {
      const item = button(domain);
      item.dataset.knowledgeRoute = 'search';
      item.dataset.tag = domain;
      domains.appendChild(item);
    });

    data.platforms.forEach(function (platform) {
      if (platform.href) {
        const link = element('a', '', platform.label);
        link.href = platform.href;
        link.target = '_blank';
        link.rel = 'noreferrer';
        platforms.appendChild(link);
      } else {
        const item = element('span', 'is-placeholder');
        item.append(element('span', '', platform.label), element('small', '', '待接入'));
        platforms.appendChild(item);
      }
    });

    data.topics.forEach(function (topic) {
      const item = button('');
      item.dataset.knowledgeRoute = 'search';
      item.dataset.keyword = topic;
      item.append(element('span', '', topic), element('span', '', '›'));
      topics.appendChild(item);
    });

    data.tags.forEach(function (tag) {
      const item = button(tag);
      item.dataset.knowledgeRoute = 'search';
      item.dataset.tag = tag;
      tags.appendChild(item);
    });

    data.archives.forEach(function (archive) {
      const item = button('');
      item.dataset.knowledgeRoute = 'archives';
      item.append(
        element('span', '', archive.year + ' · ' + archive.month),
        element('span', '', archive.count)
      );
      archives.appendChild(item);
    });

    data.stats.forEach(function (stat) {
      const item = element('div');
      item.append(element('dt', '', stat.label), element('dd', '', stat.value));
      stats.appendChild(item);
    });

    data.updates.forEach(function (update) {
      const item = element('li');
      item.dataset.placeholder = 'true';
      item.append(
        element('time', '', update.time),
        element('strong', '', update.type),
        element('small', '', update.text)
      );
      updates.appendChild(item);
    });
  }

  async function renderHomeContent() {
    const posts = await repository.getPosts();
    const featured = document.getElementById('knowledgeFeaturedList');
    const latest = document.getElementById('knowledgeLatestList');
    const solutions = document.getElementById('knowledgeSolutionList');
    featured.replaceChildren();
    latest.replaceChildren();
    solutions.replaceChildren();

    posts.filter(function (post) { return post.isFeatured; }).slice(0, 3).forEach(function (post) {
      featured.appendChild(makeFeaturedCard(post));
    });
    posts.slice(0, 5).forEach(function (post) {
      latest.appendChild(makeContentCard(post));
    });
    posts.filter(function (post) { return post.type === 'solution'; }).forEach(function (post) {
      solutions.appendChild(makeSolutionCard(post));
    });
    applyViewMode();
  }

  function applyViewMode() {
    const list = document.getElementById('knowledgeLatestList');
    const listButton = document.getElementById('knowledgeListView');
    const gridButton = document.getElementById('knowledgeGridView');
    list.classList.toggle('is-grid', state.viewMode === 'grid');
    listButton.classList.toggle('is-active', state.viewMode === 'list');
    gridButton.classList.toggle('is-active', state.viewMode === 'grid');
  }

  function setViewMode(mode) {
    state.viewMode = mode === 'grid' ? 'grid' : 'list';
    writeStorage(VIEW_MODE_KEY, state.viewMode);
    applyViewMode();
  }

  function showRouteShell(kicker, title, description) {
    homeView.hidden = true;
    routeView.hidden = false;
    routeView.replaceChildren();
    const shellNode = element('div', 'knowledge-route-shell');
    shellNode.appendChild(routeHeader(kicker, title, description));
    routeView.appendChild(shellNode);
    return shellNode;
  }

  function showHome() {
    state.route = 'home';
    routeView.hidden = true;
    homeView.hidden = false;
    closeNavigation();
    updateActiveNav('home');
    shell.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateActiveNav(route) {
    document.querySelectorAll('[data-knowledge-route]').forEach(function (item) {
      item.classList.toggle('is-active', item.dataset.knowledgeRoute === route);
    });
  }

  async function renderPostIndex(route, options) {
    const config = options || {};
    const posts = await repository.getPosts(config.filters);
    const shellNode = showRouteShell(config.kicker || 'CONTENT', config.title, config.description);
    const list = element('div', route === 'solutions' ? 'knowledge-solution-list' : 'knowledge-post-list');
    posts.forEach(function (post) {
      list.appendChild(post.type === 'solution' ? makeSolutionCard(post) : makeContentCard(post));
    });
    if (!posts.length) list.appendChild(makeEmptyState('没有匹配的演示内容', '真实内容接入后将在这里显示。'));
    shellNode.appendChild(list);
  }

  function makeEmptyState(title, description) {
    const empty = element('div', 'knowledge-empty-state');
    empty.append(element('strong', '', title), element('span', '', description));
    return empty;
  }

  async function renderSearch(initialFilters) {
    const shellNode = showRouteShell('SEARCH', '搜索与筛选', '当前使用本地演示数据验证筛选结构，不请求后端。');
    const controls = element('div', 'knowledge-search-controls');
    const keyword = element('input');
    keyword.type = 'search';
    keyword.placeholder = t('关键词');
    keyword.value = initialFilters.keyword || '';

    function selectControl(label, values, initialValue) {
      const select = element('select');
      select.appendChild(new Option(t(label), ''));
      values.forEach(function (value) {
        const option = typeof value === 'object' ? value : { label: value, value };
        select.appendChild(new Option(t(option.label), option.value));
      });
      select.value = initialValue || '';
      return select;
    }

    const type = selectControl('内容类型', data.contentTypes.map(function (item) {
      return { label: item.label, value: item.id };
    }), initialFilters.type);
    const category = selectControl('分类', data.categories.map(function (item) { return item.label; }), initialFilters.category);
    const tag = selectControl('标签', data.tags, initialFilters.tag);
    const platform = selectControl('OJ 平台', ['平台占位', 'Codeforces', 'AtCoder', '牛客', '洛谷', 'LeetCode', 'AcWing', '其他'], initialFilters.platform);
    const difficulty = selectControl('难度', ['难度待接入', '入门', '简单', '中等', '困难'], initialFilters.difficulty);
    const language = selectControl('编程语言', ['C++', 'Java', 'Python', 'JavaScript'], initialFilters.language);
    const date = selectControl('发布时间', ['最近一月', '最近一年'], initialFilters.date);
    controls.append(keyword, type, category, tag, platform, difficulty, language, date);
    const results = element('div', 'knowledge-search-results');
    shellNode.append(controls, results);

    async function updateResults() {
      const filters = {
        keyword: keyword.value,
        type: type.value,
        category: category.value,
        tag: tag.value,
        platform: platform.value,
        difficulty: difficulty.value,
        language: language.value,
        date: date.value,
      };
      const posts = await repository.searchPosts(filters);
      results.replaceChildren();
      if (!posts.length) {
        results.appendChild(makeEmptyState('没有找到匹配内容', '请修改关键词或筛选条件。'));
        return;
      }
      posts.forEach(function (post) {
        results.appendChild(post.type === 'solution' ? makeSolutionCard(post) : makeContentCard(post));
      });
    }

    const debouncedUpdate = debounce(updateResults, 260);
    controls.addEventListener('input', debouncedUpdate);
    controls.addEventListener('change', updateResults);
    updateResults();
    window.setTimeout(function () { keyword.focus(); }, 0);
  }

  function debounce(callback, delay) {
    let timer = 0;
    return function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(callback, delay);
    };
  }

  async function renderCategories() {
    const categories = await repository.getCategories();
    const shellNode = showRouteShell('CATEGORIES', '内容分类', '分类数量将在真实数据接入后更新。');
    const grid = element('div', 'knowledge-index-grid');
    categories.forEach(function (category) {
      const item = button('', 'knowledge-index-item');
      item.dataset.knowledgeRoute = 'search';
      item.dataset.category = category.label;
      item.append(element('strong', '', category.label), element('span', '', '文章数量：' + category.count));
      grid.appendChild(item);
    });
    shellNode.appendChild(grid);
  }

  async function renderTags() {
    const tags = await repository.getTags();
    const shellNode = showRouteShell('TAGS', '标签索引', '点击标签查看对应的演示内容。');
    const grid = element('div', 'knowledge-index-grid');
    tags.forEach(function (tag) {
      const item = button('', 'knowledge-index-item');
      item.dataset.knowledgeRoute = 'search';
      item.dataset.tag = tag;
      item.append(element('strong', '', '# ' + tag), element('span', '', '文章数量：--'));
      grid.appendChild(item);
    });
    shellNode.appendChild(grid);
  }

  async function renderArchives() {
    const archives = await repository.getArchives();
    const shellNode = showRouteShell('ARCHIVES', '文章归档', '按年份和月份组织文章的前端框架。');
    const year = element('section', 'knowledge-archive-year');
    year.appendChild(element('h2', '', '年份待接入'));
    archives.forEach(function (archive) {
      const month = element('div', 'knowledge-archive-month');
      month.append(element('span', '', archive.month), element('span', '', archive.count + ' 篇'));
      year.appendChild(month);
    });
    shellNode.appendChild(year);
  }

  function renderAbout() {
    const shellNode = showRouteShell('ABOUT', '关于 Lee Ethan', '作者介绍与知识站说明将在后续内容阶段正式补充。');
    const content = element('div', 'knowledge-detail-body');
    content.append(
      element('h2', '', '网站定位'),
      element('p', '', '这里将集中整理技术文章、算法题解、学习笔记、项目记录与个人思考。'),
      element('h2', '', '作者信息'),
      element('p', '', '作者名称：Lee Ethan。头像、简介和其他资料均为待替换内容。'),
      element('h2', '', '内容声明'),
      element('p', '', '当前所有文章与统计均为演示占位，不代表已经正式发布。')
    );
    shellNode.appendChild(content);
  }

  function renderWriterPlaceholder(route) {
    const labels = {
      writer: ['写文章', 'Markdown 编辑器将在后续接入。'],
      drafts: ['草稿箱', '草稿数据和发布状态将在后续接入。'],
      manage: ['文章管理', '新增、编辑和删除功能将在后续接入。'],
    };
    const currentUser = window.authManager && window.authManager.getCurrentUser
      ? window.authManager.getCurrentUser()
      : null;
    if (!currentUser || currentUser.role !== 'admin') {
      showHome();
      return;
    }
    const label = labels[route];
    const shellNode = showRouteShell('AUTHOR', label[0], label[1]);
    const placeholder = element('div', 'knowledge-writer-placeholder');
    placeholder.append(
      element('strong', '', label[0] + '功能待接入'),
      element('p', '', '本轮仅保留作者工作区入口，不实现真实写入。'),
      element('div', 'knowledge-permission-note', '安全说明：未来所有新增、编辑、删除和发布请求都必须由后端再次验证所有者权限。')
    );
    shellNode.appendChild(placeholder);
  }

  async function renderDetail(slug) {
    const post = await repository.getPostBySlug(slug);
    if (!post) {
      const shellNode = showRouteShell('NOT FOUND', '内容不存在', '没有找到对应的演示内容。');
      shellNode.appendChild(makeEmptyState('内容不存在', '返回首页继续浏览。'));
      return;
    }

    homeView.hidden = true;
    routeView.hidden = false;
    routeView.replaceChildren();
    const layout = element('div', 'knowledge-detail-layout');
    const main = element('article');
    const header = element('header', 'knowledge-detail-header');
    const badges = element('div', 'knowledge-card-tags');
    badges.append(
      element('span', 'knowledge-demo-badge', '演示内容'),
      element('span', 'knowledge-type-badge', typeLabel(post.type))
    );
    const tags = element('div', 'knowledge-card-tags');
    appendTags(tags, post.tags);
    const meta = element('div', 'knowledge-detail-meta');
    meta.append(
      element('span', '', '作者：Lee Ethan'),
      element('span', '', '发布：' + post.publishedAt),
      element('span', '', '更新：' + post.updatedAt),
      element('span', '', '分类：' + post.category),
      element('span', '', post.readingTime),
      element('span', '', post.wordCount + ' 字')
    );
    header.append(badges, element('h1', '', post.title), element('p', '', post.summary), tags, meta);
    main.appendChild(header);

    if (post.type === 'solution') main.appendChild(makeSolutionInfo(post));
    const body = makeDetailBody(post.type === 'solution');
    main.appendChild(body);
    main.appendChild(makeDetailNavigation(post));
    main.appendChild(makeRelatedSection(post));

    const aside = element('aside', 'knowledge-detail-aside');
    aside.append(makeToc(body), makeBackToTopPanel());
    layout.append(main, aside);
    routeView.appendChild(layout);
    shell.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function makeSolutionInfo(post) {
    const solution = post.solution;
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
      ['是否 AC', solution.accepted === true ? '已通过' : '状态待接入'],
      ['原题链接', solution.problemUrl || '待接入'],
    ].forEach(function (entry) {
      const item = element('div');
      item.append(element('dt', '', entry[0]), element('dd', '', entry[1]));
      details.appendChild(item);
    });
    section.append(details);
    const algorithms = element('div', 'knowledge-card-tags');
    appendTags(algorithms, solution.algorithms);
    section.appendChild(algorithms);
    return section;
  }

  function makeDetailBody(isSolution) {
    const body = element('div', 'knowledge-detail-body');
    const sections = isSolution
      ? [
        ['题意', '题目描述与输入输出要求将在真实内容中呈现。'],
        ['思路', '这里展示算法思路、观察过程与关键结论。'],
        ['推导', '数学推导和状态转移过程将在这里展开。'],
        ['算法步骤', '使用有序列表组织完整算法步骤。'],
        ['正确性说明', '用于说明算法为何能够得到正确答案。'],
        ['复杂度分析', '用于分析时间复杂度和空间复杂度。'],
        ['参考代码', '代码块样式框架如下。'],
        ['易错点', '使用提示框记录边界、溢出和实现细节。'],
        ['扩展思考', '用于整理相似问题和可推广结论。'],
      ]
      : [
        ['章节标题示例', '正文段落、链接、图片和列表将在 Markdown 渲染后进入这个稳定阅读容器。'],
        ['结构化内容', '表格、引用、提示框和折叠内容都已经预留样式。'],
        ['代码与公式', '代码、数学公式和 Mermaid 目前只展示框架占位。'],
      ];

    sections.forEach(function (section, index) {
      const heading = element('h2', '', section[0]);
      heading.id = 'knowledge-section-' + (index + 1);
      body.append(heading, element('p', '', section[1]));

      if (index === 0) {
        const quote = element('blockquote');
        quote.appendChild(element('p', '', '引用内容占位：真实文章将在这里展示引用信息。'));
        const list = element('ul');
        list.append(element('li', '', '无序列表项目 A'), element('li', '', '无序列表项目 B'));
        body.append(quote, list);
      }
    });

    const table = element('table');
    const thead = element('thead');
    const headerRow = element('tr');
    headerRow.append(element('th', '', '字段'), element('th', '', '说明'));
    thead.appendChild(headerRow);
    const tbody = element('tbody');
    const row = element('tr');
    row.append(element('td', '', '表格占位'), element('td', '', 'Markdown 表格渲染位置'));
    tbody.appendChild(row);
    table.append(thead, tbody);
    body.appendChild(table);

    const inlineParagraph = element('p');
    inlineParagraph.append(t('行内代码示例：'), element('code', '', 'const value = true;'));
    body.appendChild(inlineParagraph);
    const pre = element('pre');
    pre.appendChild(element('code', '', 'int main() {\n    return 0;\n}'));
    body.appendChild(pre);
    body.append(
      element('div', 'knowledge-media-placeholder', 'IMAGE PLACEHOLDER · 图片与 alt 文本区域'),
      element('div', 'knowledge-formula-placeholder', 'FORMULA PLACEHOLDER · 数学公式区域'),
      element('div', 'knowledge-mermaid-placeholder', 'MERMAID PLACEHOLDER · 图表区域')
    );
    const callout = element('aside', 'knowledge-callout', '提示框占位：用于展示注意、警告或补充说明。');
    const details = element('details');
    details.append(element('summary', '', '折叠内容占位'), element('p', '', '展开后显示补充内容。'));
    body.append(callout, details);
    return body;
  }

  function makeToc(body) {
    const toc = element('details', 'knowledge-toc');
    toc.open = true;
    toc.appendChild(element('summary', '', '文章目录'));
    const nav = element('nav');
    body.querySelectorAll('h2').forEach(function (heading) {
      const item = button(heading.textContent);
      item.dataset.knowledgeHeading = heading.id;
      nav.appendChild(item);
    });
    toc.appendChild(nav);
    return toc;
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

  function makeDetailNavigation(post) {
    const currentIndex = data.posts.findIndex(function (item) { return item.slug === post.slug; });
    const previous = data.posts[currentIndex - 1];
    const next = data.posts[currentIndex + 1];
    const nav = element('nav', 'knowledge-detail-navigation');
    const previousButton = button(previous ? '上一篇\n' + previous.title : '上一篇\n暂无');
    const nextButton = button(next ? '下一篇\n' + next.title : '下一篇\n暂无');
    previousButton.disabled = !previous;
    nextButton.disabled = !next;
    if (previous) previousButton.dataset.postSlug = previous.slug;
    if (next) nextButton.dataset.postSlug = next.slug;
    nav.append(previousButton, nextButton);
    return nav;
  }

  function makeRelatedSection(post) {
    const section = element('section', 'knowledge-related-section');
    section.appendChild(element('h2', '', '相关文章'));
    const grid = element('div', 'knowledge-related-grid');
    data.posts.filter(function (item) { return item.slug !== post.slug; }).slice(0, 3).forEach(function (item) {
      const card = button('', 'knowledge-related-card');
      card.dataset.postSlug = item.slug;
      card.append(element('span', 'knowledge-type-badge', typeLabel(item.type)), element('h3', '', item.title));
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  async function openRoute(route, payload) {
    const details = payload || {};
    state.route = route;
    state.routePayload = Object.assign({}, details);
    closeNavigation();
    updateActiveNav(route);
    shell.scrollTo({ top: 0, behavior: 'smooth' });

    if (route === 'home') return showHome();
    if (route === 'all') return renderPostIndex(route, {
      kicker: 'ALL CONTENT',
      title: '全部文章',
      description: '统一浏览文章、题解、笔记、项目记录和随笔。',
      filters: details.type ? { type: details.type } : {},
    });
    if (route === 'solutions') return renderPostIndex(route, {
      kicker: 'SOLUTIONS',
      title: '算法题解',
      description: '题解使用独立元数据和专用卡片展示。',
      filters: { type: 'solution' },
    });
    if (route === 'notes') return renderPostIndex(route, {
      kicker: 'NOTES',
      title: '学习笔记',
      description: '用于整理 408、数学和其他学习内容。',
      filters: { type: 'note' },
    });
    if (route === 'projects') return renderPostIndex(route, {
      kicker: 'PROJECTS',
      title: '项目记录',
      description: '记录项目设计、开发过程和阶段更新。',
      filters: { type: 'project' },
    });
    if (route === 'search') return renderSearch(details);
    if (route === 'categories') return renderCategories();
    if (route === 'tags') return renderTags();
    if (route === 'archives') return renderArchives();
    if (route === 'about') return renderAbout();
    if (route === 'detail') return renderDetail(details.slug);
    if (route === 'writer' || route === 'drafts' || route === 'manage') return renderWriterPlaceholder(route);
    return showHome();
  }

  function handleSearchSubmit(form) {
    const input = form.elements.keyword;
    openRoute('search', { keyword: input ? input.value.trim() : '' });
  }

  shell.addEventListener('click', function (event) {
    const routeTarget = event.target.closest('[data-knowledge-route]');
    const postTarget = event.target.closest('[data-post-slug]');
    const actionTarget = event.target.closest('[data-knowledge-action]');
    const headingTarget = event.target.closest('[data-knowledge-heading]');
    const viewModeTarget = event.target.closest('[data-view-mode]');

    if (postTarget && !postTarget.disabled) {
      openRoute('detail', { slug: postTarget.dataset.postSlug });
      return;
    }
    if (routeTarget && !routeTarget.disabled) {
      openRoute(routeTarget.dataset.knowledgeRoute, {
        type: routeTarget.dataset.contentType || '',
        category: routeTarget.dataset.category || '',
        tag: routeTarget.dataset.tag || '',
        keyword: routeTarget.dataset.keyword || '',
      });
      return;
    }
    if (headingTarget) {
      const heading = document.getElementById(headingTarget.dataset.knowledgeHeading);
      if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (viewModeTarget) {
      setViewMode(viewModeTarget.dataset.viewMode);
      return;
    }
    if (actionTarget) {
      if (actionTarget.dataset.knowledgeAction === 'top') {
        shell.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (actionTarget.dataset.knowledgeAction === 'desktop') {
        const user = window.authManager && window.authManager.getCurrentUser
          ? window.authManager.getCurrentUser()
          : null;
        if (user && window.authUi) window.authUi.showDesktop(user);
      }
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

  menuToggle.addEventListener('click', function () {
    setNavOpen(!navLinks.classList.contains('is-open'));
  });
  themeButton.addEventListener('click', cycleTheme);
  languageButton.addEventListener('click', toggleLanguage);
  searchButton.addEventListener('click', function () { openRoute('search', {}); });
  logoutButton.addEventListener('click', function () {
    closeNavigation();
    if (window.authUi && window.authUi.logoutToLogin) window.authUi.logoutToLogin('');
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1040) setNavOpen(false);
  });

  translateStaticTree();
  updateLanguageButton();
  renderHomeStatic();
  renderHomeContent();
  applyTheme();
  refreshIdentity();

  window.elegantShell = {
    closeNavigation,
    refreshIdentity,
  };
}());
