import {
    analyzeHtml,
    extractElementByClass,
    extractMeta,
    htmlToMarkdown,
    sanitizeHtml,
    stripTags
} from "./html-tools.mjs";

const NOWCODER_HOSTS = new Set(["www.nowcoder.com", "nowcoder.com", "m.nowcoder.com"]);
const LEGACY_HOSTS = new Set(["blog.nowcoder.net"]);

export function parseNowCoderUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch (error) {
        return null;
    }
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const discuss = /^\/discuss\/(\d+)\/?$/.exec(url.pathname);
    if (NOWCODER_HOSTS.has(host) && discuss) {
        return {
            platform: "nowcoder",
            remoteArticleId: discuss[1],
            sourceIdentity: `discuss:${discuss[1]}`,
            normalizedUrl: `https://www.nowcoder.com/discuss/${discuss[1]}`
        };
    }
    const legacy = /^\/n\/([a-z0-9]+)\/?$/i.exec(url.pathname);
    if (LEGACY_HOSTS.has(host) && legacy) {
        return {
            platform: "nowcoder",
            remoteArticleId: legacy[1],
            sourceIdentity: `blog:${legacy[1].toLowerCase()}`,
            normalizedUrl: `https://blog.nowcoder.net/n/${legacy[1]}`
        };
    }
    return null;
}

export function parseNowCoderArticle(html, source) {
    const titleElement = extractElementByClass(html, "content-post-title");
    const contentElement = extractElementByClass(html, "nc-slate-editor-content");
    if (!contentElement) {
        throw platformError("CONTENT_NOT_FOUND", "未能从牛客页面提取正文，页面可能已删除或结构已变化");
    }
    const title = stripTags(titleElement?.innerHtml)
        || cleanTitle(extractMeta(html, "og:title"))
        || null;
    if (!title) throw platformError("TITLE_NOT_FOUND", "未能从牛客页面提取标题");

    const safeHtml = sanitizeHtml(contentElement.innerHtml, source.normalizedUrl);
    const markdown = htmlToMarkdown(safeHtml);
    if (!markdown) throw platformError("EMPTY_CONTENT", "牛客文章正文为空");
    const problemCard = extractElementByClass(html, "discuss-terminal-card");
    const problemUrl = readHref(problemCard?.outerHtml, source.normalizedUrl);
    const problemTitle = stripTags(
        extractElementByClass(problemCard?.innerHtml || "", "question-title")?.innerHtml
    ) || null;
    const author = stripTags(
        extractElementByClass(html, "name-text")?.innerHtml
    ) || null;
    const displayTime = stripTags(
        extractElementByClass(html, "time-text")?.innerHtml
    ) || null;
    const analysis = analyzeHtml(safeHtml);

    return {
        ...source,
        title,
        author,
        summary: cleanSummary(extractMeta(html, "description", "name")),
        rawContent: contentElement.innerHtml,
        rawContentFormat: "html",
        safeHtml,
        normalizedMarkdown: markdown,
        publishedAt: null,
        updatedAt: null,
        originalPublishedTime: displayTime,
        originalUpdatedTime: /已编辑/.test(html) ? displayTime : null,
        tags: [],
        category: "算法题解",
        defaultType: "solution",
        solutionMeta: {
            platform: "NowCoder",
            problemId: problemUrl ? problemUrl.split("/").filter(Boolean).at(-1)?.split("?")[0] || null : null,
            problemTitle,
            problemUrl,
            difficulty: null,
            algorithms: [],
            language: null,
            timeComplexity: null,
            spaceComplexity: null,
            accepted: null
        },
        ...analysis,
        warnings: [
            ...(displayTime && !/^\d{4}[-/]/.test(displayTime)
                ? ["牛客页面未提供完整年份，原时间文本已保留但未猜测 UTC 时间"] : []),
            ...(analysis.imageCount ? ["图片仍引用牛客远程地址，可能存在防盗链风险"] : [])
        ]
    };
}

function readHref(html, baseUrl) {
    const match = /\bhref=(["'])(.*?)\1/i.exec(String(html || ""));
    if (!match) return null;
    try {
        const url = new URL(match[2], baseUrl);
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    }
    catch (error) {
        return null;
    }
}

function cleanTitle(value) {
    return value ? value.replace(/_牛客网\s*$/i, "").trim() : null;
}

function cleanSummary(value) {
    return value ? value.replace(/_牛客网[\s\S]*$/i, "").trim().slice(0, 500) : "";
}

function platformError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}
