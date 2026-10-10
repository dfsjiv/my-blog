(function () {
  'use strict';
  window.KnowledgeAlgorithmCenter = { mount };

  function mount(root, options) {
    const { signal, user, token, onLogin } = options;
    const t = (zh, en) => options.language === 'zh' ? zh : en;
    const el = (tag, cls, text) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const btn = (text, action, cls = '') => {
      const node = el('button', 'algorithm-button ' + cls, text);
      node.type = 'button'; node.addEventListener('click', action); return node;
    };
    const formatDate = second => new Date(second * 1000).toLocaleDateString(options.language === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: 'Asia/Shanghai' });
    const percent = value => value == null ? '—' : value + '%';
    const platformName = value => value === 'codeforces' ? 'Codeforces' : 'AtCoder';
    const errors = {
      UNAUTHORIZED: t('登录已失效，请重新登录。', 'Your session expired. Please sign in again.'),
      INVALID_HANDLE: t('请输入有效的平台用户名，不是网址。', 'Enter a valid platform handle, not a URL.'),
      PROFILE_NOT_FOUND: t('找不到这个公开账号，请检查用户名。', 'Public profile not found. Check the handle.'),
      ALREADY_BOUND: t('这个平台已经绑定，请先解绑再更换。', 'This platform is already linked. Unlink it to change handles.'),
      SYNC_COOLDOWN: t('请等待 30 秒再同步，避免平台限流。', 'Wait 30 seconds between syncs to avoid rate limits.'),
      SYNC_BUSY: t('正在同步，请稍后再试。', 'A sync is in progress. Please retry later.'),
      MIGRATION_REQUIRED: t('数据库尚未初始化，请联系管理员。', 'Database setup is pending. Contact the administrator.'),
      PROVIDER_UNAVAILABLE: t('平台暂时无法访问，请稍后重试。已保存的统计不会被清除。', 'The platform is unavailable. Retry later; saved statistics are preserved.'),
    };
    const warningText = {
      RATING_UNAVAILABLE: t('Rating 暂未更新', 'Rating update unavailable'),
      DIFFICULTY_UNAVAILABLE: t('部分难度未知', 'Some difficulty values unavailable'),
      RECORD_LIMIT: t('已达到每个平台 20,000 条提交记录上限，统计为部分数据', '20,000-record limit reached; statistics are partial'),
      HISTORY_GAP: t('发现同步间隔缺口，请继续补齐历史', 'A sync gap was detected; continue history import'),
    };
    root.classList.add('algorithm-center');
    const intro = el('p', 'algorithm-note', t(
      '关联平台账号，建立属于你的训练档案。无需平台密码；Cookie 仅用于一次性同步，不保存。绑定为自行声明，不代表身份认证。',
      'Link platform accounts to build your training profile. No password is needed. Optional Cookies are used once, never saved. Linking is self-declared, not identity verification.'));
    root.append(intro);
    if (!user || user.role === 'guest' || !token) {
      const preview = el('section', 'algorithm-panel');
      preview.append(el('h2', '', t('把刷题变成看得见的进步', 'Turn practice into visible progress')),
        el('p', '', t('登录博客后可关联 Codeforces、AtCoder、VJudge、洛谷、牛客和力扣。可获取的统计范围按平台分别说明。',
          'Sign in to link Codeforces, AtCoder, VJudge, Luogu, Nowcoder and LeetCode China. Data coverage is explained separately for each platform.')),
        btn(t('登录并开始', 'Sign in to start'), onLogin, 'is-primary'));
      root.append(preview); return () => {};
    }
    const overviewNode = el('div', 'algorithm-overview'); root.append(overviewNode);
    const extraCleanup = window.KnowledgeCookieSync?.mount(root, { ...options, onUpdated: () => load() }) || (() => {});
    const records = el('details', 'algorithm-panel');
    records.append(el('summary', '', t('Codeforces / AtCoder · 账号与详细分析（展开）', 'Codeforces / AtCoder · connections & detailed analysis (expand)')));
    root.append(records);
    const form = el('form', 'algorithm-bind');
    const platform = el('select'); platform.setAttribute('aria-label', t('比赛平台', 'Platform'));
    platform.append(new Option('Codeforces', 'codeforces'), new Option('AtCoder', 'atcoder'));
    const handle = el('input'); handle.placeholder = t('平台用户名 / Handle', 'Platform handle');
    handle.setAttribute('aria-label', handle.placeholder); handle.maxLength = 32; handle.required = true; handle.autocomplete = 'off';
    const submit = el('button', 'algorithm-button is-primary', t('绑定账号', 'Link account')); submit.type = 'submit';
    form.append(platform, handle, submit);
    const status = el('p', 'algorithm-status'); status.setAttribute('role', 'status');
    const accountsNode = el('div', 'algorithm-accounts');
    const dataNode = el('div', 'algorithm-data');
    records.append(form, status, accountsNode, dataNode);
    let data, busy = false, identityChanged = false;

    async function api(path, method = 'GET', body) {
      const response = await fetch('/api/algorithm/' + path, { method, signal, cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.code || 'PROVIDER_UNAVAILABLE');
      return payload.data;
    }
    function message(error) { status.textContent = errors[error.message] || errors.PROVIDER_UNAVAILABLE; status.classList.add('is-error'); }
    function setBusy(value) {
      busy = value;
      root.querySelectorAll('button, input, select').forEach(node => { node.disabled = value; });
    }
    async function load() { data = await api('dashboard'); if (!signal.aborted && !identityChanged) render(); }
    async function mutate(action, success) {
      if (busy) return;
      setBusy(true); status.classList.remove('is-error'); status.textContent = t('正在处理，请稍候……', 'Working, please wait…');
      try { await action(); await load(); if (!signal.aborted) status.textContent = success; }
      catch (error) { if (!signal.aborted) message(error); }
      finally { if (!signal.aborted) setBusy(false); }
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      mutate(async () => {
        const account = await api('accounts', 'POST', {platform: platform.value, handle: handle.value});
        handle.value = '';
        try { await api('accounts/' + account.id + '/sync', 'POST'); }
        catch (error) { await load(); throw error; } // Keep successfully linked account visible on sync failure.
      }, t('账号已绑定，记录已同步。可继续补齐历史。', 'Account linked and synced. Continue importing history if needed.'));
    });
    function section(title, subtitle) {
      const node = el('section', 'algorithm-panel');
      node.append(el('h2', '', title)); if (subtitle) node.append(el('p', 'algorithm-note', subtitle)); return node;
    }
    function metric(label, value, detail) {
      const node = el('div', 'algorithm-metric');
      node.append(el('span', '', label), el('strong', '', value), el('small', '', detail)); return node;
    }
    function bars(node, items) {
      const max = Math.max(1, ...items.map(i => i.count));
      items.forEach(item => {
        const row = el('div', 'algorithm-bar-row');
        const track = el('div', 'algorithm-bar-track'), fill = el('span');
        fill.style.width = item.count / max * 100 + '%'; track.append(fill);
        row.append(el('span', '', item.name), track, el('strong', '', item.count)); node.append(row);
      });
      if (!items.length) node.append(el('p', 'algorithm-note', t('暂无记录', 'No records yet')));
    }
    function table(node, headings, rows) {
      const wrap = el('div', 'algorithm-table-wrap'), tableNode = el('table'), head = el('thead'), tr = el('tr'), body = el('tbody');
      headings.forEach(text => tr.append(el('th', '', text))); head.append(tr);
      rows.forEach(values => { const row = el('tr'); values.forEach(value => {
        const cell = el('td'); cell.append(value instanceof Node ? value : document.createTextNode(String(value))); row.append(cell);
      }); body.append(row); });
      tableNode.append(head, body); wrap.append(tableNode); node.append(wrap);
      if (!rows.length) node.append(el('p', 'algorithm-note', t('暂无记录', 'No records yet')));
    }
    function problemLink(problem) {
      const link = el('a', '', platformName(problem.platform) + ' · ' + problem.name);
      if (problem.url && /^https:\/\/(codeforces\.com|atcoder\.jp)\//.test(problem.url)) {
        link.href = problem.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      }
      return link;
    }
    function render() {
      renderOverview();
      accountsNode.replaceChildren(); dataNode.replaceChildren();
      data.platforms.forEach(account => {
        const item = el('section', 'algorithm-account');
        const text = el('div');
        const profileLink = el('a', '', platformName(account.platform) + ' · ' + account.handle);
        profileLink.href = account.platform === 'codeforces' ? 'https://codeforces.com/profile/' + encodeURIComponent(account.handle) : 'https://atcoder.jp/users/' + encodeURIComponent(account.handle);
        profileLink.target = '_blank'; profileLink.rel = 'noopener noreferrer';
        text.append(profileLink, el('p', 'algorithm-note', account.submissions + ' ' + t('条提交', 'submissions') + ' · '
          + (account.historyComplete ? t('历史已补齐', 'History imported') : t('历史未补齐 · 部分统计', 'Partial history'))
          + ' · ' + (account.lastSyncedAt ? t('同步于 ', 'Synced ') + new Date(account.lastSyncedAt).toLocaleString() : t('尚未同步', 'Not synced yet'))));
        (account.profile.warnings || []).forEach(code => text.append(el('small', 'algorithm-warning', warningText[code] || code)));
        const actions = el('div', 'algorithm-actions');
        actions.append(btn(account.historyComplete ? t('同步最新', 'Sync latest') : t('继续同步历史', 'Import next history page'), () => mutate(
          () => api('accounts/' + account.id + '/sync', 'POST'), t('同步成功。历史较多时需要分批同步，每次间隔 30 秒。', 'Synced. Large histories require multiple pages, 30 seconds apart.'))));
        actions.append(btn(t('解绑', 'Unlink'), () => {
          if (!window.confirm(t('解绑会移除本站保存的该账号统计，不会修改比赛平台账号。确定吗？', 'Unlink removes this account’s cached statistics here, not its platform account. Continue?'))) return;
          mutate(() => api('accounts/' + account.id, 'DELETE'), t('已解绑', 'Account unlinked'));
        }, 'is-subtle'));
        item.append(text, actions); accountsNode.append(item);
      });
      if (!data.platforms.length) {
        dataNode.append(el('p', 'algorithm-empty', t('先绑定一个账号，开始建立训练档案。支持普通用户和管理员。', 'Link a handle to start. Available to both members and administrators.'))); return;
      }
      // Counts can be combined, but rating and difficulty are always platform-specific.
      const summary = data.summary;
      const coverage = el('p', 'algorithm-warning', summary.historyComplete ? t(
        '统计基于已同步的公开提交；不同平台的同题不做跨站去重。首次通过及一次通过率以可见提交为准。',
        'Based on synced public submissions. Problems are not deduplicated across platforms; first solves and first-try rates use visible records.') : t(
        '历史尚未补齐，以下全部为已导入记录的部分统计；首次通过时间与一次通过率也可能不完整。请继续同步历史。',
        'Partial history: all counts, first-solve dates and first-try rates may be incomplete. Continue importing history.'));
      dataNode.append(coverage);
      const metrics = el('div', 'algorithm-metrics');
      metrics.append(metric(t('累计过题', 'Unique solves'), summary.solved, t('每平台按题去重', 'Deduplicated per platform')),
        metric(t('近 30 天过题', 'Solves / 30 days'), summary.solved30, t('前 30 天：', 'Previous 30 days: ') + summary.previous30),
        metric(t('近 7 天过题', 'Solves / 7 days'), summary.solved7, t('近 30 天活跃 ', 'Active days / 30: ') + summary.activeDays30),
        metric(t('提交通过率', 'Acceptance rate'), percent(summary.acceptanceRate), summary.accepted + ' / ' + summary.judged + ' ' + t('已判定提交', 'judged submissions')),
        metric(t('一次通过率', 'First-try solves'), percent(summary.firstTryRate), t('以已通过题目为分母', 'Among solved problems')),
        metric(t('当前连续训练', 'Current streak'), summary.streak + t(' 天', ' days'), t('最长连续：', 'Longest: ') + summary.longestStreak),
        metric(t('尝试题目', 'Problems attempted'), summary.attempted, summary.submissions + ' ' + t('次提交', 'submissions')),
        metric(t('尚未解决', 'Unresolved'), summary.unresolved, t('有提交但尚无通过记录', 'Attempted, no recorded acceptance')));
      dataNode.append(metrics);
      const calendar = section(t('训练日历', 'Training calendar'), t('最近 91 天 · 北京时间 · 色深代表提交次数，悬停查看每日过题', 'Last 91 days · Asia/Shanghai · Shade = submissions; hover for daily solves'));
      const heatmap = el('div', 'algorithm-heatmap');
      data.heatmap.forEach(day => {
        const cell = el('span', 'algorithm-day'); cell.dataset.level = day.submissions ? Math.min(4, Math.ceil(day.submissions / 3)) : 0;
        cell.title = day.date + ' · ' + day.submissions + ' ' + t('提交', 'submissions') + ' · ' + day.solved + ' ' + t('过题', 'solves');
        cell.setAttribute('aria-label', cell.title); heatmap.append(cell);
      }); calendar.append(heatmap); dataNode.append(calendar);
      const grid = el('div', 'algorithm-grid');
      data.platforms.forEach(account => {
        const panel = section(platformName(account.platform), t('难度独立分析，未知难度单列；AtCoder 难度为 AtCoder Problems 估算值。', 'Difficulty is analyzed separately. AtCoder values are AtCoder Problems estimates.'));
        const stats = el('div', 'algorithm-platform-stats');
        stats.append(metric('Rating', account.profile.rating ?? '—', t('峰值：', 'Peak: ') + (account.profile.maxRating ?? '—')),
          metric(t('过题', 'Solves'), account.solved, t('有难度数据：', 'Rated problems: ') + account.ratedProblems),
          metric(t('难度中位数', 'Median difficulty'), account.medianDifficulty ?? '—', t('最高：', 'Highest: ') + (account.maxDifficulty ?? '—')));
        panel.append(stats);
        bars(panel, account.difficulty.map(bucket => ({ name: bucket.bucket === 'unrated' ? t('未知 / 未评级', 'Unknown / unrated') : bucket.bucket + '–' + (+bucket.bucket + 399), count: bucket.count })));
        const ratings = account.profile.ratings || [];
        const history = el('details'); history.append(el('summary', '', t('Rating 变化与参赛记录', 'Rating history & contest results') + ' (' + (account.profile.ratedContests ?? ratings.length) + ')'));
        table(history, [t('比赛', 'Contest'), 'Rating', 'Δ', t('排名', 'Rank')], ratings.slice(-10).reverse().map(r => [r.contest, r.rating, r.change > 0 ? '+' + r.change : r.change, r.rank]));
        panel.append(history); grid.append(panel);
      });
      const months = section(t('月度过题趋势', 'Monthly solves'), t('每题归入首次公开通过的月份', 'Each problem is counted in its first recorded acceptance month'));
      bars(months, data.months.map(m => ({name:m.month, count:m.count}))); grid.append(months);
      const verdicts = section(t('提交结果', 'Submission outcomes'));
      bars(verdicts, data.verdicts.map(v => ({...v,name:v.name === 'OK' ? 'AC / Accepted' : v.name}))); grid.append(verdicts);
      dataNode.append(grid);
      const topics = section(t('算法标签分析', 'Algorithm topic analysis'), t(
        '标签来自 Codeforces。一题可有多个标签；完成率 = 通过题数 / 尝试题数，不等于能力评分。AtCoder 暂不推测标签。',
        'Codeforces tags only. A problem may have multiple tags. Completion = solved / attempted, not an ability score. No inferred AtCoder tags.'));
      table(topics, [t('标签', 'Topic'), t('尝试', 'Attempted'), t('通过', 'Solved'), t('完成率', 'Completion'), t('失败提交', 'Failed attempts')], data.tags.map(tag => [tag.tag, tag.attempted, tag.solved, percent(tag.completionRate), tag.failures]));
      dataNode.append(topics);
      const advice = section(t('训练诊断与建议', 'Training insights'));
      const list = el('ul');
      if (!summary.historyComplete) list.append(el('li', '', t('先补齐历史，再判断长期强弱项；目前结论只代表已导入样本。', 'Import the remaining history before judging long-term strengths. Current insights reflect the imported sample only.')));
      if (summary.activeDays30 < 8) list.append(el('li', '', t('近 30 天训练少于 8 天，优先建立每周 3 次的小量训练节奏。', 'Fewer than 8 active days in 30 days. Start with three short practice sessions per week.')));
      if (summary.unresolved) list.append(el('li', '', t('仍有 ', 'There are ') + summary.unresolved + t(' 道未解决题；优先复盘最近失败的题目，而不是只增加新题。', ' unresolved problems. Review recent failures before adding more new problems.')));
      data.weakTags.forEach(tag => list.append(el('li', '', tag.tag + ': ' + tag.solved + '/' + tag.attempted + ' · ' + t('完成率偏低，建议复习模板并分组补题。', 'Low completion: review the fundamentals and retry similar problems.'))));
      data.strongTags.forEach(tag => list.append(el('li', '', tag.tag + ': ' + tag.solved + '/' + tag.attempted + ' · ' + t('当前样本表现较稳定，可提高训练难度。', 'Consistent results in this sample; try harder problems.'))));
      if (!data.tags.some(tag => tag.attempted >= 3)) list.append(el('li', '', t('标签样本太少，暂不评价算法强弱。', 'Too few topic samples to assess strengths or weaknesses.')));
      if (summary.solved30 > summary.previous30) list.append(el('li', '', t('近 30 天过题数超过前一个周期，训练量正在增长。', 'More solves than the previous 30-day period: practice volume is increasing.')));
      advice.append(list); dataNode.append(advice);
      const lists = el('div', 'algorithm-grid');
      const recent = section(t('最近通过', 'Recently solved'));
      table(recent, [t('题目', 'Problem'), t('日期', 'Date'), t('提交次数', 'Attempts')], data.recent.map(p => [problemLink(p), formatDate(p.solvedAt), p.attempts]));
      const unresolved = section(t('待复盘题目', 'Review queue'));
      table(unresolved, [t('题目', 'Problem'), t('最近尝试', 'Last attempt'), t('提交次数', 'Attempts')], data.unresolved.map(p => [problemLink(p), formatDate(p.last), p.attempts]));
      const languages = section(t('编程语言', 'Programming languages')); bars(languages, data.languages);
      lists.append(recent, unresolved, languages); dataNode.append(lists);
      dataNode.append(el('p', 'algorithm-note', t('数据来源：Codeforces 官方 API；AtCoder 官方 Rating 与 AtCoder Problems 非官方提交/难度数据。仅统计可获取的公开记录，不能代表完整个人能力。',
        'Sources: official Codeforces API; official AtCoder rating and unofficial AtCoder Problems submissions/difficulty. Public records are evidence of practice, not a complete measure of ability.')));
    }
    function renderOverview() {
      overviewNode.replaceChildren();
      const a = data.aggregate; if (!a) return;
      const total = section(t('跨平台 · 总体分析', 'Cross-platform · unified analysis'));
      const metrics = el('div', 'algorithm-metrics');
      const sources = n => n + ' / ' + a.platforms.length + t(' 个平台有数据', ' platforms covered');
      metrics.append(metric(t('总过题数', 'Total solves'), a.solved, t('各平台合计，跨站同题可能重复', 'Platform sum; cross-site duplicates possible')),
        metric(t('总尝试题数', 'Total attempted problems'), a.attemptedSources ? a.attempted : '—', sources(a.attemptedSources)),
        metric(t('总提交次数（已知）', 'Total known submissions'), a.submissionSources ? a.submissions : '—', sources(a.submissionSources)),
        metric(t('总体题目完成率', 'Overall problem completion'), percent(a.completionRate), t('按题数加权，不是平台百分比平均', 'Weighted by problems, not average platform rates')),
        metric(t('待解决题目合计', 'Total unresolved'), a.attemptedSources ? a.unresolved : '—', sources(a.attemptedSources)),
        metric(t('已同步平台', 'Synced platforms'), a.platforms.length, t('绑定但未同步成功不计入', 'Unsynced connections excluded')));
      total.append(metrics, el('p', 'algorithm-note', t('数据范围：总量合并六个平台；洛谷/力扣为当前题目快照，牛客为 ACM 练习 + Tracker 分区合计，VJudge 为该站记录。跨站、跨分区同题暂不能可靠去重。', 'Coverage: six-platform totals; Luogu/LeetCode are current snapshots, Nowcoder is ACM practice + Tracker section totals, VJudge is site-recorded. Cross-site and cross-section duplicates are possible.')));
      if (a.platforms.some(p => p.platform === 'nowcoder' && p.coverage === 'nowcoder-practice-coding')) total.append(el('p', 'algorithm-warning', t('牛客仍是旧版 ACM 快照，尚未包含 Tracker。请重新同步牛客以更新总统计。', 'Nowcoder still uses the older ACM-only snapshot. Resync Nowcoder to include Tracker in the total.')));
      if (a.recordSources && !data.summary.historyComplete) total.append(el('p', 'algorithm-warning', t('CF / AtCoder 历史记录尚未完整导入，总量和趋势包含部分样本。请展开账号区域继续补齐历史。', 'CF / AtCoder history is incomplete; totals and trends include partial samples. Expand connections to continue importing history.')));
      if (!a.platforms.length) total.append(el('p', '', t('展开下面的绑定区域，同步后这里会显示统一统计。', 'Expand the connection sections below. Synced data will appear here together.')));
      overviewNode.append(total);
      const insights = section(t('综合训练诊断', 'Combined training insights')), list = el('ul');
      if (a.attempted) list.append(el('li', '', t('已知尝试题目中完成 ', 'Completed ') + percent(a.completionRate) + t('；还有 ', ' of known attempted problems; ') + a.unresolved + t(' 道待解决。建议先复盘失败题，再增加新题。', ' remain unresolved. Review failed problems before adding new ones.')));
      const largest = [...a.platforms].sort((x,y) => y.solved-x.solved)[0];
      if (largest && a.solved) list.append(el('li', '', largest.platform + t(' 占总过题量 ', ' contributes ') + (largest.solved/a.solved*100).toFixed(1) + t('%。这表示平台训练分布，不等于算法能力。', '% of all solves. This is practice distribution, not an ability score.')));
      list.append(el('li', '', t('时间趋势覆盖已导入 CF / AtCoder 的记录，算法标签只覆盖 CF；其他平台累计快照不用于推测每日训练。', 'Time trends cover imported CF / AtCoder records; algorithm topics cover CF only. Cumulative snapshots do not imply daily activity.')));
      if (a.recordSources) {
        list.append(el('li', '', t('记录覆盖平台近 30 天过题 ', 'Record-covered platforms: ') + data.summary.solved30 + t('，前 30 天 ', ' solves / 30 days; previous period ') + data.summary.previous30 + t('；活跃 ', '; active ') + data.summary.activeDays30 + t(' 天。', ' days.')));
        data.weakTags.forEach(tag => list.append(el('li', '', tag.tag + ' · ' + tag.solved + '/' + tag.attempted + t('：当前记录样本的薄弱项，建议集中补题。', ': weaker topic in available records; focus on targeted practice.'))));
      }
      insights.append(list); overviewNode.append(insights);
      const distribution = el('details', 'algorithm-panel'); distribution.append(el('summary', '', t('各平台数据分布（展开）', 'Platform distribution (expand)')));
      table(distribution, [t('平台', 'Platform'), t('账号', 'Account'), t('过题', 'Solved'), t('尝试', 'Attempted'), t('提交', 'Submissions'), t('统计更新', 'Updated')], a.platforms.map(p => [p.platform, p.handle, p.solved, p.attempted ?? '—', p.submissions ?? '—', new Date(p.lastSyncedAt).toLocaleDateString()]));
      overviewNode.append(distribution);
    }
    function authChanged(event) {
      if (String(event.detail?.user?.id) === String(user.id)) return;
      identityChanged = true;
      extraCleanup();
      if (!signal.aborted) {
        root.replaceChildren(el('p', 'algorithm-note', t('登录状态已变化，请重新打开算法中心。', 'Account changed. Reopen Algorithm Center.')));
      }
    }
    window.addEventListener('knowledge-auth-changed', authChanged);
    status.textContent = t('正在读取训练档案……', 'Loading your training profile…');
    load().then(() => { if (!signal.aborted) status.textContent = ''; }).catch(error => { if (!signal.aborted) message(error); });
    return () => { extraCleanup(); window.removeEventListener('knowledge-auth-changed', authChanged); };
  }
})();
