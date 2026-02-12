(() => {
  const SIZE = 5;
  const STORAGE_KEY = 'line-fixed-puzzle-v1';
  const SHIFT_MS = 140;
  const POP_MS = 180;

  const els = {
    board: document.getElementById('board'),
    floating: document.getElementById('floating-layer'),
    score: document.getElementById('score'),
    bestScore: document.getElementById('best-score'),
    maxTile: document.getElementById('max-tile'),
    bestTile: document.getElementById('best-tile'),
    status: document.getElementById('status'),
    rowButtons: document.getElementById('row-buttons'),
    colButtons: document.getElementById('col-buttons'),
    newGame: document.getElementById('new-game-btn'),
    help: document.getElementById('help-btn'),
    helpDialog: document.getElementById('help-dialog'),
    closeHelp: document.getElementById('close-help-btn'),
  };

  const seeded = makeSeededRng();
  const random = seeded || Math.random;

  const state = {
    board: makeEmptyBoard(),
    score: 0,
    bestScore: 0,
    maxTile: 0,
    bestTile: 0,
    selectedLine: { type: 'row', index: 2 },
    gameOver: false,
    runningAnimation: false,
    pendingLineType: 'row',
    mergeMultiplierLabel: 'k回目の合成: 生成値 × (k+1)',
    mergedCells: new Set(),
  };

  function makeEmptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function parseSeed() {
    const seed = new URLSearchParams(window.location.search).get('seed');
    return seed === null ? null : Number(seed) || hashString(seed);
  }

  function hashString(text) {
    let h = 2166136261;
    for (const c of text) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makeSeededRng() {
    const seed = parseSeed();
    if (seed === null) return null;
    let value = (seed >>> 0) || 123456789;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function pickSpawnValue(emptyCount) {
    const roll = random();
    if (emptyCount <= 7) {
      if (roll < 0.8) return 1;
      if (roll < 0.98) return 2;
      return 3;
    }
    return roll < 0.9 ? 1 : 2;
  }

  function listEmpties(board = state.board) {
    const empties = [];
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (board[r][c] === 0) empties.push([r, c]);
      }
    }
    return empties;
  }

  function spawnOne() {
    const empties = listEmpties();
    if (empties.length === 0) return false;
    const [r, c] = empties[Math.floor(random() * empties.length)];
    state.board[r][c] = pickSpawnValue(empties.length);
    state.maxTile = Math.max(state.maxTile, state.board[r][c]);
    return { r, c, value: state.board[r][c] };
  }

  function shiftLine(board, type, index, dir) {
    const next = cloneBoard(board);
    const moved = [];

    if (type === 'row') {
      const row = board[index];
      if (dir === 'left') {
        for (let c = 0; c < SIZE - 1; c += 1) {
          next[index][c] = row[c + 1];
          if (row[c + 1] !== 0) moved.push({ from: [index, c + 1], to: [index, c], value: row[c + 1] });
        }
        next[index][SIZE - 1] = 0;
      } else if (dir === 'right') {
        for (let c = SIZE - 1; c > 0; c -= 1) {
          next[index][c] = row[c - 1];
          if (row[c - 1] !== 0) moved.push({ from: [index, c - 1], to: [index, c], value: row[c - 1] });
        }
        next[index][0] = 0;
      } else {
        return null;
      }
    } else {
      if (dir === 'up') {
        for (let r = 0; r < SIZE - 1; r += 1) {
          next[r][index] = board[r + 1][index];
          if (board[r + 1][index] !== 0) moved.push({ from: [r + 1, index], to: [r, index], value: board[r + 1][index] });
        }
        next[SIZE - 1][index] = 0;
      } else if (dir === 'down') {
        for (let r = SIZE - 1; r > 0; r -= 1) {
          next[r][index] = board[r - 1][index];
          if (board[r - 1][index] !== 0) moved.push({ from: [r - 1, index], to: [r, index], value: board[r - 1][index] });
        }
        next[0][index] = 0;
      } else {
        return null;
      }
    }

    return { board: next, moved };
  }

  function mergePhase(board) {
    let chain = 0;
    let totalGain = 0;
    const mergedCells = new Set();
    const mergeEvents = [];

    while (true) {
      const mergedThisRound = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
      const ops = [];

      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) {
          const value = board[r][c];
          if (value === 0 || mergedThisRound[r][c]) continue;

          const downR = r + 1;
          const rightC = c + 1;

          if (downR < SIZE && board[downR][c] === value && !mergedThisRound[downR][c]) {
            ops.push({ from: [downR, c], to: [r, c], value: value + 1 });
            mergedThisRound[r][c] = true;
            mergedThisRound[downR][c] = true;
            continue;
          }

          if (rightC < SIZE && board[r][rightC] === value && !mergedThisRound[r][rightC]) {
            ops.push({ from: [r, rightC], to: [r, c], value: value + 1 });
            mergedThisRound[r][c] = true;
            mergedThisRound[r][rightC] = true;
          }
        }
      }

      if (ops.length === 0) break;
      chain += 1;
      const multiplier = chain + 1;

      for (const op of ops) {
        const [fromR, fromC] = op.from;
        const [toR, toC] = op.to;
        board[fromR][fromC] = 0;
        board[toR][toC] = op.value;
        const gain = op.value * multiplier;
        totalGain += gain;
        mergedCells.add(`${toR},${toC}`);
        mergeEvents.push({ ...op, chain, gain });
        state.maxTile = Math.max(state.maxTile, op.value);
      }
    }

    return { board, chainCount: chain, gain: totalGain, mergedCells, mergeEvents };
  }

  function updateStorage() {
    state.bestScore = Math.max(state.bestScore, state.score);
    state.bestTile = Math.max(state.bestTile, state.maxTile);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      bestScore: state.bestScore,
      bestTile: state.bestTile,
    }));
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.bestScore = parsed.bestScore || 0;
      state.bestTile = parsed.bestTile || 0;
    } catch (_e) {
      state.bestScore = 0;
      state.bestTile = 0;
    }
  }

  function cellMetrics() {
    const cell = els.board.firstElementChild;
    if (!cell) return { stepX: 0, stepY: 0, baseLeft: 0, baseTop: 0 };
    const boardRect = els.board.getBoundingClientRect();
    const firstRect = cell.getBoundingClientRect();
    let secondRect = null;
    if (els.board.children.length > 1) secondRect = els.board.children[1].getBoundingClientRect();
    const stepX = secondRect ? secondRect.left - firstRect.left : firstRect.width + 6;
    const stepY = stepX;
    return {
      stepX,
      stepY,
      baseLeft: firstRect.left - boardRect.left,
      baseTop: firstRect.top - boardRect.top,
      cellW: firstRect.width,
      cellH: firstRect.height,
    };
  }

  function tileColor(value) {
    const hue = 190 + (value * 18) % 150;
    const light = Math.max(32, 54 - value * 2);
    return `hsl(${hue} 70% ${light}%)`;
  }

  function render() {
    els.board.innerHTML = '';
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const value = state.board[r][c];
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (value > 0) {
          cell.classList.add('filled');
          cell.textContent = String(value);
          cell.style.backgroundColor = tileColor(value);
          if (state.mergedCells.has(`${r},${c}`)) cell.classList.add('merged-pop');
        }
        els.board.appendChild(cell);
      }
    }

    els.score.textContent = String(state.score);
    els.bestScore.textContent = String(state.bestScore);
    els.maxTile.textContent = String(state.maxTile);
    els.bestTile.textContent = String(state.bestTile);
  }

  function renderSelection() {
    document.querySelectorAll('[data-line]').forEach((btn) => btn.classList.remove('active'));
    const key = `${state.selectedLine.type}:${state.selectedLine.index}`;
    const target = document.querySelector(`[data-line='${key}']`);
    if (target) target.classList.add('active');
  }

  function setSelectedLine(type, index) {
    state.selectedLine = { type, index };
    state.pendingLineType = type;
    renderSelection();
  }

  function spawnFloatingScore(r, c, text) {
    const marker = document.createElement('span');
    marker.className = 'float-score';
    marker.textContent = text;
    const cellW = els.board.clientWidth / SIZE;
    marker.style.left = `${c * cellW + cellW * 0.3}px`;
    marker.style.top = `${r * cellW + cellW * 0.18}px`;
    els.floating.appendChild(marker);
    marker.addEventListener('animationend', () => marker.remove());
  }

  function animateTurn(shiftMoved, mergeEvents) {
    return new Promise((resolve) => {
      const metrics = cellMetrics();
      const ghosts = [];

      for (const move of shiftMoved) {
        const ghost = document.createElement('div');
        ghost.className = 'tile-ghost';
        ghost.textContent = String(move.value);
        ghost.style.backgroundColor = tileColor(move.value);
        ghost.style.width = `${metrics.cellW}px`;
        ghost.style.height = `${metrics.cellH}px`;
        const startX = metrics.baseLeft + move.from[1] * metrics.stepX;
        const startY = metrics.baseTop + move.from[0] * metrics.stepY;
        const dx = (move.to[1] - move.from[1]) * metrics.stepX;
        const dy = (move.to[0] - move.from[0]) * metrics.stepY;
        ghost.style.transform = `translate(${startX}px, ${startY}px)`;
        els.floating.appendChild(ghost);
        ghosts.push({ ghost, startX, startY, dx, dy });
      }

      const begin = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - begin) / SHIFT_MS);
        const ease = 1 - Math.pow(1 - t, 3);
        for (const g of ghosts) {
          const x = g.startX + g.dx * ease;
          const y = g.startY + g.dy * ease;
          g.ghost.style.transform = `translate(${x}px, ${y}px)`;
        }

        if (t < 1) {
          requestAnimationFrame(frame);
          return;
        }

        ghosts.forEach((g) => g.ghost.remove());

        mergeEvents.forEach((m, idx) => {
          const key = `${m.to[0]},${m.to[1]}`;
          state.mergedCells.add(key);
          spawnFloatingScore(m.to[0], m.to[1], `+${m.gain}`);
          const delay = Math.min(160, idx * 22 + (m.chain - 1) * 45);
          setTimeout(() => {
            const cellIndex = m.to[0] * SIZE + m.to[1];
            const cell = els.board.children[cellIndex];
            if (!cell) return;
            cell.classList.remove('merged-pop');
            void cell.offsetWidth;
            cell.classList.add('merged-pop');
          }, delay);
        });

        setTimeout(resolve, POP_MS);
      }

      requestAnimationFrame(frame);
    });
  }

  async function executeTurn(dir) {
    if (state.gameOver || state.runningAnimation) return;
    const { type, index } = state.selectedLine;

    const shiftResult = shiftLine(state.board, type, index, dir);
    if (!shiftResult) return;

    state.runningAnimation = true;
    const shiftedBoard = shiftResult.board;
    const merged = mergePhase(cloneBoard(shiftedBoard));

    state.board = merged.board;
    state.mergedCells = new Set();
    state.score += merged.gain;

    const spawned = spawnOne();

    if (!spawned) {
      state.gameOver = true;
      els.status.textContent = 'Game Over: 空セルがありません';
      els.status.classList.add('over');
    } else {
      els.status.classList.remove('over');
      els.status.textContent = merged.chainCount > 1
        ? `連鎖 ${merged.chainCount} / 倍率ルール: ${state.mergeMultiplierLabel}`
        : ' '; 
    }

    updateStorage();
    render();
    await animateTurn(shiftResult.moved, merged.mergeEvents);
    state.runningAnimation = false;
  }

  function createLineButtons() {
    for (let i = 0; i < SIZE; i += 1) {
      const rBtn = document.createElement('button');
      rBtn.textContent = `R${i + 1}`;
      rBtn.dataset.line = `row:${i}`;
      rBtn.addEventListener('click', () => setSelectedLine('row', i));
      els.rowButtons.appendChild(rBtn);

      const cBtn = document.createElement('button');
      cBtn.textContent = `C${i + 1}`;
      cBtn.dataset.line = `col:${i}`;
      cBtn.addEventListener('click', () => setSelectedLine('col', i));
      els.colButtons.appendChild(cBtn);
    }
    renderSelection();
  }

  function resetGame() {
    state.board = makeEmptyBoard();
    state.score = 0;
    state.maxTile = 0;
    state.gameOver = false;
    state.mergedCells = new Set();
    els.status.textContent = '操作: 行/列を選択→方向。キーボード: R/C + 1-5 + 矢印';
    els.status.classList.remove('over');
    spawnOne();
    spawnOne();
    render();
  }

  function handleKeyboard(event) {
    if (state.runningAnimation) return;
    const key = event.key;
    if (key === 'h' || key === 'H') {
      els.helpDialog.showModal();
      return;
    }
    if (key === 'n' || key === 'N') {
      resetGame();
      return;
    }
    if (key === 'r' || key === 'R') {
      state.pendingLineType = 'row';
      els.status.textContent = 'Row選択モード: 1-5 で指定';
      return;
    }
    if (key === 'c' || key === 'C') {
      state.pendingLineType = 'col';
      els.status.textContent = 'Column選択モード: 1-5 で指定';
      return;
    }

    if (/^[1-5]$/.test(key)) {
      setSelectedLine(state.pendingLineType, Number(key) - 1);
      return;
    }

    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      if (state.selectedLine.type !== 'row') setSelectedLine('row', state.selectedLine.index);
      executeTurn('left');
      event.preventDefault();
      return;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      if (state.selectedLine.type !== 'row') setSelectedLine('row', state.selectedLine.index);
      executeTurn('right');
      event.preventDefault();
      return;
    }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      if (state.selectedLine.type !== 'col') setSelectedLine('col', state.selectedLine.index);
      executeTurn('up');
      event.preventDefault();
      return;
    }
    if (key === 'ArrowDown' || key === 's' || key === 'S') {
      if (state.selectedLine.type !== 'col') setSelectedLine('col', state.selectedLine.index);
      executeTurn('down');
      event.preventDefault();
    }
  }

  function attachEvents() {
    document.querySelectorAll('.direction-buttons button').forEach((btn) => {
      btn.addEventListener('click', () => executeTurn(btn.dataset.dir));
    });

    els.newGame.addEventListener('click', resetGame);
    els.help.addEventListener('click', () => els.helpDialog.showModal());
    els.closeHelp.addEventListener('click', () => els.helpDialog.close());
    window.addEventListener('keydown', handleKeyboard);

    els.helpDialog.addEventListener('click', (event) => {
      const rect = els.helpDialog.getBoundingClientRect();
      const inDialog =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inDialog) els.helpDialog.close();
    });

    let start = null;
    els.board.addEventListener('pointerdown', (e) => {
      const rect = els.board.getBoundingClientRect();
      start = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });

    els.board.addEventListener('pointerup', (e) => {
      if (!start) return;
      const rect = els.board.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const dx = endX - start.x;
      const dy = endY - start.y;
      const threshold = 18;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
        start = null;
        return;
      }

      const startCol = Math.max(0, Math.min(SIZE - 1, Math.floor(start.x / (rect.width / SIZE))));
      const startRow = Math.max(0, Math.min(SIZE - 1, Math.floor(start.y / (rect.height / SIZE))));
      const horizontal = Math.abs(dx) > Math.abs(dy);

      if (horizontal) {
        setSelectedLine('row', startRow);
        executeTurn(dx > 0 ? 'right' : 'left');
      } else {
        setSelectedLine('col', startCol);
        executeTurn(dy > 0 ? 'down' : 'up');
      }
      start = null;
    });
  }

  function init() {
    loadStorage();
    createLineButtons();
    attachEvents();
    resetGame();
  }

  function debugMerge(boardInput) {
    const board = cloneBoard(boardInput);
    const result = mergePhase(board);
    return {
      board: result.board,
      gain: result.gain,
      chainCount: result.chainCount,
      mergedCells: Array.from(result.mergedCells),
      mergeEvents: result.mergeEvents,
    };
  }

  window._debug = {
    shiftLine: (type, index, dir, boardInput) => shiftLine(cloneBoard(boardInput), type, index, dir),
    mergePhase: debugMerge,
    spawnValue: pickSpawnValue,
    setBoard: (boardInput) => {
      state.board = cloneBoard(boardInput);
      render();
    },
    getState: () => ({
      board: cloneBoard(state.board),
      score: state.score,
      maxTile: state.maxTile,
      selectedLine: { ...state.selectedLine },
    }),
  };

  init();
})();
