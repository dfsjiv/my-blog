const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'knowledge-repository.js'),
  'utf8'
);
const requests = [];
const post = {
  id: 7,
  slug: 'binary-search',
  type: 'solution',
  title: '二分查找',
  summary: '摘要',
  contentMarkdown: '# 正文',
  coverUrl: null,
  category: '算法题解',
  categorySlug: '算法题解',
  tags: [{ name: '二分', slug: '二分' }],
  status: 'published',
  isPinned: true,
  isFeatured: true,
  sourceUrl: null,
  wordCount: 120,
  readingTimeMinutes: 2,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
  publishedAt: '2026-07-01T00:00:00.000Z',
  solutionMeta: {
    platform: 'Codeforces',
    problemId: '1A',
    problemTitle: 'Theatre Square',
    algorithms: ['数学'],
    accepted: true,
  },
};

function response(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

const context = {
  AbortController,
  DOMException,
  URL,
  URLSearchParams,
  console,
  fetch(url, options) {
    requests.push({ url, options });
    if (url === '/api/knowledge/facets') {
      return response({
        success: true,
        data: {
          types: [{ type: 'solution', count: 1 }],
          categories: [{ name: '算法题解', slug: '算法题解', count: 1 }],
          tags: [{ name: '二分', slug: '二分', count: 1 }],
          archives: [{ year: 2026, month: 7, count: 1 }],
          stats: { posts: 1, solutions: 1, words: 120 },
        },
      });
    }
    if (url === '/api/knowledge/posts/binary-search') {
      return response({ success: true, data: { post } });
    }
    return response({
      success: true,
      data: {
        items: [post],
        pagination: {
          page: 2,
          pageSize: 10,
          total: 11,
          totalPages: 2,
          hasPrevious: true,
          hasNext: false,
        },
      },
    });
  },
};
context.window = {
  setTimeout,
  clearTimeout,
};
vm.createContext(context);
vm.runInContext(source, context);

(async function run() {
  const repository = context.window.KnowledgeRepository;
  const result = await repository.getPosts({
    page: 2,
    pageSize: 10,
    type: 'solution',
    q: '二分',
    pinned: true,
  });
  assert.match(
    requests[0].url,
    /^\/api\/knowledge\/posts\?/
  );
  const query = new URL(requests[0].url, 'https://example.test').searchParams;
  assert.equal(query.get('page'), '2');
  assert.equal(query.get('type'), 'solution');
  assert.equal(query.get('q'), '二分');
  assert.equal(query.get('pinned'), 'true');
  assert.equal(result.pagination.total, 11);
  assert.equal(result.items[0].solution.platform, 'Codeforces');
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.items[0].tags)),
    [{ name: '二分', slug: '二分' }]
  );

  const facetsA = await repository.getFacets();
  const facetsB = await repository.getFacets();
  assert.equal(facetsA.stats.posts, 1);
  assert.strictEqual(facetsA, facetsB);
  assert.equal(
    requests.filter((request) => request.url === '/api/knowledge/facets').length,
    1
  );

  const detailA = await repository.getPostBySlug('binary-search');
  const detailB = await repository.getPostBySlug('binary-search');
  assert.equal(detailA.contentMarkdown, '# 正文');
  assert.strictEqual(detailA, detailB);
  assert.equal(
    requests.filter((request) => request.url === '/api/knowledge/posts/binary-search').length,
    1
  );
  assert.equal(requests.every((request) => request.options.signal), true);
  console.log('knowledge repository tests passed');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
