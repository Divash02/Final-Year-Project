# CollegeOS — Database

## Technology
- **MongoDB** (local `mongod` auto-started by `scripts/dev.js`)
- **Mongoose 9** ODM
- Connection: `backend/src/config/database.js`
- URI: `MONGODB_URI` (default `mongodb://127.0.0.1:27017/collegeos`)
- Test database: `COLLEGEOS_TEST_DB` (default `collegeos_test`), dropped before/after test runs

## Connection & Bootstrap

```javascript
// backend/src/config/database.js
connectDatabase() → retries 5× with 3s delay, sets strictQuery: false

// backend/src/db.js
initializeServerState() → connectDatabase() → seedBaseUsers()

// seedBaseUsers():
// 1. Provisions bootstrap Super Admin if not exists
//    - email: admin@<INSTITUTION_EMAIL_DOMAIN>
//    - password: COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD
//    - roles: ["super_admin"], mustChangePassword: true, accountStatus: "PASSIVE"
// 2. Runs migrateConsolidatedRoles() — legacy role migration
```

**Key principle:** Only the bootstrap Super Admin is auto-provisioned. No departments, programmes, courses, sections, students, or finance records are fabricated. Every module renders data-driven empty states.

## Models (Collections)

48 Mongoose models in `backend/src/models/`, exported from `index.js`:

### Core Identity
| Model | Collection | Key Fields |
|-------|------------|------------|
| `User` | `users` | email (unique), collegeEmail, passwordHash, firstName, lastName, roles[], activeRole, accountStatus (PASSIVE/ACTIVE/SUSPENDED/DISABLED/ARCHIVED), passwordStatus (TEMPORARY/PERMANENT), mustChangePassword, credentialExpiresAt, firstLoginAt, lastLoginAt, avatarUrl, isActive |
| `Student` | `students` | user (ref User), studentId (unique), rollNumber, program, batch, semester, section, status (ACTIVE/INACTIVE/GRADUATED/SUSPENDED), gpa, cgpa, attendancePercentage, feeBalanceDue, avatarUrl |
| `Staff` | `staffs` | user (ref User), employeeId, roleType, department, designation, campus |

### Academic Structure
| Model | Collection | Key Fields |
|-------|------------|------------|
| `Department` | `departments` | code, name, description |
| `Program` | `programs` | code, name, department, durationSemesters, creditsRequired |
| `Section` | `sections` | code, name, program, batch, semester, capacity |
| `Course` | `courses` | code, name, description, department, program, credits, semester, courseType (CORE/ELECTIVE), status (ACTIVE/ARCHIVED) |
| `Enrollment` | `enrollments` | student (ref Student), course (ref Course), sectionCode, semester, academicYear, status (ENROLLED/DROPPED/COMPLETED), enrolledAt |
| `CourseTeachingAssignment` | `courseteachingassignments` | facultyUser (ref User), course (ref Course), sectionCode, semester, academicYear |

### Attendance
| Model | Collection | Key Fields |
|-------|------------|------------|
| `AttendanceSession` | `attendancesessions` | course, sectionCode, facultyUser, date, startTime, endTime, classType, topic, qrToken, qrExpiresAt, status (OPEN/CLOSED), records[] |
| `Attendance` | `attendances` | session (ref AttendanceSession), student, studentUser, status (Present/Absent/Late/Bunk/Excused), markedAt, markedBy, correctionRequested, correctionReason, correctionStatus |

### LMS (Learning Management)
| Model | Collection | Key Fields |
|-------|------------|------------|
| `CourseWeek` | `courseweeks` | course, weekNumber, title, description, teachingPlan, expectedOutcome, studyTimeMinutes, releaseAt, status (DRAFT/PUBLISHED/ARCHIVED), position, objectives[] |
| `LearningObjective` | `learningobjectives` | week, text, position |
| `LearningMaterial` | `learningmaterials` | course, week, title, description, topic, materialType, file (ref StoredFile), estimatedMinutes, releaseAt, status, sectionCodes[], version, supersedes, documentMeta |
| `CourseAnnouncement` | `courseannouncements` | course, week, title, body, pinned, publishAt, alsoSendMail |
| `CourseTemplate` | `coursetemplates` | name, description, department, program, semester, weeks[] |

### Assignments & Submissions
| Model | Collection | Key Fields |
|-------|------------|------------|
| `Assignment` | `assignments` | course, title, description, instructions, assignmentType, maxMarks, dueAt, opensAt, status (DRAFT/OPEN/CLOSED/ARCHIVED), sectionCodes[], semester, similarityCheckEnabled |
| `Submission` | `submissions` | assignment, student, studentUser, file (ref StoredFile), submittedAt, isLate, status (DRAFT/SUBMITTED/LATE/GRADED/RETURNED), marksObtained, feedback, gradedAt, gradedBy, attemptCount, similarityStatus, similarityPercentage |

### Quizzes
| Model | Collection | Key Fields |
|-------|------------|------------|
| `Quiz` | `quizzes` | course, week, title, description, instructions, maxMarks, passingMarks, durationMinutes, attemptsAllowed, randomizeQuestions, randomizeOptions, allowBackNavigation, allowReviewBeforeSubmit, resultReleasePolicy, showCorrectAnswers, sectionCodes[], openAt, closeAt, status (DRAFT/SCHEDULED/OPEN/CLOSED/COMPLETED/ARCHIVED) |
| `QuizQuestion` | `quizquestions` | quiz, questionBank, type, difficulty, text, options[], correctAnswer, explanation, marks, position |
| `QuizAttempt` | `quizattempts` | quiz, student, studentUser, startedAt, submittedAt, status (IN_PROGRESS/SUBMITTED/GRADED), answers[], score, autoGradedScore, manualGradedScore, integrityEvents[], timeSpentMs |

### Teaching Progress
| Model | Collection | Key Fields |
|-------|------------|------------|
| `TeachingProgress` | `teachingprogresses` | material, materialVersion, facultyUser, fromUnit, toUnit, totalUnits, unitLabel, nextStartUnit, taughtOn, topic, notes, timetableSessionId, sectionCodes[], weekId, percentage |

### Examinations
| Model | Collection | Key Fields |
|-------|------------|------------|
| `ExamResult` | `examresults` | exam, student, course, marksObtained, maxMarks, grade, status, workflowStatus, verifiedBy, publishedAt |
| `ExamSeatingPlan` | `examseatingplans` | exam (unique), examCode, title, academicYear, program, semester, course, candidateScope, sectionCode, batch, examDate, startTime, endTime, status (DRAFT/GENERATED/SCHEDULED/PUBLISHED/CANCELLED), roomAllocations[] (room, building, block, floor, benchCount, assignedCount, seatAssignments[] with benchNumber/seatNumber 1–2), totalEligibleStudents, totalAllocatedSeats, totalUnallocatedStudents, requiredAdditionalCapacity, publishedAt, scheduledPublishAt, shuffleSeed, revisionReason, auditTrail[] |

### Finance
| Model | Collection | Key Fields |
|-------|------------|------------|
| `Invoice` | `invoices` | student, invoiceNumber, academicYear, semester, feeItems[], totalAmount, paidAmount, balanceDue, status (PENDING/PARTIALLY_PAID/PAID/VOID), dueDate |
| `Payment` | `payments` | invoice, student, amount, method (esewa/khalti/stripe/connectips/cash), gatewayTransactionId, status, confirmedAt, receiptNumber |

### Communication & Workflow
| Model | Collection | Key Fields |
|-------|------------|------------|
| `Notice` | `notices` | title, content (plain text), contentHtml (sanitized rich HTML), category, priority, authorUser, audience (targetType ALL/SPECIFIC + target), targetRoles[], status (DRAFT/PUBLISHED/ARCHIVED), attachments[] (embedded FileReference), publishedAt, expiresAt, updatedBy |
| `Message` | `messages` | sender, recipient, subject, body, readAt, parentMessage |
| `Mail` | `mails` | from, to[], cc[], bcc[], subject, body, attachments[], sentAt, status |
| `Notification` | `notifications` | user, title, body, category, priority, actionUrl, read, channels |
| `WorkflowCase` | `workflowcases` | caseNumber, requester, typeCode, title, status, priority, formData, currentAssignee, history[], slaDeadline |

### Documents & Files
| Model | Collection | Key Fields |
|-------|------------|------------|
| `Document` | `documents` | student, documentType (TRANSCRIPT/CERTIFICATE/ID_CARD/OTHER), file (ref StoredFile), status, issuedAt, verifiedAt |
| `StoredFile` | `storedfiles` | originalName, mimeType, extension, sizeBytes, storagePath, contentFamily, contentSubType, uploadedBy, checksum |

### Calendar & Timetable
| Model | Collection | Key Fields |
|-------|------------|------------|
| `AcademicCalendarEvent` | `academiccalendarevents` | title, description, eventType, startDate, endDate, allDay, audience, status, attachments[] |
| `AcademicCalendarDocument` | `academiccalendardocuments` | title, category, lifecycle, file (ref StoredFile), audience, effectiveFrom, effectiveTo |
| `Timetable` | `timetables` | course, sectionCode, facultyUser, dayOfWeek, startTime, endTime, room, classType, semester, academicYear, archivedAt |

### Grades & Admissions
| Model | Collection | Key Fields |
|-------|------------|------------|
| `Grade` | `grades` | student, course, exam, internalMarks, finalMarks, totalMarks, grade, gpaPoints, status |
| `AdmissionApplication` | `admissionapplications` | applicantName, email, phone, program, batch, documents[], status, reviewedBy, decidedAt |

### System
| Model | Collection | Key Fields |
|-------|------------|------------|
| `Session` | `sessions` | user, tokenHash, expiresAt, revokedAt |
| `PasswordResetToken` | `passwordresettokens` | user, tokenHash, expiresAt, usedAt |
| `AuditLog` | `auditlogs` | user, action, module, resource, resourceId, oldValue, newValue, details, metadata, timestamp |
| `InstitutionSetting` | `institutionsettings` | key, value, description |

### Online Coding Lab
| Model | Collection | Key Fields |
|-------|------------|------------|
| `CodingProject` | `codingprojects` | ownerUser, ownerRole (student/faculty), title, projectType (COMPILER/PLAYGROUND), defaultLanguage, files[] (embedded: name, content, language, isMain), course, sectionCode, visibility (PRIVATE/SHARED), assignment, copiedFrom, deletedAt (soft delete) |
| `CodingShare` | `codingshares` | project, sharedBy, shareType (COURSE/SECTION/STUDENTS), course, sectionCode, studentUsers[], permission (VIEW/COPY), expiresAt, revokedAt |
| `CodingAssignment` | `codingassignments` | facultyUser, course, sectionCodes[], semester, program, allowedLanguages[], starterFiles[] (embedded), exampleInput, exampleOutput, testCases[] (input, expectedOutput, isHidden — hidden cases never leave the server), dueAt, opensAt, maxMarks, status (DRAFT/OPEN/CLOSED), closedAt, closedBy |
| `CodingSubmission` | `codingsubmissions` | assignment, studentUser (unique compound index), language, files[] (embedded), status (SUBMITTED/GRADED), submittedAt, isLate, version (monotonic via `$inc`), lastExecution (snapshot), feedback, marks, gradedBy, gradedAt |
| `CodingExecution` | `codingexecutions` | user, project, languageId, providerSubmissionId, status (QUEUED/PROCESSING/ACCEPTED/FAILED/TIMEOUT/PROVIDER_ERROR), description, stdout, stderr, compileOutput (all capped at 64 KiB), exitCode, durationMs, memoryKb, message; TTL index expires records after 24h |
| `Room` | `rooms` | building, block, floor, roomNumber, name, capacity, campus, facilities[], isActive; unique index (building, roomNumber, campus) |
| `Audience` | `audiences` | targetType (ALL/SPECIFIC/STAFF), target (userIds[], roleIds[], programCodes[], batchYears[], semesters[], sectionCodes[], allSections) |

## Key Relationships

```
User 1──1 Student (user)
User 1──1 Staff (user)
User 1──M Session (user)
User 1──M CourseTeachingAssignment (facultyUser)
User 1──M AttendanceSession (facultyUser)
Student 1──M Enrollment (student)
Student 1──M Attendance (student)
Student 1──M Submission (student)
Student 1──M QuizAttempt (student)
Student 1──M Payment (student)
Course 1──M CourseWeek (course)
Course 1──M LearningMaterial (course)
Course 1──M Assignment (course)
Course 1──M Quiz (course)
Course 1──M Enrollment (course)
Course 1──M CourseTeachingAssignment (course)
CourseWeek 1──M LearningMaterial (week)
CourseWeek 1──M LearningObjective (week)
AttendanceSession 1──M Attendance (session)
Assignment 1──M Submission (assignment)
Quiz 1──M QuizQuestion (quiz)
Quiz 1──M QuizAttempt (quiz)
LearningMaterial 1──M TeachingProgress (material)
```

## Indexes & Constraints

- `User.email` — unique
- `User.collegeEmail` — unique (sparse)
- `User.roles` — index
- `Student.studentId` — unique
- `Student.user` — unique
- `Enrollment` — compound: student + course + semester + sectionCode (unique)
- `CourseTeachingAssignment` — compound: facultyUser + course + sectionCode + semester (unique)
- `AttendanceSession` — compound: course + sectionCode + date + startTime (unique)
- `Attendance` — compound: session + student (unique)
- `Session.tokenHash` — unique
- `StoredFile.checksum` — unique (deduplication)

## Migrations & Seed Scripts

| Script | Purpose |
|--------|---------|
| `backend/src/db.js:seedBaseUsers()` | Bootstrap Super Admin (runs on every boot) |
| `backend/src/db.js:migrateConsolidatedRoles()` | Legacy role migration (runs on every boot) |
| `scripts/seed-demo.js` | Opt-in demo fixtures (accounts, course, enrollments) — `npm run seed:demo` |
| `scripts/seed-demo.js --reset` | Drop + recreate demo fixtures — `npm run seed:demo:reset` |
| `backend/tests/api.test.js:before()` | Drops `collegeos_test` database, re-seeds for test suite |

## Data Ownership & Integrity Rules

1. **Student record is single source of truth** for cohort (program, batch, semester, section) — shared by attendance, assignments, exams, finance, analytics
2. **Audience targeting** uses `Audience` model — dimensions: programCodes, batchYears, semesters, sectionCodes, allSections, userIds, roleIds
3. **File storage** — `StoredFile` metadata + physical file in `backend/uploads/<module>/` — served via `/api/files/:id` with entitlement check
4. **Audit logging** — `logAudit()` in `db.js` writes to `AuditLog` collection for all state changes
5. **Soft deletes** — `archivedAt` / `status: ARCHIVED` / `revokedAt` preferred over hard deletes

## Sensitive Data Handling

- `User.passwordHash` — bcrypt (cost 10), never returned in queries
- `Session.tokenHash` — SHA-256 of JWT
- `PasswordResetToken.tokenHash` — SHA-256 of raw token
- `JWT_SECRET` — environment variable only
- `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD` — environment variable only
- No PII in logs (audit logs reference IDs, not raw data)

## Test Database

```bash
# Environment overrides
COLLEGEOS_TEST_DB=collegeos_test
COLLEGEOS_TEST_MONGO_HOST=127.0.0.1:27017

# npm run test:api:
# 1. Sets MONGODB_URI to test database
# 2. connectDatabase()
# 3. mongoose.connection.dropDatabase()
# 4. initializeServerState() → bootstrap admin
# 5. Creates test accounts via /api/admin/users
# 6. Runs assertions
# 7. Drops database on completion
```

## Historical Note

The `database/` directory contains **retired SQLite artifacts** (`schema/schema.sql`, `migrations/*.js`, `data/collegeos.db`, `backups/`). These are from a previous persistence layer and are no longer read by the application. They are kept only as an audit trail. Do not use `COLLEGEOS_DB_PATH` or SQLite tooling.

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/config/database.js` | Mongoose connection |
| `backend/src/db.js` | Persistence helpers, bootstrap, auth utils |
| `backend/src/models/index.js` | Model exports |
| `backend/src/models/*.js` | Individual model definitions |
| `scripts/seed-demo.js` | Demo fixture seeder |
| `backend/tests/api.test.js` | Integration test database setup |
| `database/README.md` | Legacy documentation |