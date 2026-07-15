(function () {
  const TASKBAR_HEIGHT = 40;
  const MIN_WIDTH = 680;
  const MIN_HEIGHT = 420;
  const FAVORITES_KEY = 'webos_contest_favorites';
  const REMINDERS_KEY = 'webos_contest_reminders';
  const WINDOW_KEY = 'webos_contest_window';
  const REMINDER_CHECK_MS = 30000;
  const PLATFORM_ORDER = [
    'Codeforces', 'AtCoder', '牛客', '洛谷', 'LeetCode', 'CodeChef', 'HackerRank', 'DMOJ', 'Kattis',
    '蓝桥杯', '百度之星', '睿抗', '传智杯', '天梯赛', '码蹄杯',
  ];
  const PLATFORM_META = {
    Codeforces: { short: 'CF', color: '#3977a8' },
    AtCoder: { short: 'AT', color: '#67577d' },
    牛客: { short: 'NC', color: '#3d8666' },
    洛谷: { short: 'LG', color: '#b56e35' },
    LeetCode: { short: 'LC', color: '#a9822f' },
    CodeChef: { short: 'CC', color: '#76584b' },
    HackerRank: { short: 'HR', color: '#3f7d62' },
    DMOJ: { short: 'DM', color: '#a65353' },
    Kattis: { short: 'KT', color: '#347e83' },
    蓝桥杯: { short: 'LQ', color: '#2678c8' },
    百度之星: { short: 'BD', color: '#3568d4' },
    睿抗: { short: 'RK', color: '#9b4f43' },
    传智杯: { short: 'CZ', color: '#31855a' },
    天梯赛: { short: 'TT', color: '#a66b2c' },
    码蹄杯: { short: 'MT', color: '#417c91' },
  };
  const STATUS_LABELS = { upcoming: '即将开始', running: '进行中', finished: '已结束' };
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
    search: document.getElementById('contestSearch'),
    viewTabs: document.getElementById('contestViewTabs'),
    timelineView: document.getElementById('contestTimelineView'),
    hero: document.getElementById('contestHero'),
    timelineGroups: document.getElementById('contestTimelineGroups'),
    calendarView: document.getElementById('contestCalendarView'),
    calendarTitle: document.getElementById('contestCalendarTitle'),
    calendarGrid: document.getElementById('contestCalendarGrid'),
    calendarDayTitle: document.getElementById('contestCalendarDayTitle'),
    calendarDayContests: document.getElementById('contestCalendarDayContests'),
    calendarPrevious: document.getElementById('contestCalendarPrevious'),
    calendarNext: document.getElementById('contestCalendarNext'),
    tableWrap: document.getElementById('contestTableWrap'),
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
    open: false, minimized: false, maximized: false, restoreBounds: null, drag: null, resize: null,
    loaded: false, loading: false, contests: [], warnings: [], view: 'timeline', quickFilter: 'all',
    platforms: new Set(PLATFORM_ORDER), favorites: new Set(readStoredArray(FAVORITES_KEY).map(String)),
    reminders: new Map(), notified: new Set(), sortKey: 'default', sortDirection: 'asc',
    selectedContestId: null, search: '', calendarDate: firstOfMonth(new Date()), selectedCalendarDay: null,
  };

  readStoredArray(REMINDERS_KEY).forEach(function (item) {
    const minutes = Number(item && item.remindBeforeMinutes);
    if (item && item.contestId && [10, 60, 1440].includes(minutes)) {
      state.reminders.set(String(item.contestId), minutes);
    }
  });

  const beijingFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const beijingDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const beijingTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  function readStoredArray(key) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) { return []; }
  }
  function writeStorage(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
  }
  function firstOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? beijingDateFormatter.format(date) : '';
  }
  function getContestStatus(contest, now) {
    const current = now == null ? Date.now() : now;
    const start = Date.parse(contest.startTime);
    const end = contest.endTime ? Date.parse(contest.endTime) : NaN;
    if (current < start) return 'upcoming';
    if (!Number.isFinite(end) || current < end) return 'running';
    return 'finished';
  }
  function getUrgencyClass(contest, now) {
    const status = getContestStatus(contest, now);
    if (status !== 'upcoming') return 'status-' + status;
    const remaining = Date.parse(contest.startTime) - (now || Date.now());
    if (remaining <= 60 * 60 * 1000) return 'status-urgent';
    if (remaining <= 24 * 60 * 60 * 1000) return 'status-soon';
    return 'status-upcoming';
  }
  function formatBeijingTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '未知';
    const parts = Object.fromEntries(beijingFormatter.formatToParts(date)
      .filter(function (part) { return part.type !== 'literal'; })
      .map(function (part) { return [part.type, part.value]; }));
    return parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute;
  }
  function formatTimeOnly(value) { return beijingTimeFormatter.format(new Date(value)); }
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
    if (days) return '还有 ' + days + '天 ' + hours + '小时';
    if (hours) return '还有 ' + hours + '小时 ' + minutes + '分钟';
    return '还有 ' + minutes + '分钟';
  }
  function formatFriendlyStart(contest) {
    const key = dateKey(contest.startTime);
    const today = dateKey(new Date());
    const tomorrow = dateKey(new Date(Date.now() + 86400000));
    const prefix = key === today ? '今天' : (key === tomorrow ? '明天' : key.slice(5).replace('-', '月') + '日');
    return prefix + ' ' + formatTimeOnly(contest.startTime);
  }
  function platformMeta(platform) { return PLATFORM_META[platform] || { short: platform.slice(0, 2), color: '#607080' }; }
  function applyPlatformColor(element, platform) {
    element.style.setProperty('--platform-color', platformMeta(platform).color);
  }
  function safeOfficialUrl(contest) {
    const allowedHosts = {
      Codeforces: ['codeforces.com'], AtCoder: ['atcoder.jp'], 牛客: ['ac.nowcoder.com'],
      洛谷: ['www.luogu.com.cn'], LeetCode: ['leetcode.com'], CodeChef: ['www.codechef.com'],
      HackerRank: ['www.hackerrank.com'], DMOJ: ['dmoj.ca'], Kattis: ['open.kattis.com'],
      蓝桥杯: ['dasai.lanqiao.cn'], 百度之星: ['star.baidu.com'],
      睿抗: ['www.raicom.com.cn', 'raicom.com.cn'], 传智杯: ['www.boxuegu.com', 'boxuegu.com'],
      天梯赛: ['gplt.patest.cn'], 码蹄杯: ['www.matiji.net', 'matiji.net'],
    };
    try {
      const url = new URL(contest.url);
      return url.protocol === 'https:' && (allowedHosts[contest.platform] || []).includes(url.hostname)
        ? url.toString() : '#';
    } catch (error) { return '#'; }
  }
  function createPlatformLine(contest) {
    const line = document.createElement('div');
    line.className = 'contest-platform-line';
    const mark = document.createElement('span');
    mark.className = 'contest-platform-mark';
    mark.textContent = platformMeta(contest.platform).short;
    applyPlatformColor(mark, contest.platform);
    const name = document.createElement('span');
    name.textContent = contest.platform;
    line.append(mark, name);
    return line;
  }
  function createFeeBadge(contest) {
    const badge = document.createElement('span');
    badge.className = 'contest-fee ' + (contest.feeType || 'unknown');
    badge.textContent = formatFee(contest);
    return badge;
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
    if (elements.startStatus) elements.startStatus.textContent = state.open
      ? (state.minimized ? '已最小化' : '正在运行') : '比赛聚合与提醒';
  }
  function readBounds() {
    const rect = elements.window.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  function clampBounds(bounds) {
    const viewportWidth = Math.max(1, window.innerWidth);
    const maxHeight = Math.max(1, window.innerHeight - TASKBAR_HEIGHT);
    const minWidth = Math.min(MIN_WIDTH, viewportWidth);
    const minHeight = Math.min(MIN_HEIGHT, maxHeight);
    const width = Math.min(Math.max(minWidth, Number(bounds.width) || minWidth), viewportWidth);
    const height = Math.min(Math.max(minHeight, Number(bounds.height) || minHeight), maxHeight);
    return {
      left: Math.max(0, Math.min(Number(bounds.left) || 0, viewportWidth - width)),
      top: Math.max(0, Math.min(Number(bounds.top) || 0, maxHeight - height)), width: width, height: height,
    };
  }
  function applyBounds(bounds) {
    const safe = clampBounds(bounds);
    elements.window.style.left = safe.left + 'px'; elements.window.style.top = safe.top + 'px';
    elements.window.style.width = safe.width + 'px'; elements.window.style.height = safe.height + 'px';
  }
  function saveWindowBounds() { if (!state.maximized) writeStorage(WINDOW_KEY, readBounds()); }
  function restoreWindowBounds() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(WINDOW_KEY) || 'null');
      if (saved && ['left', 'top', 'width', 'height'].every(function (key) {
        return Number.isFinite(Number(saved[key]));
      })) applyBounds(saved);
    } catch (error) {}
  }
  function openWindow() {
    state.open = true; state.minimized = false; setSelected(true); bringToFront(); updateWindowState();
    if (window.homeDesktop) window.homeDesktop.closeStartMenu();
    loadContests();
  }
  function closeWindow() {
    state.open = false; state.minimized = false; state.maximized = false; state.restoreBounds = null;
    closeDetail(); setSelected(false); updateWindowState();
  }
  function minimizeWindow() { if (state.open) { state.minimized = true; updateWindowState(); } }
  function toggleTaskbar() {
    if (!state.open) return openWindow();
    state.minimized = !state.minimized; if (!state.minimized) bringToFront(); updateWindowState();
  }
  function toggleMaximize() {
    if (!state.open) openWindow();
    if (state.maximized) {
      state.maximized = false; if (state.restoreBounds) applyBounds(state.restoreBounds); state.restoreBounds = null;
    } else {
      state.restoreBounds = readBounds(); state.maximized = true; state.minimized = false;
    }
    bringToFront(); updateWindowState(); saveWindowBounds();
  }
  function startDrag(event) {
    if ((event.button !== undefined && event.button !== 0) || event.target.closest('.window-control')
      || !state.open || state.minimized || state.maximized) return;
    const bounds = readBounds();
    state.drag = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
    bringToFront(); elements.window.classList.add('is-dragging');
    document.addEventListener('pointermove', dragWindow);
    document.addEventListener('pointerup', stopDrag, { once: true });
  }
  function dragWindow(event) {
    if (!state.drag) return;
    const bounds = readBounds();
    applyBounds({ left: state.drag.left + event.clientX - state.drag.x,
      top: state.drag.top + event.clientY - state.drag.y, width: bounds.width, height: bounds.height });
  }
  function stopDrag() {
    state.drag = null; elements.window.classList.remove('is-dragging');
    document.removeEventListener('pointermove', dragWindow); saveWindowBounds();
  }
  function startResize(event, edge) {
    if ((event.button !== undefined && event.button !== 0) || !state.open || state.minimized || state.maximized) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = readBounds();
    state.resize = { edge: edge, x: event.clientX, y: event.clientY, left: bounds.left,
      top: bounds.top, right: bounds.left + bounds.width, bottom: bounds.top + bounds.height };
    bringToFront(); elements.window.classList.add('is-resizing');
    document.addEventListener('pointermove', resizeWindow);
    document.addEventListener('pointerup', stopResize, { once: true });
  }
  function resizeWindow(event) {
    if (!state.resize) return;
    const original = state.resize; const dx = event.clientX - original.x; const dy = event.clientY - original.y;
    let left = original.left; let top = original.top; let right = original.right; let bottom = original.bottom;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportBottom = Math.max(1, window.innerHeight - TASKBAR_HEIGHT);
    const minWidth = Math.min(MIN_WIDTH, viewportWidth);
    const minHeight = Math.min(MIN_HEIGHT, viewportBottom);
    if (original.edge.includes('e')) right = Math.min(viewportWidth, Math.max(left + minWidth, original.right + dx));
    if (original.edge.includes('s')) bottom = Math.min(viewportBottom, Math.max(top + minHeight, original.bottom + dy));
    if (original.edge.includes('w')) left = Math.max(0, Math.min(original.right - minWidth, original.left + dx));
    if (original.edge.includes('n')) top = Math.max(0, Math.min(original.bottom - minHeight, original.top + dy));
    applyBounds({ left: left, top: top, width: right - left, height: bottom - top });
  }
  function stopResize() {
    state.resize = null; elements.window.classList.remove('is-resizing');
    document.removeEventListener('pointermove', resizeWindow); saveWindowBounds();
  }

  function getContestById(id) {
    return state.contests.find(function (contest) { return String(contest.id) === String(id); }) || null;
  }
  function saveFavorites() { writeStorage(FAVORITES_KEY, Array.from(state.favorites)); }
  function saveReminders() {
    writeStorage(REMINDERS_KEY, Array.from(state.reminders, function (entry) {
      return { contestId: entry[0], remindBeforeMinutes: entry[1] };
    }));
  }
  function toggleFavorite(contestId) {
    const id = String(contestId);
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    saveFavorites(); renderAll(); updateDetailActions();
  }
  function setReminder(contestId, value) {
    const id = String(contestId); const minutes = Number(value);
    if ([10, 60, 1440].includes(minutes)) state.reminders.set(id, minutes); else state.reminders.delete(id);
    state.notified.delete(id + ':' + minutes); saveReminders(); renderAll(); updateDetailActions();
  }
  function createReminderSelect(contest, className) {
    const select = document.createElement('select');
    select.className = className || 'contest-reminder-select';
    select.setAttribute('aria-label', '设置提醒');
    [['', '不提醒'], ['1440', '提前1天'], ['60', '提前1小时'], ['10', '提前10分钟']]
      .forEach(function (optionData) {
        const option = document.createElement('option'); option.value = optionData[0];
        option.textContent = optionData[1]; select.appendChild(option);
      });
    select.value = state.reminders.has(String(contest.id)) ? String(state.reminders.get(String(contest.id))) : '';
    select.addEventListener('click', function (event) { event.stopPropagation(); });
    select.addEventListener('change', function () { setReminder(contest.id, select.value); });
    return select;
  }
  function createFavoriteButton(contest) {
    const favorite = document.createElement('button');
    const active = state.favorites.has(String(contest.id));
    favorite.type = 'button'; favorite.className = 'contest-favorite';
    favorite.classList.toggle('is-active', active); favorite.textContent = active ? '★' : '☆';
    favorite.setAttribute('aria-label', active ? '取消收藏' : '收藏');
    favorite.addEventListener('click', function (event) { event.stopPropagation(); toggleFavorite(contest.id); });
    return favorite;
  }
  function matchesCommonFilters(contest) {
    if (!state.platforms.has(contest.platform)) return false;
    const query = state.search.trim().toLocaleLowerCase('zh-CN');
    if (query && !(contest.title + ' ' + contest.platform).toLocaleLowerCase('zh-CN').includes(query)) return false;
    const now = Date.now(); const start = Date.parse(contest.startTime);
    if (state.quickFilter === 'favorites') return state.favorites.has(String(contest.id));
    if (state.quickFilter === 'reminders') return state.reminders.has(String(contest.id));
    if (state.quickFilter === 'today') return dateKey(contest.startTime) === dateKey(new Date());
    if (state.quickFilter === 'day') return start >= now && start <= now + 86400000;
    if (state.quickFilter === 'week') return start >= now && start <= endOfCurrentWeek(now);
    if (state.quickFilter === 'weekend') {
      const day = new Date(start).getDay();
      return start >= now && start <= endOfCurrentWeek(now) && (day === 0 || day === 6);
    }
    return true;
  }
  function endOfCurrentWeek(now) {
    const date = new Date(now); const day = date.getDay() || 7;
    date.setDate(date.getDate() + (7 - day)); date.setHours(23, 59, 59, 999); return date.getTime();
  }
  function filteredContests(includeHistory) {
    const items = state.contests.filter(matchesCommonFilters).filter(function (contest) {
      return includeHistory || getContestStatus(contest) !== 'finished';
    });
    if (state.sortKey === 'default') return items.sort(function (a, b) {
      return Date.parse(a.startTime) - Date.parse(b.startTime);
    });
    const direction = state.sortDirection === 'asc' ? 1 : -1;
    return items.sort(function (left, right) {
      let leftValue = left[state.sortKey]; let rightValue = right[state.sortKey];
      if (state.sortKey === 'status') {
        const order = { upcoming: 0, running: 1, finished: 2 };
        leftValue = order[getContestStatus(left)]; rightValue = order[getContestStatus(right)];
      } else if (state.sortKey === 'startTime') {
        leftValue = Date.parse(left.startTime); rightValue = Date.parse(right.startTime);
      } else if (state.sortKey === 'durationSeconds') {
        leftValue = Number(left.durationSeconds) || 0; rightValue = Number(right.durationSeconds) || 0;
      } else { leftValue = String(leftValue || ''); rightValue = String(rightValue || ''); }
      return (typeof leftValue === 'number' ? leftValue - rightValue
        : leftValue.localeCompare(rightValue, 'zh-CN')) * direction;
    });
  }

  function renderPlatformChips() {
    elements.platformFilters.replaceChildren();
    PLATFORM_ORDER.forEach(function (platform) {
      const count = state.contests.filter(function (contest) { return contest.platform === platform; }).length;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'contest-platform-chip';
      button.classList.toggle('is-active', state.platforms.has(platform));
      button.dataset.platform = platform; applyPlatformColor(button, platform);
      const label = document.createElement('span'); label.textContent = platform;
      const number = document.createElement('strong'); number.textContent = String(count);
      button.append(label, number); elements.platformFilters.appendChild(button);
    });
  }
  function renderHero() {
    elements.hero.replaceChildren();
    const contest = filteredContests(false).find(function (item) {
      return getContestStatus(item) === 'upcoming' && item.importance !== 'low';
    });
    if (!contest) {
      elements.hero.className = 'contest-hero is-empty';
      elements.hero.textContent = state.loading ? '正在查找下一场比赛……' : '当前筛选条件下没有即将开始的比赛';
      return;
    }
    elements.hero.className = 'contest-hero'; applyPlatformColor(elements.hero, contest.platform);
    const label = document.createElement('p'); label.className = 'contest-hero-label'; label.textContent = '下一场比赛';
    const title = document.createElement('h3'); title.textContent = contest.title;
    const time = document.createElement('p'); time.className = 'contest-hero-time'; time.textContent = formatFriendlyStart(contest);
    const countdown = document.createElement('p'); countdown.className = 'contest-hero-countdown';
    countdown.textContent = formatCountdown(contest);
    const meta = document.createElement('div'); meta.className = 'contest-meta-line';
    const duration = document.createElement('span'); duration.textContent = formatDuration(contest.durationSeconds);
    const rating = document.createElement('span'); rating.className = 'contest-rating';
    rating.textContent = contest.ratingRange || (contest.rated === true ? 'Rated' : 'Rating 未知');
    meta.append(duration, rating, createFeeBadge(contest));
    const actions = document.createElement('div'); actions.className = 'contest-hero-actions';
    const link = document.createElement('a'); link.className = 'primary'; link.href = safeOfficialUrl(contest);
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '打开官网';
    const reminder = createReminderSelect(contest);
    const favorite = createFavoriteButton(contest); favorite.textContent = state.favorites.has(String(contest.id)) ? '★ 已收藏' : '☆ 收藏';
    favorite.style.width = 'auto'; favorite.style.padding = '5px 11px'; favorite.style.borderColor = '#5a626b';
    actions.append(link, reminder, favorite);
    elements.hero.append(label, createPlatformLine(contest), title, time, countdown, meta, actions);
  }
  function createContestCard(contest) {
    const card = document.createElement('article');
    card.className = 'contest-card ' + getUrgencyClass(contest); card.tabIndex = 0;
    card.addEventListener('click', function () { openDetail(contest.id); });
    card.addEventListener('keydown', function (event) { if (event.key === 'Enter') openDetail(contest.id); });
    const time = document.createElement('time'); time.className = 'contest-card-time';
    time.dateTime = contest.startTime; time.textContent = formatTimeOnly(contest.startTime);
    const main = document.createElement('div'); main.className = 'contest-card-main';
    const title = document.createElement('h4'); title.textContent = contest.title;
    const meta = document.createElement('div'); meta.className = 'contest-card-meta';
    const duration = document.createElement('span'); duration.textContent = formatDuration(contest.durationSeconds);
    const rating = document.createElement('span'); rating.textContent = contest.ratingRange || (contest.rated ? 'Rated' : 'Rating 未知');
    meta.append(duration, rating, createFeeBadge(contest));
    main.append(createPlatformLine(contest), title, meta);
    const side = document.createElement('div'); side.className = 'contest-card-side';
    const countdown = document.createElement('span'); countdown.className = 'contest-countdown';
    countdown.textContent = formatCountdown(contest);
    const actions = document.createElement('div'); actions.className = 'contest-card-actions';
    if (state.reminders.has(String(contest.id))) {
      const reminder = document.createElement('span'); reminder.className = 'contest-reminder-status';
      reminder.textContent = reminderLabel(state.reminders.get(String(contest.id))); actions.appendChild(reminder);
    }
    actions.appendChild(createFavoriteButton(contest)); side.append(countdown, actions);
    card.append(time, main, side); return card;
  }
  function reminderLabel(minutes) {
    return minutes === 1440 ? '提前1天' : (minutes === 60 ? '提前1小时' : '提前10分钟');
  }
  function groupLabel(key, startTime) {
    const today = dateKey(new Date()); const tomorrow = dateKey(new Date(Date.now() + 86400000));
    if (key === 'later') return '更晚';
    if (key === today) return '今天';
    if (key === tomorrow) return '明天';
    const date = new Date(startTime); const weekday = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', weekday: 'short',
    }).format(date);
    return Number(key.slice(5, 7)) + '月' + Number(key.slice(8, 10)) + '日 ' + weekday;
  }
  function renderTimeline() {
    renderHero(); elements.timelineGroups.replaceChildren();
    const now = Date.now();
    const items = filteredContests(false).filter(function (contest) {
      if ((state.quickFilter === 'favorites' || state.quickFilter === 'reminders')) return true;
      return contest.importance !== 'low';
    });
    const groups = new Map();
    items.forEach(function (contest) {
      const starts = Date.parse(contest.startTime);
      const key = starts > now + 7 * 86400000 ? 'later' : dateKey(contest.startTime);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(contest);
    });
    groups.forEach(function (contests, key) {
      const section = document.createElement('section'); section.className = 'contest-date-group';
      const heading = document.createElement('h3'); heading.textContent = groupLabel(key, contests[0].startTime);
      const list = document.createElement('div'); list.className = 'contest-card-list';
      contests.forEach(function (contest) { list.appendChild(createContestCard(contest)); });
      section.append(heading, list); elements.timelineGroups.appendChild(section);
    });
    if (!items.length && !state.loading) {
      const empty = document.createElement('div'); empty.className = 'contest-empty';
      empty.textContent = '当前筛选条件下没有比赛'; elements.timelineGroups.appendChild(empty);
    }
  }
  function createCell(text) {
    const cell = document.createElement('td'); cell.textContent = text; cell.title = text; return cell;
  }
  function renderTable() {
    const contests = filteredContests(true); elements.tableBody.replaceChildren(); const now = Date.now();
    contests.forEach(function (contest) {
      const row = document.createElement('tr'); row.addEventListener('click', function () { openDetail(contest.id); });
      const status = getContestStatus(contest, now); const statusCell = document.createElement('td');
      const statusText = document.createElement('span'); statusText.className = 'contest-status ' + status;
      statusText.textContent = STATUS_LABELS[status]; statusCell.appendChild(statusText); row.appendChild(statusCell);
      const favoriteCell = document.createElement('td'); favoriteCell.appendChild(createFavoriteButton(contest));
      row.appendChild(favoriteCell); row.appendChild(createCell(contest.platform));
      const titleCell = document.createElement('td'); const titleButton = document.createElement('button');
      titleButton.type = 'button'; titleButton.className = 'contest-title-button'; titleButton.textContent = contest.title;
      titleButton.title = contest.title; titleButton.addEventListener('click', function () { openDetail(contest.id); });
      titleCell.appendChild(titleButton); row.appendChild(titleCell);
      row.appendChild(createCell(formatBeijingTime(contest.startTime)));
      row.appendChild(createCell(formatDuration(contest.durationSeconds)));
      row.appendChild(createCell(formatFee(contest))); row.appendChild(createCell(formatCountdown(contest, now)));
      const reminderCell = document.createElement('td'); reminderCell.appendChild(createReminderSelect(contest));
      row.appendChild(reminderCell); elements.tableBody.appendChild(row);
    });
    elements.empty.classList.toggle('is-hidden', contests.length > 0);
    if (!state.loading) elements.empty.textContent = contests.length ? '' : '当前筛选条件下没有比赛';
  }
  function renderCalendar() {
    const year = state.calendarDate.getFullYear(); const month = state.calendarDate.getMonth();
    elements.calendarTitle.textContent = year + '年 ' + (month + 1) + '月'; elements.calendarGrid.replaceChildren();
    const first = new Date(year, month, 1); const leading = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - leading);
    const contestMap = new Map();
    filteredContests(true).forEach(function (contest) {
      const key = dateKey(contest.startTime); if (!contestMap.has(key)) contestMap.set(key, []);
      contestMap.get(key).push(contest);
    });
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart); day.setDate(gridStart.getDate() + index); const key = dateKey(day);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'contest-calendar-day';
      button.classList.toggle('is-outside', day.getMonth() !== month);
      button.classList.toggle('is-selected', state.selectedCalendarDay === key);
      const number = document.createElement('span'); number.className = 'contest-calendar-day-number';
      number.textContent = String(day.getDate()); const events = document.createElement('span');
      events.className = 'contest-calendar-events';
      const counts = new Map();
      (contestMap.get(key) || []).forEach(function (contest) {
        counts.set(contest.platform, (counts.get(contest.platform) || 0) + 1);
      });
      Array.from(counts).slice(0, 4).forEach(function (entry) {
        const event = document.createElement('span'); event.className = 'contest-calendar-event';
        event.textContent = platformMeta(entry[0]).short + (entry[1] > 1 ? ' ' + entry[1] : '');
        applyPlatformColor(event, entry[0]); events.appendChild(event);
      });
      button.append(number, events); button.addEventListener('click', function () {
        state.selectedCalendarDay = key; renderCalendarDay(key, contestMap.get(key) || []); renderCalendar();
      });
      elements.calendarGrid.appendChild(button);
    }
    if (state.selectedCalendarDay) renderCalendarDay(state.selectedCalendarDay, contestMap.get(state.selectedCalendarDay) || []);
  }
  function renderCalendarDay(key, contests) {
    elements.calendarDayTitle.textContent = key.replace(/^\d{4}-/, '').replace('-', '月') + '日比赛';
    elements.calendarDayContests.replaceChildren();
    if (!contests.length) {
      const empty = document.createElement('div'); empty.className = 'contest-empty'; empty.textContent = '当天没有比赛';
      elements.calendarDayContests.appendChild(empty); return;
    }
    const list = document.createElement('div'); list.className = 'contest-card-list';
    contests.forEach(function (contest) { list.appendChild(createContestCard(contest)); });
    elements.calendarDayContests.appendChild(list);
  }
  function renderSummary() {
    const visible = filteredContests(state.view === 'table');
    const upcoming = visible.filter(function (contest) { return getContestStatus(contest) === 'upcoming'; }).length;
    const running = visible.filter(function (contest) { return getContestStatus(contest) === 'running'; }).length;
    elements.summary.textContent = state.loading ? '正在获取比赛信息……'
      : '当前 ' + visible.length + ' 场 · ' + upcoming + ' 场即将开始 · ' + running + ' 场进行中';
  }
  function renderViews() {
    elements.timelineView.classList.toggle('is-hidden', state.view !== 'timeline');
    elements.calendarView.classList.toggle('is-hidden', state.view !== 'calendar');
    elements.tableWrap.classList.toggle('is-hidden', state.view !== 'table');
    elements.viewTabs.querySelectorAll('[data-contest-view]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.contestView === state.view);
    });
  }
  function renderAll() {
    renderPlatformChips(); renderViews(); renderTimeline(); renderCalendar(); renderTable(); renderSummary();
  }

  function updateDetailActions() {
    if (!state.selectedContestId) return;
    const id = String(state.selectedContestId);
    elements.detailFavorite.textContent = state.favorites.has(id) ? '取消收藏' : '收藏';
    elements.detailReminder.value = state.reminders.has(id) ? String(state.reminders.get(id)) : '';
  }
  function addDetailField(label, value) {
    const term = document.createElement('dt'); const detail = document.createElement('dd');
    term.textContent = label; detail.textContent = value || '未知'; elements.detailFields.append(term, detail);
  }
  function openDetail(contestId) {
    const contest = getContestById(contestId); if (!contest) return;
    state.selectedContestId = String(contest.id); elements.detailTitle.textContent = contest.title;
    elements.detailFields.replaceChildren();
    addDetailField('平台', contest.platform); addDetailField('状态', STATUS_LABELS[getContestStatus(contest)]);
    addDetailField('开始时间', formatBeijingTime(contest.startTime));
    addDetailField('结束时间', contest.endTime ? formatBeijingTime(contest.endTime) : '未知');
    addDetailField('持续时间', formatDuration(contest.durationSeconds));
    addDetailField('Rating', contest.ratingRange || (contest.rated === true ? 'Rated' : '未知'));
    addDetailField('费用', formatFee(contest)); addDetailField('比赛类型', contest.contestKind || 'competitive-programming');
    addDetailField('重要性', contest.importance || 'normal'); addDetailField('数据来源', contest.sourceConfidence || 'official-page');
    elements.officialLink.href = safeOfficialUrl(contest); updateDetailActions(); elements.detail.classList.remove('is-hidden');
  }
  function closeDetail() { state.selectedContestId = null; elements.detail.classList.add('is-hidden'); }

  async function loadContests() {
    if (state.loaded || state.loading) return;
    state.loading = true; elements.empty.textContent = '正在获取比赛信息……';
    elements.empty.classList.remove('is-hidden'); renderAll();
    try {
      const response = await fetch('/api/contests', { cache: 'no-cache', headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data || data.success !== true || !Array.isArray(data.contests)) throw new Error('invalid-response');
      state.contests = data.contests.filter(function (contest) {
        return contest && contest.id && contest.platform && contest.title && contest.startTime;
      });
      state.warnings = Array.isArray(data.warnings) ? data.warnings : []; state.loaded = true;
      elements.warning.textContent = state.warnings.length ? '部分平台数据暂时不可用：' + state.warnings.join('、') : '';
      elements.warning.classList.toggle('is-hidden', state.warnings.length === 0); checkReminders();
    } catch (error) {
      elements.empty.textContent = '比赛信息加载失败，请稍后重试';
      elements.warning.textContent = ''; elements.warning.classList.add('is-hidden');
    } finally { state.loading = false; renderAll(); }
  }
  function showToast(contest, minutes) {
    const toast = document.createElement('div'); toast.className = 'contest-toast';
    const heading = document.createElement('strong'); const title = document.createElement('span');
    const time = document.createElement('small'); const button = document.createElement('button');
    heading.textContent = contest.platform + ' 比赛即将开始'; title.textContent = contest.title;
    time.textContent = '将在 ' + (minutes === 1440 ? '1 天' : (minutes === 60 ? '1 小时' : '10 分钟')) + '后开始';
    button.type = 'button'; button.textContent = '查看比赛';
    button.addEventListener('click', function () { openWindow(); openDetail(contest.id); toast.remove(); });
    toast.append(heading, title, time, button); elements.toastRegion.appendChild(toast);
    window.setTimeout(function () { toast.remove(); }, 12000);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(heading.textContent, { body: contest.title + '\n' + time.textContent });
    }
  }
  function checkReminders() {
    if (!state.loaded || !state.reminders.size) return;
    const now = Date.now();
    state.reminders.forEach(function (minutes, contestId) {
      const contest = getContestById(contestId); if (!contest) return;
      const trigger = Date.parse(contest.startTime) - minutes * 60000;
      const key = contestId + ':' + minutes + ':' + contest.startTime;
      if (now >= trigger && now < trigger + 60000 && !state.notified.has(key)) {
        state.notified.add(key); showToast(contest, minutes);
      }
    });
  }
  async function requestNotificationPermission() {
    if (!('Notification' in window)) { elements.enableNotifications.textContent = '浏览器不支持通知'; return; }
    const permission = await Notification.requestPermission();
    elements.enableNotifications.textContent = permission === 'granted' ? '系统通知已开启' : '仅使用站内提醒';
  }

  elements.desktopIcon.addEventListener('click', function (event) { event.stopPropagation(); setSelected(true); });
  elements.desktopIcon.addEventListener('dblclick', openWindow);
  elements.desktopIcon.addEventListener('keydown', function (event) { if (event.key === 'Enter') openWindow(); });
  elements.taskbarButton.addEventListener('click', toggleTaskbar);
  if (elements.startButton) elements.startButton.addEventListener('click', openWindow);
  elements.minimize.addEventListener('click', minimizeWindow); elements.maximize.addEventListener('click', toggleMaximize);
  elements.close.addEventListener('click', closeWindow); elements.titlebar.addEventListener('pointerdown', startDrag);
  elements.titlebar.addEventListener('dblclick', toggleMaximize); elements.window.addEventListener('pointerdown', bringToFront);
  elements.resizeHandles.forEach(function (handle) {
    handle.addEventListener('pointerdown', function (event) { startResize(event, handle.dataset.contestResizeEdge); });
  });
  elements.viewTabs.addEventListener('click', function (event) {
    const button = event.target.closest('[data-contest-view]'); if (!button) return;
    state.view = button.dataset.contestView; renderAll();
  });
  elements.quickFilters.addEventListener('click', function (event) {
    const button = event.target.closest('[data-contest-filter]'); if (!button) return;
    state.quickFilter = button.dataset.contestFilter;
    elements.quickFilters.querySelectorAll('[data-contest-filter]').forEach(function (item) {
      item.classList.toggle('is-active', item === button);
    });
    renderAll();
  });
  elements.platformFilters.addEventListener('click', function (event) {
    const button = event.target.closest('[data-platform]'); if (!button) return;
    if (state.platforms.has(button.dataset.platform)) state.platforms.delete(button.dataset.platform);
    else state.platforms.add(button.dataset.platform);
    renderAll();
  });
  let searchTimer = null;
  elements.search.addEventListener('input', function () {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () { state.search = elements.search.value; renderAll(); }, 180);
  });
  elements.sortButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      const key = button.dataset.contestSort;
      if (state.sortKey === key) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = key; state.sortDirection = 'asc'; }
      renderTable();
    });
  });
  elements.calendarPrevious.addEventListener('click', function () {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
    state.selectedCalendarDay = null; renderCalendar();
  });
  elements.calendarNext.addEventListener('click', function () {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
    state.selectedCalendarDay = null; renderCalendar();
  });
  elements.detailClose.addEventListener('click', closeDetail);
  elements.detailFavorite.addEventListener('click', function () {
    if (state.selectedContestId) toggleFavorite(state.selectedContestId);
  });
  elements.detailReminder.addEventListener('change', function () {
    if (state.selectedContestId) setReminder(state.selectedContestId, elements.detailReminder.value);
  });
  elements.enableNotifications.addEventListener('click', requestNotificationPermission);
  window.addEventListener('resize', function () { if (!state.maximized && state.open) applyBounds(readBounds()); });

  let iconDragRegistered = false;
  function registerDesktopIconDrag() {
    if (iconDragRegistered || !window.homeDesktop || typeof window.homeDesktop.getIconDragController !== 'function') return;
    const iconDrag = window.homeDesktop.getIconDragController(); if (!iconDrag) return;
    iconDrag.registerIcon(elements.desktopIcon, {
      onDragStart: function () { setSelected(true); window.homeDesktop.closeStartMenu(); },
    });
    iconDragRegistered = true;
  }

  restoreWindowBounds(); registerDesktopIconDrag();
  if (!iconDragRegistered) document.addEventListener('DOMContentLoaded', registerDesktopIconDrag, { once: true });
  updateWindowState(); renderAll();
  window.setInterval(function () { if (state.loaded) { renderAll(); checkReminders(); } }, REMINDER_CHECK_MS);
  if (state.reminders.size) loadContests();

  window.contestCenter = {
    openWindow: openWindow, closeWindow: closeWindow,
    refresh: function () { state.loaded = false; return loadContests(); },
  };
  window.ContestCenter = {
    formatBeijingTime: formatBeijingTime, formatDuration: formatDuration, formatFee: formatFee,
    formatCountdown: formatCountdown, getContestStatus: getContestStatus,
  };
}());
