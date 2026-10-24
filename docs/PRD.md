# CollegeOS — Product Requirements Document (PRD)

## 1. Executive Summary

CollegeOS is a unified, multi-tenant enterprise education operating system engineered to replace disparate SIS, LMS, ERP, attendance, finance, case management, examination, and communication tools into one cohesive, event-driven platform.

## 2. Core Personas & Roles

- **Platform / Institution Super Admin**: High-level tenant isolation, security policies, campus provisioning, global audit logs.
- **Registrar & Academic Administration**: Student lifecycle, enrollment, section allocation, transcripts, degree clearance.
- **Department Head (HoD) & Dean**: Curriculum review, faculty assignment, moderation, attendance oversight, bottleneck analysis.
- **Faculty / Instructors**: Class rosters, daily attendance, continuous internal evaluations, assignment grading with rubrics, student alerts.
- **Finance Officers**: Billing, invoice generation, fee collections (eSewa, Khalti, ConnectIPS), receipts, financial holds.
- **Students & Guardians**: Course registration, attendance tracking (75% threshold monitoring), assignment submission, online fee payments, official case requests, transcripts.

## 3. Key Functional Modules

1. **Authentication & Identity**: Login-first entry with temporary bootstrap credentials (`admin@techspire.edu.np` / `Nepal@123`), forced password change on first login, and institutional email identity at `@techspire.edu.np`.
2. **Student Information System (SIS)**: Single Source of Truth for student dossiers, enrollment status transitions, and ID generation.
3. **Curriculum & Academic Management**: Program catalog, semester structures, prerequisites, and credit rules.
4. **Timetable & Attendance Engine**: Weekly schedule grid with conflict detection, session recording, and 75% minimum examination eligibility compliance.
5. **Learning Management (LMS)**: Course materials, assignments, student submissions, and teacher-privileged evaluation.
6. **Examinations & Transcripts**: Exam scheduling, marks compilation, moderation, GPA/CGPA computation, and verifiable grade sheets.
7. **Finance & Accounts**: Invoicing, payment reconciliation, installment tracking, and financial holds.
8. **Unified Workflow & Case Management**: Dynamic forms for student leaves, fee adjustments, and document requests with SLA monitoring.
9. **College Mail & Real-Time Communications**: Institutional email with BCC privacy guarantees and interactive course discussion channels.
10. **Library & Facilities**: Book catalog, circulation with overdue fine calculation, and campus room inventory. The `library.view` permission covers a Library workspace and a Buildings & Rooms workspace; the full circulation and overdue-fine logic described here is a known gap and is not yet implemented.

## 4. Next-Generation Intelligence Capabilities

- **One Institutional Timeline**: Chronological event history for every student across academic, financial, and administrative interactions.
- **One Problem → One Case**: Cross-departmental case management eliminating siloed emails.
- **Life-Event Engine**: Cascading updates when major status changes occur (e.g. transfer, leave, suspension).
- **Academic Dependency Engine**: Validation of prerequisites and credit constraints upon course changes.
- **Graduation Path Simulator**: Forward-looking projection of student graduation timelines based on completed vs required courses.
- **Student Next-Action Engine**: Prioritized task list highlighting urgent academic and financial obligations.
- **Institutional Anomaly Radar**: Real-time identification of statistical deviations (e.g. attendance shortage spikes, unpaid balance surges).
- **Universal Institutional Search**: Role-scoped cross-entity search across records, documents, and cases.
