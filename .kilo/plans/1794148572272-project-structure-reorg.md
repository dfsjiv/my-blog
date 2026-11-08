# 项目结构整理计划

## 目标

把根目录从 80+ 个条目收敛为「部署入口 + 配置 + 目录」；前端 JS/CSS 按类型归入 `static/`；图片归入 `assets/images/`；二级页面归档到 `pages/`、`tools/`；删除已确认无引用的死文件。不改变任何运行时行为、构建方式或公开站点 URL。

## 约束与已确认决策

- Cloudflare Pages 的 `index.html`、`functions/`、`_headers`、`_redirects`、`robots.txt`、`favicon.ico` 必须留在根目录。
- 不引入 `public/` 构建输出目录，不改 Cloudflare Pages 构建配置。
- JS/CSS 采用 `static/js`、`static/css` 按类型平铺，不做领域子目录。
- 二级页面移动后通过根目录 `_redirects` 保留旧 URL。
- 删除 `d`、`.dev`、`乐米小奶泡体.ttf`、`knowledge-site-v3.js`，已确认均无引用。
- `tests/` 本轮保持平铺，只更新文件路径，不按领域拆分。
- 保持现有文件名和 `?v=` 缓存查询串不变，避免额外改名风险。

## 目标结构

```
/
├─ index.html
├─ _headers
├─ _redirects
├─ robots.txt
├─ favicon.ico
├─ package.json / package-lock.json
├─ static/
│  ├─ js/        # 原根目录全部 *.js
│  └─ css/       # 原根目录全部 *.css
├─ pages/
│  ├─ blog.html
│  └─ gallery.html
├─ tools/
│  └─ model-test.html
├─ assets/
│  ├─ images/    # 原根目录 3 张 master1200.jpg
│  ├─ brand/ knowledge/ live2d/ models/ games/ vendor/   # 保持不变
├─ functions/
├─ migrations/
├─ scripts/
├─ src/
├─ tests/
├─ docs/
└─ workers/
```

## 实施步骤

### 1. 删除死文件

删除以下文件，使用 `git rm`：

- `d`
- `.dev`
- `乐米小奶泡体.ttf`
- `knowledge-site-v3.js`

删除前用 `rg -l` 再确认一次无引用；若发现新引用，停止并报告，不要删除。

### 2. 创建目录并移动前端资源

创建 `static/js`、`static/css`、`assets/images`、`pages`、`tools`。使用 `git mv` 保留历史。

- 根目录全部 `*.js` → `static/js/`，共 40 个，文件名不变：
  `ai-chat.js`、`algorithm-center.js`、`algorithm-charts.js`、`algorithm-cookie-sync.js`、`auth.js`、`chat.js`、`city-world-app.js`、`city-world.js`、`contest-center.js`、`home-desktop.js`、`home-device.js`、`login-mikutap-bridge.js`、全部 `knowledge-*.js`（保留 `knowledge-site-v4.js`，不移动已删除的 v3）、`model-test.js`、`night-rain-city-3d.js`、`particle-wallpaper.js`、`script.js`、`site-entry-loader.js`
- 根目录全部 `*.css` → `static/css/`，共 18 个，文件名不变：
  `algorithm-center.css`、`contest-center.css`、`home-desktop.css`、全部 `knowledge-*.css`、`model-test.css`、`particle-wallpaper.css`、`style.css`
- 3 张图片 → `assets/images/`：
  `110944994_p0_master1200.jpg`、`125625696_p0_master1200.jpg`、`131135880_p0_master1200.jpg`
- `blog.html`、`gallery.html` → `pages/`
- `model-test.html` → `tools/`

### 3. 新增 `_redirects`

根目录 `_redirects`：

```
/blog.html /pages/blog.html 301
/gallery.html /pages/gallery.html 301
/model-test.html /tools/model-test.html 301
```

### 4. 更新 HTML 引用

统一使用根相对路径，避免嵌套页面和 CSS 的相对路径问题。

`index.html`：

- 所有 `<link rel="stylesheet" href="...">` 改为 `/static/css/...`，查询串保持不变。
- 所有 `<script src="...">` 改为 `/static/js/...`，查询串保持不变。
- 内联 `knowledgeFeatureManifest` 中每个 `styles` / `scripts` 路径改为 `/static/css/...`、`/static/js/...`。
- `blogFrame` 的 `data-src="blog.html"` 改为 `/pages/blog.html`。
- `assets/vendor/knowledge/site.bundle.js`、KaTeX、marked、purify、importmap、字体 preload 路径保持不动。
- 首页图片 `assets/blog-icon.png`、`assets/chat-icon.png` 保持不动。

`pages/blog.html`：

- `href="style.css"` → `/static/css/style.css`
- `src="script.js"` → `/static/js/script.js`

`pages/gallery.html`：

- `href="style.css"` → `/static/css/style.css`
- 3 张图片 `src` → `/assets/images/<原文件名>`
- 返回链接 `blog.html` 保持相对路径，因为两个页面同目录。

`tools/model-test.html`：

- `href="model-test.css"` → `/static/css/model-test.css`
- `src="model-test.js"` → `/static/js/model-test.js`
- `model-test.js` 内的 `import './city-world.js'` 不用改，两者同目录。

### 5. 更新 JS / CSS / 构建入口引用

- `src/knowledge-site-entry.js`：6 个 `import '../knowledge-*.js'` 改为 `import '../static/js/knowledge-*.js'`。
- `home-desktop.js`：`BLOG_URL = 'blog.html'` 改为 `BLOG_URL = '/pages/blog.html'`。
- `script.js`：3 处图片 `src` 改为 `/assets/images/<原文件名>`；`window.location.href = 'gallery.html'` 不用改，`blog.html` 与 `gallery.html` 同目录。
- `knowledge-site-v2.css`：
  - `url("131135880_p0_master1200.jpg")` → `url("/assets/images/131135880_p0_master1200.jpg")`
  - `url("assets/knowledge/hero-01.webp")` → `url("/assets/knowledge/hero-01.webp")`
- `knowledge-navigation.css`：
  - `url("assets/vendor/caveat/ZhenWordmark.woff2")` → `url("/assets/vendor/caveat/ZhenWordmark.woff2")`
- `_headers`：两个具体路径更新为
  - `/static/js/login-mikutap-bridge.js`
  - `/static/css/home-desktop.css`
  - 其余规则保持不变。
- `scripts/build-knowledge-site.mjs`、`package.json`、`functions/`、`workers/` 不需要改。

### 6. 更新测试中的源文件路径

把测试里所有根目录 JS/CSS 引用改为 `static/js`、`static/css`。涉及文件：

```
tests/algorithm-pie.test.mjs
tests/article-edit-visibility.test.mjs
tests/appearance.test.mjs
tests/algorithm-cookie-sync.test.mjs
tests/blog-content.test.js
tests/auth-timeout.test.mjs
tests/background-display.test.mjs
tests/auth.test.js
tests/algorithm-diagnostics.test.mjs
tests/code-copy.test.mjs
tests/desktop-lazy.test.mjs
tests/contest-center.test.js
tests/detail-extras-lazy.test.mjs
tests/feature-loader.test.mjs
tests/hero-lazy.test.mjs
tests/grid-blocks.test.mjs
tests/home-desktop.test.js
tests/home-device.test.js
tests/home-loading.test.mjs
tests/knowledge-editor-adapter.test.js
tests/knowledge-game-2048.test.js
tests/knowledge-live2d-lazy.test.mjs
tests/knowledge-navigation.test.mjs
tests/knowledge-markdown.test.js
tests/knowledge-markdown-import.test.mjs
tests/knowledge-post-card.test.mjs
tests/knowledge-validation-errors.test.mjs
tests/knowledge-repository.test.js
tests/logo-font.test.mjs
tests/math-markdown-delimiters.test.mjs
tests/math-lazy.test.mjs
tests/portable-article.test.mjs
tests/quick-search.test.mjs
tests/knowledge-site.test.js
tests/reading-library.test.mjs
tests/repository-timeout.test.mjs
tests/site-entry-loader.test.js
tests/user-profile.test.mjs
tests/wizard-chess.test.mjs
```

需要同时修改的精确断言：

- `tests/auth.test.js`：`<script src="auth.js?...">`、`<script src="login-mikutap-bridge.js?...">` 改为 `/static/js/...`。
- `tests/home-desktop.test.js`：`blogFrame.src === 'blog.html'` 改为 `/pages/blog.html`；iframe 的 `src="blog.html"` 正则改为 `/pages/blog.html`；`home-desktop.css?v=...` 断言改为 `/static/css/...`。
- `tests/home-device.test.js`：`<script src="home-device.js">` 改为 `/static/js/home-device.js`。
- `tests/desktop-lazy.test.mjs`：`data-src="blog.html"` 改为 `data-src="/pages/blog.html"`。
- `tests/knowledge-site.test.js`：`knowledge-site-v2.css?v=...` 等精确 href 断言补上 `/static/css/` 前缀；仅匹配文件名顺序的断言保持原样。
- `tests/feature-loader.test.mjs`：从 `index.html` 解析 manifest，路径会变成 `/static/...`，测试本身的加载器模拟无需改逻辑。

`tests/fixtures/knowledge-browser-server.mjs` 以仓库根目录为静态根，新路径可直接访问，不需要修改。

### 7. 重新生成首页 bundle

```powershell
npm run build:knowledge-site
```

该命令会因 `src/knowledge-site-entry.js` 的 import 路径变化重新生成 `assets/vendor/knowledge/site.bundle.js` 并更新 `index.html` 中的 `?v=` 哈希。之后执行：

```powershell
npm run check:knowledge-build
```

### 8. 验证

```powershell
npm test
npm run check:knowledge-build
```

再做静态引用扫描，确认没有遗漏的旧根路径：

```powershell
rg 'src="(knowledge-|home-|auth\.js|login-mikutap|site-entry-loader|algorithm-|contest-center|chat\.js|ai-chat|city-world|particle-wallpaper|night-rain-city)' index.html pages tools
rg 'href="(style|knowledge-|home-desktop|model-test|contest-center|algorithm-center|particle-wallpaper)' pages tools
rg '\.\./knowledge-' src
rg 'master1200' -g '!node_modules/**'
```

预期：前三条无输出；`master1200` 只出现在 `static/css/knowledge-site-v2.css`、`static/js/script.js`、`pages/gallery.html`，且均带 `/assets/images/` 前缀。

本地起测试服务器做冒烟检查：

```powershell
node tests/fixtures/knowledge-browser-server.mjs 8766
```

检查以下 URL 返回 200：

- `/`
- `/pages/blog.html`
- `/pages/gallery.html`
- `/tools/model-test.html`
- `/static/js/knowledge-site-v4.js`
- `/static/css/knowledge-site-v2.css`
- `/assets/images/131135880_p0_master1200.jpg`
- `/assets/vendor/knowledge/site.bundle.js`

`_redirects` 只在 Cloudflare Pages 生效，本地 fixture server 不处理；语法需人工核对，部署后用 Pages 预览环境确认三个 301。

## 风险与应对

- **CSS 相对 `url()` 失效**：CSS 从根目录移到 `static/css` 后，相对路径基准改变。已列出 3 处必须改成 `/assets/...` 绝对路径。
- **嵌套页面相对路径失效**：`pages/`、`tools/` 内的 HTML 统一使用 `/static/...`、`/assets/...` 绝对路径。
- **测试硬编码根路径**：约 39 个测试文件需要机械更新；`npm test` 是最终兜底。
- **首页 bundle 哈希过期**：`check:knowledge-build` 会直接报错，必须重新 build 并提交产物。
- **旧 URL 兼容**：`_redirects` 未在单元测试覆盖，需在 Pages 预览环境验证 301。
- **缓存**：所有 `?v=` 查询串保持不变，避免用户命中旧缓存；文件移动只影响路径。

## 回滚

开始前先用 `git status --short` 确认工作区干净。全部移动使用 `git mv` 且未改文件名，若验证失败可按目标结构反向移动恢复；删除的 4 个文件用 `git checkout -- <path>` 恢复。不要使用 `git reset --hard`，以免覆盖其他未提交改动。建议在独立分支上执行本次整理。

## 本轮不做

- 不引入 `public/` 构建输出目录或修改 Pages 构建命令。
- 不拆分 `tests/` 目录。
- 不重命名带版本/日期的文件，如 `knowledge-site-v4.js`、`knowledge-i18n-v3.js`、`knowledge-live2d-mana-position-20260809.js`。
- 不继续拆分 `knowledge-*.js` 内部结构或做代码重构。
- 不改 `functions/`、`workers/`、`migrations/`。
