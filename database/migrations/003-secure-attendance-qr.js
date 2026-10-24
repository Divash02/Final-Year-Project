export function migrateSecureAttendanceQr(db) {
  const sessionColumns = new Set(
    db
      .prepare("PRAGMA table_info(attendance_sessions)")
      .all()
      .map((column) => column.name),
  );

  for (const [column, declaration] of [
    ["status", "TEXT NOT NULL DEFAULT 'CLOSED'"],
    ["opened_at", "TEXT"],
    ["closed_at", "TEXT"],
  ]) {
    if (!sessionColumns.has(column)) {
      db.exec(
        `ALTER TABLE attendance_sessions ADD COLUMN ${column} ${declaration}`,
      );
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS course_teaching_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_user_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      section_code TEXT NOT NULL,
      semester INTEGER NOT NULL,
      assigned_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(faculty_user_id, course_id, section_code, semester),
      FOREIGN KEY (faculty_user_id) REFERENCES users(id),
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_qr_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_by_user_id INTEGER NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_qr_session_active
      ON attendance_qr_tokens(session_id, revoked_at, expires_at);
  `);
}
