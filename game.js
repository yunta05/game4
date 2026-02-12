(() => {
  const SIZE = 5;
  const STORAGE_KEY = 'line-fixed-puzzle-v1';

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
    turn: 0,
    selectedLine: { type: 'row', index: 2 },
    gameOver: false,
    mergeMultiplierLabel: 'k回目の合成: 生成値 × (k+1)',
    shiftedCells: new Set(),
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
    return true;
  }

  function shiftLine(type, index, dir) {
    const next = cloneBoard(state.board);
    const shifted = new Set();
    if (type === 'row') {
      const row = state.board[index];
      if (dir === 'left') {
        for (let c = 0; c < SIZE - 1; c += 1) {
          next[index][c] = row[c + 1];
          shifted.add(`${index},${c}`);
        }
        next[index][SIZE - 1] = 0;
      } else if (dir === 'right') {
        for (let c = SIZE - 1; c > 0; c -= 1) {
          next[index][c] = row[c - 1];
          shifted.add(`${index},${c}`);
        }
        next[index][0] = 0;
      } else {
        return null;
      }
    } else {
      if (dir === 'up') {
        for (let r = 0; r < SIZE - 1; r += 1) {
          next[r][index] = state.board[r + 1][index];
          shifted.add(`${r},${index}`);
        }
        next[SIZE - 1][index] = 0;
      } else if (dir === 'down') {
        for (let r = SIZE - 1; r > 0; r -= 1) {
          next[r][index] = state.board[r - 1][index];
          shifted.add(`${r},${index}`);
        }
        next[0][index] = 0;
      } else {
        return null;
      }
    }
    return { board: next, shifted };
  }

  function mergePhase(board) {
    let chain = 0;
    let totalGain = 0;
    const mergedCells = new Set();

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
        totalGain += op.value * multiplier;
        mergedCells.add(`${toR},${toC}`);
        state.maxTile = Math.max(state.maxTile, op.value);
      }
    }

    return { board, chainCount: chain, gain: totalGain, mergedCells };
  }

  function canMove() {
    return listEmpties().length > 0;
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

  function executeTurn(dir) {
    if (state.gameOver) return;
    const { type, index } = state.selectedLine;
    const shiftResult = shiftLine(type, index, dir);
    if (!shiftResult) return;

    state.board = shiftResult.board;
    state.shiftedCells = shiftResult.shifted;

    const merged = mergePhase(state.board);
    state.mergedCells = merged.mergedCells;
    state.score += merged.gain;

    const spawned = spawnOne();
    state.turn += 1;

    if (!spawned && !canMove()) {
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
  }

  function setSelectedLine(type, index) {
    state.selectedLine = { type, index };
    renderSelection();
  }

  function renderSelection() {
    document.querySelectorAll('[data-line]').forEach((btn) => btn.classList.remove('active'));
    const key = `${state.selectedLine.type}:${state.selectedLine.index}`;
    const target = document.querySelector(`[data-line='${key}']`);
    if (target) target.classList.add('active');
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
        }
        const key = `${r},${c}`;
        if (state.shiftedCells.has(key)) cell.classList.add('shifted');
        if (state.mergedCells.has(key)) {
          cell.classList.add('merged');
          spawnFloatingScore(r, c, value);
        }
        els.board.appendChild(cell);
      }
    }

    els.score.textContent = String(state.score);
    els.bestScore.textContent = String(state.bestScore);
    els.maxTile.textContent = String(state.maxTile);
    els.bestTile.textContent = String(state.bestTile);
  }

  function spawnFloatingScore(r, c, value) {
    const marker = document.createElement('span');
    marker.className = 'float-score';
    marker.textContent = `+${value}`;
    const cellW = els.board.clientWidth / SIZE;
    marker.style.left = `${c * cellW + cellW * 0.36}px`;
    marker.style.top = `${r * cellW + cellW * 0.24}px`;
    els.floating.appendChild(marker);
    marker.addEventListener('animationend', () => marker.remove());
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
    state.turn = 0;
    state.gameOver = false;
    state.shiftedCells = new Set();
    state.mergedCells = new Set();
    els.status.textContent = ' '; 
    els.status.classList.remove('over');
    spawnOne();
    spawnOne();
    render();
  }

  function attachEvents() {
    document.querySelectorAll('.direction-buttons button').forEach((btn) => {
      btn.addEventListener('click', () => executeTurn(btn.dataset.dir));
    });

    els.newGame.addEventListener('click', resetGame);
    els.help.addEventListener('click', () => els.helpDialog.showModal());
    els.closeHelp.addEventListener('click', () => els.helpDialog.close());
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
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      start = { x, y };
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
        if (state.selectedLine.type !== 'row') setSelectedLine('row', startRow);
        executeTurn(dx > 0 ? 'right' : 'left');
      } else {
        if (state.selectedLine.type !== 'col') setSelectedLine('col', startCol);
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
    };
  }

  window._debug = {
    shiftLine: (type, index, dir, boardInput) => {
      const backup = state.board;
      state.board = cloneBoard(boardInput);
      const out = shiftLine(type, index, dir);
      state.board = backup;
      return out;
    },
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
