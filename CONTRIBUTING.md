# 贡献指南 / Contributing

[项目介绍](README.md) · [English overview](README.en.md)

## 提交改进 / Propose a change

欢迎先通过 Issue 描述问题，或直接提交范围清晰的 Pull Request。请说明改动目的、影响范围和实际验证结果。涉及界面时附上截图，保持现有设计；涉及第三方代码或素材时，注明来源并保留许可证。

Open an issue or submit a focused pull request. Describe the problem, the resulting behavior, and the checks you actually ran. Include screenshots for visual changes, preserve the existing design, and retain third-party attribution and licenses.

## 目录约定 / Directory conventions

以下约定整理自 [OldFish（woll-778）的目录整理方案](.kilo/plans/1794148572272-project-structure-reorg.md)及其[原始实现](https://github.com/dfsjiv/my-blog/commit/088673af7c5ac865c39e2b0dfe602f8ab27d3f32)，保留原有结构设计，供后续贡献者查阅。

These conventions are adapted from OldFish's existing organization plan and implementation, linked above.

| 位置 / Location | 放置内容 / Purpose |
| --- | --- |
| `static/js/`、`static/css/` | 前端脚本与样式 / Frontend scripts and styles |
| `assets/` | 图片、字体、模型及第三方资源 / Images, fonts, models, and third-party assets |
| `pages/`、`tools/` | 二级页面与开发辅助页面 / Secondary pages and development tools |
| `src/` | 构建入口与编辑器扩展 / Bundle entry points and editor extensions |
| `functions/`、`workers/` | 服务端接口与独立 Worker / Server endpoints and standalone Workers |
| `tests/`、`docs/` | 自动化测试与维护文档 / Automated tests and maintenance documentation |

`index.html`、`functions/`、`_headers`、`_redirects` 等部署入口与配置保留在根目录。移动页面时维护旧 URL 的重定向；移动 CSS 时检查 `url()` 的路径基准。嵌套页面引用静态资源时使用根相对路径，例如 `/static/css/style.css`。

Keep deployment entry points and configuration at the repository root. Preserve redirects when moving public pages, check relative asset URLs when moving CSS, and use root-relative asset paths in nested pages.

## 构建与验证 / Build and validation

使用与 CI 一致的 Node.js 24，在仓库根目录执行：

Use Node.js 24, matching CI, and run commands from the repository root:

```bash
npm ci
npm run check:knowledge-build
npm test
```

修改站点入口或其打包依赖后，先执行 `npm run build:knowledge-site`，并提交生成的 bundle 和入口版本更新。修改编辑器扩展后执行 `npm run build:knowledge-editor`。不要直接修改生成的 vendor bundle。

After changing bundled site sources, run `npm run build:knowledge-site` and commit the generated bundle and entry version together. For editor extension changes, run `npm run build:knowledge-editor`. Do not edit generated vendor bundles directly.

可通过以下命令预览静态页面：

To preview static pages:

```bash
node tests/fixtures/knowledge-browser-server.mjs 8766
```

该服务不模拟完整 Cloudflare 后端，也不执行 Pages 的 `_redirects` 规则。登录、上传和数据库功能需要配置自己的开发资源；重定向需在 Pages 环境验证。

The fixture server does not emulate the full Cloudflare backend or Pages redirects. Authentication, uploads, and database features need your own development resources; verify redirects in a Pages environment.

## 许可与配置 / Licensing and configuration

原创代码及工程文档按 [MIT](LICENSE) 提供。文章及内容数据的授权范围见 [内容许可说明](LICENSE-CONTENT.md)。第三方资源沿用原许可。请勿提交令牌、Cookie、会话凭据、私有数据或生产数据库导出。

Original code and engineering documentation use [MIT](LICENSE). See the [content license](LICENSE-CONTENT.md) for articles and content data; third-party assets retain their own licenses. Never commit tokens, cookies, session credentials, private data, or production database exports.
