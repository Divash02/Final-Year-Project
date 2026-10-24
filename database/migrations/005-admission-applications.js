export function migrateAdmissionApplications(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admission_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      programme TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUBMITTED'
        CHECK (status IN ('SUBMITTED','VERIFIED','OFFERED','REJECTED','ENROLLED')),
      submitted_by_user_id INTEGER,
      reviewed_by_user_id INTEGER,
      decision_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
      FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_admission_applications_status
      ON admission_applications(status, created_at);
  `);
}
