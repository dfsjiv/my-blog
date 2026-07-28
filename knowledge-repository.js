(function () {
  const source = window.KnowledgeMockData;
  const i18n = window.KnowledgeI18n;
  if (!source) return;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase();
  }

  function getPosts(filters) {
    const options = filters || {};
    let posts = source.posts.slice();
    if (options.type) posts = posts.filter(function (post) { return post.type === options.type; });
    if (options.category) posts = posts.filter(function (post) { return post.category === options.category; });
    if (options.tag) posts = posts.filter(function (post) { return post.tags.includes(options.tag); });
    return Promise.resolve(clone(posts));
  }

  function getPostBySlug(slug) {
    const post = source.posts.find(function (item) { return item.slug === slug; });
    return Promise.resolve(post ? clone(post) : null);
  }

  function searchPosts(filters) {
    const options = filters || {};
    const keyword = normalize(options.keyword);
    const results = source.posts.filter(function (post) {
      const solution = post.solution || {};
      const haystack = [
        post.title,
        post.summary,
        post.category,
        post.tags.join(' '),
        solution.platform,
        solution.problemId,
        solution.problemTitle,
        solution.difficulty,
        solution.language,
      ].flatMap(function (value) {
        return [
          normalize(value),
          normalize(i18n ? i18n.translate(value, 'en') : value),
        ];
      }).join(' ');

      if (keyword && !haystack.includes(keyword)) return false;
      if (options.type && post.type !== options.type) return false;
      if (options.category && post.category !== options.category) return false;
      if (options.tag && !post.tags.includes(options.tag)) return false;
      if (options.platform && solution.platform !== options.platform) return false;
      if (options.difficulty && solution.difficulty !== options.difficulty) return false;
      if (options.language && solution.language !== options.language) return false;
      return true;
    });
    return Promise.resolve(clone(results));
  }

  function getCategories() {
    return Promise.resolve(clone(source.categories));
  }

  function getTags() {
    return Promise.resolve(clone(source.tags));
  }

  function getArchives() {
    return Promise.resolve(clone(source.archives));
  }

  function getSiteStats() {
    return Promise.resolve(clone(source.stats));
  }

  window.KnowledgeRepository = {
    getPosts,
    getPostBySlug,
    searchPosts,
    getCategories,
    getTags,
    getArchives,
    getSiteStats,
  };
}());
