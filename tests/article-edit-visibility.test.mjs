import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../static/js/knowledge-site-v4.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('  function canEditPost('), source.indexOf('  function isAdmin('));
test('only admins or the current non-legacy article owner get an edit affordance', () => {
  let user = null;
  const context = { currentUser: () => user, Number };
  vm.createContext(context); vm.runInContext(fn, context);
  const post = { source: 'knowledge', authorUserId: 2 };
  assert.equal(context.canEditPost(post), false);
  user = { role: 'guest', id: 2 }; assert.equal(context.canEditPost(post), false);
  user = { role: 'user', id: 3 }; assert.equal(context.canEditPost(post), false);
  user = { role: 'user', id: 2 }; assert.equal(context.canEditPost(post), true);
  assert.equal(context.canEditPost({ ...post, source: 'legacy-blog' }), false);
  user = { role: 'admin', id: 1 }; assert.equal(context.canEditPost({ ...post, source: 'legacy-blog' }), true);
});
