const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'knowledge-site.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'knowledge-site.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(root, 'knowledge-data.js'), 'utf8');
const repositorySource = fs.readFileSync(path.join(root, 'knowledge-repository.js'), 'utf8');

assert.match(html, /class="knowledge-site" id="elegantShell"/);
assert.match(html, /Lee Ethan 的知识发布站/);
assert.match(html, /id="knowledgeLatestList"/);
assert.match(html, /id="knowledgeSolutionList"/);
assert.match(html, /id="knowledgeRouteView"/);
assert.match(html, /id="knowledgeAuthorTools" hidden/);
assert.match(html, /<script src="knowledge-data\.js"><\/script>/);
assert.match(html, /<script src="knowledge-repository\.js"><\/script>/);
assert.match(html, /<script src="knowledge-site\.js"><\/script>/);
assert.doesNotMatch(html, /<script src="portal-data\.js"><\/script>/);

assert.match(css, /--knowledge-bg:/);
assert.match(css, /--knowledge-content-width:/);
assert.match(css, /prefers-color-scheme:\s*dark/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /grid-template-columns:\s*240px minmax\(0,\s*1fr\) 270px/);

assert.match(script, /knowledge-site-theme/);
assert.match(script, /knowledge-site-view-mode/);
assert.match(script, /currentUser\.role === 'admin'/);
assert.match(script, /Future write APIs must verify owner\/admin permission on the server/);
assert.match(script, /debounce\(updateResults,\s*260\)/);
assert.match(script, /window\.authUi\.logoutToLogin\(''\)/);
assert.doesNotMatch(script, /innerHTML/);
assert.doesNotMatch(script, /fetch\(/);
assert.doesNotMatch(script, /\beval\(/);
assert.doesNotMatch(script, /new Function/);

const context = { window: {} };
vm.createContext(context);
vm.runInContext(dataSource, context);
vm.runInContext(repositorySource, context);

const data = context.window.KnowledgeMockData;
const repository = context.window.KnowledgeRepository;
assert.equal(data.author.name, 'Lee Ethan');
assert.equal(data.posts.length, 6);
assert.deepEqual(
  Array.from(data.posts, (post) => post.type),
  ['article', 'article', 'solution', 'solution', 'note', 'project']
);
assert.ok(data.posts.every((post) => post.placeholder === true));
assert.ok(data.posts.filter((post) => post.type === 'solution').every((post) => post.solution));

(async function () {
  const solutions = await repository.getPosts({ type: 'solution' });
  const search = await repository.searchPosts({ keyword: 'C++' });
  assert.equal(solutions.length, 2);
  assert.ok(search.length >= 2);
  console.log('knowledge site tests passed');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
