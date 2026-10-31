import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../knowledge-grid-blocks.js', import.meta.url), 'utf8');
const { makeBoard, choosePlacement, fullRows, removeRows } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('autonomous blocks land without overlaps and clear complete rows', () => {
  let board = makeBoard(12, 20);
  let lines = 0;
  for (let i = 0; i < 180; i++) {
    const piece = choosePlacement(board, i % 7);
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

test('clearing rows moves the stack down and leaves new empty rows at the top', () => {
  const board = [[0, 0, 0, 0], [1, 0, 0, 0], [2, 2, 2, 2]];
  assert.deepEqual(removeRows(board, fullRows(board)), [[0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0]]);
});
