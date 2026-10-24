# CollegeOS — System Memory & Decisions Log

## 1. Architectural Decisions

- **Login-First**: Default unauthenticated route directs to the Login portal (`admin@techspire.edu.np`). Forced password rotation is strictly verified before routing to operational modules.
- **Empty Database Purity**: The `User` collection is the one exception to the empty-start rule — `seedBaseUsers()` in `backend/src/db.js` provisions exactly one bootstrap Super Admin account on every boot. Every other collection (students, courses, invoices, etc.) starts completely empty. Real records are added via production forms or the opt-in `scripts/seed-demo.js` fixture seeder (development only).
- **Color System**: Light off-white workspace (`#F8FAFC`), white content surfaces, a white (`#FFFFFF`) navigation rail, and institutional teal (`#0F766E`) as the action colour. No dark sidebar.
- **Font Awesome Standard**: All icons rely on `@fortawesome/free-solid-svg-icons`.
- **Responsive Navigation**: Mobile screens render a hamburger toggle activating an off-canvas drawer overlaying the `#FFFFFF` sidebar.
