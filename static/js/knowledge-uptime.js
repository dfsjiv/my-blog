(function () {
  const output = document.getElementById('knowledgeSiteUptime');
  const shell = document.getElementById('elegantShell');
  if (!output || !shell) return;
  const startedAt = Date.parse(output.dataset.startedAt);
  if (!Number.isFinite(startedAt)) return;
  let timer;

  function sync() {
    window.clearTimeout(timer);
    if (document.hidden || !document.body.classList.contains('auth-elegant')
      || shell.classList.contains('knowledge-writing-mode')
      || shell.classList.contains('knowledge-reader-focus')) return;
    const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor(total % 86400 / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const seconds = total % 60;
    const clock = [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
    const english = shell.dataset.language === 'en';
    output.textContent = days + (english ? 'd ' : '天 ') + clock;
    output.dateTime = 'P' + days + 'DT' + hours + 'H' + minutes + 'M' + seconds + 'S';
    output.title = english ? 'Site age since May 24, 2026' : '运营时长，自 2026 年 5 月 24 日起';
    timer = window.setTimeout(sync, 1000 - Date.now() % 1000);
  }

  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', () => window.clearTimeout(timer));
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  observer.observe(shell, { attributes: true, attributeFilter: ['class', 'data-language'] });
  sync();
}());
