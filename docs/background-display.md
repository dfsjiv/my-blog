# Background display adjustments

Background Management previews new uploads, existing custom backgrounds and all
four built-in backgrounds with horizontal/vertical focal position and zoom.
Desktop (16:9), wide (21:9) and portrait (9:16) presets simulate different crop
windows. Images retain their proportions and use `cover`, not stretch. Preview
and the home carousel share the same position, scale and transform-origin code.
Actual viewport sizes may differ from these presets.

Built-in images are managed too: pause, remove from the queue, or restore them
from the collapsed removed list. Deletion has an inline confirmation and cancel.
Crop settings survive removal and restoration. Image source files remain available
for undo, but removed/paused originals are neither displayed nor preloaded. An
empty queue stays empty on reload and uses the neutral background. Existing
custom background ordering, enable/disable, upload and deletion remain unchanged.
Older custom focal settings (left/center/right) are honored until new settings are
saved. Adjustments take effect after Save, including carousel refresh in the same
session. Image files are not destructively cropped or re-encoded.

Background uploads accept JPEG/PNG/WebP originals up to **5 MiB**. Frontend and
backend enforce the same limit, independently of avatars and article images.
Upload bytes and resolution are preserved; a larger byte limit cannot restore
detail absent from an original. The form recommends 2560×1440 or higher for
enlarged display. **Clear selection** releases the local preview, clears the file
and adjustments, and does not upload anything. Leaving the manager also releases
its preview URL.

GET `/api/background-display?ids=builtin-1,7` returns public display metadata.
PATCH `/api/background-display` requires an authenticated admin and accepts
`{ key, display: { x, y, zoom } }` or, for built-ins, `{ key, state }` where state
is `active`, `paused` or `removed`. X/Y are 0–100%; zoom is 1–3. Numeric custom
IDs must already exist; built-in keys are limited to `builtin-1` through `builtin-4`.
Bodies are stream-limited to 4 KiB.

Crop metadata uses one small `background-display/<key>` JSON object per background.
Availability is stored separately in `background-state/builtin-<n>` in the existing
`KNOWLEDGE_IMAGES` R2 binding; concurrent crop saves cannot reactivate a removed
image. No D1 schema change is required. Missing metadata keeps legacy defaults;
unreadable metadata reports an error rather than silently restoring removed images.
The carousel waits for availability before loading even the first photo.
Requests have an 8-second timeout and do not hold the entry loader. If image
upload succeeds but metadata saving fails, the interface reports partial success
and allows retrying the settings on the uploaded queue entry.

**My OS** now appears among the links on the public **About Zhen / Meet Zhen**
page, using the existing desktop action and account permissions. It no longer
occupies a primary navigation item.

原有背景可暂停、删除出队并恢复；全部移出后不会自动补回。背景独立支持 5 MiB
原图上传，不压缩或缩小尺寸，可取消本地选择。状态复用现有 R2 存储，无需新增
数据库表。“我的系统”入口移到公开的“关于阿臻 / Meet Zhen”页面。
