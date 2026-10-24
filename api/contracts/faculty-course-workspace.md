# Faculty Course Workspace — HTTP Contract

Implementation: `backend/src/routes/lms.js`, `backend/src/routes/quizzes.js`,
`backend/src/routes/assignments.js` and `backend/src/services/lms/lmsAccess.js`. The
workspace is a view over these existing endpoints; it introduces no routes of its own
and no parallel authoring path. This file documents the contract only.

The workspace has six tabs — Planner, Materials, Assignments, Quizzes, Announcements and
Analytics. Each is served by endpoints that already existed, and the changes recorded in
"Authorisation" and "Teaching progress" below are the only behavioural differences.

## The access question, answered once

`GET /api/lms/courses/:courseId/overview` returns the caller's relationship to the course:

```jsonc
{ "access": { "canManage": true, "role": "teacher" },
  "scope":  { "sectionCodes": ["A1"], "semester": 4 } }
```

`canManage` and `sectionCodes` come from the session user only: a `CourseTeachingAssignment`
for a teacher, an `Enrollment` for a student, and `courses.manage` for a curriculum
administrator. Every tab reads this rather than deciding for itself, and every write below
re-checks it server-side.

A caller with no relationship to the course receives `404` on the reads — the course is not
confirmed to exist by probing its id.

## Authorisation

| Action | Permission | Object-level check |
|---|---|---|
| Read overview, weeks, week detail, progress, activity | `lms.view` | `assertCourseVisible` — course must be taught or studied |
| Create or change a week, objective, announcement | `lms.content.manage` | `assertCanManageCourse` |
| Upload a material into a week | `lms.content.manage` | `assertCanManageCourse`, then the audience |
| Release, hide or archive a material | `lms.content.manage` | `canManageMaterial` |
| List quizzes | `lms.view` | `resolveCourseScope`; `access.canManage` reports the verdict |
| Create a quiz, add or remove a question, set its state | `lms.quiz.manage` | `assertCanManageCourse` |
| Create an assignment | `assignments.create` | `isTeachingAuthorized` |
| Read a material's teaching position | `lms.view` | `assertCourseVisible`, then `access.canManage` |
| Record a teaching session | `lms.content.manage` | `canManageMaterial`, plus the session's own course and faculty |
| Read course teaching history | `lms.view` | `assertCourseVisible`, then `access.canManage` |

Two rules apply to every write that names a section:

1. **A named section must be one of the caller's own.** A teacher assigned to A1 who names
   A2 is refused; the request is not silently redirected.
2. **An unnamed section becomes the caller's own sections, not the whole course.** Material
   upload and quiz creation previously left `sectionCodes` empty when the caller named none,
   and an empty filter means "every section in that semester" to the student-facing queries —
   so an A1 teacher reached an A2 cohort. Both routes now default to the caller's own
   sections. Only an account with `courses.manage` can still address a course as a whole
   without naming sections.

## Materials

### Accepted formats

The upload form accepts **PDF, PPT, PPTX, DOC and DOCX**. This is a narrower promise than the
server's policy: `FILE_POLICIES.learning_material` also permits spreadsheets, images, archives,
text and media, and it verifies every stored file against its real content family, so renaming
an executable to `.ppt` is still refused on upload. The five formats are listed because they are
the countable ones — a deck and a handout have a page or slide to mark a position against.

`version` is returned with the material. A replacement upload is a **new row** carrying the next
number and pointing back at the row it supersedes; the previous version is never rewritten, which
is what lets a teaching record stay attached to the file that was actually taught.

### `POST /api/lms/weeks/:weekId/materials` (multipart)

Fields: `file` (required), `title`, `description`, `topic`, `materialType`
(`FILE | SLIDES | DOCUMENT | IMAGE | ARCHIVE | VIDEO | AUDIO | LINK | EMBED | READING |
TEXT`), `estimatedMinutes`, `releaseAt`, `status`, `sectionCodes`.

**`status` defaults to `PUBLISHED` on the server.** A workspace that offers "upload, then
release" must send `status: "DRAFT"` explicitly, or the upload reaches students immediately.

The response carries `status` (the stored decision) and `state` (what a student experiences
now, resolved server-side with the clock). They differ whenever a release instant is still in
the future, and `state` is the field a view should render.

### `POST /api/lms/materials/:materialId/status`

Body is `{ "status": "DRAFT" | "SCHEDULED" | "PUBLISHED" | "HIDDEN" | "ARCHIVED" }` and
nothing else. Two consequences a caller must plan around:

- `SCHEDULED` is rejected with `422` unless the material already has a `releaseAt`. Set the
  time first with `PATCH /api/lms/materials/:materialId`.
- A future `releaseAt` outranks the stored status. Publishing a *scheduled* material
  therefore leaves it `SCHEDULED` and still invisible. To release it now, `PATCH
  { "releaseAt": null }` first, then set the status.

## Assignments

Creation is `POST /api/assignments`, the assignments module's own route — the workspace does
not have a second one. The course and section are authorised against the caller's teaching
scope, and the audience comes from that scope.

`POST /api/assignments` does not accept a week. An assignment created from the workspace is
therefore course-level and will not appear in the per-week planner, which lists assignments
attached to a week. The Assignments tab reads `GET /api/assignments?courseId=…` for this
reason.

## Quizzes

`GET /api/lms/courses/:courseId/quizzes` returns the caller's own access verdict:

```jsonc
{ "quizzes": [], "access": { "canManage": true, "sections": ["A1"] }, "serverTime": "…" }
```

Authoring is offered when this verdict is `true` **and** the session carries `lms.quiz.manage`.
Neither replaces the other: the verdict is scoped to this course, the permission is what the
role holds, and the server re-validates course, section and semester on every write regardless
of what any client concludes.

## Teaching progress

A teaching position is only ever a teacher's own declaration. Nothing in this system infers
that a deck was taught because it was opened, downloaded or left open in a browser, and
`LearningMaterial.firstViewedAt` / `viewCount` are kept deliberately apart from the position
so a client cannot merge the two.

### `GET /api/lms/materials/:materialId/teaching-progress`

Requires `lms.view` and `access.canManage`. Returns the position, the document's real length and
the full record history:

```jsonc
{
  "material": {
    "id": "…", "title": "Foundations deck", "version": 1,
    "documentMeta": { "pageCount": null, "slideCount": 24, "unitCount": 24,
                      "unitLabel": "slide", "detectedBy": "pptx-slide-parts",
                      "detectedAt": null },
    "opened": { "firstViewedAt": null, "viewCount": 0, "downloadCount": 0 }
  },
  "documentLength": { "known": true, "totalUnits": 24, "unitLabel": "slide" },
  "position": { "fromUnit": 13, "toUnit": 20, "taughtOn": "2026-10-05",
                "sectionCode": "A1", "sessionName": "REGULAR_CLASS · A1",
                "nextStartUnit": 21, "percentage": 83.3, "recordedBy": "Suresh Karki" },
  "records": [ /* newest first */ ],
  "recordCount": 2
}
```

`position` is `null` until a session is recorded, however often the file has been opened.
`percentage` is `null` whenever `documentLength.known` is `false`: no progress figure is drawn
against a length the system could not establish.

Query: `limit` (1–100, default 30).

### `POST /api/lms/materials/:materialId/teaching-progress`

Requires `lms.content.manage` and `canManageMaterial`. Body:

| Field | Meaning |
|---|---|
| `fromUnit`, `toUnit` | 1-based inclusive range. `toUnit < fromUnit` is `422`. |
| `totalUnits` | Only for a format whose length cannot be read from its bytes. |
| `unitLabel` | `slide \| page \| section`; defaults to the file's own. |
| `nextStartUnit` | Defaults to the unit after `toUnit`, or `null` at the end. |
| `taughtOn` | Institution calendar day; defaults to today. |
| `topic`, `notes` | Free text, 500 and 4000 characters. |
| `timetableSessionId` | Attaches the record to a real class. |
| `sectionCodes`, `weekId` | Audience and week, checked against the caller's scope. |

A `totalUnits` the server could read itself is not accepted as an override: the file's own count
wins, so the two cannot disagree. A range past the end of the document is `422`.

`timetableSessionId` is an identifier, not a claim. The session must belong to the same course,
the caller must be able to manage it, and — unless the caller holds `courses.manage` — it must be
the caller's own class. Filing against a colleague's session would inherit that class's section
and attendance register, so it is refused with `403`.

Response `201` is `{ record, position, documentLength }`: the newest record, the resulting
position and the length the range was checked against.

### `GET /api/lms/courses/:courseId/teaching-history`

Requires `lms.view` and `access.canManage`. Query: `section`, `limit` (1–200, default 60).

Each row adds `materialTitle`, `materialVersion`, `weekNumber` and `facultyName` to the record
fields, so a session can be traced to the material, the cohort and the teacher who declared it.
`section` is resolved through `resolveRequestedSections`: naming a section the caller does not
teach narrows to their own rather than widening.

### `GET /api/timetable?courseId=…&scope=mine`

Read-only input. The Materials tab calls this to let a teacher attach a record to the class it
happened in, so course, section, date, time window and attendance session are carried across
instead of retyped. Nothing here writes to the timetable, and `scope=mine` restricts the result
to the session user's own classes.

### Week payload

`GET /api/lms/weeks/:weekId` includes `week.teachingProgress`: the latest position per material
in that week, each with `materialId`, `materialVersion`, the range, `totalUnits`, `unitLabel`,
`topic`, `nextStartUnit`, and the `sectionCode` / `sessionName` / session times it was declared
in. It is `null` for a caller who may not manage the course, rather than an empty array, so
"you may not see this" cannot be read as "there is nothing here".

## Testing

`backend/tests/facultyCourseWorkspace.test.js` (26 tests) asserts the contract above against
the real app on an ephemeral port: an assigned teacher can author in their own section, cannot
author in a section they do not teach, an upload with no named section reaches only their own
sections, an unassigned faculty member cannot see the course, and a scheduled material cannot
be released without its release instant being cleared.

The teaching-progress cases pin the rules that keep "where was I" honest: a freshly read
material reports `position: null`; a recorded range becomes the next starting point; an earlier
session survives as history; a range past the end of the file is `422`, while a document whose
length cannot be read takes the teacher's declared total and reports `percentage: null`; a
colleague's class cannot be attached; a session from another course is `422`; and faculty with
no teaching claim receive `404` rather than a confirmation the course exists.

Deck fixtures are built as real Office Open XML packages, so the slide count under test is the
one read out of the stored bytes, not a value the test declared.