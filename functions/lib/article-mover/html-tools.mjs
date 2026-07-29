const BLOCKED_TAGS = new Set([
    "script", "iframe", "object", "embed", "form", "input",
    "button", "textarea", "select", "option", "style", "link", "meta"
]);
const ALLOWED_TAGS = new Set([
    "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b",
    "em", "i", "blockquote", "ul", "ol", "li", "a", "img", "table",
    "thead", "tbody", "tr", "th", "td", "pre", "code", "hr", "div",
    "span", "figure", "figcaption"
]);
const VOID_TAGS = new Set(["br", "img", "hr"]);

export function decodeHtmlEntities(value) {
    return String(value || "")
        .replace(/&#x([0-9a-f]+);?/gi, (_, code) => safeCodePoint(parseInt(code, 16)))
        .replace(/&#(\d+);?/g, (_, code) => safeCodePoint(parseInt(code, 10)))
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;|&apos;/gi, "'");
}

export function stripTags(value) {
    return normalizeWhitespace(decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " ")));
}

export function extractElementByClass(html, className) {
    const source = String(html || "");
    const escaped = escapeRegExp(className);
    const opening = new RegExp(
        `<([a-z][\\w:-]*)\\b[^>]*class=(["'])[^"']*\\b${escaped}\\b[^"']*\\2[^>]*>`,
        "i"
    ).exec(source);
    if (!opening) return null;
    const tag = opening[1].toLowerCase();
    const contentStart = opening.index + opening[0].length;
    const tagPattern = new RegExp(`<\\/?${escapeRegExp(tag)}\\b[^>]*>`, "gi");
    tagPattern.lastIndex = contentStart;
    let depth = 1;
    let match;
    while ((match = tagPattern.exec(source))) {
        if (/^<\//.test(match[0])) depth -= 1;
        else if (!/\/>$/.test(match[0])) depth += 1;
        if (depth === 0) {
            return {
                tag,
                innerHtml: source.slice(contentStart, match.index),
                outerHtml: source.slice(opening.index, tagPattern.lastIndex)
            };
        }
    }
    return null;
}

export function extractMeta(html, key, attribute = "property") {
    const escaped = escapeRegExp(key);
    const source = String(html || "");
    const keyFirst = new RegExp(
        `<meta\\b[^>]*${attribute}=(["'])${escaped}\\1[^>]*content=(["'])([\\s\\S]*?)\\2[^>]*>`,
        "i"
    ).exec(source);
    if (keyFirst) return decodeHtmlEntities(keyFirst[3]);
    const contentFirst = new RegExp(
        `<meta\\b[^>]*content=(["'])([\\s\\S]*?)\\1[^>]*${attribute}=(["'])${escaped}\\3[^>]*>`,
        "i"
    ).exec(source);
    if (contentFirst) return decodeHtmlEntities(contentFirst[2]);
    return null;
}

export function extractJsonLd(html) {
    const values = [];
    const pattern = /<script\b[^>]*type=(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = pattern.exec(String(html || "")))) {
        try {
            const parsed = JSON.parse(decodeHtmlEntities(match[2]).trim());
            if (Array.isArray(parsed)) values.push(...parsed);
            else values.push(parsed);
        }
        catch (error) {
            // Invalid JSON-LD is ignored; platform-specific HTML extraction may still work.
        }
    }
    return values;
}

export function sanitizeHtml(rawHtml, baseUrl) {
    const source = String(rawHtml || "");
    let output = "";
    let cursor = 0;
    let blockedDepth = 0;
    for (const token of tokenizeHtml(source)) {
        if (token.start > cursor && blockedDepth === 0) {
            output += escapeText(decodeHtmlEntities(source.slice(cursor, token.start)));
        }
        cursor = token.end;
        const tag = token.name;
        if (BLOCKED_TAGS.has(tag)) {
            if (!token.closing && !token.selfClosing) blockedDepth += 1;
            else if (token.closing && blockedDepth > 0) blockedDepth -= 1;
            continue;
        }
        if (blockedDepth > 0 || !ALLOWED_TAGS.has(tag)) continue;
        if (token.closing) {
            if (!VOID_TAGS.has(tag)) output += `</${tag}>`;
            continue;
        }
        const attributes = sanitizeAttributes(tag, token.raw, baseUrl);
        output += `<${tag}${attributes}>`;
    }
    if (cursor < source.length && blockedDepth === 0) {
        output += escapeText(decodeHtmlEntities(source.slice(cursor)));
    }
    return output;
}

export function htmlToMarkdown(safeHtml) {
    const source = String(safeHtml || "");
    let output = "";
    let cursor = 0;
    const listStack = [];
    const links = [];
    const codeStack = [];
    for (const token of tokenizeHtml(source)) {
        if (token.start > cursor) {
            const text = decodeHtmlEntities(source.slice(cursor, token.start));
            output += codeStack.length ? text : escapeMarkdownText(text);
        }
        cursor = token.end;
        const tag = token.name;
        if (!token.closing) {
            if (/^h[1-6]$/.test(tag)) output += `\n\n${"#".repeat(Number(tag[1]))} `;
            else if (tag === "p" || tag === "div" || tag === "figure") output += "\n\n";
            else if (tag === "br") output += "  \n";
            else if (tag === "strong" || tag === "b") output += "**";
            else if (tag === "em" || tag === "i") output += "*";
            else if (tag === "blockquote") output += "\n\n> ";
            else if (tag === "ul" || tag === "ol") listStack.push(tag);
            else if (tag === "li") output += `\n${listStack.at(-1) === "ol" ? "1." : "-"} `;
            else if (tag === "a") {
                links.push(readAttribute(token.raw, "href") || "");
                output += "[";
            }
            else if (tag === "img") {
                const src = readAttribute(token.raw, "src") || "";
                const alt = readAttribute(token.raw, "alt") || "";
                if (src) output += `![${escapeMarkdownText(alt)}](${src})`;
            }
            else if (tag === "pre") {
                codeStack.push("pre");
                output += "\n\n```\n";
            }
            else if (tag === "code" && codeStack.at(-1) !== "pre") {
                codeStack.push("code");
                output += "`";
            }
            else if (tag === "hr") output += "\n\n---\n\n";
            else if (tag === "th" || tag === "td") output += " | ";
        }
        else {
            if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "div"
                || tag === "blockquote" || tag === "figure") output += "\n\n";
            else if (tag === "strong" || tag === "b") output += "**";
            else if (tag === "em" || tag === "i") output += "*";
            else if (tag === "ul" || tag === "ol") {
                listStack.pop();
                output += "\n";
            }
            else if (tag === "a") output += `](${links.pop() || ""})`;
            else if (tag === "pre") {
                if (codeStack.at(-1) === "pre") codeStack.pop();
                output += "\n```\n\n";
            }
            else if (tag === "code" && codeStack.at(-1) === "code") {
                codeStack.pop();
                output += "`";
            }
            else if (tag === "tr") output += "\n";
            else if (tag === "figcaption") output += "\n\n";
        }
    }
    if (cursor < source.length) output += escapeMarkdownText(decodeHtmlEntities(source.slice(cursor)));
    return output
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function analyzeHtml(safeHtml) {
    const images = [];
    const domains = new Set();
    let codeBlockCount = 0;
    let relativeImageCount = 0;
    for (const token of tokenizeHtml(String(safeHtml || ""))) {
        if (token.closing) continue;
        if (token.name === "pre") codeBlockCount += 1;
        if (token.name !== "img") continue;
        const src = readAttribute(token.raw, "src");
        if (!src) continue;
        images.push(src);
        try {
            domains.add(new URL(src).hostname);
        }
        catch (error) {
            relativeImageCount += 1;
        }
    }
    return {
        imageCount: images.length,
        imageDomains: [...domains],
        relativeImageCount,
        codeBlockCount
    };
}

function* tokenizeHtml(source) {
    const pattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][\w:-]*)\b[^>]*>/gi;
    let match;
    while ((match = pattern.exec(source))) {
        if (!match[1]) continue;
        yield {
            raw: match[0],
            name: match[1].toLowerCase(),
            closing: /^<\//.test(match[0]),
            selfClosing: /\/>$/.test(match[0]),
            start: match.index,
            end: pattern.lastIndex
        };
    }
}

function sanitizeAttributes(tag, raw, baseUrl) {
    const allowed = tag === "a"
        ? ["href", "title"]
        : tag === "img" ? ["src", "alt", "title"] : [];
    const pairs = [];
    for (const name of allowed) {
        const value = readAttribute(raw, name);
        if (value === null) continue;
        if ((name === "href" || name === "src")) {
            const safe = safeResourceUrl(value, baseUrl, name === "src");
            if (!safe) continue;
            pairs.push(`${name}="${escapeAttribute(safe)}"`);
        }
        else {
            pairs.push(`${name}="${escapeAttribute(decodeHtmlEntities(value))}"`);
        }
    }
    if (tag === "a" && pairs.some((item) => item.startsWith("href="))) {
        pairs.push('rel="noopener noreferrer"');
    }
    return pairs.length ? ` ${pairs.join(" ")}` : "";
}

function safeResourceUrl(value, baseUrl, image) {
    const text = decodeHtmlEntities(value).trim();
    if (!text || /^javascript:/i.test(text) || /^data:text\/html/i.test(text)) return null;
    if (image && /^data:image\/(?:png|gif|jpeg|webp);base64,/i.test(text)) return text;
    try {
        const url = new URL(text, baseUrl);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    }
    catch (error) {
        return null;
    }
}

function readAttribute(raw, name) {
    const escaped = escapeRegExp(name);
    const quoted = new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(raw);
    if (quoted) return quoted[2];
    const bare = new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, "i").exec(raw);
    return bare ? bare[1] : null;
}

function escapeMarkdownText(value) {
    return String(value || "").replace(/([\\`*_{}[\]])/g, "\\$1");
}

function escapeText(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
    return escapeText(value).replace(/"/g, "&quot;");
}

function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function safeCodePoint(value) {
    try {
        return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
            ? String.fromCodePoint(value)
            : "";
    }
    catch (error) {
        return "";
    }
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
