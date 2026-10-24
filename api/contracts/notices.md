# Notices — HTTP Contract

Implementation: `backend/src/routes/notices.js`, entitlement check in
`backend/src/routes/files.js`, sanitization in
`backend/src/utils/sanitizeHtml.js`. This file documents the contract only.

## Model

A notice carries its body twice: `content` (plain text — every existing
client renders it) and `contentHtml` (the rich-text composition). `contentHtml`
is sanitized to a strict allow-list on write and re-sanitized on render; it is
never trusted client-side. Attachments embed `FileReferenceSchema` (file ids
into `StoredFile`, module `notice_attachment`) — bytes never live in MongoDB.

Lifecycle: `DRAFT` → `PUBLISHED` → `ARCHIVED` → (`RESTORE` → `PUBLISHED`).
A draft is invisible to every reader except its author and notice managers;
an archived notice is withdrawn from every view. Existing notices default to
`PUBLISHED`, so historical records behave exactly as before.

## Authorisation

| Action | Permission | Object-level check |
|---|---|---|
| List / read published notices | `notices.view` | Audience match (ALL, roles, cohort); draft additionally limited to author/manager |
| Create draft | `notices.publish` | — |
| Create published notice | `notices.publish` | Faculty without the permission must address a `SPECIFIC` audience (never `ALL`); students cannot publish |
| Edit notice | author of the notice, or `notices.publish` | 404 when the caller has no reach |
| Publish / archive / restore | `notices.publish` | Manager, or author for their own notice |
| Stage attachment upload | `notices.publish` | Multipart, `notice_attachment` content family |
| Attach staged files | author or `notices.publish` | Uploader or manager only — a file is bound to whoever uploaded it |
| Download/preview attachment bytes | `requireAuth` + entitlement | `notice_attachment` case in `files.js`: author, manager, or member of the notice audience |

Publishing resolves the audience to concrete students via
`accessControl.listTargetedStudents` and delivers one LMS notification per
student through `notifyOnce` (idempotency keyed by notice id), so a
re-publish never re-notifies.

## Endpoints

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/api/notices` | — | Published, audience-filtered; ordered by publishedAt desc |
| `GET` | `/api/notices/:id` | — | Draft visible to author/managers |
| `POST` | `/api/notices` | `{ title, contentHtml \| content, category?, priority?, audience, targetRoles?, targetUsers?, attachments?, expiresAt?, status? }` | `status: "DRAFT"` saves without notifying; `attachments` are staged `fileId`s; `expiresAt` hides the notice from readers once past |
| `PATCH` | `/api/notices/:id` | same subset | Records `updatedBy`; `expiresAt: null` clears expiry |
| `POST` | `/api/notices/:id/publish` | — | Idempotent; sends notifications once |
| `POST` | `/api/notices/:id/archive` | — | Withdraws from views |
| `POST` | `/api/notices/:id/restore` | — | Returns to published |
| `POST` | `/api/notices/upload` | multipart `file` (up to 10) | Stages `{ files: [{ fileId, originalName, mimeType, sizeBytes }] }` |
| `POST` | `/api/notices/:id/attachments` | `{ fileIds: [] }` | Binds staged files |
| `DELETE` | `/api/notices/:id/attachments/:fileId` | — | Drops the reference and deletes the stored file |
| `GET` | `/api/notices/exam/:examId` | — | Exam-linked notices |

## Reading attachments

`GET /api/files/:id?download=true` streams the bytes; `download=false` (or
omitted) serves inline for preview. The client renders PDFs through
`shared/viewer/PdfViewer` (pdfjs-dist) and images through `ImageViewer`;
Office/other types get an explicit download action, never a fake preview.
