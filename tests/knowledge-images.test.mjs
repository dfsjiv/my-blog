import assert from "node:assert/strict";
import test from "node:test";
import {
    getKnowledgeImage,
    uploadKnowledgeImage
} from "../functions/lib/knowledge-images.mjs";

class MemoryR2 {
    constructor() {
        this.objects = new Map();
    }

    async put(key, bytes, options) {
        this.objects.set(key, {
            bytes: new Uint8Array(bytes),
            contentType: options.httpMetadata.contentType,
            httpEtag: '"test-etag"'
        });
    }

    async get(key) {
        const stored = this.objects.get(key);
        if (!stored) return null;
        return {
            body: stored.bytes,
            httpEtag: stored.httpEtag,
            writeHttpMetadata(headers) {
                headers.set("Content-Type", stored.contentType);
            }
        };
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

function pngFile() {
    return new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "cover.png",
        { type: "image/png" }
    );
}

test("knowledge image upload stores verified image and returns same-origin URL", async () => {
    const bucket = new MemoryR2();
    const formData = new FormData();
    formData.set("file", pngFile());
    const request = new Request("https://example.test/api/knowledge/admin/images", {
        method: "POST",
        body: formData
    });
    const response = await uploadKnowledgeImage({
        request,
        env: { KNOWLEDGE_IMAGES: bucket },
        url: new URL(request.url),
        jsonResponse
    }, { id: 1 });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.success, true);
    assert.match(payload.data.image.url, /^https:\/\/example\.test\/api\/knowledge\/images\//);
    assert.equal(payload.data.image.mimeType, "image/png");
    assert.equal(bucket.objects.size, 1);
});

test("knowledge image download returns immutable image response", async () => {
    const bucket = new MemoryR2();
    const key = "knowledge/2026/07/123e4567-e89b-12d3-a456-426614174000.png";
    await bucket.put(key, new Uint8Array([1, 2, 3]), {
        httpMetadata: { contentType: "image/png" }
    });
    const response = await getKnowledgeImage({
        env: { KNOWLEDGE_IMAGES: bucket },
        jsonResponse
    }, key);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.equal(
        response.headers.get("Cache-Control"),
        "public, max-age=31536000, immutable"
    );
});

test("knowledge image upload rejects unsupported content and missing binding", async () => {
    const formData = new FormData();
    formData.set("file", new File(["not-an-image"], "fake.png", { type: "image/png" }));
    const request = new Request("https://example.test/api/knowledge/admin/images", {
        method: "POST",
        body: formData
    });

    const missing = await uploadKnowledgeImage({
        request,
        env: {},
        url: new URL(request.url),
        jsonResponse
    }, { id: 1 });
    assert.equal(missing.status, 503);

    const invalid = await uploadKnowledgeImage({
        request,
        env: { KNOWLEDGE_IMAGES: new MemoryR2() },
        url: new URL(request.url),
        jsonResponse
    }, { id: 1 });
    assert.equal(invalid.status, 400);
});
