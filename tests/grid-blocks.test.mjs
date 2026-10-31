import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../knowledge-grid-blocks.js', import.meta.url), 'utf8');
const { makeBoard, choosePlacement, fullRows, removeRows } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function seededRandom(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('autonomous blocks land without overlaps and clear complete rows', () => {
  let board = makeBoard(12, 20);
  let lines = 0;
  const random = seededRandom(42);
  for (let i = 0; i < 180; i++) {
    const piece = choosePlacement(board, i % 7, random);
    assert.ok(piece, 'board should remain playable');
    piece.shape.forEach(([dx, dy]) => {
      assert.equal(board[piece.y + dy][piece.x + dx], 0);
      board[piece.y + dy][piece.x + dx] = piece.color;
    });
    const rows = fullRows(board);
    lines += rows.length;
    board = removeRows(board, rows);
    assert.equal(board.length, 20);
    assert.ok(board.every(row => row.length === 12));
  }
  assert.ok(lines > 20, 'the animation must actually clear rows');
});

test('landing targets spread across the board including its middle', () => {
  const random = seededRandom(123);
  const regions = [0, 0, 0];
  for (let i = 0; i < 120; i++) {
    const piece = choosePlacement(makeBoard(36, 20), 1, random);
    regions[Math.min(2, Math.floor((piece.x + 0.5) / 12))]++;
  }
  assert.ok(regions.every(count => count >= 25), 'left, middle and right should all receive regular landings');
});

test('clearing rows moves the stack down and leaves new empty rows at the top', () => {
  const board = [[0, 0, 0, 0], [1, 0, 0, 0], [2, 2, 2, 2]];
  assert.deepEqual(removeRows(board, fullRows(board)), [[0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0]]);
});
