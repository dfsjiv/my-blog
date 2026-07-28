const LEGACY_SOURCE = "legacy-blog";
const LEGACY_TABLE = "articles";
const LEGACY_SLUG_PREFIX = "legacy-article-";

export const legacyTypeMapping = Object.freeze({
    algorithm: Object.freeze({ type: "article", category: "算法文章" }),
    computer: Object.freeze({ type: "article", category: "计算机技术" }),
    essay: Object.freeze({ type: "essay", category: "个人随笔" })
});

export async function tableExists(env, tableName) {
    const row = await env.DB.prepare(`
        SELECT 1 AS present
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        LIMIT 1
    `).bind(tableName).first();
    return Boolean(row);
}

export function normalizeLegacyCategory(category) {
    const key = String(category || "").trim();
    const mapping = legacyTypeMapping[key];
    return mapping
        ? { name: mapping.category, slug: key }
        : { name: key || null, slug: key || null };
}

export function normalizeLegacyTags() {
    return [];
}

export function normalizeLegacyPost(row) {
    const category = normalizeLegacyCategory(row.category);
    const content = typeof row.content === "string" ? row.content : "";
    const metrics = calculateTextMetrics(content);
    const sourceId = Number(row.id);
    const mapping = legacyTypeMapping[row.category] || { type: "article" };
    return {
        id: sourceId,
        source: LEGACY_SOURCE,
        sourceId,
        legacyId: sourceId,
        legacySlug: null,
        legacyUrl: null,
        slug: `${LEGACY_SLUG_PREFIX}${sourceId}`,
        type: mapping.type,
        title: row.title || "",
        summary: row.summary || createSummary(content),
        content,
        originalContent: content,
        renderedContent: null,
        contentMarkdown: content,
        contentFormat: detectLegacyContentFormat(content),
        coverUrl: null,
        category: category.name,
        categorySlug: category.slug,
        tags: normalizeLegacyTags(row),
        status: "published",
        isPinned: false,
        isFeatured: false,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || row.created_at || null,
        publishedAt: row.created_at || null,
        wordCount: metrics.wordCount,
        readingTimeMinutes: metrics.readingTimeMinutes,
        sourceUrl: null,
        author: row.author || null,
        solutionMeta: null
    };
}

export async function fetchLegacyPosts(env, filters = {}, limit = 50) {
    if (!await tableExists(env, LEGACY_TABLE)) return { items: [], total: 0 };
    const where = [];
    const bindings = [];
    const categoryKeys = categoriesForType(filters.type);
    if (filters.type && !categoryKeys.length) return { items: [], total: 0 };
    if (filters.channel && !["all", "article", "solution", "note", "project"].includes(filters.channel)) {
        return { items: [], total: 0 };
    }
    if (filters.channel && filters.channel !== "all") {
        const channelCategories = categoriesForType(filters.channel);
        if (!channelCategories.length) return { items: [], total: 0 };
        appendInFilter(where, bindings, "a.category", channelCategories);
    }
    if (categoryKeys.length) appendInFilter(where, bindings, "a.category", categoryKeys);
    if (filters.category) {
        where.push("a.category = ?");
        bindings.push(String(filters.category).trim());
    }
    if (filters.tag || filters.featured === true || filters.pinned === true) {
        return { items: [], total: 0 };
    }
    const excludedIds = Array.from(filters.excludeSourceIds || [])
        .map(Number)
        .filter(Number.isSafeInteger);
    if (excludedIds.length) {
        appendInFilter(where, bindings, "a.id", excludedIds, true);
    }
    if (filters.q) {
        const query = `%${String(filters.q).toLowerCase()}%`;
        where.push(`(
            LOWER(a.title) LIKE ? OR LOWER(COALESCE(a.summary, '')) LIKE ?
            OR LOWER(a.content) LIKE ?
        )`);
        bindings.push(query, query, query);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const count = await env.DB.prepare(`
        SELECT COUNT(*) AS total FROM ${LEGACY_TABLE} AS a ${whereSql}
    `).bind(...bindings).first();
    const orderSql = filters.sort === "oldest"
        ? "a.created_at ASC, a.id ASC"
        : filters.sort === "updated"
            ? "a.updated_at DESC, a.id DESC"
            : "a.created_at DESC, a.id DESC";
    const rows = await env.DB.prepare(`
        SELECT
            a.id, a.title, a.summary, a.content, a.category,
            a.created_at, a.updated_at, u.username AS author
        FROM ${LEGACY_TABLE} AS a
        LEFT JOIN users AS u ON u.id = a.author_id
        ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ?
    `).bind(...bindings, Math.max(1, Number(limit) || 50)).all();
    return {
        items: (rows.results || []).map(normalizeLegacyPost),
        total: Number(count?.total) || 0
    };
}

export async function fetchLegacyPostBySlug(env, slug) {
    if (!await tableExists(env, LEGACY_TABLE)) return null;
    const match = String(slug || "").match(/^legacy-article-(\d+)$/);
    if (!match) return null;
    const row = await env.DB.prepare(`
        SELECT
            a.id, a.title, a.summary, a.content, a.category,
            a.created_at, a.updated_at, u.username AS author
        FROM ${LEGACY_TABLE} AS a
        LEFT JOIN users AS u ON u.id = a.author_id
        WHERE a.id = ?
        LIMIT 1
    `).bind(Number(match[1])).first();
    return row ? normalizeLegacyPost(row) : null;
}

export async function getLegacyFacets(env, excludeSourceIds = new Set()) {
    if (!await tableExists(env, LEGACY_TABLE)) {
        return {
            types: [],
            categories: [],
            tags: [],
            archives: [],
            stats: {
                posts: 0,
                solutions: 0,
                notes: 0,
                projects: 0,
                essays: 0,
                words: 0,
                lastUpdatedAt: null
            }
        };
    }
    const count = await fetchLegacyPosts(env, { excludeSourceIds }, 1);
    const posts = await fetchLegacyPosts(
        env,
        { excludeSourceIds },
        Math.max(1, count.total)
    );
    const categoryCounts = new Map();
    const archiveCounts = new Map();
    posts.items.forEach((post) => {
        const category = categoryCounts.get(post.categorySlug) || {
            name: post.category,
            slug: post.categorySlug,
            count: 0
        };
        category.count += 1;
        categoryCounts.set(post.categorySlug, category);
        const date = new Date(String(post.publishedAt || "").replace(" ", "T") + "Z");
        if (!Number.isNaN(date.getTime())) {
            const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
            const archive = archiveCounts.get(key) || {
                year: date.getUTCFullYear(),
                month: date.getUTCMonth() + 1,
                count: 0
            };
            archive.count += 1;
            archiveCounts.set(key, archive);
        }
    });
    return {
        types: countBy(posts.items, "type"),
        categories: Array.from(categoryCounts.values()).sort((a, b) => b.count - a.count),
        tags: [],
        archives: Array.from(archiveCounts.values()).sort((a, b) => (
            b.year - a.year || b.month - a.month
        )),
        stats: {
            posts: posts.total,
            solutions: posts.items.filter((post) => post.type === "solution").length,
            notes: posts.items.filter((post) => post.type === "note").length,
            projects: posts.items.filter((post) => post.type === "project").length,
            essays: posts.items.filter((post) => post.type === "essay").length,
            words: posts.items.reduce((total, post) => total + post.wordCount, 0),
            lastUpdatedAt: posts.items.reduce((latest, post) => (
                !latest || Date.parse(post.updatedAt) > Date.parse(latest)
                    ? post.updatedAt
                    : latest
            ), null)
        }
    };
}

export async function getMigratedLegacyIds(env) {
    if (
        !await tableExists(env, "knowledge_migration_map")
        || !await tableExists(env, "knowledge_posts")
    ) {
        return new Set();
    }
    const result = await env.DB.prepare(`
        SELECT m.source_id
        FROM knowledge_migration_map AS m
        JOIN knowledge_posts AS p ON p.id = m.target_post_id
        WHERE m.source_type = ?
          AND m.migration_status IN ('migrated', 'verified')
          AND p.status = 'published'
          AND p.deleted_at IS NULL
    `).bind(LEGACY_SOURCE).all();
    return new Set((result.results || []).map((row) => Number(row.source_id)));
}

export async function buildLegacyMigrationAudit(env) {
    const rows = await readAllLegacyRows(env);
    const posts = rows.map(normalizeLegacyPost);
    const knowledgeExists = await tableExists(env, "knowledge_posts");
    const mapExists = await tableExists(env, "knowledge_migration_map");
    const targetSlugs = knowledgeExists ? await readTargetSlugs(env) : new Set();
    const mapStats = mapExists ? await readMigrationStats(env) : emptyMigrationStats();
    const duplicateTitles = duplicateValueSet(rows, "title");
    const problems = [];
    let slugConflicts = 0;
    let emptyContent = 0;
    let unknownFormats = 0;
    let autoMigratable = 0;
    let manualReview = 0;
    const formats = {};
    const categories = {};
    let imageUrls = 0;
    let externalResources = 0;
    const imageBreakdown = {
        relative: 0,
        absolute: 0,
        data: 0,
        invalid: 0,
        externalHost: 0
    };

    posts.forEach((post) => {
        formats[post.contentFormat] = (formats[post.contentFormat] || 0) + 1;
        categories[post.categorySlug || "uncategorized"] =
            (categories[post.categorySlug || "uncategorized"] || 0) + 1;
        const analysis = analyzeContent(post.originalContent);
        imageUrls += analysis.imageUrls;
        externalResources += analysis.externalResources;
        Object.keys(imageBreakdown).forEach((key) => {
            imageBreakdown[key] += analysis.imageBreakdown[key];
        });
        const postProblems = [];
        if (!post.originalContent.trim()) {
            emptyContent += 1;
            postProblems.push(["empty-content", "正文为空"]);
        }
        if (post.contentFormat === "unknown") {
            unknownFormats += 1;
            postProblems.push(["unknown-format", "正文格式无法识别"]);
        }
        else if (post.contentFormat !== "markdown") {
            postProblems.push([
                "target-format-unsupported",
                "现有知识文章表不能无损保存该正文格式"
            ]);
        }
        if (targetSlugs.has(normalizeSlugConflict(post.slug))) {
            slugConflicts += 1;
            postProblems.push(["slug-conflict", "目标 slug 已存在"]);
        }
        if (duplicateTitles.has(normalizeComparable(post.title))) {
            postProblems.push(["duplicate-title", "存在重复标题"]);
        }
        if (postProblems.length) manualReview += 1;
        else autoMigratable += 1;
        postProblems.forEach(([problemType, message]) => problems.push({
            sourceId: post.sourceId,
            title: post.title,
            slug: post.legacySlug,
            problemType,
            message
        }));
    });

    return {
        source: LEGACY_SOURCE,
        sourceTable: LEGACY_TABLE,
        legacyTotal: posts.length,
        publishedCount: posts.length,
        draftCount: 0,
        contentFormats: formats,
        missingSlugCount: posts.length,
        slugConflictCount: slugConflicts,
        duplicateTitleCount: duplicateTitles.size,
        emptyContentCount: emptyContent,
        unknownFormatCount: unknownFormats,
        categories,
        tagCount: 0,
        imageUrlCount: imageUrls,
        imageUrlBreakdown: imageBreakdown,
        externalResourceCount: externalResources,
        autoMigratableCount: autoMigratable,
        manualReviewCount: manualReview,
        migratedCount: mapStats.migrated,
        verifiedCount: mapStats.verified,
        failedCount: mapStats.failed,
        conflictCount: mapStats.conflict,
        mappingTableAvailable: mapExists,
        targetTableAvailable: knowledgeExists,
        problems: problems.slice(0, 100)
    };
}

export async function buildLegacyMigrationDryRun(env) {
    const rows = await readAllLegacyRows(env);
    const knowledgeExists = await tableExists(env, "knowledge_posts");
    const targetSlugs = knowledgeExists ? await readTargetSlugs(env) : new Set();
    const plans = [];
    for (const row of rows) {
        const post = normalizeLegacyPost(row);
        const slugConflict = targetSlugs.has(normalizeSlugConflict(post.slug));
        const contentRisk = !post.originalContent.trim() || post.contentFormat !== "markdown";
        const checksum = await createLegacyChecksum(post);
        plans.push({
            sourceId: post.sourceId,
            sourceSlug: post.legacySlug,
            targetSlug: post.slug,
            sourceFormat: post.contentFormat,
            targetFormat: post.contentFormat,
            typeMapping: post.type,
            categoryMapping: {
                name: post.category,
                slug: post.categorySlug
            },
            tagMapping: [],
            sourceChecksum: checksum,
            targetChecksum: checksum,
            slugConflict,
            contentRisk,
            canAutoMigrate: !slugConflict && !contentRisk,
            plannedAction: slugConflict || contentRisk ? "manual-review" : "copy"
        });
    }
    return {
        summary: {
            total: plans.length,
            copy: plans.filter((plan) => plan.plannedAction === "copy").length,
            manualReview: plans.filter((plan) => plan.plannedAction === "manual-review").length,
            writesPerformed: 0
        },
        plans
    };
}

export async function createLegacyChecksum(post) {
    const canonical = JSON.stringify({
        title: post.title,
        originalContent: post.originalContent,
        slug: post.legacySlug,
        publishedAt: post.publishedAt,
        category: post.categorySlug,
        tags: post.tags.map((tag) => tag.slug || tag.name || tag)
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function detectLegacyContentFormat(content) {
    const value = String(content || "");
    if (!value.trim()) return "markdown";
    if (/<(?:article|section|div|p|h[1-6]|ul|ol|li|pre|blockquote|img|table)\b[^>]*>/i.test(value)) {
        return "html";
    }
    return "markdown";
}

function categoriesForType(type) {
    if (!type) return [];
    return Object.entries(legacyTypeMapping)
        .filter(([, mapping]) => mapping.type === type)
        .map(([category]) => category);
}

function appendInFilter(where, bindings, column, values, exclude = false) {
    where.push(`${column} ${exclude ? "NOT IN" : "IN"} (${values.map(() => "?").join(", ")})`);
    bindings.push(...values);
}

function calculateTextMetrics(content) {
    const text = String(content || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const chineseCount = (text.match(/[\p{Script=Han}]/gu) || []).length;
    const latinWords = (text.replace(/[\p{Script=Han}]/gu, " ").match(/[\p{Letter}\p{Number}]+/gu) || []).length;
    const wordCount = chineseCount + latinWords;
    return {
        wordCount,
        readingTimeMinutes: Math.max(1, Math.ceil(chineseCount / 400 + latinWords / 220))
    };
}

function createSummary(content, limit = 240) {
    const plain = String(content || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/[`*_>#-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return plain.length > limit ? `${plain.slice(0, limit).trimEnd()}...` : plain;
}

function countBy(items, field) {
    const values = new Map();
    items.forEach((item) => values.set(item[field], (values.get(item[field]) || 0) + 1));
    return Array.from(values, ([type, count]) => ({ type, count }));
}

function analyzeContent(content) {
    const value = String(content || "");
    const imageUrls = [];
    for (const match of value.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
        imageUrls.push(match[1]);
    }
    for (const match of value.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
        imageUrls.push(match[1]);
    }
    const external = value.match(/https?:\/\/[^\s)"'<]+/gi) || [];
    const imageBreakdown = {
        relative: 0,
        absolute: 0,
        data: 0,
        invalid: 0,
        externalHost: 0
    };
    imageUrls.forEach((url) => {
        const source = String(url || "").trim();
        if (/^data:image\//i.test(source)) {
            imageBreakdown.data += 1;
        }
        else if (/^https?:\/\//i.test(source)) {
            imageBreakdown.absolute += 1;
            imageBreakdown.externalHost += 1;
        }
        else if (/^(?:\/(?!\/)|\.{0,2}\/)[^\s]+$/.test(source)) {
            imageBreakdown.relative += 1;
        }
        else {
            imageBreakdown.invalid += 1;
        }
    });
    return {
        imageUrls: imageUrls.length,
        externalResources: external.length,
        imageBreakdown
    };
}

async function readAllLegacyRows(env) {
    if (!await tableExists(env, LEGACY_TABLE)) return [];
    const result = await env.DB.prepare(`
        SELECT
            a.id, a.title, a.summary, a.content, a.category,
            a.created_at, a.updated_at, u.username AS author
        FROM ${LEGACY_TABLE} AS a
        LEFT JOIN users AS u ON u.id = a.author_id
        ORDER BY a.id ASC
    `).all();
    return result.results || [];
}

async function readTargetSlugs(env) {
    const result = await env.DB.prepare("SELECT slug FROM knowledge_posts").all();
    return new Set((result.results || []).map((row) => normalizeSlugConflict(row.slug)));
}

async function readMigrationStats(env) {
    const result = await env.DB.prepare(`
        SELECT migration_status, COUNT(*) AS count
        FROM knowledge_migration_map
        GROUP BY migration_status
    `).all();
    const stats = emptyMigrationStats();
    (result.results || []).forEach((row) => {
        if (Object.prototype.hasOwnProperty.call(stats, row.migration_status)) {
            stats[row.migration_status] = Number(row.count) || 0;
        }
    });
    return stats;
}

function emptyMigrationStats() {
    return { pending: 0, migrated: 0, verified: 0, conflict: 0, failed: 0 };
}

function duplicateValueSet(rows, field) {
    const counts = new Map();
    rows.forEach((row) => {
        const value = normalizeComparable(row[field]);
        if (value) counts.set(value, (counts.get(value) || 0) + 1);
    });
    return new Set(Array.from(counts).filter(([, count]) => count > 1).map(([value]) => value));
}

function normalizeComparable(value) {
    return String(value || "").trim().toLocaleLowerCase();
}

function normalizeSlugConflict(value) {
    const source = String(value || "").trim();
    try {
        return decodeURIComponent(source).normalize("NFKC").toLocaleLowerCase();
    }
    catch {
        return source.normalize("NFKC").toLocaleLowerCase();
    }
}
