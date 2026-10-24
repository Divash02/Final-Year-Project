# CollegeOS Documentation Index

This directory contains the authoritative technical documentation for CollegeOS. Every document here reflects the **actual implementation** as verified against the source code.

## AI Agent Instructions
- **[AGENTS.md](../AGENTS.md)** — Primary instruction manual for AI coding agents (read first)
- **[AI_CONTEXT.md](AI_CONTEXT.md)** — Compact project knowledge base for task-driven navigation

## Project Overview
- **[README.md](../README.md)** — Human-readable project entry point
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — System architecture, boundaries, request flow, limitations
- **[DIRECTORY_STRUCTURE.md](DIRECTORY_STRUCTURE.md)** — Complete directory map with responsibilities

## Core Technical References

### Authentication & Authorization
- **[AUTHENTICATION.md](AUTHENTICATION.md)** — Login, session, password rotation, token lifecycle
- **[AUTHORIZATION_AND_RBAC.md](AUTHORIZATION_AND_RBAC.md)** — Role hierarchy, permission catalog, object-level checks

### Data & API
- **[DATABASE.md](DATABASE.md)** — MongoDB/Mongoose models, relationships, indexes, bootstrap, seeds
- **[API_REFERENCE.md](API_REFERENCE.md)** — Complete endpoint reference, auth requirements, error formats
- **[API Contracts](../api/contracts/)** — Domain-specific HTTP contracts (auth, LMS, my-courses)

### Implementation
- **[FRONTEND.md](FRONTEND.md)** — React/Vite structure, state, components, API client, types
- **[BACKEND.md](BACKEND.md)** — Express routes, middleware, services, validation, error handling
- **[MODULES.md](MODULES.md)** — Module inventory with implementation status, roles, source paths

### Operations
- **[CONFIGURATION.md](CONFIGURATION.md)** — Environment variables, config modules, secrets handling
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — Local workflow, dev scripts, seeding, debugging
- **[TESTING.md](TESTING.md)** — Test organization, running suites, writing tests
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Production build, environment, runtime considerations
- **[SECURITY.md](SECURITY.md)** — Auth boundaries, data protection, known limitations
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** — Common issues, debug steps, log locations

## Maintenance
- **[DOCUMENTATION_MAINTENANCE.md](DOCUMENTATION_MAINTENANCE.md)** — Update rules, ownership, validation checks

---

**Rule:** Each subject has a single authoritative document. Other files link here instead of duplicating content. When code changes, update the corresponding authoritative document.