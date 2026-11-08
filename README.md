# 臻写代码 · Zhen Codes

[中文](README.md) · [English](README.en.md)

一个持续生长的个人博客与知识站：写代码、记笔记、分享算法题解，也收集一些有趣的小工具。

**访问网站：[lilinzheng.top](https://lilinzheng.top/)**

## 可以做什么

- **阅读与检索**：文章分类、标签、归档、站内搜索、精选文章、RSS 和独立文章链接。
- **创作与排版**：Markdown / 富文本编辑、`.md` 文件导入、LaTeX 数学公式、代码块复制、草稿、文章备份与导出。
- **帖子外观**：多种动态卡片样式、封面裁剪和外观预览。
- **个性化**：深浅色主题、自定义整套色调、背景图片队列、头像裁剪与昵称。
- **阅读体验**：本地书签与阅读进度、字号和行距调整、专注阅读、图片放大和打印排版。
- **算法与竞赛**：跨平台做题统计、题型与难度分析、可视化图表、竞赛查询。
- **其他空间**：Web OS 风格桌面、聊天室、可选 AI 聊天及小游戏。

部分功能需要登录、管理员权限或对应的后端配置。阅读记录、书签和外观偏好保存在当前浏览器；算法平台 Cookie 仅用于当次同步，不持久化保存。平台数据覆盖范围与统计口径见 [算法中心说明](docs/algorithm-center.md)。

## 技术与目录

前端采用 HTML、CSS、JavaScript，使用 esbuild 打包站点入口；编辑器使用 Tiptap，Markdown 与数学公式分别由 Marked、DOMPurify 和 KaTeX 处理。后端运行于 Cloudflare Pages Functions，使用 D1、R2，并按需接入 Durable Objects 等服务。

```text
index.html                 站点入口
static/js/                 前端业务脚本
static/css/                样式与主题
src/                       打包入口和编辑器扩展
assets/                    图片、字体、模型和第三方静态资源
pages/                     二级页面
tools/                     开发辅助页面
functions/                 Pages Functions API 与服务端逻辑
workers/                   独立 Worker
migrations/                数据库增量迁移
scripts/                   构建与资源维护脚本
tests/                     自动化测试
docs/                      功能与维护说明
```

## 本地开发

推荐 Node.js 24，与仓库 CI 保持一致。

```bash
git clone https://github.com/dfsjiv/my-blog.git
cd my-blog
npm ci
npm run build:knowledge-site
npm test
```

可以用静态 HTTP 服务预览页面；完整的登录、文章读写和上传等功能需要 Cloudflare 后端及数据绑定。需要运行 Pages Functions 时，可在配置自己的开发资源后使用 Wrangler：

```bash
npx wrangler pages dev .
```

修改站点入口相关脚本后运行 `npm run build:knowledge-site`，并一同提交生成的 bundle 和更新后的入口版本。修改编辑器扩展后运行 `npm run build:knowledge-editor`。不要直接编辑生成的 vendor bundle。

提交前可运行：

```bash
npm run check:knowledge-build
npm test
```

## 部署说明

站点通过 Cloudflare Pages 部署，发布目录是仓库根目录。复用项目时，请在自己的 Cloudflare 账户中配置相应资源：

| 配置 | 用途 |
| --- | --- |
| D1 绑定 `DB` | 用户、文章、评论、算法统计等业务数据 |
| R2 绑定 `KNOWLEDGE_IMAGES` | 上传图片、头像、背景及相关展示配置 |
| `CHAT_ROOM` 等实时服务绑定 | 按实际聊天室架构配置，见 `workers/` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | 可选 Gemini 聊天服务 |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | 可选 DeepSeek 聊天服务 |

`migrations/` 是现有业务数据库的增量迁移，不是完整的新站初始化脚本。新建数据库需另行准备基础表与初始管理员；不要把示例文档中的生产资源标识用于自己的部署。凭据通过 Cloudflare Secrets 或本地开发环境配置，不提交到仓库。

旧页面入口通过根目录的 `_redirects` 保持兼容。自建站点时，还需要把域名、分享元数据、RSS / sitemap 地址及个人社交链接替换为自己的配置。

更多说明：[算法中心](docs/algorithm-center.md) · [头像与个人资料](docs/profile-avatar.md) · [背景展示](docs/background-display.md) · [旧内容兼容](docs/knowledge-legacy-migration.md)

## 开源与内容许可

| 内容 | 许可证与使用方式 |
| --- | --- |
| 项目原创代码及工程文档 | [MIT License](LICENSE)。允许使用、修改、分发和商业使用，保留版权与许可声明。 |
| 博主本人拥有版权的原创文章、题解及原创内容数据 | [CC BY 4.0](LICENSE-CONTENT.md)。允许转载、整理、改编及商业使用，按要求署名并标注出处即可，无需另行申请。 |
| 第三方代码、字体、插画、模型、音视频及转载文章 | 遵循各自原有授权；不因收录于本仓库或网站而自动改用 MIT 或 CC BY 4.0。 |

**使用原创文章内容时，请保留作者署名、原文链接及 CC BY 4.0 许可链接；有修改时注明修改情况，并保留原有的相关声明。** 不要求把你的作品也采用同一许可证，也不额外限制商业使用。完整范围与条款见 [内容许可说明](LICENSE-CONTENT.md)。

署名示例（请替换为该文章实际显示的作者、标题与原文地址）：

```text
《文章标题》—— 作者：原作者署名
原文：臻写代码，https://lilinzheng.top/原文地址
许可：CC BY 4.0，https://creativecommons.org/licenses/by/4.0/
修改说明：未修改 / 已节选并调整排版 / 已改编……
```

其他用户的投稿、评论和第三方平台内容，只有在权利人明确作出相应授权时才适用该许可。账号资料、会话信息、非公开草稿及其他个人数据不属于开放内容授权范围。

第三方许可声明应继续保留，例如 `assets/vendor/` 中的 LICENSE、NOTICE、`.LICENSE` 文件，以及字体目录中的 OFL 声明。没有明确授权信息的第三方素材，不应被视为可以任意再分发的开源资产。

## 参与贡献

欢迎通过 Issue 反馈问题，或通过 Pull Request 提交改进。涉及视觉设计时，请尽量保持现有风格，并说明改动目的和验证方式。

提交代码前请确认拥有相应权利；代码贡献按本项目 MIT 许可提供，原创文章或其他内容贡献应明确自己的授权方式。第三方代码或素材请保留原作者、来源和许可证信息。
