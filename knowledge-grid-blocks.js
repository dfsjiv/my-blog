// Small autonomous board; coordinates use the existing 36px background grid.
const SHAPES = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
];

export function makeBoard(columns, rows) {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}

function fits(board, shape, x, y) {
  return shape.every(([dx, dy]) => {
    const px = x + dx, py = y + dy;
    return px >= 0 && px < board[0].length && py < board.length && (py < 0 || !board[py][px]);
  });
}

function rotations(shape) {
  const result = [];
  let cells = shape;
  for (let turn = 0; turn < 4; turn++) {
    result.push(cells);
    const next = cells.map(([x, y]) => [-y, x]);
    const left = Math.min(...next.map(([x]) => x));
    const top = Math.min(...next.map(([, y]) => y));
    cells = next.map(([x, y]) => [x - left, y - top]);
  }
  return result;
}

export function fullRows(board) {
  return board.flatMap((row, index) => row.every(Boolean) ? [index] : []);
}

export function removeRows(board, cleared) {
  const remaining = board.filter((_, index) => !cleared.includes(index));
  return [...makeBoard(board[0].length, cleared.length), ...remaining];
}

export function choosePlacement(board, shapeIndex) {
  let best = null;
  for (const shape of rotations(SHAPES[shapeIndex])) {
    const width = Math.max(...shape.map(([x]) => x)) + 1;
    for (let x = 0; x <= board[0].length - width; x++) {
      let y = -3;
      while (fits(board, shape, x, y + 1)) y++;
      if (shape.some(([, dy]) => y + dy < 0)) continue;
      const next = board.map(row => [...row]);
      shape.forEach(([dx, dy]) => { next[y + dy][x + dx] = shapeIndex + 1; });
      const lines = fullRows(next).length;
      const heights = [];
      let holes = 0;
      for (let col = 0; col < next[0].length; col++) {
        const first = next.findIndex(row => row[col]);
        heights.push(first < 0 ? 0 : next.length - first);
        if (first >= 0) for (let r = first; r < next.length; r++) if (!next[r][col]) holes++;
      }
      const roughness = heights.slice(1).reduce((sum, h, i) => sum + Math.abs(h - heights[i]), 0);
      const score = holes * 22 + heights.reduce((a, b) => a + b, 0) + roughness * 1.5 - lines * 30;
      if (!best || score < best.score) best = { shape, x, y, score, color: shapeIndex + 1 };
    }
  }
  return best;
}

function initGridBlocks() {
  const shell = document.getElementById('elegantShell');
  const backdrop = shell && shell.querySelector('.knowledge-backdrop');
  if (!backdrop) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let canvas, ctx, board, piece, clearing = [], clearStarted = 0;
  let width = 0, height = 0, frame = 0, lastTime = 0, lastDraw = 0, bag = [];
  let colors = [], dark = true;

  function palette() {
    const style = getComputedStyle(shell);
    dark = style.getPropertyValue('--knowledge-bg').trim() === '#081018';
    colors = [style.getPropertyValue('--knowledge-primary').trim(), style.getPropertyValue('--knowledge-secondary').trim(), '#9585d8'];
  }

  function spawn() {
    // A shuffled seven-piece bag avoids long runs of the same shape.
    if (!bag.length) {
      bag = SHAPES.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    let planned = choosePlacement(board, bag.pop());
    if (!planned) {
      board = makeBoard(board[0].length, board.length);
      planned = choosePlacement(board, 0);
    }
    piece = { ...planned, fallingY: -3 };
  }

  function resize() {
    width = shell.clientWidth;
    height = shell.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    board = makeBoard(Math.max(4, Math.ceil(width / 36)), Math.max(6, Math.ceil(height / 36)));
    clearing = [];
    spawn();
    palette();
  }

  function block(x, y, color, opacity) {
    ctx.globalAlpha = opacity;
    ctx.fillStyle = colors[(color - 1) % colors.length];
    ctx.fillRect(x * 36 + 2, y * 36 + 2, 32, 32);
    ctx.globalAlpha = opacity * 2;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.strokeRect(x * 36 + 2.5, y * 36 + 2.5, 31, 31);
  }

  function draw(now) {
    frame = 0;
    if (!visible()) return;
    if (now - lastDraw >= 40) {
      const elapsed = Math.min((now - lastTime) / 1000 || 0, 0.1);
      lastTime = now;
      lastDraw = now;
      ctx.clearRect(0, 0, width, height);
      if (clearing.length && now - clearStarted >= 550) {
        board = removeRows(board, clearing);
        clearing = [];
        spawn();
      }
      if (!clearing.length) {
        piece.fallingY = Math.min(piece.y, piece.fallingY + elapsed * 12);
        if (piece.fallingY >= piece.y) {
          piece.shape.forEach(([dx, dy]) => { board[piece.y + dy][piece.x + dx] = piece.color; });
          clearing = fullRows(board);
          if (clearing.length) clearStarted = now;
          else spawn();
        }
      }
      const base = dark ? 0.12 : 0.10;
      board.forEach((row, y) => row.forEach((color, x) => {
        if (!color) return;
        const fade = clearing.includes(y) ? Math.max(0, 1 - (now - clearStarted) / 550) : 1;
        block(x, y, color, base * fade);
      }));
      if (!clearing.length) piece.shape.forEach(([dx, dy]) => block(piece.x + dx, piece.fallingY + dy, piece.color, dark ? 0.17 : 0.14));
      ctx.globalAlpha = 1;
    }
    frame = requestAnimationFrame(draw);
  }

  function visible() {
    return !document.hidden && !motion.matches && document.body.classList.contains('auth-elegant') && shell.dataset.route === 'home';
  }

  function update() {
    if (!visible()) {
      cancelAnimationFrame(frame);
      frame = 0;
      if (canvas) canvas.hidden = true;
      return;
    }
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'knowledge-grid-blocks';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;
      backdrop.appendChild(canvas);
      resize();
      new ResizeObserver(resize).observe(shell);
    }
    canvas.hidden = false;
    palette();
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }

  const observer = new MutationObserver(update);
  observer.observe(shell, { attributes: true, attributeFilter: ['data-route', 'data-theme'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', update);
  motion.addEventListener('change', update);
  // Wait until the core homepage has initialized; no image, font or API request.
  if ('requestIdleCallback' in window) window.requestIdleCallback(update, { timeout: 1500 });
  else setTimeout(update, 300);
}

if (typeof document !== 'undefined') initGridBlocks();
