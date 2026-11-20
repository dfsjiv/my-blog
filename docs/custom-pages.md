# 每篇文章的页面设计 / Per-article page design

一篇文章对应一套详情页设计。设计只作用于该文章打开后的页面；首页、搜索、分类、导航和文章卡片仍使用原来的设计。没有选择自定义的文章继续使用默认排版。

## 使用

1. 登录后新建或编辑文章，填写标题、分类及正文。原有 Markdown 导入继续可用。
2. 点击编辑器底部 **文章页面设计**，选择 **使用本篇自定义设计**。
3. 编辑 HTML、CSS、JS 三个区域，也可导入 HTML 文件：内联 style/script 分别进入 CSS/JS 编辑区，导入时不执行。外部脚本不支持。
4. HTML 必须保留 `{{content}}`，自动插入当前文章正文。另支持 `{{title}}`、`{{author}}`、`{{date}}`、`{{category}}`、`{{cover}}`，以及 `<section data-article-slot="content"></section>`。
5. 点击 **检测并预览**，用实际未保存的正文检查悬停、点击、动画及手机布局。图片使用本站上传链接或 PNG/JPEG/WebP/GIF data URL；外部资源被阻止。
6. **应用到当前文章** 只更新编辑器状态；随后用原有 **保存草稿 / 发布** 按钮提交。原有 **预览** 也显示本篇设计。文章 JSON 备份携带设计；普通 `.md` 导出只包含文章与常用元数据。
7. 详情页可 **关闭 JS 效果** 或 **默认排版阅读**，只影响本次阅读。作者可用外层 **编辑本篇页面** 返回编辑器。

**帖子外观预览** 继续设置首页文章卡片，和本文的详情页设计是两个独立功能。

## JavaScript 范围与限制

JS 是受限的 DOM 交互子集，支持明确选择元素、修改样式/文本、classList、点击/指针事件、计时器和动画回调。可以使用 `forEach` / `map` 遍历。

```js
const button = document.querySelector('.back-top');
button.addEventListener('click', () => {
  document.querySelector('.my-article').scrollIntoView({behavior: 'smooth'});
});
```

- 客户端和服务端使用同一 Acorn AST 能力策略，拒绝账号存储、Cookie、网络接口、外层窗口、动态代码、原型/构造器、动态属性访问、接口提取、循环和非受限全局变量。错误定位到源代码行。
- HTML 另经 DOMPurify 清理，脚本只能写在单独的 JS 区。CSS 的 `@import` 被拒绝，页面 CSP 阻止外部脚本、网络连接和表单。
- 预览及正式展示使用相同的 `sandbox="allow-scripts"` iframe，**不授予 allow-same-origin**。脚本无法获得博客的令牌、存储或外层 DOM。框架只接收来自该 iframe、匹配随机通道的高度消息，不接受脚本发来的操作命令。
- 每个用户函数注入运行预算检查，限制高频回调、递归与过量计时器。运行失败时可切回原生正文。
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
- `npm run build:knowledge-site` 同步固定版本 Acorn 解析器到 Functions（适配线上无构建命令、不安装 npm 依赖的部署环境），并生成主包及按需加载的 `article-layout.bundle.js`；`npm run check:knowledge-build` 检查两者一致性。公开 KaTeX 字体允许跨源读取，以便不透明来源 iframe 排版公式；不涉及 API 或账号数据。

## English

Each article owns one independent detail-page HTML/CSS/restricted-JS design. Open **Article page design** in that article's writer, choose the custom mode, retain `{{content}}`, check the interactive/mobile preview, apply, then save or publish the article. The default layout remains available. Homepages and other common pages are unchanged; **Post appearance preview** still configures the homepage card.

Source is checked on both client and server and rendered through DOMPurify, an opaque-origin script sandbox, and restrictive CSP. Network/storage access, parent-page access, dynamic execution, prototype/constructor operations, dynamic properties, extracted capability methods, and loop syntax are rejected. Static analysis and callback budgets are not a guarantee against all resource-exhaustion cases. External resources and arbitrary third-party scripts are unsupported. Preview and publication use the same restrictions.

Apply migration 0015. `knowledge_article_layouts` has one row per article and draft/published JSON snapshots; saving is atomic with article updates and retains ownership/version rules. Member/admin design limits are 96/256 KiB, with 16/64 Ki-character JS limits. JSON article backups retain designs; plain Markdown exports do not embed page code. Old incorrectly scoped `custom_pages` data is preserved while its UI, homepage override and API are retired.
