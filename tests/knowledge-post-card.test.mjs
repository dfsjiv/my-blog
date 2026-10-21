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
test('featured posts use the shared renderer and retain every saved appearance, cover and metadata', () => {
  const source = fs.readFileSync(new URL('../knowledge-site-v4.js', import.meta.url), 'utf8');
  const factories = source.slice(source.indexOf('  function makeContentCard(post)'), source.indexOf('  function makeSolutionCard(post)'));
  const context = { window: {}, document: { createElement: t => new Node(t), createElementNS: (_, t) => new Node(t) },
    t: x => x, typeLabel: () => '文章', formatDate: x => x || '', coverNode: () => new Node('cover'), appendTags() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../knowledge-post-card.js', import.meta.url), 'utf8') + '\n' + factories, context);
  for (const appearance of ['default', 'vinyl', 'collage', 'mecha', 'island', 'holo', 'spider', 'armor', 'hand']) {
    const card = context.makeFeaturedCard({ slug: 'featured', title: '精选文章', author: '作者', appearance,
      isFeatured: true, tags: [], publishedAt: '2026-10-21', wordCount: 1234, readingTimeMinutes: 4 });
    assert.equal(card.dataset.postAppearance, appearance);
    assert.equal(card.dataset.postSlug, 'featured');
    assert.equal(card.attrs.role, 'button');
    assert.ok(card.className.includes('knowledge-post-card'));
    assert.ok(!card.className.includes('knowledge-featured-card'));
    const nodes = walk(card);
    for (const text of ['精选', '2026-10-21', '作者', '4 分钟', '1,234 字']) assert.ok(nodes.some(n => n.textContent === text), text);
    assert.ok(nodes.some(n => n.tag === 'cover'));
  }
});
test('all optional card styles keep safe real post content and unknown styles fall back', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(new URL('../knowledge-post-card.js', import.meta.url), 'utf8'), {
    window, document: { createElement: t => new Node(t), createElementNS: (_, t) => new Node(t) },
  });
  for (const appearance of ['default', 'vinyl', 'collage', 'mecha', 'island', 'holo', 'spider', 'armor', 'hand', '<script>unknown</script>']) {
    const card = window.KnowledgePostCard.render({ title: '<img onerror=alert(1)>', slug: 'post', author: 'name', appearance, tags: [] }, {
      t: x => x, typeLabel: () => '文章', formatDate: () => '', coverNode: () => new Node('cover'), appendTags() {},
    });
    assert.equal(card.dataset.postAppearance, appearance.startsWith('<') ? 'default' : appearance);
    assert.ok(walk(card).some(n => n.textContent === '<img onerror=alert(1)>'));
    assert.ok(walk(card).some(n => n.className === 'knowledge-post-footer'));
    if (appearance === 'hand') {
      assert.equal(card.children.length, 4);
      assert.deepEqual(card.children.map(n => n.dataset.handIndex), ['1','2','3','4']);
      assert.equal(walk(card).filter(n => n.textContent === '<img onerror=alert(1)>').length, 1);
    }
    if (appearance === 'armor') {
      const ghosts = walk(card).filter(n => n.className.includes('knowledge-post-armor-ghost'));
      assert.equal(ghosts.length, 3);
      assert.ok(ghosts.every(n => n.attrs['aria-hidden'] === 'true'));
    }
  }
});
test('optional author identity failure does not revert the reference layout', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(new URL('../knowledge-post-card.js', import.meta.url), 'utf8'), {
    window, console: { warn() {} },
    document: { createElement: t => new Node(t), createElementNS: (_, t) => new Node(t) },
  });
  const card = window.KnowledgePostCard.render({ title: 'Test', slug: 'test', author: 'admin', tags: [] }, {
    t: x => x, typeLabel: () => '文章', formatDate: () => '', coverNode: () => new Node('cover'),
    appendTags() {}, identity() { throw new Error('profile unavailable'); },
  });
  assert.ok(card.className.includes('knowledge-post-card'));
  assert.ok(walk(card).some(n => n.textContent === 'admin'));
  assert.ok(walk(card).some(n => n.className === 'knowledge-post-footer'));
});

test('deployed entry includes the card renderer before its homepage consumer', () => {
  const bundle = fs.readFileSync(new URL('../assets/vendor/knowledge/site.bundle.js', import.meta.url), 'utf8');
  assert.ok(bundle.indexOf('KnowledgePostCard={render:') >= 0);
  assert.ok(bundle.indexOf('KnowledgePostCard={render:') < bundle.indexOf('KnowledgePostCard.render('));
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('assets/vendor/knowledge/site.bundle.js?v='));
  assert.ok(!html.includes('<script src="knowledge-post-card.js'));
  assert.ok(!html.includes('<script src="knowledge-site-v4.js'));
});
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

test('real homepage card factory keeps article data visible if the cosmetic module is missing or throws', () => {
  const source = fs.readFileSync(new URL('../knowledge-site-v4.js', import.meta.url), 'utf8');
  const factory = source.slice(source.indexOf('  function makeContentCard(post)'), source.indexOf('  function makeFeaturedCard(post)'));
  const element = (tag, cls, text) => { const n = new Node(tag); n.className = cls; n.textContent = text || ''; return n; };
  const options = { console: { error() {} }, element, contentElement: element, t: x => x,
    typeLabel: () => '文章', formatDate: x => x || '', coverNode: () => new Node('cover'), appendTags() {},
    appendIf: (root, label, value) => { if (value) root.append(element('span', '', label + value)); } };
  for (const module of [undefined, { render() { throw new Error('render failed'); } }]) {
    const context = { ...options, window: { KnowledgePostCard: module } };
    vm.runInNewContext(factory + ';globalThis.make = makeContentCard;', context);
    const card = context.make({ slug: 'kept', title: '不能消失的文章', author: 'author', tags: [] });
    assert.equal(card.dataset.postSlug, 'kept');
    assert.ok(walk(card).some(n => n.textContent === '不能消失的文章'));
  }
});
