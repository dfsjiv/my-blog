(function () {
  'use strict';
  window.KnowledgeCookieSync = { mount };
  function mount(root, options) {
    const t = (zh, en) => options.language === 'zh' ? zh : en;
    const controller = new AbortController();
    const platforms = { vjudge: 'VJudge', luogu: t('洛谷', 'Luogu'), nowcoder: t('牛客', 'Nowcoder'), leetcode: t('力扣中国站', 'LeetCode China') };
    const el = (tag, cls, text) => { const node = document.createElement(tag); node.className = cls || ''; if (text != null) node.textContent = text; return node; };
    const button = (text, fn) => { const node = el('button', 'algorithm-button', text); node.type = 'button'; node.addEventListener('click', fn); return node; };
    const panel = el('details', 'algorithm-panel algorithm-cookie-panel');
    panel.append(el('summary', '', t('其他平台绑定与明细（展开）', 'Other platform connections & details (expand)')));
    panel.append(el('h2', '', t('更多平台 · 一次性同步', 'More platforms · one-time sync')),
      el('p', 'algorithm-note', t('按平台填写指定 Cookie 的 Value，自动识别账号。仅用于当次请求，不保存、不自动同步，提交后立即清空。也可选择无需 Cookie 的公开账号模式。不要填写平台密码。',
        'Enter the named Cookie values to identify your account automatically. Used once, never saved or auto-synced, cleared on submit. Public-profile mode needs no Cookie. Never enter a platform password.')));
    const form = el('form', 'algorithm-bind');
    form.autocomplete = 'off';
    const platform = el('select'); platform.setAttribute('aria-label', t('更多平台', 'More platforms'));
    Object.entries(platforms).forEach(([value, name]) => platform.append(new Option(name, value)));
    const mode = el('select'); mode.setAttribute('aria-label', t('绑定方式', 'Connection mode'));
    mode.append(new Option(t('登录态自动识别账号', 'Identify account from session'), 'session'), new Option(t('公开账号（无需 Cookie）', 'Public profile (no Cookie)'), 'public'));
    const luoguDomain = el('select'); luoguDomain.setAttribute('aria-label', t('洛谷 Cookie 来源域名', 'Luogu Cookie source domain'));
    luoguDomain.append(new Option('www.luogu.com.cn', 'www.luogu.com.cn'), new Option('www.luogu.com', 'www.luogu.com'));
    const handle = el('input'); handle.maxLength = 40; handle.autocomplete = 'off';
    handle.setAttribute('aria-label', t('平台用户名或 UID', 'Platform handle or UID'));
    const cookieFields = { vjudge: ['JSESSIONID'], luogu: ['_uid', '__client_id'], nowcoder: ['t'], leetcode: ['LEETCODE_SESSION', 'csrftoken'] };
    const domains = { vjudge: 'vjudge.net', luogu: 'www.luogu.com / www.luogu.com.cn', nowcoder: 'ac.nowcoder.com / .nowcoder.com', leetcode: 'leetcode.cn' };
    const credentialsNode = el('div', 'algorithm-credentials'), guide = el('p', 'algorithm-note');
    let credentialInputs = [];
    const submit = el('button', 'algorithm-button is-primary', t('绑定 / 同步', 'Link / sync')); submit.type = 'submit';
    form.append(platform, mode, luoguDomain, handle, credentialsNode, submit);
    const clear = () => { credentialInputs.forEach(input => { input.value = ''; }); };
    const status = el('p', 'algorithm-status'); status.setAttribute('role', 'status');
    const content = el('div');
    panel.append(guide, form, button(t('清空 Cookie', 'Clear Cookie'), clear), status, content);
    root.append(panel);
    let accounts = [], busy = false;
    const errors = {
      MIGRATION_REQUIRED: t('更多平台的数据库尚未初始化；原有平台不受影响。', 'More-platform database setup is pending; existing platforms are unaffected.'),
      UNAUTHORIZED: t('请重新登录博客。', 'Please sign in to the blog again.'),
      INVALID_HANDLE: t('洛谷和牛客请填数字 UID；VJudge 和力扣请填用户名。', 'Use numeric UIDs for Luogu/Nowcoder and handles for VJudge/LeetCode.'),
      INVALID_COOKIE: t('Cookie 格式不正确，或超过 8192 字符。', 'Invalid Cookie format or more than 8192 characters.'),
      PROVIDER_ACCESS_BLOCKED: t('平台拒绝服务器访问（HTTP 403），可能是风控或人机验证。不要继续重复提交 Cookie；可稍后重试。', 'Provider blocked server access (HTTP 403), possibly an anti-bot challenge. Do not repeatedly submit Cookies; retry later.'),
      PROVIDER_RATE_LIMITED: t('平台限流（HTTP 429），请稍后重试。', 'Provider rate limit (HTTP 429). Retry later.'),
      PROVIDER_TIMEOUT: t('平台请求超时，旧数据未改动，请稍后重试。', 'Provider timed out. Saved data is unchanged; retry later.'),
      PROVIDER_REDIRECT: t('平台要求跳转，未转发 Cookie。洛谷请确认选中的域名与复制 Cookie 的域名一致。', 'Provider requested a redirect; Cookie was not forwarded. For Luogu, select the domain where you copied the Cookie.'),
      PROVIDER_FORMAT_CHANGED: t('平台返回内容无法解析，或统计不完整。旧数据未改动；请反馈所选平台及这条错误提示。', 'Provider response changed or statistics are incomplete. Saved data is unchanged; report the platform and this message.'),
      COOKIE_EXPIRED: t('Cookie 已过期，或不适用于此平台。请重新获取。', 'Cookie expired or not valid for this platform. Please obtain a new one.'),
      COOKIE_MISMATCH: t('Cookie 对应的账号与填写的账号不一致。', 'The Cookie account does not match the entered account.'),
      PROFILE_NOT_FOUND: t('找不到这个平台账号，请检查用户名或 UID。', 'Platform account not found. Check the handle or UID.'),
      ALREADY_BOUND: t('这个平台已绑定其他账号，请先解绑。', 'Another account is linked on this platform. Unlink it first.'),
      SYNC_COOLDOWN: t('请间隔 30 秒再同步。', 'Wait 30 seconds between syncs.'),
      SYNC_BUSY: t('同步正在进行，请稍后再试。', 'Sync is in progress. Please try again later.'),
      NOT_FOUND_OR_BUSY: t('账号不存在或正在同步，请刷新后重试。', 'Account missing or syncing. Reload and retry.'),
      PROVIDER_UNAVAILABLE: t('平台访问受限、统计隐藏或接口发生变化。旧统计已保留，Cookie 已清空；可稍后重新填写并重试。',
        'Provider unavailable, statistics hidden, or API changed. Saved statistics are preserved; Cookie cleared. Re-enter it to retry later.')
    };
    async function api(path, method = 'GET', body) {
      const init = { method, signal: controller.signal, cache: 'no-store', headers: { Authorization: 'Bearer ' + options.token, 'Content-Type': 'application/json' } };
      const wipe = () => { if (body) { body.cookie = ''; if (body.credentials) Object.keys(body.credentials).forEach(key => { body.credentials[key] = ''; }); } };
      if (body) { init.body = JSON.stringify(body); wipe(); }
      try {
        const request = fetch('/api/algorithm/external/' + path, init);
        init.body = undefined; body = null;
        const response = await request, payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.code || 'PROVIDER_UNAVAILABLE');
        return payload.data;
      } finally { init.body = undefined; wipe(); }
    }
    function changePlatform() {
      clear();
      credentialsNode.replaceChildren(); credentialInputs = [];
      const session = mode.value === 'session'; handle.hidden = session; handle.required = !session;
      luoguDomain.hidden = platform.value !== 'luogu';
      guide.textContent = session ? t('先登录所选平台，F12 → Application（应用）→ Cookies → ', 'Sign in to the selected platform, then F12 → Application → Cookies → ') + (platform.value === 'luogu' ? luoguDomain.value : domains[platform.value]) + t('。按 Name 找到下面这些字段，只复制对应的 Value，不要复制全部 Cookie。不需要另外填写用户编号。', '. Find the names below and copy only their Value, not the whole Cookie list. No extra user ID required.') : t('公开模式不提供登录凭据，只填写个人主页的用户名或 UID。', 'Public mode uses a profile handle or UID without session credentials.');
      if (session) cookieFields[platform.value].forEach(name => {
        const label = el('label', '', name + ' · Value');
        const input = el('input', 'algorithm-cookie-input'); input.type = 'password'; input.name = name; input.required = true;
        input.maxLength = 8192; input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = name + ' Value';
        label.append(input); credentialInputs.push(input); credentialsNode.append(label);
      });
      handle.placeholder = ['luogu', 'nowcoder'].includes(platform.value) ? t('数字 UID（个人主页网址中的数字）', 'Numeric UID from your profile URL') : t('平台用户名（不是网址）', 'Platform handle, not a URL');
      handle.value = accounts.find(a => a.platform === platform.value)?.handle || '';
    }
    platform.addEventListener('change', changePlatform); mode.addEventListener('change', changePlatform); luoguDomain.addEventListener('change', changePlatform); changePlatform();
    async function load() {
      const data = await api('dashboard');
      if (controller.signal.aborted) return;
      accounts = data.accounts; render();
    }
    async function mutate(action) {
      if (busy) { clear(); return; }
      busy = true; panel.querySelectorAll('input,select,button').forEach(n => { n.disabled = true; });
      status.classList.remove('is-error'); status.textContent = t('正在同步……', 'Syncing…');
      try { await action(); await load(); await options.onUpdated?.(); if (!controller.signal.aborted) status.textContent = t('总统计已更新，未保存 Cookie。', 'Unified statistics updated. Cookie was not saved.'); }
      catch (error) {
        if (!controller.signal.aborted) {
          status.classList.add('is-error'); status.textContent = errors[error.message] || errors.PROVIDER_UNAVAILABLE;
          // Initial failed sync may reserve an account. Keep its unlink/retry actions visible.
          try { await load(); } catch {}
        }
      } finally { clear(); busy = false; if (!controller.signal.aborted) panel.querySelectorAll('input,select,button').forEach(n => { n.disabled = false; }); }
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const body = mode.value === 'session' ? { platform: platform.value, credentials: Object.fromEntries(credentialInputs.map(input => [input.name, input.value])) } : { platform: platform.value, handle: handle.value };
      if (platform.value === 'luogu') body.luoguDomain = luoguDomain.value;
      clear();
      if (busy) { if (body.credentials) Object.keys(body.credentials).forEach(key => { body.credentials[key] = ''; }); return; }
      mutate(() => api('sync', 'POST', body));
    });
    const metric = (label, value) => {
      const node = el('div', 'algorithm-metric'); node.append(el('span', '', label), el('strong', '', value ?? '—')); return node;
    };
    function breakdown(node, heading, rows) {
      if (!rows.length) return;
      node.append(el('h3', '', heading));
      const wrap = el('div', 'algorithm-table-wrap'), table = el('table'), thead = el('thead'), head = el('tr'), tbody = el('tbody');
      [t('分类', 'Group'), t('过题', 'Solved'), t('尝试题数', 'Attempted'), t('题目完成率', 'Problem completion')].forEach(text => head.append(el('th', '', text)));
      thead.append(head);
      rows.forEach(r => {
        const row = el('tr'), names = { EASY: t('简单', 'Easy'), MEDIUM: t('中等', 'Medium'), HARD: t('困难', 'Hard') };
        [names[r.name] || r.name, r.solved, r.attempted ?? '—', r.attempted ? (r.solved / r.attempted * 100).toFixed(1) + '%' : '—'].forEach(value => row.append(el('td', '', value)));
        tbody.append(row);
      }); table.append(thead, tbody); wrap.append(table); node.append(wrap);
    }
    function render() {
      content.replaceChildren();
      content.append(el('p', 'algorithm-note', t('以下快照已纳入顶部总统计。牛客包含 ACM 练习与 Tracker 分区合计，分区同题可能重复；未知项显示 —。', 'These snapshots feed the unified overview. Nowcoder includes ACM practice + Tracker section totals; duplicates between sections are possible. Unknown values show —.')));
      accounts.forEach(a => {
        const item = el('details', 'algorithm-panel'), heading = el('summary', '', platforms[a.platform] + ' · ' + a.handle), s = a.snapshot;
        item.append(heading, el('p', 'algorithm-note', a.lastSyncedAt ? t('统计更新：', 'Updated: ') + new Date(a.lastSyncedAt).toLocaleString() : t('尚未同步成功，可重试或解绑。', 'Not synced yet. Retry or unlink.')));
        const actions = el('div', 'algorithm-actions');
        actions.append(button(t('重新同步', 'Resync'), () => { platform.value = a.platform; changePlatform(); form.scrollIntoView({ block: 'center' }); (credentialInputs[0] || handle).focus(); }),
          button(t('解绑', 'Unlink'), () => {
            clear();
            if (window.confirm(t('删除本站保存的该平台统计？不会修改平台账号。', 'Remove cached platform statistics here? The platform account is untouched.'))) mutate(() => api('accounts/' + a.id, 'DELETE'));
          })); item.append(actions);
        if (a.lastSyncedAt) {
          const metrics = el('div', 'algorithm-metrics');
          metrics.append(metric(t('累计过题', 'Unique solves'), s.solved), metric(t('尝试题数', 'Problems attempted'), s.attempted),
            metric(t('提交次数', 'Submissions'), s.submissions), metric(t('未解决题数', 'Unresolved'), s.attempted == null ? null : s.attempted - s.solved));
          item.append(metrics);
          if (s.sources?.length) {
            item.append(el('p', 'algorithm-warning', t('牛客按 ACM 练习 + Tracker 分区合计，不是跨分区去重题数。Tracker 未提供尝试/提交总数，因此不与 ACM 的完成率混算。', 'Nowcoder is ACM practice + Tracker section totals, not deduplicated across sections. Tracker supplies no attempted/submission totals, so no combined completion rate is inferred.')));
            s.sources.forEach(source => {
              const text = source.name + ' · ' + t('过题 ', 'Solved ') + source.solved + ' · ' + t('尝试 ', 'Attempted ') + (source.attempted ?? '—') + ' · ' + t('提交 ', 'Submissions ') + (source.submissions ?? '—');
              item.append(el('p', 'algorithm-note', text));
            });
          }
          if (a.previousSolved != null) item.append(el('p', 'algorithm-note', t('较上次快照过题数变化：', 'Solve-count change since last snapshot: ') + (s.solved - a.previousSolved) + t('（不是每日新增过题；平台统计可能修正）', ' (not daily new solves; provider counts may change)')));
          breakdown(item, t('难度分析', 'Difficulty breakdown'), s.difficulty || []);
          breakdown(item, t('VJudge 来源 OJ 分布', 'VJudge source OJ breakdown'), s.origins || []);
          item.append(el('p', 'algorithm-note', t('完成率只表示已解决题目 / 尝试题目，不是提交通过率。没有完整提交时间、判定及算法标签时，不推测训练日历、一次通过率或能力评分。',
            'Completion means solved / attempted problems, not submission acceptance. Without complete timestamps, verdicts and topics, no training calendar, first-try rate or ability score is inferred.')));
        } content.append(item);
      });
    }
    function cleanup() { clear(); controller.abort(); window.removeEventListener('pagehide', clear); options.signal.removeEventListener('abort', cleanup); }
    options.signal.addEventListener('abort', cleanup, { once: true }); window.addEventListener('pagehide', clear);
    load().catch(error => { if (!controller.signal.aborted) { status.classList.add('is-error'); status.textContent = errors[error.message] || errors.PROVIDER_UNAVAILABLE; } });
    return cleanup;
  }
})();
