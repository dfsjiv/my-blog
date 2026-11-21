# 每篇文章的页面设计 / Per-article page design

一篇文章对应一套详情页设计，提供默认、自定义布局、完全自由 HTML 三种模式。设计只作用于该文章打开后的页面；首页、搜索、分类、导航和文章卡片仍使用原来的设计。没有选择自定义的文章继续使用默认排版。

## 使用

1. 登录后新建或编辑文章，填写标题、分类及正文。原有 Markdown 导入继续可用。
2. 点击编辑器底部 **文章页面设计**，选择 **使用本篇自定义设计**。
3. 编辑 HTML、CSS、JS 三个区域，也可同时选择一个 HTML 和它引用的 CSS / JS 文件导入。源代码分别进入三个编辑区，导入时不执行；缺少配套文件时会明确列出文件名，并保留当前编辑内容。
4. 自定义布局模式的 HTML 必须保留 `{{content}}`，自动插入当前文章正文。另支持 `{{title}}`、`{{author}}`、`{{date}}`、`{{category}}`、`{{cover}}`，以及 `<section data-article-slot="content"></section>`。
5. 点击 **检测并预览**，用实际未保存的正文检查悬停、点击、动画及手机布局。图片使用本站上传链接或 PNG/JPEG/WebP/GIF data URL；外部资源被阻止。
6. **应用到当前文章** 只更新编辑器状态；随后用原有 **保存草稿 / 发布** 按钮提交。原有 **预览** 也显示本篇设计。文章 JSON 备份携带设计；普通 `.md` 导出只包含文章与常用元数据。
7. 详情页可 **关闭 JS 效果** 或 **默认排版阅读**，只影响本次阅读。作者可用外层 **编辑本篇页面** 返回编辑器。

### 自由画布

- **文章页面宽度**：可跟随网站内容区，或选择全宽画布铺满视口。全宽只影响当前文章的设计区域，评论等公共功能继续保留。
- **文章基础样式**：可保留基础阅读样式，或选择空白样式，完全由自己的 CSS 决定字体、间距、布局、背景和图片比例。
- **空白起稿**：用一个正文占位符开始，不强制标题、封面、作者区等模块的位置或样式。模板中的直角是起稿默认值，作者仍可在自己的 CSS 中使用圆角。
- 支持 Grid、Flex、CSS 动画及清理后的静态 SVG 图形；SVG 脚本、foreignObject、嵌入和外部引用不保留。
- 编辑器可展开到整个窗口，支持桌面、平板和手机预览。只有点击应用并保存文章后才改变线上设计。
- 配置继续存入原有文章设计 JSON，不需要新的数据库迁移。

**帖子外观预览** 继续设置首页文章卡片，和本文的详情页设计是两个独立功能。

## 完全自由 HTML 写作

编辑器顶部新增 **完全自由 HTML** 入口；底部“文章页面设计”的模式选择中也可以切换。

- **默认模式**：继续使用原来的富文本 / Markdown。
- **自定义布局**：用 HTML / CSS / JS 设计布局，用 `{{content}}` 插入原正文。
- **完全自由 HTML**：HTML 本身就是文章正文，不要求任何占位符，也不要求另写 Markdown。可以写 HTML 片段、粘贴完整文档或导入 `.html` 文件。

完整文档里的内联 `<style>`、`<script>` 或随选的配套文件会被提取到 CSS / JS 区域，随后进行相同的检查。CSS / JS 源文本保留，运行副本会自动加入预算检查。文档的 html/body class、style、lang、dir、data-theme 在清理后保留。导入、检测和预览不会自动发布，仍须应用后保存或发布文章。无导入导出的独立 module 脚本可按普通隔离脚本运行，模块导入、任意远程脚本、网络请求与危险事件属性仍不支持。

### 原代码与常用依赖

- `index.html` 引用 `style.css` / `script.js` 时，在文件选择器里同时选中这三份文件。不会要求作者重写主题切换、目录、复制按钮或小实验代码。
- 也可以把完整 HTML、CSS、JS 分别粘贴到三个编辑区；检测和保存会把已有 CSS / JS 视为本地引用的内容，不要求重复上传文件，也不会重复拼接代码。空编辑区仍会提示缺少对应文件，远程资源仍按原规则检查。
- 明确识别的 cdnjs KaTeX、auto-render 和 highlight.js 引用改由本站固定版本提供；不会联网执行作者指定的任意第三方库。支持 `renderMathInElement`、`hljs.highlightElement`；高亮语言包含 C++、JavaScript、CSS 与 HTML/XML。
- Google Fonts 引用不会联网加载，使用作者 CSS 已声明的本机后备字体；导入提示会说明这一点。缺少本地配套文件或不支持的远程资源不会静默忽略。
- 原代码的 `localStorage` 是本篇文章独立、限额的虚拟存储；`navigator.clipboard.writeText` 是需要点击授权的写入接口。滚动进度、固定/粘性元素、页内锚点和 `IntersectionObserver` 使用隔离环境提供的视口信息。数值、范围、勾选等实验输入可用，登录表单仍不允许。

切回默认写作时保留 HTML / CSS / JS，原 Markdown 也始终保留。JSON 文章备份携带两种源内容；HTML 文章的 Markdown 导出使用其正文文本。未填写摘要时，从 HTML 文本生成摘要；字数也来自 HTML 内容。详情页的默认阅读回退显示 HTML 的纯文本正文，不执行其中的代码。

数据库继续使用 `knowledge_posts` 与 `knowledge_article_layouts`：HTML / CSS / JS、模式及画布选项放在现有设计 JSON 的草稿/发布字段，按文章 ID 关联。没有新增表或改表，原 Markdown 不被 HTML 覆盖。标题、分类、作者、权限、版本冲突和图片存储沿用原实现。

## JavaScript 范围与限制

JS 支持明确选择及创建展示元素、修改样式/文本、classList、事件、计时器和动画回调，以及默认参数、解构、展开语法和 async 函数。`for` / `while` / `do` / `for…of` / `for…in` 均可用，每次循环自动检查运行预算；也可用 `forEach` / `map`。元素创建只接受明确的展示标签，不允许创建脚本、资源或嵌入页面。

```js
const button = document.querySelector('.back-top');
button.addEventListener('click', () => {
  document.querySelector('.my-article').scrollIntoView({behavior: 'smooth'});
});
```

- 客户端和服务端使用同一 Acorn AST 能力策略，拒绝账号存储、Cookie、网络接口、外层窗口、动态代码、原型、动态属性访问和非受限全局变量。构造器仅开放隔离环境的 `IntersectionObserver`，核心 DOM / 计时接口不能提取或改写。错误定位到源代码行。
- HTML 另经 DOMPurify 清理，动态 `innerHTML` 也经清理；脚本只能写在单独的 JS 区。CSS 的 `@import` 被拒绝，页面 CSP 只许可平台带 nonce 的可信脚本，阻止作者的远程脚本、网络连接和表单。
- 预览及正式展示使用相同的 `sandbox="allow-scripts"` iframe，**不授予 allow-same-origin**。脚本无法获得博客令牌或外层 DOM。消息必须同时匹配 iframe 来源和随机通道；只开放有边界的高度、视口、页内锚点、复制及文章偏好接口。
- 虚拟 `localStorage` 只映射到固定文章 ID 的独立命名空间，最多 32 项、4 KiB UTF-8 数据；每项键最多 64 字符、值最多 1024 字符。没有文章 ID 的新建预览只使用内存。作者的 `theme` 键不会覆盖博客主题或读取博客登录信息。
- 复制仅写文本，不提供读取剪贴板的接口；父页面验证用户激活与文本长度。文章不得读取其他文章的偏好数据。
- 每个用户函数及循环注入运行预算检查：200 ms 窗口内最多 100,000 次检查、单次挂载合计最多 1,000,000 次；另限制待执行计时/动画回调。运行失败时可切回原生正文。
- **检测不是任意代码安全的数学证明，也不是独立进程级 CPU/内存限额。** 不支持任意 npm 库、第三方脚本、`eval`、`fetch` 或完整 JavaScript 环境；需要新能力时应扩展并测试白名单，不能关闭隔离。
- iframe 中只允许锚点链接。正常外链、评论、文章导航和分享功能可在默认排版或外层原有区域使用。

## 数据与部署

迁移：`migrations/0015_add_article_layouts.sql`。

`knowledge_article_layouts` 以 `post_id` 为主键和外键，每篇文章最多一行，包含 `draft_json`、`published_json` 与更新时间。正文仍在 `knowledge_posts`，图片复用原上传服务。设计和正文通过同一数据库 batch 保存，沿用文章所有权、版本冲突及发布权限；列表不读取设计源码。

- 用户设计最大 **96 KiB**，管理员 **256 KiB**（JSON UTF-8 字节）；JS 分别最大 **16 Ki / 64 Ki 字符**。
- 最多保留草稿和发布两份设计快照，存储估算按约两倍配置大小，再加 SQLite 开销。未启用的普通文章不新增设计行。
- 未执行迁移时普通文章读写保持可用；保存自定义设计会提示需要迁移。
- 保存为草稿遵循原文章状态逻辑，已发布文章改存草稿会撤下文章；再次发布时提升当前设计快照。不能将它当成独立的公开文章版本管理。
- 原错误范围的 `custom_pages` 数据保留，不删除、不迁移到任意文章。其公共页面入口、首页替换逻辑和 API 已撤回（API 返回 410）。
- `npm run build:knowledge-site` 同步固定版本 Acorn 解析器到 Functions（适配线上无构建命令、不安装 npm 依赖的部署环境），并生成主包、按需加载的 `article-layout.bundle.js` 及隔离环境高亮库；`npm run check:knowledge-build` 检查产物与版本一致性。高亮库许可证随构建提交。公开 KaTeX 字体允许跨源读取，以便不透明来源 iframe 排版公式；不涉及 API 或账号数据。

## English

Each article owns one independent detail-page design with default, custom-layout and fully free HTML modes. The free mode treats HTML as the article body without a required content slot; complete documents or HTML files can be imported. Inline styles/scripts are extracted and checked, and cleaned html/body attributes are retained. Original Markdown is preserved through mode switches; existing draft/published JSON fields are reused without a database migration. Open **Article page design** in that article's writer, choose the custom mode, retain `{{content}}`, check the interactive/mobile preview, apply, then save or publish the article. The default layout remains available. Homepages and other common pages are unchanged; **Post appearance preview** still configures the homepage card.

Import one HTML file together with its referenced CSS and JS files, or paste all three into their editor fields; source text is preserved. Nonempty CSS/JS fields satisfy local references during preview and saving without duplication. Known cdnjs KaTeX/highlight.js dependencies are supplied by pinned local libraries. Google Fonts links use the author's CSS fallback fonts, and missing companions or unsupported remote resources produce explicit errors without replacing current work.

Source is checked on both client and server and rendered through DOMPurify, an opaque-origin script sandbox, and restrictive CSP. Default parameters, destructuring, spread and async functions are supported. The runtime provides per-article virtual localStorage (32 entries, 4 KiB), gesture-gated clipboard writing, viewport facts and an isolated IntersectionObserver. Dynamic innerHTML is sanitized. Messages require the matching frame and random channel; no blog tokens, parent DOM, network or clipboard reading are exposed. User functions/loops have injected budgets (100,000 checks per 200 ms, 1,000,000 per mount), plus callback limits. Static analysis and callback budgets are not a guarantee against all resource-exhaustion cases. Arbitrary third-party scripts, module imports and dynamic execution remain unsupported. Preview and publication use the same restrictions.

Apply migration 0015. `knowledge_article_layouts` has one row per article and draft/published JSON snapshots; saving is atomic with article updates and retains ownership/version rules. Member/admin design limits are 96/256 KiB, with 16/64 Ki-character JS limits. JSON article backups retain designs; plain Markdown exports do not embed page code. Old incorrectly scoped `custom_pages` data is preserved while its UI, homepage override and API are retired.
