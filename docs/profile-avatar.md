# Personal avatars

Personal Center accepts JPEG, PNG, WebP and GIF avatars up to 2 MiB. Uploaded
avatars are public. The profile and header use circular, center-cropped display;
square source images are recommended. Missing avatars fall back to initials.

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
