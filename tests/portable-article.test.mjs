import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../knowledge-portable.js', import.meta.url), 'utf8');
const window = { location: { origin: 'https://lilinzheng.top' } };
vm.runInNewContext(source, { window, URL, TextEncoder, Date, Set, Number, JSON });
const portable = window.KnowledgePortable;
const post = {
  title: '题解: "数组"\n下一行', category: '算法题解', contentMarkdown: '# Heading\n\n<div align="center">居中</div>\n\n```cpp\nint main() {}\n```\n',
  type: 'solution', tags: ['二分', { name: '数学' }], appearance: 'spider',
  coverUrl: '/images/cover.webp', sourceUrl: 'javascript:alert(1)',
  isFeatured: true, isPinned: true, status: 'published', id: 9, version: 17, authorUserId: 1, password: 'SECRET', token: 'TOKEN',
  solutionMeta: { platform: 'CF', problemId: '123A', problemUrl: 'https://codeforces.com/problemset/problem/123/A' },
};

test('portable article backups preserve body, appearance and metadata but never authority fields or credentials', () => {
  const backup = portable.toBackup(post);
  assert.doesNotMatch(backup, /SECRET|TOKEN|isFeatured|isPinned|authorUserId|"id"|"status"/);
  const restored = portable.fromBackup(backup);
  assert.equal(restored.contentMarkdown, post.contentMarkdown);
  assert.equal(restored.title, post.title);
  assert.equal(restored.appearance, 'spider');
  assert.equal(restored.solutionMeta.problemId, '123A');
  assert.equal(restored.coverUrl, 'https://lilinzheng.top/images/cover.webp');
  assert.equal(restored.sourceUrl, '');
  assert.deepEqual(Array.from(restored.tags), ['二分', '数学']);
});

test('Markdown exports use quoted frontmatter and keep code, alignment and trailing newlines intact', () => {
  const value = portable.toMarkdown(post);
  assert.ok(value.startsWith('---\ntitle: ' + JSON.stringify(post.title) + '\n'));
  assert.ok(value.endsWith(post.contentMarkdown));
  assert.ok(value.includes('tags: ["二分","数学"]'));
  const imported = portable.parseMarkdown(value);
  assert.equal(imported.markdown, post.contentMarkdown);
  assert.equal(imported.title, post.title);
  assert.equal(imported.settings.category, post.category);
  assert.equal(imported.settings.appearance, post.appearance);
  const generalYaml = '---\ntitle: |\n  Do not guess YAML\n---\n\nBody';
  assert.equal(portable.parseMarkdown(generalYaml).markdown, generalYaml);
});

test('backup imports validate format, size and text before replacing work', () => {
  assert.throws(() => portable.fromBackup('bad'), /JSON/);
  assert.throws(() => portable.fromBackup('{"post":{}}'), /备份/);
  assert.throws(() => portable.fromBackup(portable.toBackup(post), 5), /大小/);
  const unsafe = JSON.parse(portable.toBackup(post));
  unsafe.post.coverUrl = 'https://name:secret@example.com/image';
  unsafe.post.appearance = 'unknown'; unsafe.post.isFeatured = true;
  const restored = portable.fromBackup(JSON.stringify(unsafe));
  assert.equal(restored.coverUrl, ''); assert.equal(restored.appearance, 'default');
  assert.equal('isFeatured' in restored, false);
});

test('local drafts use distinct account/new/existing-post keys and filenames remain valid on Windows', () => {
  assert.notEqual(portable.draftKey(1, null), portable.draftKey(2, null));
  assert.notEqual(portable.draftKey(1, 9), portable.draftKey(1, 10));
  assert.notEqual(portable.draftKey(1, null), 'knowledge-writer-draft:v1:new');
  assert.throws(() => portable.draftKey(0)); assert.throws(() => portable.draftKey('abc'));
  assert.equal(portable.filename('CON', '.md'), 'article-CON.md');
  assert.doesNotMatch(portable.filename('../foo:bar?*', '.article.json'), /[/:?*]/);
});
