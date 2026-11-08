(function () {
  const SIZE = 4;
  const BEST_KEY = 'knowledge-game-2048-best:v1';

  class Game2048Engine {
    constructor(random) {
      this.random = typeof random === 'function' ? random : Math.random;
      this.board = createBoard();
      this.score = 0;
      this.won = false;
      this.over = false;
    }

    reset() {
      this.board = createBoard();
      this.score = 0;
      this.won = false;
      this.over = false;
      this.addRandomTile();
      this.addRandomTile();
    }

    addRandomTile() {
      const empty = [];
      this.board.forEach(function (row, rowIndex) {
        row.forEach(function (value, columnIndex) {
          if (!value) empty.push([rowIndex, columnIndex]);
        });
      });
      if (!empty.length) return false;
      const position = empty[Math.floor(this.random() * empty.length)];
      this.board[position[0]][position[1]] = this.random() < 0.9 ? 2 : 4;
      return true;
    }

    move(direction) {
      if (this.over) return false;
      const before = JSON.stringify(this.board);
      for (let lineIndex = 0; lineIndex < SIZE; lineIndex += 1) {
        const values = [];
        for (let offset = 0; offset < SIZE; offset += 1) {
          const position = linePosition(direction, lineIndex, offset);
          values.push(this.board[position[0]][position[1]]);
        }
        const merged = mergeLine(values);
        this.score += merged.score;
        for (let offset = 0; offset < SIZE; offset += 1) {
          const position = linePosition(direction, lineIndex, offset);
          this.board[position[0]][position[1]] = merged.values[offset];
        }
      }
      if (before === JSON.stringify(this.board)) {
        this.over = !this.canMove();
        return false;
      }
      this.addRandomTile();
      this.won = this.won || this.board.some(function (row) {
        return row.some(function (value) { return value >= 2048; });
      });
      this.over = !this.canMove();
      return true;
    }

    canMove() {
      for (let row = 0; row < SIZE; row += 1) {
        for (let column = 0; column < SIZE; column += 1) {
          const value = this.board[row][column];
          if (!value) return true;
          if (column + 1 < SIZE && value === this.board[row][column + 1]) return true;
          if (row + 1 < SIZE && value === this.board[row + 1][column]) return true;
        }
      }
      return false;
    }
  }

  function createBoard() {
    return Array.from({ length: SIZE }, function () {
      return Array(SIZE).fill(0);
    });
  }

  function mergeLine(line) {
    const compact = line.filter(Boolean);
    const result = [];
    let score = 0;
    for (let index = 0; index < compact.length; index += 1) {
      if (compact[index] === compact[index + 1]) {
        const value = compact[index] * 2;
        result.push(value);
        score += value;
        index += 1;
      } else {
        result.push(compact[index]);
      }
    }
    while (result.length < SIZE) result.push(0);
    return { values: result, score };
  }

  function linePosition(direction, line, offset) {
    if (direction === 'left') return [line, offset];
    if (direction === 'right') return [line, SIZE - 1 - offset];
    if (direction === 'up') return [offset, line];
    return [SIZE - 1 - offset, line];
  }

  function readBest() {
    try {
      const value = Number.parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10);
      return Number.isInteger(value) && value > 0 ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch (error) {
      // The game remains playable if storage is unavailable.
    }
  }

  function mount(container, options) {
    if (!container) return function () {};
    const translate = typeof options?.translate === 'function'
      ? options.translate
      : function (value) { return value; };
    const engine = new Game2048Engine();
    let best = readBest();
    let touchStart = null;
    let dismissedWin = false;

    const game = document.createElement('div');
    game.className = 'knowledge-2048';
    const top = document.createElement('div');
    top.className = 'knowledge-2048-top';
    const scoreGroup = document.createElement('div');
    scoreGroup.className = 'knowledge-2048-scores';
    const score = scoreBox('分数', translate);
    const bestScore = scoreBox('最高分', translate);
    scoreGroup.append(score.root, bestScore.root);
    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'knowledge-2048-restart';
    restart.textContent = translate('重新开始');
    top.append(scoreGroup, restart);

    const board = document.createElement('div');
    board.className = 'knowledge-2048-board';
    board.tabIndex = 0;
    board.setAttribute('role', 'application');
    board.setAttribute('aria-label', translate('2048 棋盘'));
    const cells = [];
    for (let index = 0; index < SIZE * SIZE; index += 1) {
      const cell = document.createElement('div');
      cell.className = 'knowledge-2048-cell';
      board.appendChild(cell);
      cells.push(cell);
    }

    const overlay = document.createElement('div');
    overlay.className = 'knowledge-2048-overlay';
    overlay.hidden = true;
    const overlayTitle = document.createElement('strong');
    const overlayAction = document.createElement('button');
    overlayAction.type = 'button';
    overlay.append(overlayTitle, overlayAction);
    board.appendChild(overlay);

    const help = document.createElement('p');
    help.className = 'knowledge-2048-help';
    help.textContent = translate('按方向键或滑动开始');
    game.append(top, board, help);
    container.replaceChildren(game);

    function render() {
      const values = engine.board.flat();
      values.forEach(function (value, index) {
        const cell = cells[index];
        cell.textContent = value || '';
        cell.dataset.value = value ? String(Math.min(value, 8192)) : '0';
        cell.setAttribute('aria-label', value ? String(value) : translate('空白'));
      });
      score.value.textContent = String(engine.score);
      if (engine.score > best) {
        best = engine.score;
        writeBest(best);
      }
      bestScore.value.textContent = String(best);
      const showWin = engine.won && !dismissedWin;
      overlay.hidden = !engine.over && !showWin;
      if (engine.over) {
        overlayTitle.textContent = translate('游戏结束');
        overlayAction.textContent = translate('重新开始');
      } else if (showWin) {
        overlayTitle.textContent = translate('你合成了 2048！');
        overlayAction.textContent = translate('继续游戏');
      }
    }

    function startGame() {
      dismissedWin = false;
      engine.reset();
      render();
      board.focus({ preventScroll: true });
    }

    function move(direction) {
      if (!direction || engine.over) return;
      const changed = engine.move(direction);
      if (changed || engine.over) render();
    }

    function onKeyDown(event) {
      const target = event.target;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const directions = {
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
        ArrowUp: 'up', w: 'up', W: 'up',
        ArrowDown: 'down', s: 'down', S: 'down',
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      move(direction);
    }

    function onTouchStart(event) {
      const touch = event.changedTouches[0];
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    }

    function onTouchEnd(event) {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 28) return;
      move(Math.abs(deltaX) > Math.abs(deltaY)
        ? (deltaX > 0 ? 'right' : 'left')
        : (deltaY > 0 ? 'down' : 'up'));
    }

    restart.addEventListener('click', startGame);
    if (window.__knowledge2048KeydownHandler) {
      window.removeEventListener('keydown', window.__knowledge2048KeydownHandler);
    }
    window.__knowledge2048KeydownHandler = onKeyDown;
    window.addEventListener('keydown', onKeyDown);
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchend', onTouchEnd, { passive: true });
    overlayAction.addEventListener('click', function () {
      if (engine.over) startGame();
      else {
        dismissedWin = true;
        render();
        board.focus({ preventScroll: true });
      }
    });
    startGame();

    return function destroy() {
      restart.removeEventListener('click', startGame);
      window.removeEventListener('keydown', onKeyDown);
      if (window.__knowledge2048KeydownHandler === onKeyDown) {
        window.__knowledge2048KeydownHandler = null;
      }
      board.removeEventListener('touchstart', onTouchStart);
      board.removeEventListener('touchend', onTouchEnd);
      container.replaceChildren();
    };
  }

  function scoreBox(label, translate) {
    const root = document.createElement('div');
    const caption = document.createElement('span');
    const value = document.createElement('strong');
    caption.textContent = translate(label);
    value.textContent = '0';
    root.append(caption, value);
    return { root, value };
  }

  window.KnowledgeGame2048 = { Game2048Engine, mergeLine, mount };
}());
