export function migrateExaminationRecords(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      course_id INTEGER NOT NULL,
      section_code TEXT NOT NULL,
      semester INTEGER NOT NULL,
      scheduled_at TEXT NOT NULL,
      room TEXT,
      status TEXT NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
      results_status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (results_status IN ('DRAFT','PUBLISHED')),
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS exam_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      student_user_id INTEGER NOT NULL,
      internal_marks REAL NOT NULL CHECK (internal_marks >= 0 AND internal_marks <= 40),
      final_marks REAL NOT NULL CHECK (final_marks >= 0 AND final_marks <= 60),
      total_marks REAL NOT NULL CHECK (total_marks >= 0 AND total_marks <= 100),
      letter_grade TEXT NOT NULL,
      grade_point REAL NOT NULL CHECK (grade_point >= 0 AND grade_point <= 4),
      entered_by_user_id INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(exam_id, student_user_id),
      FOREIGN KEY (exam_id) REFERENCES exams(id),
      FOREIGN KEY (student_user_id) REFERENCES users(id),
      FOREIGN KEY (entered_by_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_exams_scope_date
      ON exams(course_id, section_code, semester, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_exam_results_student
      ON exam_results(student_user_id, exam_id);
  `);
}
