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
const mover = fs.readFileSync(path.join(root, 'knowledge-article-mover.js'), 'utf8');
const moverCss = fs.readFileSync(path.join(root, 'knowledge-article-mover.css'), 'utf8');
const writer = fs.readFileSync(path.join(root, 'knowledge-writer.js'), 'utf8');
const writerCss = fs.readFileSync(path.join(root, 'knowledge-writer.css'), 'utf8');
const editorAdapter = fs.readFileSync(path.join(root, 'knowledge-editor-adapter.js'), 'utf8');

assert.match(html, /class="knowledge-site" id="elegantShell"/);
assert.match(html, /id="knowledgeLatestList"/);
assert.match(html, /id="knowledgeSolutionList"/);
assert.match(html, /id="knowledgeRouteView"/);
assert.match(html, /id="knowledgeAuthorTools" hidden/);
assert.match(html, /data-knowledge-route="mover">文章搬家/);
assert.match(html, /knowledge-article-mover\.css/);
assert.match(html, /knowledge-article-mover\.js/);
assert.match(html, /data-knowledge-nav-menu="links"/);
assert.match(html, /data-knowledge-nav-menu="about"/);
assert.match(html, /aria-haspopup="menu"/);
assert.match(html, /id="knowledgeLinkMenu" role="menu" hidden/);
assert.match(html, /id="knowledgeAboutMenu" role="menu" hidden/);
assert.match(html, /data-social-link="bilibili" role="menuitem" target="_blank" rel="noopener noreferrer"/);
assert.match(html, /data-social-link="github" role="menuitem" target="_blank" rel="noopener noreferrer"/);
assert.match(html, /data-social-link="zhihu" role="menuitem" target="_blank" rel="noopener noreferrer"/);
assert.match(html, /data-social-link="nowcoder" role="menuitem" target="_blank" rel="noopener noreferrer"/);
assert.match(html, /data-knowledge-route="articles">技术文章/);
assert.match(html, /data-about-link="games" role="menuitem"/);
assert.match(html, /data-about-link="anime" role="menuitem"/);
assert.match(html, /data-about-link="manga" role="menuitem"/);
assert.match(html, /data-about-link="novels" role="menuitem"/);
assert.match(html, /assets\/vendor\/knowledge\/marked\.umd\.js/);
assert.match(html, /assets\/vendor\/knowledge\/purify\.min\.js/);
assert.match(html, /knowledge-markdown\.js/);
assert.match(html, /knowledge-writer\.css/);
assert.match(html, /assets\/vendor\/knowledge-editor\/tiptap\.bundle\.js/);
assert.match(html, /knowledge-editor-adapter\.js/);
assert.match(html, /knowledge-writer\.js/);
assert.ok(
  html.indexOf('marked.umd.js') < html.indexOf('knowledge-markdown.js')
  && html.indexOf('purify.min.js') < html.indexOf('knowledge-markdown.js')
);
assert.ok(
  html.indexOf('tiptap.bundle.js') < html.indexOf('knowledge-editor-adapter.js')
  && html.indexOf('knowledge-editor-adapter.js') < html.indexOf('knowledge-writer.js')
  && html.indexOf('knowledge-writer.js') < html.indexOf('knowledge-site.js')
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
assert.match(css, /\.knowledge-nav-submenu/);
assert.match(css, /\.knowledge-nav-menu\.is-open/);
assert.match(css, /max-height:\s*calc\(100vh - 92px\)/);

assert.match(data, /placeholder:\s*true/);
assert.match(html, /knowledge-data\.js/);
assert.ok(html.indexOf('knowledge-data.js') < html.indexOf('knowledge-site.js'));
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
assert.match(repository, /getAdminPost/);
assert.match(repository, /createPost/);
assert.match(repository, /updatePost/);

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
assert.match(site, /renderArticleMover/);
assert.match(site, /renderWriter/);
assert.match(site, /window\.KnowledgeWriter/);
assert.match(site, /knowledge-writing-mode/);
assert.match(site, /window\.KnowledgeArticleMover/);
assert.match(site, /bilibili:\s*'https:\/\/space\.bilibili\.com\/3546789605018414'/);
assert.match(site, /github:\s*'https:\/\/github\.com\/dfsjiv'/);
assert.match(site, /zhihu:\s*'https:\/\/www\.zhihu\.com\/people\/study-32-31'/);
assert.match(site, /nowcoder:\s*'https:\/\/www\.nowcoder\.com\/users\/412412995'/);
assert.match(site, /aboutLinks:\s*Object\.freeze\(\{[\s\S]*games:\s*'games'[\s\S]*anime:\s*'anime'[\s\S]*manga:\s*'manga'[\s\S]*novels:\s*'novels'/);
assert.match(site, /channelEmptyTitle/);
assert.match(repository, /'channel'/);
assert.match(site, /event\.key !== 'Escape'/);
assert.match(site, /closeNavMenus\(name\)/);
assert.match(site, /debounce\(function \(\) \{[\s\S]*\}, 380\)/);
assert.match(site, /renderAdminPosts\(route, details, controller\)/);
assert.match(site, /repository\.getAdminPosts/);
assert.match(site, /repository\.changePostState/);
assert.match(site, /repository\.deletePost/);
assert.match(site, /function makeShareLink/);
assert.match(site, /navigator\.clipboard\.writeText/);
assert.doesNotMatch(site, /草稿箱功能待接入|文章管理功能待接入/);
assert.doesNotMatch(site, /data\.posts/);
assert.doesNotMatch(site, /演示内容/);
assert.doesNotMatch(site, /innerHTML/);
assert.doesNotMatch(site, /\beval\(/);
assert.doesNotMatch(site, /new Function/);

assert.match(markdown, /markedApi\.parse/);
assert.match(markdown, /function renderHtml/);
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
assert.match(mover, /\/api\/knowledge\/admin\/article-mover\/preview/);
assert.match(mover, /\/api\/knowledge\/admin\/article-mover\/import/);
assert.match(mover, /Authorization:\s*'Bearer '/);
assert.match(mover, /KnowledgeMarkdown\.render/);
assert.doesNotMatch(mover, /\binnerHTML\b/);
assert.doesNotMatch(mover, /\beval\(/);
assert.match(moverCss, /\.knowledge-mover/);
assert.match(repository, /\/admin\/posts/);
assert.match(repository, /function getAdminPosts/);
assert.match(repository, /function changePostState/);
assert.match(repository, /function deletePost/);
assert.match(writer, /knowledge-writer-draft:v1:/);
assert.match(writer, /AUTO_SAVE_DELAY = 1500/);
assert.match(writer, /editorDocumentToMarkdown/);
assert.match(writer, /getAdminPost/);
assert.match(writer, /createPost/);
assert.match(writer, /updatePost/);
assert.match(writer, /正在保存|正在加载/);
assert.match(writer, /检测到未保存的本地草稿/);
assert.match(writer, /图片上传功能将在下一阶段接入/);
assert.match(editorAdapter, /contentType:\s*'markdown'/);
assert.match(editorAdapter, /DOMPurify/);
assert.match(editorAdapter, /transformPastedHTML/);
assert.match(editorAdapter, /FORBID_TAGS/);
assert.match(editorAdapter, /protocols:\s*\['http', 'https', 'mailto'\]/);
assert.doesNotMatch(writer, /\binnerHTML\b/);
assert.doesNotMatch(writer, /\bcontenteditable\b/i);
assert.doesNotMatch(writer, /\beval\(/);
assert.doesNotMatch(writer, /new Function/);
assert.doesNotMatch(editorAdapter, /\beval\(/);
assert.doesNotMatch(editorAdapter, /new Function/);
assert.match(writerCss, /\.knowledge-writer-page/);
assert.match(writerCss, /\.knowledge-tiptap-editor/);
assert.match(writerCss, /\.knowledge-writer-slash-menu/);
assert.match(writerCss, /\.knowledge-writer-bubble/);
assert.match(writerCss, /@media \(max-width:\s*768px\)/);

['marked.umd.js', 'purify.min.js', 'marked.LICENSE', 'dompurify.LICENSE'].forEach((file) => {
  assert.equal(
    fs.existsSync(path.join(root, 'assets', 'vendor', 'knowledge', file)),
    true,
    `${file} should be vendored locally`
  );
});
assert.equal(
  fs.existsSync(path.join(root, 'assets', 'vendor', 'knowledge-editor', 'tiptap.bundle.js')),
  true,
  'Tiptap editor bundle should be vendored locally'
);

console.log('knowledge site tests passed');
