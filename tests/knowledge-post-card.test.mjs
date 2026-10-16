import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.textContent = ''; this.className = ''; this.classList = { add: c => { this.className += ' ' + c; } }; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(k, v) { this.attrs[k] = v; }
  get childElementCount() { return this.children.length; }
}
const walk = n => [n, ...n.children.flatMap(walk)];
test('reference article card separates date, title, summary/tags and author/read footer without duplicating title as category', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(new URL('../knowledge-post-card.js', import.meta.url), 'utf8'), { window,
    document: { createElement: t => new Node(t), createElementNS: (_, t) => new Node(t) } });
  const title = '暑假集训内部赛29(个人赛)10.13';
  const card = window.KnowledgePostCard.render({ title, slug: 'contest-29', type: 'solution', category: title,
    author: 'account', authorUserId: 7, tags: ['数学'], summary: '<script>纯文本</script>', publishedAt: '2026-10-12', updatedAt: '2026-10-13', readingTimeMinutes: 8, wordCount: 2527 }, {
    t: x => x, typeLabel: () => '算法题解', formatDate: x => x || '', coverNode: () => new Node('cover'),
    appendTags: (node, tags) => tags.forEach(tag => { const n = new Node('span'); n.textContent = tag; node.append(n); }),
    identity: () => new Node('identity') });
  const nodes = walk(card);
  assert.equal(card.dataset.postSlug, 'contest-29'); assert.equal(card.attrs.role, 'button');
  assert.equal(nodes.filter(n => n.textContent === title).length, 1);
  assert.ok(nodes.some(n => n.className === 'knowledge-post-eyebrow'));
  assert.ok(nodes.some(n => n.className === 'knowledge-post-footer'));
  assert.ok(nodes.some(n => n.textContent === '#29' && n.attrs['aria-hidden'] === 'true'));
  assert.ok(nodes.some(n => n.textContent === '<script>纯文本</script>'));
  assert.equal(card.children[1].className.includes('knowledge-post-cover'), true);
});
