# Personal avatars

Personal Center accepts JPEG, PNG, WebP and GIF avatars up to 2 MiB. Uploaded
avatars are public. The profile and header use circular, center-cropped display;
square source images are recommended. Missing avatars fall back to initials.

Avatar selection now opens a circular crop preview. Drag (or use arrow keys) to
position the source and use the zoom slider to scale it. Confirming produces a
512×512 PNG; cancellation leaves the old avatar unchanged. GIF cropping takes
one static frame.

Personal Center also supports an optional nickname of up to 40 Unicode code
points. Emoji, international scripts, spaces and most punctuation are accepted;
line breaks, control characters and explicit bidi controls are rejected. Nicknames
are rendered with `textContent`, never interpreted as HTML. They are not login
names or identity verification. Clearing a nickname restores the account name.

Nickname data uses a separate `profiles/<authenticated-user-id>` JSON object in
the same R2 bucket. Avatar reset does not delete the nickname. `PATCH /api/profile`
changes only the caller's nickname. Public `GET /api/profile/public?ids=...` accepts
at most 50 IDs and returns only IDs and nicknames. The frontend batches requests,
deduplicates in-flight reads and caches results for 60 seconds. Articles expose
their public author ID (already public in comments) to resolve these identities.
Article lists/details and comments show the avatar and nickname with account-name
fallback; the account name remains available in the name tooltip.

The feature reuses the existing `KNOWLEDGE_IMAGES` R2 binding. Each account owns
one object (`avatars/<authenticated-user-id>`). Replacement overwrites that object;
reset deletes only the authenticated account's object. No D1 tables, migrations,
session changes or role changes are required. Existing article images are untouched.

`POST /api/profile/avatar` accepts raw image bytes with the normal bearer token.
`DELETE /api/profile/avatar` restores the initials. Neither write accepts a user ID.
`GET /api/profile/avatar/<id>` is public and uses ETag revalidation rather than an
immutable cache, so replacement is visible across sessions and devices.

Uploads are stream-limited before buffering and use detected image signatures,
not a trusted filename or MIME header. SVG is not accepted. If the R2 binding is
unavailable, the interface reports the configuration error and keeps the initials.
