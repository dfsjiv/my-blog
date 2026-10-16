(function () {
  'use strict';
  const cache = new Map(), pending = new Map(), inFlight = new Map();
  let scheduled = false;
  function get(id) {
    id = Number(id);
    if (!Number.isSafeInteger(id) || id <= 0) return Promise.resolve({ nickname: '' });
    const saved = cache.get(id);
    if (saved && saved.expires > Date.now()) return Promise.resolve(saved.profile);
    if (pending.has(id)) return pending.get(id).promise;
    if (inFlight.has(id)) return inFlight.get(id);
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    pending.set(id, { promise, resolve });
    if (!scheduled) { scheduled = true; queueMicrotask(flush); }
    return promise;
  }
  async function flush() {
    scheduled = false;
    const entries = [...pending.entries()];
    for (const [id, waiter] of entries) { pending.delete(id); inFlight.set(id, waiter.promise); }
    for (let start = 0; start < entries.length; start += 50) {
      const batch = entries.slice(start, start + 50), controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/profile/public?ids=' + batch.map(([id]) => id).join(','), { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error('Profile unavailable');
        for (const [id, waiter] of batch) {
          const profile = result.data.profiles.find(p => p.id === id) || { nickname: '' };
          cache.set(id, { profile, expires: Date.now() + 60000 }); inFlight.delete(id); waiter.resolve(profile);
        }
      } catch { for (const [id, waiter] of batch) { inFlight.delete(id); waiter.resolve({ nickname: '' }); } }
      finally { clearTimeout(timeout); }
    }
  }
  function identity(id, username, className) {
    const root = document.createElement('span'); root.className = 'knowledge-user-identity ' + (className || '');
    const avatar = document.createElement('span'); avatar.className = 'knowledge-user-small-avatar';
    avatar.textContent = Array.from(username || 'U')[0].toUpperCase();
    if (Number(id) > 0) {
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy';
      image.src = '/api/profile/avatar/' + Number(id);
      image.addEventListener('error', () => { image.remove(); }, { once: true }); avatar.append(image);
    }
    const name = document.createElement('strong'); name.textContent = username || 'User'; name.title = '@' + (username || 'User');
    root.append(avatar, name);
    get(id).then(profile => { name.textContent = profile.nickname || username || 'User'; });
    return root;
  }
  function cropRect(width, height, size, zoom, x, y) {
    const scale = Math.max(size / width, size / height) * zoom;
    const halfX = (width * scale - size) / 2, halfY = (height * scale - size) / 2;
    x = Math.max(-halfX, Math.min(halfX, x)); y = Math.max(-halfY, Math.min(halfY, y));
    return { x, y, sx: (width * scale / 2 - size / 2 - x) / scale,
      sy: (height * scale / 2 - size / 2 - y) / scale, side: size / scale };
  }
  function cropRegion(width, height, viewWidth, viewHeight, zoom, x, y) {
    const scale = Math.max(viewWidth / width, viewHeight / height) * zoom;
    x = Math.max(-(width * scale - viewWidth) / 2, Math.min((width * scale - viewWidth) / 2, x));
    y = Math.max(-(height * scale - viewHeight) / 2, Math.min((height * scale - viewHeight) / 2, y));
    return { x, y, sx: (width * scale - viewWidth) / 2 / scale - x / scale,
      sy: (height * scale - viewHeight) / 2 / scale - y / scale, sw: viewWidth / scale, sh: viewHeight / scale };
  }
  async function crop(file, language, options) {
    const cover = options?.kind === 'cover', viewWidth = cover ? 480 : 320, viewHeight = 320;
    const url = URL.createObjectURL(file), image = new Image();
    try { image.src = url; await image.decode(); }
    catch { URL.revokeObjectURL(url); throw new Error(language === 'zh' ? '无法读取图片' : 'Cannot read image'); }
    if (image.naturalWidth * image.naturalHeight > 40000000) { URL.revokeObjectURL(url); throw new Error('图片尺寸过大，请缩小后重试'); }
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const overlay = document.createElement('div'); overlay.className = 'knowledge-avatar-crop-overlay';
      const dialog = document.createElement('section'); dialog.className = 'knowledge-avatar-crop-dialog';
      const titleText = cover ? '调整文章封面' : (language === 'zh' ? '调整头像' : 'Adjust avatar');
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', titleText);
      const title = document.createElement('h2'); title.textContent = titleText;
      const note = document.createElement('p'); note.textContent = cover ? '拖动图片或使用方向键调整位置，滑动缩放。横向 3:2 裁剪；首页左侧会斜切，重要内容请靠中间。动图裁剪后为静态图片。' : (language === 'zh' ? '拖动图片调整位置，放缩后保存。动图裁剪后为静态头像。' : 'Drag to position, zoom and save. Animated images become static.');
      const stage = document.createElement('div'); stage.className = 'knowledge-avatar-crop-stage';
      if (cover) { dialog.style.width = 'min(580px,100%)'; stage.style.width = '100%'; stage.style.aspectRatio = '3 / 2'; }
      const canvas = document.createElement('canvas'); canvas.width = viewWidth; canvas.height = viewHeight; canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', language === 'zh' ? '拖动图片或使用方向键调整裁剪位置' : 'Drag or use arrow keys to move image');
      const ring = document.createElement('div'); ring.className = 'knowledge-avatar-crop-ring';
      if (cover) { ring.style.borderRadius = '0'; ring.style.boxShadow = 'none'; }
      stage.append(canvas, ring);
      const label = document.createElement('label'); label.textContent = language === 'zh' ? '缩放' : 'Zoom';
      const zoom = document.createElement('input'); zoom.type = 'range'; zoom.min = '1'; zoom.max = '3'; zoom.step = '.01'; zoom.value = '1'; label.append(zoom);
      const actions = document.createElement('div'); actions.className = 'knowledge-profile-actions';
      const cancel = document.createElement('button'), save = document.createElement('button');
      cancel.type = save.type = 'button'; cancel.textContent = language === 'zh' ? '取消' : 'Cancel'; save.textContent = cover ? '使用此封面' : (language === 'zh' ? '保存头像' : 'Save avatar');
      actions.append(cancel, save); dialog.append(title, note, stage, label, actions); overlay.append(dialog); document.body.append(overlay);
      let x = 0, y = 0, drag = null;
      function draw() {
        const r = cropRegion(image.naturalWidth, image.naturalHeight, viewWidth, viewHeight, Number(zoom.value), x, y); x = r.x; y = r.y;
        const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, viewWidth, viewHeight); ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, viewWidth, viewHeight);
      }
      function finish(blob) { document.removeEventListener('keydown', keydown); overlay.remove(); URL.revokeObjectURL(url); previousFocus?.focus(); resolve(blob); }
      function keydown(event) {
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
        if (event.key === 'Tab') {
          const controls = [canvas, zoom, cancel, save], i = controls.indexOf(document.activeElement);
          event.preventDefault(); controls[(i + (event.shiftKey ? 3 : 1)) % 4].focus();
        }
      }
      document.addEventListener('keydown', keydown);
      zoom.addEventListener('input', draw);
      canvas.addEventListener('keydown', e => {
        const arrows = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
        if (arrows[e.key]) { e.preventDefault(); x += arrows[e.key][0]; y += arrows[e.key][1]; draw(); }
      });
      canvas.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return;
        const factor = viewWidth / canvas.getBoundingClientRect().width; x += (e.clientX - drag.x) * factor; y += (e.clientY - drag.y) * factor;
        drag.x = e.clientX; drag.y = e.clientY; draw(); });
      canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
      cancel.addEventListener('click', () => finish(null));
      save.addEventListener('click', () => {
        save.disabled = cancel.disabled = true;
        save.disabled = true;
        const output = document.createElement('canvas'); output.width = cover ? 1200 : 512; output.height = cover ? 800 : 512;
        const r = cropRegion(image.naturalWidth, image.naturalHeight, viewWidth, viewHeight, Number(zoom.value), x, y);
        output.getContext('2d').drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, output.width, output.height);
        output.toBlob(blob => finish(blob), cover ? 'image/jpeg' : 'image/png', .9);
      });
      draw(); zoom.focus();
    });
  }
  window.KnowledgeUserProfile = { get, identity, crop, cropRect, cropRegion, clear: id => cache.delete(Number(id)) };
}());
