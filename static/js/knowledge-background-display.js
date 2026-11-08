(function () {
  'use strict';
  const defaults = { x: 50, y: 42, zoom: 1.08 };
  async function request(method, ids, body, token, signal) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    const abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    try {
    const response = await fetch('/api/background-display' + (ids ? '?ids=' + ids.map(encodeURIComponent).join(',') : ''), {
      method, signal: controller.signal, headers: method === 'PATCH' ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error?.message || '背景设置加载失败');
    return result.data;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
  }
  function apply(node, display, image) {
    const d = display || defaults;
    node.style[image ? 'objectPosition' : 'backgroundPosition'] = d.x + '% ' + d.y + '%';
    node.style.transform = 'scale(' + d.zoom + ')';
    // Anchoring scale at the focal point also permits panning after zooming.
    node.style.transformOrigin = d.x + '% ' + d.y + '%';
  }
  function editor(src, initial) {
    const root = document.createElement('div'); root.className = 'knowledge-background-adjust';
    const stage = document.createElement('div'); stage.className = 'knowledge-background-stage';
    const image = document.createElement('img'); image.alt = '背景裁剪效果预览'; image.draggable = false;
    stage.append(image);
    const ratio = document.createElement('select'); ratio.setAttribute('aria-label', '预览屏幕比例');
    for (const [value, label] of [['16:9', '桌面 16:9'], ['21:9', '宽屏 21:9'], ['9:16', '手机 9:16']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; ratio.append(option);
    }
    const controls = document.createElement('div'); controls.className = 'knowledge-background-adjust-controls';
    const inputs = {};
    for (const [name, text, min, max, step] of [['x', '左右位置', 0, 100, 1], ['y', '上下位置', 0, 100, 1], ['zoom', '放缩', 1, 3, .01]]) {
      const label = document.createElement('label'), caption = document.createElement('span'), output = document.createElement('output'); caption.textContent = text;
      const input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step;
      input.value = (initial || defaults)[name]; label.append(caption, input, output); controls.append(label); inputs[name] = { input, output };
      input.addEventListener('input', update);
    }
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'knowledge-route-button'; reset.textContent = '撤销本次调整';
    reset.addEventListener('click', () => { for (const name of Object.keys(inputs)) inputs[name].input.value = (initial || defaults)[name]; update(); });
    const caption = document.createElement('p'); caption.className = 'knowledge-background-message'; caption.textContent = '模拟 cover 裁剪，不拉伸原图。拖动或调整滑条；切换比例检查不同屏幕。';
    root.append(ratio, stage, controls, reset, caption);
    function value() { return Object.fromEntries(Object.entries(inputs).map(([name, control]) => [name, Number(control.input.value)])); }
    function update() {
      apply(image, value(), true);
      for (const [name, control] of Object.entries(inputs)) control.output.textContent = name === 'zoom' ? Number(control.input.value).toFixed(2) + '×' : control.input.value + '%';
    }
    function updateRatio() { const [w, h] = ratio.value.split(':').map(Number); stage.style.aspectRatio = w + '/' + h; stage.style.maxWidth = Math.round(300 * w / h) + 'px'; }
    ratio.addEventListener('change', updateRatio);
    let drag;
    stage.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const r = stage.getBoundingClientRect();
      inputs.x.input.value = Math.min(100, Math.max(0, Number(inputs.x.input.value) - (e.clientX - drag.x) / r.width * 100));
      inputs.y.input.value = Math.min(100, Math.max(0, Number(inputs.y.input.value) - (e.clientY - drag.y) / r.height * 100));
      drag.x = e.clientX; drag.y = e.clientY; update();
    });
    stage.addEventListener('pointerup', () => { drag = null; }); stage.addEventListener('pointercancel', () => { drag = null; });
    if (src) image.src = src;
    update(); updateRatio();
    return { root, image, value, setSource: url => { image.src = url; }, setFocal: focal => { inputs.x.input.value = ({ left: 0, center: 50, right: 100 })[focal] ?? 50; update(); } };
  }
  window.KnowledgeBackgroundDisplay = { apply, editor, defaults,
    get: async (ids, signal) => (await request('GET', ids, null, null, signal)).settings,
    save: (key, display, token, signal) => request('PATCH', null, { key: String(key), display }, token, signal) };
}());
