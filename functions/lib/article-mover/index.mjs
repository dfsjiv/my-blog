import { parseNowCoderArticle, parseNowCoderUrl } from "./nowcoder-adapter.mjs";
import { parseZhihuArticle, parseZhihuUrl } from "./zhihu-adapter.mjs";

const MAX_URLS = 20;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;
const ALLOWED_TYPES = new Set(["article", "solution", "note", "project", "essay"]);

export function isArticleMoverPath(pathname) {
    return pathname === "/api/knowledge/admin/article-mover/preview"
        || pathname === "/api/knowledge/admin/article-mover/import";
}

export async function handleArticleMoverRequest(context, user, createPost) {
    const { request, env, url, jsonResponse } = context;
    if (url.pathname === "/api/knowledge/admin/article-mover/preview") {
        if (request.method !== "POST") {
            return errorResponse(jsonResponse, 405, "VALIDATION_ERROR", "请求方法不受支持");
        }
        const body = await readBody(request);
        if (body.error) return errorResponse(jsonResponse, 400, "VALIDATION_ERROR", body.error);
        const urls = normalizeUrls(body.value.urls);
        if (urls.error) return errorResponse(jsonResponse, 400, "VALIDATION_ERROR", urls.error);
        const items = await mapWithConcurrency(urls.value, 2, async (sourceUrl) => {
            try {
                const article = await fetchExternalArticle(sourceUrl);
                return await buildPreview(article, env, user.id);
            }
            catch (error) {
                return failedItem(sourceUrl, error);
            }
        });
        return jsonResponse({
            success: true,
            data: { items, summary: summarize(items) }
        });
    }

    if (url.pathname === "/api/knowledge/admin/article-mover/import") {
        if (request.method !== "POST") {
            return errorResponse(jsonResponse, 405, "VALIDATION_ERROR", "请求方法不受支持");
        }
        const body = await readBody(request);
        if (body.error) return errorResponse(jsonResponse, 400, "VALIDATION_ERROR", body.error);
        const items = normalizeImportItems(body.value.items);
        if (items.error) return errorResponse(jsonResponse, 400, "VALIDATION_ERROR", items.error);
        const results = [];
        for (const item of items.value) {
            try {
                results.push(await importOne(item, context, user, createPost));
            }
            catch (error) {
                console.error("Article mover import failed:", safeMessage(error));
                results.push(failedItem(item.sourceUrl, error));
            }
        }
        return jsonResponse({
            success: true,
            data: { items: results, summary: summarize(results) }
        });
    }
    return errorResponse(jsonResponse, 404, "NOT_FOUND", "接口不存在");
}

export async function fetchExternalArticle(sourceUrl, fetchImpl = fetch) {
    let source = identifySource(sourceUrl);
    if (!source) throw moverError("UNSUPPORTED_URL", "仅支持公开的牛客题解和知乎专栏文章链接");
    let currentUrl = source.normalizedUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let response;
        try {
            response = await fetchImpl(currentUrl, {
                method: "GET",
                redirect: "manual",
                signal: controller.signal,
                headers: {
                    Accept: "text/html,application/xhtml+xml",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
                    "User-Agent": "Lee-Ethan-Article-Mover/1.0"
                }
            });
        }
        catch (error) {
            if (error?.name === "AbortError") {
                throw moverError("FETCH_TIMEOUT", "读取外部文章超时");
            }
            throw moverError("NETWORK_ERROR", "无法连接外部文章平台");
        }
        finally {
            clearTimeout(timeout);
        }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("Location");
            if (!location || redirects === 3) {
                throw moverError("REDIRECT_REJECTED", "外部文章重定向异常");
            }
            const redirected = identifySource(new URL(location, currentUrl).href);
            if (!redirected || redirected.platform !== source.platform) {
                throw moverError("REDIRECT_REJECTED", "外部文章重定向到了不受支持的地址");
            }
            source = redirected;
            currentUrl = redirected.normalizedUrl;
            continue;
        }
        if (response.status === 401 || response.status === 403) {
            throw moverError(
                "PLATFORM_BLOCKED",
                `${platformName(source.platform)}拒绝了公开读取，页面可能需要登录或触发了访问限制`
            );
        }
        if (response.status === 404 || response.status === 410) {
            throw moverError("NOT_FOUND", "外部文章不存在或已删除");
        }
        if (!response.ok) {
            throw moverError("PLATFORM_ERROR", `外部平台返回 HTTP ${response.status}`);
        }
        const contentType = response.headers.get("Content-Type") || "";
        if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
            throw moverError("INVALID_CONTENT_TYPE", "外部地址没有返回文章页面");
        }
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > MAX_RESPONSE_BYTES) {
            throw moverError("CONTENT_TOO_LARGE", "外部文章页面过大，无法安全处理");
        }
        const html = new TextDecoder("utf-8").decode(bytes);
        const article = source.platform === "nowcoder"
            ? parseNowCoderArticle(html, source)
            : parseZhihuArticle(html, source);
        article.fetchedAt = new Date().toISOString();
        article.rawMetadata = {
            sourceUrl: article.normalizedUrl,
            remoteArticleId: article.remoteArticleId,
            author: article.author,
            originalPublishedTime: article.originalPublishedTime,
            originalUpdatedTime: article.originalUpdatedTime,
            publishedAt: article.publishedAt,
            updatedAt: article.updatedAt,
            tags: article.tags,
            problem: article.solutionMeta,
            images: {
                count: article.imageCount,
                domains: article.imageDomains,
                relativeCount: article.relativeImageCount
            }
        };
        article.checksum = await checksumArticle(article);
        return article;
    }
    throw moverError("REDIRECT_REJECTED", "外部文章重定向次数过多");
}

async function buildPreview(article, env, ownerUserId) {
    const existing = await findSourceMap(env, ownerUserId, article);
    const slug = await suggestSlug(env, article.title);
    const changed = Boolean(
        existing?.knowledge_post_id
        && existing.snapshot_checksum
        && existing.snapshot_checksum !== article.checksum
    );
    const metrics = contentMetrics(article.normalizedMarkdown);
    return {
        ok: true,
        platform: article.platform,
        platformLabel: platformName(article.platform),
        sourceUrl: article.normalizedUrl,
        remoteArticleId: article.remoteArticleId,
        title: article.title,
        slug: slug.value,
        slugConflict: slug.conflict,
        suggestedSlug: slug.value,
        type: article.defaultType,
        summary: article.summary,
        category: article.category,
        tags: article.tags,
        author: article.author,
        rawContentFormat: article.rawContentFormat,
        contentMarkdown: article.normalizedMarkdown,
        safeHtml: article.safeHtml,
        originalPublishedTime: article.originalPublishedTime,
        originalUpdatedTime: article.originalUpdatedTime,
        publishedAtUtc: article.publishedAt,
        updatedAtUtc: article.updatedAt,
        wordCount: metrics.wordCount,
        imageCount: article.imageCount,
        imageDomains: article.imageDomains,
        relativeImageCount: article.relativeImageCount,
        codeBlockCount: article.codeBlockCount,
        warnings: article.warnings,
        alreadyImported: Boolean(existing?.knowledge_post_id),
        remoteUpdated: changed,
        knowledgePostId: existing?.knowledge_post_id || null
    };
}

async function importOne(item, context, user, createPost) {
    const article = await fetchExternalArticle(item.sourceUrl);
    const snapshotId = await saveSnapshot(context.env, user.id, article);
    const existing = await findSourceMap(context.env, user.id, article);
    if (existing?.knowledge_post_id) {
        const changed = existing.snapshot_checksum !== article.checksum;
        if (changed) {
            await context.env.DB.prepare(`
                UPDATE knowledge_external_source_map
                SET snapshot_id = ?, import_status = 'remote_updated',
                    source_updated_at = ?, updated_at = ?
                WHERE id = ?
            `).bind(snapshotId, article.updatedAt, new Date().toISOString(), existing.id).run();
        }
        return {
            ok: false,
            code: changed ? "REMOTE_UPDATED" : "ALREADY_IMPORTED",
            sourceUrl: article.normalizedUrl,
            title: article.title,
            message: changed ? "远程文章已有更新，未覆盖本地草稿" : "该文章已经导入",
            knowledgePostId: existing.knowledge_post_id
        };
    }

    const now = new Date().toISOString();
    await context.env.DB.prepare(`
        INSERT OR IGNORE INTO knowledge_external_source_map (
            owner_user_id, platform, source_identity, source_url,
            remote_article_id, snapshot_id, import_status,
            source_published_at, source_updated_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'discovered', ?, ?, ?, ?)
    `).bind(
        user.id, article.platform, article.sourceIdentity, article.normalizedUrl,
        article.remoteArticleId, snapshotId, article.publishedAt, article.updatedAt, now, now
    ).run();
    const map = await findSourceMap(context.env, user.id, article);
    const nonce = crypto.randomUUID();
    const lock = await context.env.DB.prepare(`
        UPDATE knowledge_external_source_map
        SET import_status = 'importing', import_nonce = ?, snapshot_id = ?, updated_at = ?
        WHERE id = ? AND knowledge_post_id IS NULL
          AND import_status IN ('discovered', 'failed', 'conflict')
    `).bind(nonce, snapshotId, now, map.id).run();
    if (!Number(lock?.meta?.changes)) {
        return {
            ok: false,
            code: "IMPORT_IN_PROGRESS",
            sourceUrl: article.normalizedUrl,
            title: article.title,
            message: "该文章正在导入，请稍后刷新"
        };
    }

    const postBody = normalizePostOverrides(item, article);
    const postRequest = new Request("https://internal/api/knowledge/admin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postBody)
    });
    const response = await createPost(postRequest, context.env, user, context.jsonResponse);
    const payload = await response.clone().json().catch(() => null);
    if (!response.ok || !payload?.success || !payload?.data?.post?.id) {
        const conflict = payload?.error?.code === "SLUG_CONFLICT";
        await context.env.DB.prepare(`
            UPDATE knowledge_external_source_map
            SET import_status = ?, import_nonce = NULL, updated_at = ?
            WHERE id = ? AND import_nonce = ?
        `).bind(conflict ? "conflict" : "failed", new Date().toISOString(), map.id, nonce).run();
        return {
            ok: false,
            code: conflict ? "SLUG_CONFLICT" : "IMPORT_FAILED",
            sourceUrl: article.normalizedUrl,
            title: article.title,
            message: conflict ? "Slug 已被使用，请修改后重试" : "创建知识站草稿失败"
        };
    }

    const postId = Number(payload.data.post.id);
    await context.env.DB.prepare(`
        UPDATE knowledge_posts
        SET created_at = COALESCE(?, created_at),
            updated_at = COALESCE(?, updated_at)
        WHERE id = ?
    `).bind(article.publishedAt, article.updatedAt, postId).run();
    const importedAt = new Date().toISOString();
    await context.env.DB.prepare(`
        UPDATE knowledge_external_source_map
        SET knowledge_post_id = ?, snapshot_id = ?, import_status = 'imported',
            import_nonce = NULL, imported_at = ?, updated_at = ?
        WHERE id = ? AND import_nonce = ?
    `).bind(postId, snapshotId, importedAt, importedAt, map.id, nonce).run();
    return {
        ok: true,
        code: "IMPORTED",
        sourceUrl: article.normalizedUrl,
        title: postBody.title,
        slug: postBody.slug,
        status: "draft",
        knowledgePostId: postId,
        message: "已导入草稿"
    };
}

async function saveSnapshot(env, ownerUserId, article) {
    const now = new Date().toISOString();
    await env.DB.prepare(`
        INSERT OR IGNORE INTO external_article_snapshots (
            owner_user_id, platform, source_url, source_identity,
            remote_article_id, title, raw_content, raw_content_format,
            raw_metadata_json, normalized_markdown, content_checksum,
            fetched_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        ownerUserId,
        article.platform,
        article.normalizedUrl,
        article.sourceIdentity,
        article.remoteArticleId,
        article.title,
        article.rawContent,
        article.rawContentFormat,
        JSON.stringify(article.rawMetadata),
        article.normalizedMarkdown,
        article.checksum,
        article.fetchedAt,
        now
    ).run();
    const row = await env.DB.prepare(`
        SELECT id FROM external_article_snapshots
        WHERE owner_user_id = ? AND platform = ? AND source_identity = ?
          AND content_checksum = ?
        LIMIT 1
    `).bind(ownerUserId, article.platform, article.sourceIdentity, article.checksum).first();
    if (!row) throw moverError("SNAPSHOT_FAILED", "无法保存原始文章快照");
    return Number(row.id);
}

async function findSourceMap(env, ownerUserId, article) {
    return env.DB.prepare(`
        SELECT m.*, s.content_checksum AS snapshot_checksum
        FROM knowledge_external_source_map AS m
        LEFT JOIN external_article_snapshots AS s ON s.id = m.snapshot_id
        WHERE m.owner_user_id = ? AND m.platform = ? AND m.source_identity = ?
        LIMIT 1
    `).bind(ownerUserId, article.platform, article.sourceIdentity).first();
}

function identifySource(value) {
    return parseNowCoderUrl(value) || parseZhihuUrl(value);
}

async function checksumArticle(article) {
    const canonical = JSON.stringify({
        platform: article.platform,
        sourceIdentity: article.sourceIdentity,
        title: article.title,
        rawContent: article.rawContent,
        publishedAt: article.originalPublishedTime || article.publishedAt,
        updatedAt: article.originalUpdatedTime || article.updatedAt
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function suggestSlug(env, title) {
    const base = normalizeSlug(title).slice(0, 190) || "imported-article";
    const existing = await env.DB.prepare(
        "SELECT id FROM knowledge_posts WHERE slug = ? LIMIT 1"
    ).bind(base).first();
    if (!existing) return { value: base, conflict: false };
    for (let suffix = 2; suffix <= 999; suffix += 1) {
        const value = `${base.slice(0, 190)}-${suffix}`;
        const row = await env.DB.prepare(
            "SELECT id FROM knowledge_posts WHERE slug = ? LIMIT 1"
        ).bind(value).first();
        if (!row) return { value, conflict: true };
    }
    return { value: `${base}-${Date.now()}`, conflict: true };
}

function normalizePostOverrides(item, article) {
    const type = ALLOWED_TYPES.has(item.type) ? item.type : article.defaultType;
    return {
        type,
        title: limitedString(item.title, 240) || article.title,
        slug: normalizeSlug(item.slug || article.title),
        summary: limitedString(item.summary, 1000) || article.summary || "",
        contentMarkdown: article.normalizedMarkdown,
        category: limitedString(item.category, 100) || article.category,
        tags: normalizeTags(item.tags?.length ? item.tags : article.tags),
        status: "draft",
        isPinned: false,
        isFeatured: false,
        coverUrl: null,
        sourceUrl: article.normalizedUrl,
        solutionMeta: type === "solution" ? article.solutionMeta || {
            platform: platformName(article.platform),
            problemId: article.remoteArticleId,
            problemTitle: article.title,
            problemUrl: article.normalizedUrl,
            difficulty: null,
            algorithms: [],
            language: null,
            timeComplexity: null,
            spaceComplexity: null,
            accepted: null
        } : null
    };
}

function normalizeUrls(value) {
    const list = Array.isArray(value)
        ? value
        : typeof value === "string" ? value.split(/\r?\n/) : [];
    const urls = [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
    if (!urls.length) return { error: "请至少输入一个文章 URL" };
    if (urls.length > MAX_URLS) return { error: `一次最多处理 ${MAX_URLS} 个 URL` };
    return { value: urls };
}

function normalizeImportItems(value) {
    if (!Array.isArray(value)) return { error: "items 必须为数组" };
    const selected = value.filter((item) => item && item.selected !== false);
    if (!selected.length) return { error: "请至少选择一篇文章" };
    if (selected.length > MAX_URLS) return { error: `一次最多导入 ${MAX_URLS} 篇文章` };
    for (const item of selected) {
        if (typeof item.sourceUrl !== "string" || !identifySource(item.sourceUrl)) {
            return { error: "导入项包含不受支持的 URL" };
        }
    }
    return { value: selected };
}

function normalizeTags(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
        .slice(0, 15)
        .map((item) => item.slice(0, 40));
}

function contentMetrics(markdown) {
    const text = String(markdown || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`[^`]*`/g, " ")
        .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
        .replace(/\[[^\]]*]\([^)]*\)/g, " ")
        .replace(/[#>*_~\-|]/g, " ");
    const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const words = (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
    return { wordCount: chinese + words };
}

function normalizeSlug(value) {
    const text = String(value || "").normalize("NFKC").trim().toLowerCase();
    const slug = text
        .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
    return slug || "imported-article";
}

function summarize(items) {
    return {
        total: items.length,
        success: items.filter((item) => item.ok).length,
        failed: items.filter((item) => !item.ok).length,
        imported: items.filter((item) => item.code === "IMPORTED").length,
        conflicts: items.filter((item) => item.code === "SLUG_CONFLICT").length,
        needsReview: items.filter((item) => item.remoteUpdated || item.warnings?.length).length
    };
}

function failedItem(sourceUrl, error) {
    return {
        ok: false,
        sourceUrl,
        code: error?.code || "PARSE_FAILED",
        message: safeMessage(error)
    };
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await worker(items[index]);
        }
    }));
    return results;
}

async function readBody(request) {
    try {
        const value = await request.json();
        return value && typeof value === "object" && !Array.isArray(value)
            ? { value }
            : { error: "请求体必须为 JSON 对象" };
    }
    catch (error) {
        return { error: "请求体不是有效 JSON" };
    }
}

function limitedString(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function platformName(platform) {
    return platform === "nowcoder" ? "牛客题解" : "知乎文章";
}

function moverError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function safeMessage(error) {
    if (error?.code && typeof error.message === "string") return error.message;
    return "文章处理失败，请稍后重试";
}

function errorResponse(jsonResponse, status, code, message) {
    return jsonResponse({ success: false, error: { code, message } }, status);
}
