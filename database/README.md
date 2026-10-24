# Database

CollegeOS persists data in **MongoDB via Mongoose**. The SQLite artifacts in this
directory (`schema/schema.sql`, `migrations/*.js`, `data/collegeos.db`,
`backups/`) are **retired historical material from a previous persistence layer**
and are no longer read by the application. They are kept only as an audit trail of
the pre-MongoDB schema and must not be used as a reference for current development.

- `backend/src/config/database.js` owns the Mongoose connection. It reads
  `MONGODB_URI` from the environment and retries connection failures before the
  HTTP server starts.
- `backend/src/db.js` contains persistence helpers and the bootstrap logic that
  provisions the single Super Admin account.
- `backend/src/models/` holds one Mongoose model per collection.
- The local MongoDB data directory is `.mongodb-data/` (created automatically by
  `scripts/dev.js` when `mongod` is not already running on `127.0.0.1:27017`).
- The development database is ignored by Git (see `.gitignore`).

## Configuration

Set `MONGODB_URI` in the environment (root `.env` or `backend/.env`) before
starting the backend, for example:

```
MONGODB_URI=mongodb://127.0.0.1:27017/collegeos
```

Tests override the database with `COLLEGEOS_TEST_DB` and
`COLLEGEOS_TEST_MONGO_HOST`; the test database is dropped before and after each
run so development data is never touched.

## Historical note

The previous development database was copied with SQLite's online backup API into
`data/collegeos.db`; the archived source and canonical database pass integrity
checks and have identical per-table content digests. A point-in-time archive is
retained in the ignored `backups/` directory. This migration is complete — do not
re-introduce SQLite tooling or treat `COLLEGEOS_DB_PATH` as a supported variable.