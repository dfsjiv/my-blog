import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = Number(process.argv[2]) || 8766;
const emptyMode = process.argv[3] === "empty";
const now = "2026-07-28T08:00:00.000Z";
const posts = [
    {
        id: 2,
        slug: "safe-markdown",
        type: "article",
        title: "安全 Markdown 测试",
        summary: "验证 Markdown、目录和安全清理。",
        contentMarkdown: [
            "# 安全 Markdown",
            "",
            "## 中文标题",
            "",
            "**粗体**、*斜体*、~~删除线~~ 和 `inline code`。",
            "",
            "- [x] 已完成",
            "- [ ] 待完成",
            "",
            "| 字段 | 内容 |",
            "| --- | --- |",
            "| A | B |",
            "",
            "```cpp",
            "int main() {",
            "    return 0;",
            "}",
            "```",
            "",
            "## 中文标题",
            "",
            "<script>window.__knowledgeXss = 1</script>",
            "<img src=\"x\" onerror=\"window.__knowledgeXss = 2\">",
            "[危险链接](javascript:window.__knowledgeXss=3)",
        ].join("\n"),
        coverUrl: null,
        category: "技术文章",
        categorySlug: "技术文章",
        tags: [{ name: "安全", slug: "安全" }],
        status: "published",
        isPinned: true,
        isFeatured: true,
        sourceUrl: null,
        wordCount: 180,
        readingTimeMinutes: 2,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
        solutionMeta: null,
    },
    {
        id: 1,
        slug: "binary-solution",
        type: "solution",
        title: "二分查找题解",
        summary: "真实题解卡片和详情信息。",
        contentMarkdown: "## 解题思路\n\n使用二分查找。\n\n### 复杂度\n\n时间复杂度为 `O(log n)`。",
        coverUrl: null,
        category: "算法题解",
        categorySlug: "算法题解",
        tags: [{ name: "二分", slug: "二分" }],
        status: "published",
        isPinned: false,
        isFeatured: false,
        sourceUrl: null,
        wordCount: 80,
        readingTimeMinutes: 1,
        createdAt: now,
        updatedAt: now,
        publishedAt: "2026-07-27T08:00:00.000Z",
        solutionMeta: {
            platform: "Codeforces",
            problemId: "1A",
            problemTitle: "Theatre Square",
            problemUrl: "https://codeforces.com/problemset/problem/1/A",
            difficulty: "800",
            algorithms: ["二分"],
            language: "C++",
            timeComplexity: "O(log n)",
            spaceComplexity: "O(1)",
            accepted: true,
        },
    },
];

function json(response, data, status = 200) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(data));
}

function listPosts(url) {
    let items = emptyMode ? [] : posts.slice();
    const type = url.searchParams.get("type");
    const category = url.searchParams.get("category");
    const tag = url.searchParams.get("tag");
    const q = (url.searchParams.get("q") || "").toLocaleLowerCase();
    if (type) items = items.filter((post) => post.type === type);
    if (category) items = items.filter((post) => post.categorySlug === category);
    if (tag) items = items.filter((post) => post.tags.some((item) => item.slug === tag));
    if (q) {
        items = items.filter((post) => [
            post.title,
            post.summary,
            post.contentMarkdown,
            post.tags.map((item) => item.name).join(" "),
        ].join(" ").toLocaleLowerCase().includes(q));
    }
    if (url.searchParams.get("featured") === "true") {
        items = items.filter((post) => post.isFeatured);
    }
    if (url.searchParams.get("pinned") === "true") {
        items = items.filter((post) => post.isPinned);
    }
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 10);
    const start = (page - 1) * pageSize;
    return {
        items: items.slice(start, start + pageSize).map(({ contentMarkdown, ...post }) => post),
        pagination: {
            page,
            pageSize,
            total: items.length,
            totalPages: Math.ceil(items.length / pageSize),
            hasPrevious: page > 1,
            hasNext: start + pageSize < items.length,
        },
    };
}

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ttf": "font/ttf",
};

http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/login" && request.method === "POST") {
        return json(response, {
            success: true,
            user: { id: 1, username: "Lee Ethan", role: "admin" },
            sessionToken: "fixture-admin-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
        });
    }
    if (url.pathname === "/api/me") {
        if (request.headers.authorization !== "Bearer fixture-admin-token") {
            return json(response, { success: false, message: "Unauthorized" }, 401);
        }
        return json(response, {
            success: true,
            user: { id: 1, username: "Lee Ethan", role: "admin" },
            expiresAt: "2099-01-01T00:00:00.000Z",
        });
    }
    if (url.pathname === "/api/logout" && request.method === "POST") {
        return json(response, { success: true });
    }
    if (url.pathname === "/api/knowledge/posts") {
        return json(response, { success: true, data: listPosts(url) });
    }
    if (url.pathname === "/api/knowledge/facets") {
        if (emptyMode) {
            return json(response, {
                success: true,
                data: {
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
                        lastUpdatedAt: null,
                    },
                },
            });
        }
        return json(response, {
            success: true,
            data: {
                types: [
                    { type: "article", count: 1 },
                    { type: "solution", count: 1 },
                ],
                categories: [
                    { name: "技术文章", slug: "技术文章", count: 1 },
                    { name: "算法题解", slug: "算法题解", count: 1 },
                ],
                tags: [
                    { name: "安全", slug: "安全", count: 1 },
                    { name: "二分", slug: "二分", count: 1 },
                ],
                archives: [{ year: 2026, month: 7, count: 2 }],
                stats: {
                    posts: 2,
                    solutions: 1,
                    notes: 0,
                    projects: 0,
                    essays: 0,
                    words: 260,
                    lastUpdatedAt: now,
                },
            },
        });
    }
    const detailMatch = url.pathname.match(/^\/api\/knowledge\/posts\/([^/]+)$/);
    if (detailMatch) {
        const post = emptyMode
            ? null
            : posts.find((item) => item.slug === decodeURIComponent(detailMatch[1]));
        return post
            ? json(response, { success: true, data: { post } })
            : json(response, {
                success: false,
                error: { code: "NOT_FOUND", message: "文章不存在" },
            }, 404);
    }

    const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(root)) {
        response.writeHead(403);
        return response.end("Forbidden");
    }
    try {
        const content = await fs.readFile(target);
        response.writeHead(200, {
            "Content-Type": contentTypes[path.extname(target).toLowerCase()]
                || "application/octet-stream",
        });
        response.end(content);
    }
    catch {
        response.writeHead(404);
        response.end("Not Found");
    }
}).listen(port, "127.0.0.1", () => {
    console.log(`Knowledge fixture server listening on http://127.0.0.1:${port}`);
});
