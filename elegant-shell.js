(function () {
  const shell = document.getElementById('elegantShell');
  const toggle = document.getElementById('elegantMenuToggle');
  const menu = document.getElementById('elegantNavMenu');
  const themeToggle = document.getElementById('portalThemeToggle');
  const logoutButton = document.getElementById('portalLogoutButton');
  const config = window.portalConfig;
  if (!shell || !toggle || !menu || !config) return;

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setMenuOpen(open) {
    menu.classList.toggle('is-open', Boolean(open));
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
  }

  function closeNavigation() {
    setMenuOpen(false);
    shell.querySelectorAll('details[open]').forEach(function (details) {
      details.removeAttribute('open');
    });
  }

  function getCurrentUser() {
    return window.authManager && window.authManager.getCurrentUser
      ? window.authManager.getCurrentUser()
      : null;
  }

  function getRoleLabel(role) {
    if (role === 'admin') return 'Administrator';
    if (role === 'user') return '普通用户';
    if (role === 'guest') return '游客模式';
    return '当前用户';
  }

  function refreshIdentity(user) {
    const currentUser = user || getCurrentUser() || { username: '用户', role: null };
    const username = currentUser.username || '用户';
    const initial = username.slice(0, 1).toUpperCase() || 'U';

    ['portalNavUserName', 'portalMenuUserName', 'portalHeroUserName', 'portalProfileUserName']
      .forEach(function (id) {
        const element = document.getElementById(id);
        if (element) element.textContent = username;
      });

    const role = document.getElementById('portalMenuUserRole');
    if (role) role.textContent = getRoleLabel(currentUser.role);

    shell.querySelectorAll('[data-avatar]').forEach(function (avatar) {
      if (!avatar.classList.contains('portal-character-placeholder')) {
        avatar.textContent = initial;
      }
    });
  }

  function renderQuickLinks() {
    const container = document.getElementById('portalQuickLinks');
    if (!container) return;
    const fragment = document.createDocumentFragment();

    config.quickLinks.forEach(function (item) {
      const card = createElement(item.href ? 'a' : 'button', 'portal-quick-card');
      if (item.href) {
        card.href = item.href;
      } else {
        card.type = 'button';
        card.disabled = Boolean(item.disabled);
      }
      card.dataset.placeholder = String(Boolean(item.placeholder));
      if (item.action) card.dataset.portalAction = item.action;
      if (item.scrollTarget) card.dataset.portalScroll = item.scrollTarget;

      card.append(
        createElement('span', 'portal-quick-icon', item.icon),
        createElement('strong', '', item.title),
        createElement('p', '', item.description),
        createElement('small', '', item.tag)
      );
      fragment.appendChild(card);
    });

    container.replaceChildren(fragment);
  }

  function renderCategories() {
    const container = document.getElementById('portalCategories');
    if (!container) return;
    const fragment = document.createDocumentFragment();
    config.categories.forEach(function (category) {
      const item = createElement('span', 'portal-category-chip', category.label);
      item.dataset.placeholder = String(Boolean(category.placeholder));
      fragment.appendChild(item);
    });
    container.replaceChildren(fragment);
  }

  function renderPosts() {
    const container = document.getElementById('portalPostList');
    if (!container) return;
    const fragment = document.createDocumentFragment();

    config.placeholderPosts.forEach(function (post) {
      const article = createElement('article', 'portal-post-card');
      article.dataset.placeholder = String(Boolean(post.placeholder));
      const cover = createElement('div', 'portal-post-cover', 'ARTICLE COVER');
      cover.setAttribute('aria-label', '文章封面占位');
      const body = createElement('div', 'portal-post-body');
      const meta = createElement('div', 'portal-post-meta');
      meta.append(
        createElement('span', 'portal-placeholder-label', '占位内容'),
        createElement('time', '', post.date),
        createElement('span', '', post.category)
      );
      body.append(meta, createElement('h3', '', post.title), createElement('p', '', post.summary));

      const footer = createElement('div', 'portal-post-footer');
      post.tags.forEach(function (tag) {
        footer.appendChild(createElement('span', 'portal-post-tag', tag));
      });
      footer.append(
        createElement('span', '', post.readingTime),
        createElement('span', 'portal-post-read', '阅读入口待接入')
      );
      body.appendChild(footer);
      article.append(cover, body);
      fragment.appendChild(article);
    });

    container.replaceChildren(fragment);
  }

  function renderProjects() {
    const container = document.getElementById('portalProjectList');
    if (!container) return;
    const fragment = document.createDocumentFragment();

    config.placeholderProjects.forEach(function (project) {
      const article = createElement('article', 'portal-project-card');
      article.dataset.placeholder = String(Boolean(project.placeholder));
      const cover = createElement('div', 'portal-project-cover', 'PROJECT IMAGE');
      cover.setAttribute('aria-label', '项目图片占位');
      const tech = createElement('div', 'portal-project-tech');
      project.tech.forEach(function (item) {
        tech.appendChild(createElement('span', '', item));
      });
      const status = createElement('div', 'portal-project-status');
      status.append(
        createElement('span', '', project.status),
        createElement('span', '', '项目链接待接入')
      );
      article.append(
        cover,
        createElement('h3', '', project.name),
        createElement('p', '', project.description),
        tech,
        status
      );
      fragment.appendChild(article);
    });

    container.replaceChildren(fragment);
  }

  function renderActivities() {
    const container = document.getElementById('portalActivityList');
    if (!container) return;
    const fragment = document.createDocumentFragment();

    config.placeholderActivities.forEach(function (activity) {
      const item = createElement('li');
      item.dataset.placeholder = String(Boolean(activity.placeholder));
      item.append(
        createElement('time', '', activity.time),
        createElement('strong', '', activity.type),
        createElement('small', '', activity.description)
      );
      fragment.appendChild(item);
    });

    container.replaceChildren(fragment);
  }

  function renderStatsAndTags() {
    const stats = document.getElementById('portalStats');
    const tags = document.getElementById('portalTagCloud');
    if (stats) {
      const statsFragment = document.createDocumentFragment();
      config.placeholderStats.forEach(function (stat) {
        const item = createElement('div', 'portal-stat');
        item.dataset.placeholder = String(Boolean(stat.placeholder));
        item.append(createElement('strong', '', stat.value), createElement('span', '', stat.label));
        statsFragment.appendChild(item);
      });
      stats.replaceChildren(statsFragment);
    }
    if (tags) {
      const tagFragment = document.createDocumentFragment();
      config.placeholderTags.forEach(function (tag) {
        const item = createElement('span', '', tag);
        item.dataset.placeholder = 'true';
        tagFragment.appendChild(item);
      });
      tags.replaceChildren(tagFragment);
    }
  }

  function renderCalendar() {
    const container = document.getElementById('portalCalendar');
    const label = document.getElementById('portalCalendarMonth');
    if (!container || !label) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const mondayOffset = firstDay === 0 ? 6 : firstDay - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const fragment = document.createDocumentFragment();
    label.textContent = year + ' 年 ' + (month + 1) + ' 月';

    for (let blank = 0; blank < mondayOffset; blank += 1) {
      fragment.appendChild(createElement('span', 'is-empty', '0'));
    }
    for (let day = 1; day <= totalDays; day += 1) {
      const cell = createElement('span', day === today.getDate() ? 'is-today' : '', String(day));
      fragment.appendChild(cell);
    }
    container.replaceChildren(fragment);
  }

  function scrollToSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    closeNavigation();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function enterDesktop(destination) {
    const user = getCurrentUser();
    if (!user || !window.authUi || !window.authUi.showDesktop) return;
    closeNavigation();
    window.authUi.showDesktop(user);

    window.setTimeout(function () {
      if (destination === 'blog' && window.homeDesktop) {
        window.homeDesktop.openBlogWindow();
      } else if (destination === 'contest' && window.contestCenter) {
        window.contestCenter.openWindow();
      } else if (destination === 'city' && window.cityWorldApp) {
        window.cityWorldApp.enterCityWorld();
      }
    }, 0);
  }

  function handlePortalAction(action) {
    if (action === 'desktop') enterDesktop('');
    if (action === 'blog') window.location.href = 'blog.html';
    if (action === 'contest') enterDesktop('contest');
    if (action === 'city') enterDesktop('city');
  }

  function updateThemeButton() {
    if (!themeToggle) return;
    const isDark = shell.dataset.theme === 'dark'
      || (!shell.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    themeToggle.textContent = isDark ? '☀' : '☾';
    themeToggle.setAttribute('aria-label', isDark ? '切换到浅色主题' : '切换到深色主题');
    themeToggle.title = themeToggle.getAttribute('aria-label');
  }

  function toggleTheme() {
    const isDark = shell.dataset.theme === 'dark'
      || (!shell.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    shell.dataset.theme = isDark ? 'light' : 'dark';
    updateThemeButton();
  }

  toggle.addEventListener('click', function () {
    setMenuOpen(!menu.classList.contains('is-open'));
  });

  shell.addEventListener('click', function (event) {
    const actionTarget = event.target.closest('[data-portal-action]');
    const scrollTarget = event.target.closest('[data-portal-scroll]');
    if (actionTarget && !actionTarget.disabled) {
      handlePortalAction(actionTarget.dataset.portalAction);
    } else if (scrollTarget && !scrollTarget.disabled) {
      scrollToSection(scrollTarget.dataset.portalScroll);
    }
  });

  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
  if (logoutButton) {
    logoutButton.addEventListener('click', function () {
      closeNavigation();
      if (window.authUi && window.authUi.logoutToLogin) {
        window.authUi.logoutToLogin('');
      }
    });
  }

  window.addEventListener('resize', function () {
    if (window.innerWidth > 820) setMenuOpen(false);
  });

  renderQuickLinks();
  renderCategories();
  renderPosts();
  renderProjects();
  renderActivities();
  renderStatsAndTags();
  renderCalendar();
  refreshIdentity();
  updateThemeButton();

  window.elegantShell = {
    closeNavigation,
    refreshIdentity,
  };
}());
