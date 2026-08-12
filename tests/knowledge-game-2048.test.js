const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'knowledge-game-2048.js'), 'utf8');
const storage = new Map();
const context = {
  window: {
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
    },
  },
  document: {},
};
vm.runInNewContext(source, context);

const { Game2048Engine, mergeLine } = context.window.KnowledgeGame2048;
assert.deepEqual(
  JSON.parse(JSON.stringify(mergeLine([2, 2, 2, 2]))),
  { values: [4, 4, 0, 0], score: 8 }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(mergeLine([2, 2, 4, 0]))),
  { values: [4, 4, 0, 0], score: 4 }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(mergeLine([4, 4, 4, 0]))),
  { values: [8, 4, 0, 0], score: 8 }
);

const engine = new Game2048Engine(() => 0);
engine.board = [
  [2, 2, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];
assert.equal(engine.move('left'), true);
assert.equal(engine.board[0][0], 4);
assert.equal(engine.score, 4);
assert.equal(engine.board.flat().filter(Boolean).length, 2);

engine.board = [
  [2, 4, 2, 4],
  [4, 2, 4, 2],
  [2, 4, 2, 4],
  [4, 2, 4, 2],
];
assert.equal(engine.canMove(), false);
assert.equal(engine.move('left'), false);
assert.equal(engine.over, true);

console.log('knowledge 2048 tests passed');
