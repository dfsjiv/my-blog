const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'knowledge-site.css'), 'utf8');
const site = fs.readFileSync(path.join(root, 'knowledge-site.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'knowledge-data.js'), 'utf8');
const repository = fs.readFileSync(path.join(root, 'knowledge-repository.js'), 'utf8');
const markdown = fs.readFileSync(path.join(root, 'knowledge-markdown.js'), 'utf8');

assert.match(html, /class="knowledge-site" id="elegantShell"/);
assert.match(html, /id="knowledgeLatestList"/);
assert.match(html, /id="knowledgeSolutionList"/);
assert.match(html, /id="knowledgeRouteView"/);
assert.match(html, /id="knowledgeAuthorTools" hidden/);
assert.match(html, /assets\/vendor\/knowledge\/marked\.umd\.js/);
assert.match(html, /assets\/vendor\/knowledge\/purify\.min\.js/);
assert.match(html, /knowledge-markdown\.js/);
assert.ok(
  html.indexOf('marked.umd.js') < html.indexOf('knowledge-markdown.js')
  && html.indexOf('purify.min.js') < html.indexOf('knowledge-markdown.js')
);

assert.match(css, /--knowledge-bg:/);
assert.match(css, /knowledge-loading-state/);
assert.match(css, /knowledge-pagination/);
assert.match(css, /knowledge-code-toolbar/);
assert.match(css, /knowledge-toc button\.is-active/);
assert.match(css, /max-width:\s*920px/);
assert.match(css, /overflow-x:\s*auto/);
assert.match(css, /prefers-color-scheme:\s*dark/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);

assert.match(data, /placeholder:\s*true/);
assert.doesNotMatch(html, /knowledge-data\.js/);
assert.doesNotMatch(repository, /KnowledgeMockData/);
assert.doesNotMatch(repository, /source\.posts/);
assert.match(repository, /const API_ROOT = '\/api\/knowledge'/);
assert.match(repository, /REQUEST_TIMEOUT_MS = 12000/);
assert.match(repository, /AbortController/);
assert.match(repository, /getPosts/);
assert.match(repository, /getPostBySlug/);
assert.match(repository, /getFacets/);
assert.match(repository, /getRelatedPosts/);
assert.match(repository, /getPostContext/);

assert.match(site, /knowledge-site-theme/);
assert.match(site, /knowledge-site-language/);
assert.match(site, /window\.history\[method\]/);
assert.match(site, /window\.addEventListener\('popstate'/);
assert.match(site, /URLSearchParams\(window\.location\.search\)/);
assert.match(site, /knowledge', 'post'/);
assert.match(site, /repository\.getPosts/);
assert.match(site, /repository\.getFacets/);
assert.match(site, /repository\.getPostBySlug/);
assert.match(site, /repository\.getRelatedPosts/);
assert.match(site, /repository\.getPostContext/);
assert.match(site, /currentUser\(\)\.role === 'admin'/);
assert.match(site, /debounce\(function \(\) \{[\s\S]*\}, 380\)/);
assert.doesNotMatch(site, /data\.posts/);
assert.doesNotMatch(site, /演示内容/);
assert.doesNotMatch(site, /innerHTML/);
assert.doesNotMatch(site, /\beval\(/);
assert.doesNotMatch(site, /new Function/);

assert.match(markdown, /markedApi\.parse/);
assert.match(markdown, /purifier\.sanitize/);
assert.match(markdown, /RETURN_DOM_FRAGMENT:\s*true/);
assert.match(markdown, /FORBID_TAGS:[\s\S]*'script'[\s\S]*'iframe'[\s\S]*'object'[\s\S]*'embed'/);
assert.match(markdown, /FORBID_ATTR:\s*\['style'\]/);
assert.match(markdown, /noopener noreferrer/);
assert.match(markdown, /loading = 'lazy'/);
assert.match(markdown, /navigator\.clipboard\.writeText/);
assert.match(markdown, /querySelectorAll\('h2, h3, h4'\)/);
assert.doesNotMatch(markdown, /\beval\(/);
assert.doesNotMatch(markdown, /new Function/);

['marked.umd.js', 'purify.min.js', 'marked.LICENSE', 'dompurify.LICENSE'].forEach((file) => {
  assert.equal(
    fs.existsSync(path.join(root, 'assets', 'vendor', 'knowledge', file)),
    true,
    `${file} should be vendored locally`
  );
});

console.log('knowledge site tests passed');
