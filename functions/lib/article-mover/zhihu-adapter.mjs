import {
    analyzeHtml,
    extractElementByClass,
    extractJsonLd,
    extractMeta,
    htmlToMarkdown,
    sanitizeHtml,
    stripTags
} from "./html-tools.mjs";

export function parseZhihuUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch (error) {
        return null;
    }
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.hostname.toLowerCase() !== "zhuanlan.zhihu.com") return null;
    const match = /^\/p\/(\d+)\/?$/.exec(url.pathname);
    if (!match) return null;
    return {
        platform: "zhihu",
        remoteArticleId: match[1],
        sourceIdentity: `article:${match[1]}`,
        normalizedUrl: `https://zhuanlan.zhihu.com/p/${match[1]}`
    };
}

export function parseZhihuArticle(html, source) {
    const jsonLd = extractJsonLd(html).find((item) => {
        const type = item && item["@type"];
        return type === "Article" || type === "NewsArticle" || type === "BlogPosting";
    }) || {};
    const titleElement = extractElementByClass(html, "Post-Title");
    const contentElement = extractElementByClass(html, "Post-RichTextContainer")
        || extractElementByClass(html, "RichText");
    const rawContent = typeof jsonLd.articleBody === "string" && jsonLd.articleBody.includes("<")
        ? jsonLd.articleBody
        : contentElement?.innerHtml;
    if (!rawContent) {
        throw platformError(
            "CONTENT_NOT_FOUND",
            "未能从知乎页面提取正文，页面可能需要登录或平台页面结构已变化"
        );
    }
    const title = stripTags(titleElement?.innerHtml)
        || stringValue(jsonLd.headline)
        || extractMeta(html, "og:title")
        || null;
    if (!title) throw platformError("TITLE_NOT_FOUND", "未能从知乎页面提取标题");

    const safeHtml = sanitizeHtml(rawContent, source.normalizedUrl);
    const markdown = htmlToMarkdown(safeHtml);
    if (!markdown) throw platformError("EMPTY_CONTENT", "知乎文章正文为空");
    const analysis = analyzeHtml(safeHtml);
    const author = typeof jsonLd.author === "object"
        ? stringValue(jsonLd.author.name)
        : stringValue(jsonLd.author);
    return {
        ...source,
        title,
        author,
        summary: stringValue(jsonLd.description)
            || extractMeta(html, "description", "name")
            || extractMeta(html, "og:description")
            || "",
        rawContent,
        rawContentFormat: "html",
        safeHtml,
        normalizedMarkdown: markdown,
        publishedAt: normalizeDate(jsonLd.datePublished),
        updatedAt: normalizeDate(jsonLd.dateModified),
        originalPublishedTime: stringValue(jsonLd.datePublished),
        originalUpdatedTime: stringValue(jsonLd.dateModified),
        tags: normalizeKeywords(jsonLd.keywords),
        category: "技术文章",
        defaultType: "article",
        solutionMeta: null,
        ...analysis,
        warnings: [
            ...(analysis.imageCount ? ["图片仍引用知乎远程地址，可能存在防盗链风险"] : [])
        ]
    };
}

function normalizeKeywords(value) {
    const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，]/) : [];
    return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].slice(0, 15);
}

function normalizeDate(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stringValue(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function platformError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}
