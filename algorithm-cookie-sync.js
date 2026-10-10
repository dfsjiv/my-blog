(function () {
  'use strict';
  window.KnowledgeCookieSync = { mount };
  function mount(root, options) {
    const t = (zh, en) => options.language === 'zh' ? zh : en;
    const controller = new AbortController();
    const platforms = { vjudge: 'VJudge', luogu: t('洛谷', 'Luogu'), nowcoder: t('牛客', 'Nowcoder'), leetcode: t('力扣中国站', 'LeetCode China') };
    const el = (tag, cls, text) => { const node = document.createElement(tag); node.className = cls || ''; if (text != null) node.textContent = text; return node; };
    const button = (text, fn) => { const node = el('button', 'algorithm-button', text); node.type = 'button'; node.addEventListener('click', fn); return node; };
    const panel = el('section', 'algorithm-panel algorithm-cookie-panel');
    panel.append(el('h2', '', t('更多平台 · 一次性同步', 'More platforms · one-time sync')),
      el('p', 'algorithm-note', t('Cookie 可选：仅用于当次请求，不保存、不自动同步，提交后立即清空。不要填写平台密码。账号关联不等于身份认证。',
        'Cookie is optional, used only for this request, never saved or auto-synced, and cleared on submit. Do not enter your platform password. Linking does not certify ownership.')));
    const form = el('form', 'algorithm-bind');
    form.autocomplete = 'off';
    const platform = el('select'); platform.setAttribute('aria-label', t('更多平台', 'More platforms'));
    Object.entries(platforms).forEach(([value, name]) => platform.append(new Option(name, value)));
    const handle = el('input'); handle.required = true; handle.maxLength = 40; handle.autocomplete = 'off';
    handle.setAttribute('aria-label', t('平台用户名或 UID', 'Platform handle or UID'));
    const cookie = el('input', 'algorithm-cookie-input'); cookie.type = 'password'; cookie.maxLength = 8192; cookie.autocomplete = 'off';
    cookie.spellcheck = false; cookie.setAttribute('aria-label', t('一次性 Cookie（可选）', 'One-time Cookie (optional)'));
    cookie.placeholder = t('一次性 Cookie（可选，name=value; ...）', 'One-time Cookie (optional, name=value; ...)');
    const submit = el('button', 'algorithm-button is-primary', t('绑定 / 同步', 'Link / sync')); submit.type = 'submit';
    form.append(platform, handle, cookie, submit);
    const clear = () => { cookie.value = ''; };
    const status = el('p', 'algorithm-status'); status.setAttribute('role', 'status');
    const content = el('div');
    panel.append(form, button(t('清空 Cookie', 'Clear Cookie'), clear), status, content);
    root.append(panel);
    let accounts = [], busy = false;
    const errors = {
      MIGRATION_REQUIRED: t('更多平台的数据库尚未初始化；原有平台不受影响。', 'More-platform database setup is pending; existing platforms are unaffected.'),
      UNAUTHORIZED: t('请重新登录博客。', 'Please sign in to the blog again.'),
      INVALID_HANDLE: t('洛谷和牛客请填数字 UID；VJudge 和力扣请填用户名。', 'Use numeric UIDs for Luogu/Nowcoder and handles for VJudge/LeetCode.'),
      INVALID_COOKIE: t('Cookie 格式不正确，或超过 8192 字符。', 'Invalid Cookie format or more than 8192 characters.'),
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
      if (body) { init.body = JSON.stringify(body); body.cookie = ''; }
      try {
        const request = fetch('/api/algorithm/external/' + path, init);
        init.body = undefined; body = null;
        const response = await request, payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.code || 'PROVIDER_UNAVAILABLE');
        return payload.data;
      } finally { init.body = undefined; if (body) body.cookie = ''; }
    }
    function changePlatform() {
      clear();
      handle.placeholder = ['luogu', 'nowcoder'].includes(platform.value) ? t('数字 UID（个人主页网址中的数字）', 'Numeric UID from your profile URL') : t('平台用户名（不是网址）', 'Platform handle, not a URL');
      handle.value = accounts.find(a => a.platform === platform.value)?.handle || '';
    }
    platform.addEventListener('change', changePlatform); changePlatform();
    async function load() {
      const data = await api('dashboard');
      if (controller.signal.aborted) return;
      accounts = data.accounts; render();
    }
    async function mutate(action) {
      if (busy) { clear(); return; }
      busy = true; panel.querySelectorAll('input,select,button').forEach(n => { n.disabled = true; });
      status.classList.remove('is-error'); status.textContent = t('正在同步……', 'Syncing…');
      try { await action(); await load(); if (!controller.signal.aborted) status.textContent = t('统计已更新，未保存 Cookie。', 'Statistics updated. Cookie was not saved.'); }
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
      const body = { platform: platform.value, handle: handle.value, cookie: cookie.value };
      clear();
      if (busy) { body.cookie = ''; return; }
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
        [names[r.name] || r.name, r.solved, r.attempted, r.attempted ? (r.solved / r.attempted * 100).toFixed(1) + '%' : '—'].forEach(value => row.append(el('td', '', value)));
        tbody.append(row);
      }); table.append(thead, tbody); wrap.append(table); node.append(wrap);
    }
    function render() {
      content.replaceChildren();
      content.append(el('p', 'algorithm-warning', t('以下为平台统计快照，不混入下方 CF / AtCoder 的提交分析；未知项显示 —。不同平台同题不合并，VJudge 仅统计经 VJudge 记录的题目。',
        'These platform snapshots are separate from CF / AtCoder submission analysis below. Unknown values show —. No cross-platform deduplication. VJudge counts only VJudge-recorded problems.')));
      accounts.forEach(a => {
        const item = el('section', 'algorithm-panel'), heading = el('h3', '', platforms[a.platform] + ' · ' + a.handle), s = a.snapshot;
        item.append(heading, el('p', 'algorithm-note', a.lastSyncedAt ? t('统计更新：', 'Updated: ') + new Date(a.lastSyncedAt).toLocaleString() : t('尚未同步成功，可重试或解绑。', 'Not synced yet. Retry or unlink.')));
        const actions = el('div', 'algorithm-actions');
        actions.append(button(t('重新同步', 'Resync'), () => { platform.value = a.platform; changePlatform(); form.scrollIntoView({ block: 'center' }); cookie.focus(); }),
          button(t('解绑', 'Unlink'), () => {
            clear();
            if (window.confirm(t('删除本站保存的该平台统计？不会修改平台账号。', 'Remove cached platform statistics here? The platform account is untouched.'))) mutate(() => api('accounts/' + a.id, 'DELETE'));
          })); item.append(actions);
        if (a.lastSyncedAt) {
          const metrics = el('div', 'algorithm-metrics');
          metrics.append(metric(t('累计过题', 'Unique solves'), s.solved), metric(t('尝试题数', 'Problems attempted'), s.attempted),
            metric(t('提交次数', 'Submissions'), s.submissions), metric(t('未解决题数', 'Unresolved'), s.attempted == null ? null : s.attempted - s.solved));
          item.append(metrics);
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
