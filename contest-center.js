(function () {
  const TASKBAR_HEIGHT = 40;
  const MIN_WIDTH = 680;
  const MIN_HEIGHT = 420;
  const FAVORITES_KEY = 'webos_contest_favorites';
  const REMINDERS_KEY = 'webos_contest_reminders';
  const WINDOW_KEY = 'webos_contest_window';
  const REMINDER_CHECK_MS = 30000;
  const STATUS_LABELS = {
    upcoming: '即将开始',
    running: '进行中',
    finished: '已结束',
  };
  const elements = {
    desktopIcon: document.getElementById('contestDesktopIcon'),
    taskbarButton: document.getElementById('contestTaskbarButton'),
    startButton: document.getElementById('startContestButton'),
    startStatus: document.getElementById('startContestStatus'),
    window: document.getElementById('contestWindow'),
    titlebar: document.getElementById('contestTitlebar'),
    minimize: document.getElementById('contestMinimize'),
    maximize: document.getElementById('contestMaximize'),
    close: document.getElementById('contestClose'),
    summary: document.getElementById('contestSummary'),
    warning: document.getElementById('contestWarning'),
    tableBody: document.getElementById('contestTableBody'),
    empty: document.getElementById('contestEmpty'),
    quickFilters: document.getElementById('contestQuickFilters'),
    platformFilters: document.getElementById('contestPlatformFilters'),
    enableNotifications: document.getElementById('contestEnableNotifications'),
    detail: document.getElementById('contestDetail'),
    detailTitle: document.getElementById('contestDetailTitle'),
    detailFields: document.getElementById('contestDetailFields'),
    detailClose: document.getElementById('contestDetailClose'),
    officialLink: document.getElementById('contestOfficialLink'),
    detailFavorite: document.getElementById('contestDetailFavorite'),
    detailReminder: document.getElementById('contestDetailReminder'),
    toastRegion: document.getElementById('contestToastRegion'),
    resizeHandles: Array.from(document.querySelectorAll('[data-contest-resize-edge]')),
    sortButtons: Array.from(document.querySelectorAll('[data-contest-sort]')),
  };

  if (!elements.desktopIcon || !elements.window || !elements.tableBody) return;

  const state = {
    open: false,
    minimized: false,
    maximized: false,
    restoreBounds: null,
    drag: null,
    resize: null,
    loaded: false,
    loading: false,
    contests: [],
    warnings: [],
    quickFilter: 'all',
    platforms: new Set(['Codeforces', 'AtCoder', '牛客', '洛谷']),
    favorites: new Set(readStoredArray(FAVORITES_KEY).map(String)),
    reminders: new Map(),
    notified: new Set(),
    sortKey: 'default',
    sortDirection: 'asc',
    selectedContestId: null,
  };

  readStoredArray(REMINDERS_KEY).forEach(function (item) {
    const minutes = Number(item && item.remindBeforeMinutes);
    if (item && item.contestId && [10, 60, 1440].includes(minutes)) {
      state.reminders.set(String(item.contestId), minutes);
    }
  });

  const beijingFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  function readStoredArray(key) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Local preferences are optional; the application remains usable without them.
    }
  }

  function getContestStatus(contest, now) {
    const current = now == null ? Date.now() : now;
    const start = Date.parse(contest.startTime);
    const end = contest.endTime ? Date.parse(contest.endTime) : NaN;
    if (current < start) return 'upcoming';
    if (!Number.isFinite(end) || current < end) return 'running';
    return 'finished';
  }

  function formatBeijingTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '未知';
    const parts = Object.fromEntries(beijingFormatter.formatToParts(date)
      .filter(function (part) { return part.type !== 'literal'; })
      .map(function (part) { return [part.type, part.value]; }));
    return parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute;
  }

  function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || seconds === '') return '未知';
    const totalMinutes = Math.round(Number(seconds) / 60);
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '未知';
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days) parts.push(days + '天');
    if (hours) parts.push(hours + '小时');
    if (minutes || !parts.length) parts.push(minutes + '分钟');
    return parts.join(' ');
  }

  function formatFee(contest) {
    if (contest.feeType === 'free') return '免费';
    if (contest.feeType !== 'paid' || !Number.isFinite(Number(contest.feeAmount))) return '未知';
    const symbol = contest.feeCurrency === 'CNY' ? '¥' : (contest.feeCurrency || '');
    const unit = contest.feeUnit === 'team' ? '/队' : (contest.feeUnit === 'person' ? '/人' : '');
    return symbol + Number(contest.feeAmount) + unit;
  }

  function formatCountdown(contest, now) {
    const status = getContestStatus(contest, now);
    if (status === 'running') return '进行中';
    if (status === 'finished') return '已结束';
    const remainingMinutes = Math.max(0, Math.floor((Date.parse(contest.startTime) - (now || Date.now())) / 60000));
    const days = Math.floor(remainingMinutes / 1440);
    const hours = Math.floor((remainingMinutes % 1440) / 60);
    const minutes = remainingMinutes % 60;
    if (days) return days + '天 ' + hours + '小时';
    if (hours) return hours + '小时 ' + minutes + '分钟';
    return minutes + '分钟';
  }

  function safeOfficialUrl(contest) {
    const allowedHosts = {
      Codeforces: 'codeforces.com',
      AtCoder: 'atcoder.jp',
      牛客: 'ac.nowcoder.com',
      洛谷: 'www.luogu.com.cn',
    };
    try {
      const url = new URL(contest.url);
      return url.protocol === 'https:' && url.hostname === allowedHosts[contest.platform]
        ? url.toString()
        : '#';
    } catch (error) {
      return '#';
    }
  }

  function setSelected(selected) {
    elements.desktopIcon.classList.toggle('is-selected', selected);
    elements.desktopIcon.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  function bringToFront() {
    window.__webOsWindowZ = Math.max(Number(window.__webOsWindowZ) || 30, 30) + 1;
    elements.window.style.zIndex = String(window.__webOsWindowZ);
  }

  function updateWindowState() {
    elements.window.classList.toggle('is-hidden', !state.open);
    elements.window.classList.toggle('is-minimized', state.open && state.minimized);
    elements.window.classList.toggle('is-maximized', state.open && state.maximized);
    elements.taskbarButton.classList.toggle('is-running', state.open);
    elements.taskbarButton.classList.toggle('is-active', state.open && !state.minimized);
    elements.taskbarButton.setAttribute('aria-pressed', state.open && !state.minimized ? 'true' : 'false');
    elements.maximize.setAttribute('aria-label', state.maximized ? '还原' : '最大化');
    if (elements.startStatus) {
      elements.startStatus.textContent = state.open
        ? (state.minimized ? '已最小化' : '正在运行')
        : '比赛聚合与提醒';
    }
  }

  function readBounds() {
    const rect = elements.window.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function clampBounds(bounds) {
    const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - TASKBAR_HEIGHT);
    const width = Math.min(Math.max(MIN_WIDTH, bounds.width), window.innerWidth);
    const height = Math.min(Math.max(MIN_HEIGHT, bounds.height), maxHeight);
    return {
      left: Math.max(0, Math.min(bounds.left, window.innerWidth - width)),
      top: Math.max(0, Math.min(bounds.top, maxHeight - height)),
      width: width,
      height: height,
    };
  }

  function applyBounds(bounds) {
    const safe = clampBounds(bounds);
    elements.window.style.left = safe.left + 'px';
    elements.window.style.top = safe.top + 'px';
    elements.window.style.width = safe.width + 'px';
    elements.window.style.height = safe.height + 'px';
  }

  function saveWindowBounds() {
    if (state.maximized) return;
    const bounds = readBounds();
    writeStorage(WINDOW_KEY, bounds);
  }

  function restoreWindowBounds() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(WINDOW_KEY) || 'null');
      if (saved && ['left', 'top', 'width', 'height'].every(function (key) {
        return Number.isFinite(Number(saved[key]));
      })) applyBounds(saved);
    } catch (error) {
      // Invalid saved bounds fall back to CSS defaults.
    }
  }

  function openWindow() {
    state.open = true;
    state.minimized = false;
    setSelected(true);
    bringToFront();
    updateWindowState();
    if (window.homeDesktop) window.homeDesktop.closeStartMenu();
    loadContests();
  }

  function closeWindow() {
    state.open = false;
    state.minimized = false;
    state.maximized = false;
    state.restoreBounds = null;
    closeDetail();
    setSelected(false);
    updateWindowState();
  }

  function minimizeWindow() {
    if (!state.open) return;
    state.minimized = true;
    updateWindowState();
  }

  function toggleTaskbar() {
    if (!state.open) return openWindow();
    state.minimized = !state.minimized;
    if (!state.minimized) bringToFront();
    updateWindowState();
  }

  function toggleMaximize() {
    if (!state.open) openWindow();
    if (state.maximized) {
      state.maximized = false;
      if (state.restoreBounds) applyBounds(state.restoreBounds);
      state.restoreBounds = null;
    } else {
      state.restoreBounds = readBounds();
      state.maximized = true;
      state.minimized = false;
    }
    bringToFront();
    updateWindowState();
    saveWindowBounds();
  }

  function startDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest && event.target.closest('.window-control')) return;
    if (!state.open || state.minimized || state.maximized) return;
    const bounds = readBounds();
    state.drag = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
    bringToFront();
    elements.window.classList.add('is-dragging');
    document.addEventListener('pointermove', dragWindow);
    document.addEventListener('pointerup', stopDrag, { once: true });
  }

  function dragWindow(event) {
    if (!state.drag) return;
    const bounds = readBounds();
    applyBounds({
      left: state.drag.left + event.clientX - state.drag.x,
      top: state.drag.top + event.clientY - state.drag.y,
      width: bounds.width,
      height: bounds.height,
    });
  }

  function stopDrag() {
    state.drag = null;
    elements.window.classList.remove('is-dragging');
    document.removeEventListener('pointermove', dragWindow);
    saveWindowBounds();
  }

  function startResize(event, edge) {
    if (event.button !== undefined && event.button !== 0) return;
    if (!state.open || state.minimized || state.maximized) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = readBounds();
    state.resize = {
      edge: edge,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top,
      right: bounds.left + bounds.width,
      bottom: bounds.top + bounds.height,
    };
    bringToFront();
    elements.window.classList.add('is-resizing');
    document.addEventListener('pointermove', resizeWindow);
    document.addEventListener('pointerup', stopResize, { once: true });
  }

  function resizeWindow(event) {
    if (!state.resize) return;
    const original = state.resize;
    const dx = event.clientX - original.x;
    const dy = event.clientY - original.y;
    let left = original.left;
    let top = original.top;
    let right = original.right;
    let bottom = original.bottom;
    if (original.edge.includes('e')) right = Math.min(window.innerWidth, Math.max(left + MIN_WIDTH, original.right + dx));
    if (original.edge.includes('s')) bottom = Math.min(window.innerHeight - TASKBAR_HEIGHT, Math.max(top + MIN_HEIGHT, original.bottom + dy));
    if (original.edge.includes('w')) left = Math.max(0, Math.min(original.right - MIN_WIDTH, original.left + dx));
    if (original.edge.includes('n')) top = Math.max(0, Math.min(original.bottom - MIN_HEIGHT, original.top + dy));
    applyBounds({ left: left, top: top, width: right - left, height: bottom - top });
  }

  function stopResize() {
    state.resize = null;
    elements.window.classList.remove('is-resizing');
    document.removeEventListener('pointermove', resizeWindow);
    saveWindowBounds();
  }

  function getContestById(id) {
    return state.contests.find(function (contest) { return String(contest.id) === String(id); }) || null;
  }

  function saveFavorites() {
    writeStorage(FAVORITES_KEY, Array.from(state.favorites));
  }

  function saveReminders() {
    writeStorage(REMINDERS_KEY, Array.from(state.reminders, function (entry) {
      return { contestId: entry[0], remindBeforeMinutes: entry[1] };
    }));
  }

  function toggleFavorite(contestId) {
    const id = String(contestId);
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    saveFavorites();
    renderTable();
    updateDetailActions();
  }

  function setReminder(contestId, value) {
    const id = String(contestId);
    const minutes = Number(value);
    if ([10, 60, 1440].includes(minutes)) state.reminders.set(id, minutes);
    else state.reminders.delete(id);
    state.notified.delete(id + ':' + minutes);
    saveReminders();
    renderTable();
    updateDetailActions();
  }

  function filteredContests() {
    const now = Date.now();
    const deadline = state.quickFilter === 'day'
      ? now + 24 * 60 * 60 * 1000
      : now + 7 * 24 * 60 * 60 * 1000;
    const items = state.contests.filter(function (contest) {
      if (!state.platforms.has(contest.platform)) return false;
      if (state.quickFilter === 'favorites') return state.favorites.has(String(contest.id));
      if (state.quickFilter === 'reminders') return state.reminders.has(String(contest.id));
      if (state.quickFilter === 'day' || state.quickFilter === 'week') {
        const start = Date.parse(contest.startTime);
        return start >= now && start <= deadline;
      }
      return true;
    });
    if (state.sortKey === 'default') return items;
    const direction = state.sortDirection === 'asc' ? 1 : -1;
    return items.sort(function (left, right) {
      let leftValue = left[state.sortKey];
      let rightValue = right[state.sortKey];
      if (state.sortKey === 'status') {
        const order = { upcoming: 0, running: 1, finished: 2 };
        leftValue = order[getContestStatus(left)];
        rightValue = order[getContestStatus(right)];
      } else if (state.sortKey === 'startTime') {
        leftValue = Date.parse(left.startTime);
        rightValue = Date.parse(right.startTime);
      } else if (state.sortKey === 'durationSeconds') {
        leftValue = Number(left.durationSeconds) || 0;
        rightValue = Number(right.durationSeconds) || 0;
      } else {
        leftValue = String(leftValue || '');
        rightValue = String(rightValue || '');
      }
      return (typeof leftValue === 'number'
        ? leftValue - rightValue
        : leftValue.localeCompare(rightValue, 'zh-CN')) * direction;
    });
  }

  function createCell(text) {
    const cell = document.createElement('td');
    cell.textContent = text;
    cell.title = text;
    return cell;
  }

  function createReminderSelect(contest) {
    const select = document.createElement('select');
    select.className = 'contest-reminder-select';
    select.setAttribute('aria-label', '设置提醒');
    [['', '不提醒'], ['1440', '提前1天'], ['60', '提前1小时'], ['10', '提前10分钟']]
      .forEach(function (optionData) {
        const option = document.createElement('option');
        option.value = optionData[0];
        option.textContent = optionData[1];
        select.appendChild(option);
      });
    select.value = state.reminders.has(String(contest.id))
      ? String(state.reminders.get(String(contest.id)))
      : '';
    select.addEventListener('click', function (event) { event.stopPropagation(); });
    select.addEventListener('change', function () { setReminder(contest.id, select.value); });
    return select;
  }

  function renderTable() {
    const contests = filteredContests();
    elements.tableBody.replaceChildren();
    const now = Date.now();
    contests.forEach(function (contest) {
      const row = document.createElement('tr');
      const status = getContestStatus(contest, now);
      const statusCell = document.createElement('td');
      const statusText = document.createElement('span');
      statusText.className = 'contest-status ' + status;
      statusText.textContent = STATUS_LABELS[status];
      statusCell.appendChild(statusText);
      row.appendChild(statusCell);

      const favoriteCell = document.createElement('td');
      const favorite = document.createElement('button');
      favorite.type = 'button';
      favorite.className = 'contest-favorite';
      favorite.classList.toggle('is-active', state.favorites.has(String(contest.id)));
      favorite.textContent = state.favorites.has(String(contest.id)) ? '★' : '☆';
      favorite.setAttribute('aria-label', state.favorites.has(String(contest.id)) ? '取消收藏' : '收藏');
      favorite.addEventListener('click', function (event) {
        event.stopPropagation();
        toggleFavorite(contest.id);
      });
      favoriteCell.appendChild(favorite);
      row.appendChild(favoriteCell);
      row.appendChild(createCell(contest.platform));

      const titleCell = document.createElement('td');
      const titleButton = document.createElement('button');
      titleButton.type = 'button';
      titleButton.className = 'contest-title-button';
      titleButton.textContent = contest.title;
      titleButton.title = contest.title;
      titleButton.addEventListener('click', function () { openDetail(contest.id); });
      titleCell.appendChild(titleButton);
      row.appendChild(titleCell);
      row.appendChild(createCell(formatBeijingTime(contest.startTime)));
      row.appendChild(createCell(formatDuration(contest.durationSeconds)));
      row.appendChild(createCell(formatFee(contest)));
      row.appendChild(createCell(formatCountdown(contest, now)));
      const reminderCell = document.createElement('td');
      reminderCell.appendChild(createReminderSelect(contest));
      row.appendChild(reminderCell);
      elements.tableBody.appendChild(row);
    });

    elements.empty.classList.toggle('is-hidden', contests.length > 0);
    if (!state.loading) elements.empty.textContent = contests.length ? '' : '没有符合当前筛选条件的比赛';
    elements.summary.textContent = state.loading
      ? '正在获取比赛信息……'
      : '共 ' + contests.length + ' 场比赛 · 北京时间';
  }

  function appendDetailField(label, value) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    elements.detailFields.appendChild(term);
    elements.detailFields.appendChild(detail);
  }

  function updateDetailActions() {
    const contest = getContestById(state.selectedContestId);
    if (!contest) return;
    const favorite = state.favorites.has(String(contest.id));
    elements.detailFavorite.textContent = favorite ? '取消收藏' : '收藏';
    elements.detailReminder.value = state.reminders.has(String(contest.id))
      ? String(state.reminders.get(String(contest.id)))
      : '';
  }

  function openDetail(contestId) {
    const contest = getContestById(contestId);
    if (!contest) return;
    state.selectedContestId = String(contest.id);
    elements.detailTitle.textContent = contest.title;
    elements.detailFields.replaceChildren();
    appendDetailField('平台', contest.platform);
    appendDetailField('开始时间', formatBeijingTime(contest.startTime));
    appendDetailField('结束时间', contest.endTime ? formatBeijingTime(contest.endTime) : '未知');
    appendDetailField('持续时间', formatDuration(contest.durationSeconds));
    appendDetailField('费用', formatFee(contest));
    appendDetailField('Rating 范围', contest.ratingRange || '未知');
    appendDetailField('报名截止', contest.registrationDeadline ? formatBeijingTime(contest.registrationDeadline) : '未知');
    appendDetailField('距离开始', formatCountdown(contest));
    elements.officialLink.href = safeOfficialUrl(contest);
    updateDetailActions();
    elements.detail.classList.remove('is-hidden');
  }

  function closeDetail() {
    state.selectedContestId = null;
    elements.detail.classList.add('is-hidden');
  }

  async function loadContests() {
    if (state.loaded || state.loading) return;
    state.loading = true;
    elements.empty.textContent = '正在获取比赛信息……';
    elements.empty.classList.remove('is-hidden');
    renderTable();
    try {
      const response = await fetch('/api/contests', {
        cache: 'no-cache',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok || !data || data.success !== true || !Array.isArray(data.contests)) {
        throw new Error('invalid-response');
      }
      state.contests = data.contests.filter(function (contest) {
        return contest && contest.id && contest.platform && contest.title && contest.startTime;
      });
      state.warnings = Array.isArray(data.warnings) ? data.warnings : [];
      state.loaded = true;
      elements.warning.textContent = state.warnings.length ? '部分平台数据暂时不可用。' : '';
      elements.warning.classList.toggle('is-hidden', state.warnings.length === 0);
      checkReminders();
    } catch (error) {
      elements.empty.textContent = '比赛信息加载失败，请稍后重试';
      elements.warning.textContent = '';
      elements.warning.classList.add('is-hidden');
    } finally {
      state.loading = false;
      renderTable();
    }
  }

  function showToast(contest, minutes) {
    const toast = document.createElement('div');
    toast.className = 'contest-toast';
    const heading = document.createElement('strong');
    const title = document.createElement('span');
    const time = document.createElement('small');
    const button = document.createElement('button');
    heading.textContent = contest.platform + ' 比赛即将开始';
    title.textContent = contest.title;
    time.textContent = '将在 ' + (minutes === 1440 ? '1 天' : (minutes === 60 ? '1 小时' : '10 分钟')) + '后开始';
    button.type = 'button';
    button.textContent = '查看比赛';
    button.addEventListener('click', function () {
      openWindow();
      openDetail(contest.id);
      toast.remove();
    });
    toast.append(heading, title, time, button);
    elements.toastRegion.appendChild(toast);
    window.setTimeout(function () { toast.remove(); }, 12000);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(heading.textContent, { body: contest.title + '\n' + time.textContent });
    }
  }

  function checkReminders() {
    if (!state.loaded || !state.reminders.size) return;
    const now = Date.now();
    state.reminders.forEach(function (minutes, contestId) {
      const contest = getContestById(contestId);
      if (!contest) return;
      const trigger = Date.parse(contest.startTime) - minutes * 60000;
      const key = contestId + ':' + minutes + ':' + contest.startTime;
      if (now >= trigger && now < trigger + 60000 && !state.notified.has(key)) {
        state.notified.add(key);
        showToast(contest, minutes);
      }
    });
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      elements.enableNotifications.textContent = '浏览器不支持通知';
      return;
    }
    const permission = await Notification.requestPermission();
    elements.enableNotifications.textContent = permission === 'granted' ? '系统通知已开启' : '仅使用站内提醒';
  }

  elements.desktopIcon.addEventListener('click', function (event) {
    event.stopPropagation();
    setSelected(true);
  });
  elements.desktopIcon.addEventListener('dblclick', openWindow);
  elements.desktopIcon.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') openWindow();
  });
  elements.taskbarButton.addEventListener('click', toggleTaskbar);
  if (elements.startButton) elements.startButton.addEventListener('click', openWindow);
  elements.minimize.addEventListener('click', minimizeWindow);
  elements.maximize.addEventListener('click', toggleMaximize);
  elements.close.addEventListener('click', closeWindow);
  elements.titlebar.addEventListener('pointerdown', startDrag);
  elements.titlebar.addEventListener('dblclick', toggleMaximize);
  elements.window.addEventListener('pointerdown', bringToFront);
  elements.resizeHandles.forEach(function (handle) {
    handle.addEventListener('pointerdown', function (event) {
      startResize(event, handle.dataset.contestResizeEdge);
    });
  });
  elements.quickFilters.addEventListener('click', function (event) {
    const button = event.target.closest('[data-contest-filter]');
    if (!button) return;
    state.quickFilter = button.dataset.contestFilter;
    elements.quickFilters.querySelectorAll('[data-contest-filter]').forEach(function (item) {
      item.classList.toggle('is-active', item === button);
    });
    renderTable();
  });
  elements.platformFilters.addEventListener('change', function (event) {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) state.platforms.add(event.target.value);
    else state.platforms.delete(event.target.value);
    renderTable();
  });
  elements.sortButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      const key = button.dataset.contestSort;
      if (state.sortKey === key) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      else {
        state.sortKey = key;
        state.sortDirection = 'asc';
      }
      renderTable();
    });
  });
  elements.detailClose.addEventListener('click', closeDetail);
  elements.detailFavorite.addEventListener('click', function () {
    if (state.selectedContestId) toggleFavorite(state.selectedContestId);
  });
  elements.detailReminder.addEventListener('change', function () {
    if (state.selectedContestId) setReminder(state.selectedContestId, elements.detailReminder.value);
  });
  elements.enableNotifications.addEventListener('click', requestNotificationPermission);
  window.addEventListener('resize', function () {
    if (!state.maximized && state.open) applyBounds(readBounds());
  });

  let iconDragRegistered = false;
  function registerDesktopIconDrag() {
    if (iconDragRegistered || !window.homeDesktop
      || typeof window.homeDesktop.getIconDragController !== 'function') return;
    const iconDrag = window.homeDesktop.getIconDragController();
    if (!iconDrag) return;
    iconDrag.registerIcon(elements.desktopIcon, {
      onDragStart: function () {
        setSelected(true);
        window.homeDesktop.closeStartMenu();
      },
    });
    iconDragRegistered = true;
  }

  restoreWindowBounds();
  registerDesktopIconDrag();
  if (!iconDragRegistered) document.addEventListener('DOMContentLoaded', registerDesktopIconDrag, { once: true });
  updateWindowState();
  window.setInterval(function () {
    if (state.loaded) {
      renderTable();
      checkReminders();
    }
  }, REMINDER_CHECK_MS);
  if (state.reminders.size) loadContests();

  window.contestCenter = {
    openWindow: openWindow,
    closeWindow: closeWindow,
    refresh: function () {
      state.loaded = false;
      return loadContests();
    },
  };
  window.ContestCenter = {
    formatBeijingTime: formatBeijingTime,
    formatDuration: formatDuration,
    formatFee: formatFee,
    formatCountdown: formatCountdown,
    getContestStatus: getContestStatus,
  };
}());
