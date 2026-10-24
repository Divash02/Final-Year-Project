# CollegeOS — Development Tasks Roadmap

Status marks reflect the **actual implemented codebase** as of the 2026-10-09 audit.
A checked box means the feature exists in code; an unchecked box means it is a
known gap. Where a task is only partially implemented, the box is checked and the
limitation is described inline.

- [x] Phase 1: Comprehensive Codebase Inspection & Architecture Map
- [x] Phase 2: Complete Removal of Hardcoded & Demo Data (Zero Fake Data Guarantee)
- [x] Phase 3: Centralized Design Tokens & Color Palette Implementation
  - White Workspace Canvas (`#FFFFFF`) with Slate Navy (`#1E293B`) palette
  - Zero-Pill Discipline: Unboxed metadata with typographic separators
  - Skeleton Loaders & Custom 404 Error State screens
- [x] Phase 4: Font Awesome Icons Integration across all Components
- [x] Phase 5: Authentication & Login-First Gate with Forced Password Change
  - ~~Google Workspace OAuth 2.0 Restricted SSO for `@*.edu.np`~~ — **NOT IMPLEMENTED.** Login is email/password only via `POST /api/auth/login`. No OAuth provider, passport, or SSO code exists in the backend.
  - Role-Based Access Control (RBAC)
- [x] Phase 6: Timetable, Attendance & Faculty Routine Engine
  - Personalized Schedule Rendering for 50+ Institutional Faculty Members
  - ~~Automated 8:55 AM Location-Based Class Routine Alert Cron Job~~ — **NOT IMPLEMENTED.** The only scheduled job is the academic LMS scheduler (`backend/src/services/lms/scheduler.js`), which delivers weekly materials and quizzes. No location-based routine alert exists.
  - Dynamic Rotating Classroom QR Code Attendance Check-in
  - ~~Biometric Terminal Device Fleet Sync Log~~ — **NOT IMPLEMENTED.** No biometric device integration exists in the codebase.
- [x] Phase 7: Examination, Grading & Transcripts
  - Batch Processing for 400+ Student Semester Grades via Virtualized Spreadsheet Uploads
  - Real-time Credit & Mark Validation (/40 Internal, /60 Final, /100 Total)
  - ~~Official PDF Academic Transcript Generator with Cryptographic Verification Hash & Printable Layout~~ — **NOT IMPLEMENTED.** The `Document` model accepts a `TRANSCRIPT` document type and the gradebook references transcripts, but no PDF generation, cryptographic hash, or printable transcript endpoint exists.
- [x] Phase 8: Financial Management & Payments
  - Regional Payment Gateway Integrations (eSewa, Khalti, Stripe, connectIPS, Cash Counter)
  - Instant Verifiable NPR Payment Receipts
- [x] Phase 9: Academic Learning & Plagiarism Detection
  - Coursework Assignment Publishing
  - Plagiarism Detection & AI Content Likelihood Scorecards
- [x] Phase 10: Responsive Layout & Mobile Drawer Adaptation
  - Mobile Hamburger Navigation Drawer with Backdrop Blur
  - Overflow Table Wrapping across all screen sizes
- [x] Phase 11: System Verification & TypeScript Compilation Testing