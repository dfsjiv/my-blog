export function normalizeAccent(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return '#' + [...hex.slice(1)].map(c => c + c).join('');
  return null;
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hexColor = values => '#' + values.map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
function luminance(hex) {
  return rgb(hex).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
    .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
}
export function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
export function accentPalette(value, dark) {
  const source = normalizeAccent(value);
  if (!source) return null;
  const background = dark ? '#17212c' : '#ffffff';
  const target = dark ? [255, 255, 255] : [0, 0, 0];
  function readable(color) {
    let result = color;
    for (let step = 1; contrast(result, background) < 4.5 && step <= 100; step++) {
      result = hexColor(rgb(color).map((n, i) => n + (target[i] - n) * step / 100));
    }
    return result;
  }
  const primary = readable(source);
  const [r, g, b] = rgb(primary);
  return {
    '--knowledge-primary': primary,
    '--knowledge-primary-soft': `rgba(${r}, ${g}, ${b}, ${dark ? '.18' : '.10'})`,
    '--knowledge-secondary': readable(hexColor([g * .25 + r * .75, b * .25 + g * .75, r * .25 + b * .75])),
    '--knowledge-on-primary': contrast(primary, '#ffffff') >= 4.5 ? '#ffffff' : '#081018',
  };
}

function initAppearance() {
  const shell = document.getElementById('elegantShell');
  const trigger = document.getElementById('knowledgeAppearanceButton');
  const panel = document.getElementById('knowledgeAppearanceDialog');
  if (!shell || !trigger || !panel) return;
  const key = 'knowledge-site-accent:v1';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const color = panel.querySelector('[data-accent-color]');
  const hex = panel.querySelector('[data-accent-hex]');
  const status = panel.querySelector('[data-accent-status]');
  let accent = null, persistent = true;
  try { accent = normalizeAccent(localStorage.getItem(key)); } catch { persistent = false; }
  const presets = [
    ['#69b7ff', '晴空蓝', 'Sky'], ['#36c6d3', '湖水青', 'Lagoon'],
    ['#55bf99', '松石绿', 'Jade'], ['#a78bfa', '鸢尾紫', 'Iris'],
    ['#ef88ad', '玫瑰粉', 'Rose'], ['#e8b15b', '琥珀金', 'Amber'],
  ];
  const swatches = panel.querySelector('[data-accent-presets]');
  for (const [value, chinese, english] of presets) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.accent = value;
    button.dataset.nameZh = chinese; button.dataset.nameEn = english;
    button.style.setProperty('--swatch', value);
    const dot = document.createElement('span'); dot.className = 'knowledge-accent-dot'; dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.textContent = chinese;
    button.append(dot, label); swatches.append(button);
    button.addEventListener('click', () => select(value));
  }
  const isEnglish = () => shell.dataset.language === 'en';
  const tr = (zh, en) => isEnglish() ? en : zh;
  function apply() {
    const dark = shell.dataset.theme === 'dark' || (!shell.dataset.theme && media.matches);
    const palette = accentPalette(accent, dark);
    for (const property of ['--knowledge-primary', '--knowledge-primary-soft', '--knowledge-secondary', '--knowledge-on-primary']) {
      if (palette) shell.style.setProperty(property, palette[property]);
      else shell.style.removeProperty(property);
    }
    if (accent) shell.dataset.accent = accent;
    else shell.removeAttribute('data-accent');
    trigger.setAttribute('aria-label', tr('外观与色调', 'Appearance & color'));
    trigger.title = trigger.getAttribute('aria-label');
    for (const node of panel.querySelectorAll('[data-zh]')) node.textContent = isEnglish() ? node.dataset.en : node.dataset.zh;
    const actual = accent || (dark ? '#69b7ff' : '#4f91d8');
    color.value = actual;
    if (document.activeElement !== hex) hex.value = actual.toUpperCase();
    hex.setCustomValidity(''); hex.removeAttribute('aria-invalid');
    for (const button of swatches.children) {
      button.setAttribute('aria-pressed', String(accent === button.dataset.accent));
      button.lastElementChild.textContent = isEnglish() ? button.dataset.nameEn : button.dataset.nameZh;
    }
    for (const button of panel.querySelectorAll('[data-appearance-theme]')) {
      button.setAttribute('aria-pressed', String(button.dataset.appearanceTheme === (shell.dataset.theme || 'system')));
    }
    status.textContent = persistent ? tr('自动保存在此浏览器', 'Saved automatically in this browser') : tr('当前浏览器无法保存，更改仅本页有效', 'Storage unavailable; changes last for this page');
  }
  function select(value) {
    accent = value;
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); persistent = true; }
    catch { persistent = false; }
    apply();
  }
  color.addEventListener('input', () => select(color.value));
  hex.addEventListener('input', () => {
    const value = normalizeAccent(hex.value);
    if (value) select(value);
    else {
      hex.setAttribute('aria-invalid', 'true');
      status.textContent = tr('请输入 #RRGGBB 格式的色值，例如 #A78BFA', 'Use a hex color, for example #A78BFA');
    }
  });
  hex.addEventListener('change', () => { const value = normalizeAccent(hex.value); if (value) { select(value); hex.value = value.toUpperCase(); } });
  panel.querySelector('[data-accent-reset]').addEventListener('click', () => select(null));
  for (const button of panel.querySelectorAll('[data-appearance-theme]')) {
    button.addEventListener('click', () => { window.elegantShell.setTheme(button.dataset.appearanceTheme); apply(); });
  }
  function close() { panel.close(); }
  panel.querySelector('[data-appearance-close]').addEventListener('click', close);
  panel.addEventListener('click', event => { if (event.target === panel) { const r = panel.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
  panel.addEventListener('close', () => { trigger.setAttribute('aria-expanded', 'false'); if (document.body.classList.contains('auth-elegant')) trigger.focus(); });
  trigger.addEventListener('click', () => {
    window.elegantShell.closeNavigation(); apply();
    if (!panel.open) panel.showModal();
    trigger.setAttribute('aria-expanded', 'true');
  });
  new MutationObserver(apply).observe(shell, { attributes: true, attributeFilter: ['data-theme', 'data-language'] });
  new MutationObserver(() => { if (!document.body.classList.contains('auth-elegant') && panel.open) close(); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  media.addEventListener('change', apply);
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) { try { accent = normalizeAccent(localStorage.getItem(key)); } catch {} apply(); } });
  apply();
}
if (typeof document !== 'undefined') initAppearance();
