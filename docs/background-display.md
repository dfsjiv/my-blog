# Background display adjustments

Background Management previews new uploads, existing custom backgrounds and all
four built-in backgrounds with horizontal/vertical focal position and zoom.
Desktop (16:9), wide (21:9) and portrait (9:16) presets simulate different crop
windows. Images retain their proportions and use `cover`, not stretch. Preview
and the home carousel share the same position, scale and transform-origin code.
Actual viewport sizes may differ from these presets.

Built-in files remain unchanged. Their rendering settings can be saved globally;
they remain fallback slides and are not removable through this panel. Existing
custom background ordering, enable/disable, upload and deletion remain unchanged.
Older custom focal settings (left/center/right) are honored until new settings are
saved. Adjustments take effect after Save, including carousel refresh in the same
session. Image files are not destructively cropped or re-encoded.

GET `/api/background-display?ids=builtin-1,7` returns public display metadata.
PATCH `/api/background-display` requires an authenticated admin and accepts
`{ key, display: { x, y, zoom } }`. X/Y are 0–100%; zoom is 1–3. Numeric custom
IDs must already exist; built-in keys are limited to `builtin-1` through `builtin-4`.
Bodies are stream-limited to 4 KiB.

Metadata uses one small `background-display/<key>` JSON object per background in
the existing `KNOWLEDGE_IMAGES` R2 binding. No D1 schema change is required. If
metadata is missing/unavailable, existing rendering defaults are preserved.
Requests have an 8-second timeout and do not hold the entry loader. If image
upload succeeds but metadata saving fails, the interface reports partial success
and allows retrying the settings on the uploaded queue entry.
