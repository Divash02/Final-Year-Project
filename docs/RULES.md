# CollegeOS — Operational & Architectural Rules

## 1. Zero Fake / Mock Data Rule

- No hardcoded demo students, faculty, courses, attendance, invoices, or grades in production code.
- If a collection is empty, display honest counts (`0`), empty tables, and professional `EmptyState` components.
- Do not fabricate chart data or AI outputs. If insufficient data exists, state: "Insufficient data to generate an insight."

## 2. Authentication & Authorization Rules

- The application MUST start on the CollegeOS Login screen if no valid authenticated session exists.
- The temporary administrator credentials (`admin@techspire.edu.np` / `Nepal@123`) require a mandatory password update on first login.
- Client-side checks are for UI convenience only; the server/service layer enforces authoritative RBAC.

## 3. Visual & Design Standards

- Application Workspace Background: Soft Off-White (`#F8FAFC`).
- Content Surfaces: White (`#FFFFFF`).
- Sidebar: White (`#FFFFFF`) with a `#F6F7F5` soft band, `#E4E7E3` border, text (`#1F2937`), muted text (`#6B7280`) and active navigation (`#0F766E`). The navigation rail is light — no dark sidebar slab.
- Primary Action & Accent: Institutional Teal (`#0F766E`).
- Borders: Subtle Neutral (`#E2E8F0`).
- Typography: Inter (`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`).
- Icons: Exclusively Font Awesome solid icons (`@fortawesome/react-fontawesome`). No emojis as UI icons.

## 4. Responsive & Accessibility Standards

- Fully responsive across desktop (1280px+), laptop (1024px), tablet (768px), and mobile (360px+).
- Mobile navigation uses an accessible drawer with backdrop dismissal.
- High color contrast ratio meeting WCAG 2.1 AA standards.
