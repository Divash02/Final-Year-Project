# Authentication Contract

Base prefix: `/api`

| Method | Path                    | Current behavior                                                                                          |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`           | Validates credentials and creates a backend session/token.                                                |
| GET    | `/auth/me`              | Returns the authenticated user and assigned roles.                                                        |
| POST   | `/auth/active-role`     | Selects only a role assigned to the current identity.                                                     |
| POST   | `/auth/change-password` | Changes a password and invalidates prior sessions.                                                        |
| POST   | `/auth/logout`          | Revokes the current session.                                                                              |
| POST   | `/auth/forgot-password` | Returns `501`; secure email delivery and verification are not configured.                                 |
| POST   | `/auth/reset-password`  | Accepts a valid backend reset token, but no configured recovery flow currently issues one to an end user. |

Protected requests use `Authorization: Bearer <token>`. Backend session validity and role checks are authoritative. The frontend must not create tokens, validate passwords, or grant roles.

Recovery is intentionally not represented as working until an email provider, single-use verification flow, attempt limits, and delivery tests are implemented.
