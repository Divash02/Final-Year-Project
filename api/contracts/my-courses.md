# My Courses — HTTP Contract

Implementation: `backend/src/routes/academics.js` (`GET /api/my-courses`), backed by
`backend/src/services/lms/myCourses.js`. The backend is the sole implementation; this
file documents the contract only.

## `GET /api/my-courses`

Returns the signed-in account's own courses, grouped into `inProgress`, `past` and
`future`.

**Authorization** — `requireAuth` plus `requirePermission("courses.view")`. There is no
object-level check because the route takes no target: the session user is the only
input, so a caller cannot request a course they are not attached to. A student's
authority comes from their own `Enrollment` rows; a teacher's from their
`CourseTeachingAssignment` rows; a curriculum administrator sees the catalogue they
oversee (`courses.manage`). The response shape is identical for all of them.

**No request parameters.** There is deliberately nothing to send. Filters, course ids
and scopes belong to the individual course endpoints, not to this index.

### Response

```jsonc
{
  "period": {
    "academicYear": "2025/2026",
    "semester": 4,                    // null when the institution has published none
    "basis": "INSTITUTION",           // or "RECORDS" when derived from the caller's own rows
    "configured": true,               // false when nothing has been published
    "note": null                      // set when the period was derived rather than published
  },
  "counts":    { "inProgress": 3, "past": 5, "future": 2 },
  "courses":   { "inProgress": [ /* MyCourseCard */ ], "past": [], "future": [] },
  "serverTime": "2026-01-01T00:00:00.000Z"
}
```

### `MyCourseCard`

| Field | Meaning |
|---|---|
| `courseId`, `code`, `name`, `description`, `department`, `program`, `credits`, `courseType`, `courseStatus` | Copied from the stored `Course`. |
| `semester`, `academicYear`, `sectionCodes` | Taken from the caller's `Enrollment` / teaching rows — never from the course's defaults. |
| `relation` | `ENROLLED`, `TEACHING`, `ENROLLED_AND_TEACHING` or `OVERSIGHT`. How the caller reached this course. |
| `enrollmentStatus` | `ENROLLED`, `DROPPED`, `COMPLETED` or `null`. |
| `period.bucket` | `current`, `past`, `future` or `undated`. |
| `period.undated` | `true` when the record carries no semester the institution has published. |
| `faculty` | Teachers with a `CourseTeachingAssignment` for this course and semester. Empty when none is recorded. |
| `metrics` | Every count below, each derived from documents that exist. |

### `metrics`

A metric with no backing rows is `null` (or `available: false`) — never `0`. "Nothing
was recorded" and "nothing was done" are different facts, and collapsing them would
show a student a failing course that the institution simply has no data for.

| Field | Contract |
|---|---|
| `attendance.percentage` | `null` unless marks were recorded. `recorded` distinguishes "0 records" from "0%". |
| `assignments` | `available`, `total`, `submitted`, `graded`, `pending`, `overdue`. `graded` is counted from each submission's own `gradedAt`, never inferred from status. |
| `quizzes` | `available`, `total`, `open`, `attempted`, `pendingManual`. |
| `materials` | `total`, `available`. Published, non-archived materials only. |
| `weeks` | `total`, `published`, `list`. |
| `progress` | `available: false` with `percentage: null` when the course has no countable work. Otherwise `percentage`, `completed`, `total`, `basis`. |
| `upcomingDeadline` | The nearest open assignment or upcoming quiz, or `null`. |
| `lastActivityAt` | Latest of submission, attempt, material or attendance timestamps, or `null`. |

### Grouping rules

A course is placed by comparing its semester and academic year against
`period`, never against a wall clock:

- a later semester or year → `future`
- an equal semester → `current`
- an earlier semester or year → `past`
- no recorded semester → `undated`, and the card is flagged rather than presented as current

A `future` enrolment can never appear under `inProgress`.

## Related routes

My Courses is an index. It serves no course content, and opening a card leads to the
existing course workspace rather than to a second course system:

- `GET /api/lms/courses` — courses the caller may open, split by `TEACHER` / `STUDENT`
- `GET /api/lms/courses/:courseId/overview` — the course, term context and per-section scope
- `GET /api/lms/courses/:courseId/activity` — the course activity feed, projected from the records that happened

## Negative cases

| Request | Response |
|---|---|
| No or invalid bearer token | `401` |
| Valid session, role without `courses.view` (e.g. `finance_officer`) | `403` |
| Valid session, no enrolments or teaching assignments | `200` with three empty buckets and `configured: false` |
| Valid session, course in a later semester | `200`, listed under `future` only |