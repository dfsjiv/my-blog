(function () {
  const API_ROOT = '/api/knowledge';
  const REQUEST_TIMEOUT_MS = 12000;
  const FACETS_CACHE_MS = 30000;
  const DETAIL_CACHE_MS = 30000;
  const facetsCache = { value: null, expiresAt: 0 };
  const detailCache = new Map();

  class KnowledgeApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = 'KnowledgeApiError';
      this.status = status || 0;
      this.code = code || 'REQUEST_FAILED';
    }
  }

  function createRequestSignal(externalSignal) {
    const controller = new AbortController();
    const timeout = window.setTimeout(function () {
      controller.abort(new DOMException('请求超时', 'TimeoutError'));
    }, REQUEST_TIMEOUT_MS);
    const abortFromExternal = function () {
      controller.abort(externalSignal.reason);
    };
    if (externalSignal) {
      if (externalSignal.aborted) abortFromExternal();
      else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
    return {
      signal: controller.signal,
      cleanup: function () {
        window.clearTimeout(timeout);
        if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
      },
    };
  }

  async function apiRequest(path, options) {
    const settings = options || {};
    const requestSignal = createRequestSignal(settings.signal);
    let response;
    try {
      response = await fetch(path, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: requestSignal.signal,
        credentials: 'same-origin',
      });
    } catch (error) {
      if (requestSignal.signal.aborted) throw requestSignal.signal.reason || error;
      throw new KnowledgeApiError('内容暂时无法加载。', 0, 'NETWORK_ERROR');
    } finally {
      requestSignal.cleanup();
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new KnowledgeApiError('服务器返回了无效数据。', response.status, 'INVALID_RESPONSE');
    }
    if (!response.ok || !payload || payload.success !== true) {
      const apiError = payload && payload.error;
      throw new KnowledgeApiError(
        apiError && apiError.message ? apiError.message : '内容暂时无法加载。',
        response.status,
        apiError && apiError.code
      );
    }
    return payload.data;
  }

  function appendParam(params, key, value) {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  }

  function buildPostsQuery(filters) {
    const source = filters || {};
    const params = new URLSearchParams();
    [
      'page',
      'pageSize',
      'type',
      'category',
      'tag',
      'q',
      'sort',
      'featured',
      'pinned',
      'channel',
    ].forEach(function (key) {
      appendParam(params, key, source[key]);
    });
    const query = params.toString();
    return query ? '?' + query : '';
  }

  function adaptTag(tag) {
    if (typeof tag === 'string') return { name: tag, slug: tag };
    return {
      name: tag && typeof tag.name === 'string' ? tag.name : '',
      slug: tag && typeof tag.slug === 'string' ? tag.slug : '',
    };
  }

  function adaptSolution(solution) {
    if (!solution || typeof solution !== 'object') return null;
    return {
      platform: solution.platform || null,
      problemId: solution.problemId || null,
      problemTitle: solution.problemTitle || null,
      problemUrl: solution.problemUrl || null,
      difficulty: solution.difficulty || null,
      algorithms: Array.isArray(solution.algorithms) ? solution.algorithms.filter(Boolean) : [],
      language: solution.language || null,
      timeComplexity: solution.timeComplexity || null,
      spaceComplexity: solution.spaceComplexity || null,
      accepted: typeof solution.accepted === 'boolean' ? solution.accepted : null,
    };
  }

  function adaptPost(post) {
    const source = post && typeof post === 'object' ? post : {};
    return {
      id: Number(source.id) || 0,
      source: typeof source.source === 'string' ? source.source : 'knowledge',
      sourceId: source.sourceId ?? source.id ?? null,
      legacyId: source.legacyId ?? null,
      legacySlug: source.legacySlug ?? null,
      legacyUrl: source.legacyUrl ?? null,
      slug: typeof source.slug === 'string' ? source.slug : '',
      type: typeof source.type === 'string' ? source.type : 'article',
      title: typeof source.title === 'string' ? source.title : '',
      summary: typeof source.summary === 'string' ? source.summary : '',
      contentMarkdown: typeof source.contentMarkdown === 'string' ? source.contentMarkdown : '',
      content: typeof source.content === 'string' ? source.content : '',
      originalContent: typeof source.originalContent === 'string' ? source.originalContent : '',
      contentFormat: typeof source.contentFormat === 'string' ? source.contentFormat : 'markdown',
      coverUrl: source.coverUrl || null,
      category: source.category || null,
      categorySlug: source.categorySlug || null,
      tags: Array.isArray(source.tags) ? source.tags.map(adaptTag).filter(function (tag) {
        return Boolean(tag.name);
      }) : [],
      status: source.status || 'published',
      isPinned: Boolean(source.isPinned),
      isFeatured: Boolean(source.isFeatured),
      sourceUrl: source.sourceUrl || null,
      wordCount: Number(source.wordCount) || 0,
      readingTimeMinutes: Math.max(1, Number(source.readingTimeMinutes) || 1),
      createdAt: source.createdAt || null,
      updatedAt: source.updatedAt || null,
      publishedAt: source.publishedAt || null,
      solution: adaptSolution(source.solutionMeta),
    };
  }

  async function getPosts(filters, options) {
    const data = await apiRequest(API_ROOT + '/posts' + buildPostsQuery(filters), options);
    const pagination = data && data.pagination ? data.pagination : {};
    return {
      items: Array.isArray(data && data.items) ? data.items.map(adaptPost) : [],
      pagination: {
        page: Number(pagination.page) || 1,
        pageSize: Number(pagination.pageSize) || 10,
        total: Number(pagination.total) || 0,
        totalPages: Number(pagination.totalPages) || 0,
        hasPrevious: Boolean(pagination.hasPrevious),
        hasNext: Boolean(pagination.hasNext),
      },
    };
  }

  async function searchPosts(filters, options) {
    return getPosts(filters, options);
  }

  async function getPostBySlug(slug, options) {
    const settings = options || {};
    const key = String(slug || '');
    const cached = detailCache.get(key);
    if (!settings.refresh && cached && cached.expiresAt > Date.now()) return cached.value;
    const data = await apiRequest(
      API_ROOT + '/posts/' + encodeURIComponent(key),
      settings
    );
    const post = adaptPost(data && data.post);
    detailCache.set(key, { value: post, expiresAt: Date.now() + DETAIL_CACHE_MS });
    return post;
  }

  async function getFacets(options) {
    const settings = options || {};
    if (!settings.refresh && facetsCache.value && facetsCache.expiresAt > Date.now()) {
      return facetsCache.value;
    }
    const data = await apiRequest(API_ROOT + '/facets', settings);
    const value = {
      types: Array.isArray(data && data.types) ? data.types : [],
      categories: Array.isArray(data && data.categories) ? data.categories : [],
      tags: Array.isArray(data && data.tags) ? data.tags : [],
      archives: Array.isArray(data && data.archives) ? data.archives : [],
      stats: data && data.stats ? data.stats : {},
    };
    facetsCache.value = value;
    facetsCache.expiresAt = Date.now() + FACETS_CACHE_MS;
    return value;
  }

  async function getArchivePosts(year, month, options) {
    const settings = options || {};
    const target = Number(year) * 100 + Number(month);
    const matches = [];
    let page = 1;
    let shouldContinue = true;
    while (shouldContinue && page <= 20) {
      const result = await getPosts({
        page,
        pageSize: 50,
        sort: 'latest',
      }, settings);
      result.items.forEach(function (post) {
        const date = post.publishedAt ? new Date(post.publishedAt) : null;
        if (!date || Number.isNaN(date.getTime())) return;
        if ((date.getUTCFullYear() * 100 + date.getUTCMonth() + 1) === target) matches.push(post);
      });
      const last = result.items[result.items.length - 1];
      const lastDate = last && last.publishedAt ? new Date(last.publishedAt) : null;
      const lastKey = lastDate && !Number.isNaN(lastDate.getTime())
        ? lastDate.getUTCFullYear() * 100 + lastDate.getUTCMonth() + 1
        : target;
      shouldContinue = result.pagination.hasNext && lastKey >= target;
      page += 1;
    }
    return matches;
  }

  async function getPostContext(post, options) {
    let page = 1;
    const pageSize = 20;
    while (page <= 20) {
      const result = await getPosts({ page, pageSize, sort: 'latest' }, options);
      const index = result.items.findIndex(function (item) { return item.slug === post.slug; });
      if (index !== -1) {
        let previous = result.items[index + 1] || null;
        let next = result.items[index - 1] || null;
        if (!previous && result.pagination.hasNext) {
          const older = await getPosts({ page: page + 1, pageSize, sort: 'latest' }, options);
          previous = older.items[0] || null;
        }
        if (!next && result.pagination.hasPrevious) {
          const newer = await getPosts({ page: page - 1, pageSize, sort: 'latest' }, options);
          next = newer.items[newer.items.length - 1] || null;
        }
        return { previous, next };
      }
      if (!result.pagination.hasNext) break;
      page += 1;
    }
    return { previous: null, next: null };
  }

  async function getRelatedPosts(post, options) {
    const found = new Map();
    async function collect(filters) {
      if (found.size >= 5) return;
      const result = await getPosts(Object.assign({
        page: 1,
        pageSize: 6,
        sort: 'latest',
      }, filters), options);
      result.items.forEach(function (item) {
        if (item.slug !== post.slug && found.size < 5) found.set(item.slug, item);
      });
    }

    if (post.tags[0]) await collect({ tag: post.tags[0].slug });
    if (post.categorySlug) await collect({ category: post.categorySlug });
    await collect({ type: post.type });
    await collect({});
    return Array.from(found.values()).slice(0, 5);
  }

  function clearCache() {
    facetsCache.value = null;
    facetsCache.expiresAt = 0;
    detailCache.clear();
  }

  window.KnowledgeRepository = {
    KnowledgeApiError,
    getPosts,
    getPostBySlug,
    getFacets,
    searchPosts,
    getArchivePosts,
    getPostContext,
    getRelatedPosts,
    clearCache,
  };
}());
