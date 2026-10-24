    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      must_change_password INTEGER DEFAULT 0,
      credential_expires_at TEXT,
      middle_name TEXT,
      personal_email TEXT,
      account_status TEXT NOT NULL DEFAULT 'ACTIVE',
      password_status TEXT NOT NULL DEFAULT 'PERMANENT',
      first_login_at TEXT,
      activated_at TEXT,
      last_login_at TEXT,
      last_password_changed_at TEXT,
      created_by_user_id INTEGER,
      avatar_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL,
      role_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, role_name),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS role_provisioning_permissions (
      actor_role TEXT NOT NULL,
      target_role TEXT NOT NULL,
      can_provision INTEGER NOT NULL DEFAULT 0,
      can_reset_credentials INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (actor_role, target_role),
      FOREIGN KEY (actor_role) REFERENCES roles(name),
      FOREIGN KEY (target_role) REFERENCES roles(name)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      student_id TEXT UNIQUE NOT NULL,
      program TEXT,
      department TEXT,
      batch TEXT,
      section TEXT,
      semester INTEGER,
      campus TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS faculty_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      employee_id TEXT UNIQUE NOT NULL,
      department TEXT,
      designation TEXT,
      campus TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS staff_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      employee_id TEXT UNIQUE NOT NULL,
      department TEXT,
      designation TEXT,
      campus TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS institution_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_by_user_id INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      campus TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      department_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT,
      credits INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      campus TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      section_code TEXT,
      semester INTEGER,
      enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, course_id, semester),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      course_id INTEGER,
      faculty_user_id INTEGER,
      section_code TEXT,
      semester INTEGER,
      due_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (faculty_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      student_user_id INTEGER NOT NULL,
      submission_text TEXT,
      status TEXT DEFAULT 'draft',
      submitted_at TEXT,
      last_modified_at TEXT,
      grade TEXT,
      feedback TEXT,
      plagiarism_score REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id),
      FOREIGN KEY (student_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS submission_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER,
      faculty_user_id INTEGER,
      semester INTEGER,
      section_code TEXT,
      class_type TEXT,
      scheduled_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (faculty_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      marked_by_user_id INTEGER NOT NULL,
      marked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, student_user_id),
      FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
      FOREIGN KEY (student_user_id) REFERENCES users(id),
      FOREIGN KEY (marked_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS timetable_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER,
      faculty_user_id INTEGER,
      room TEXT,
      section_code TEXT,
      semester INTEGER,
      class_type TEXT,
      scheduled_day TEXT,
      start_time TEXT,
      end_time TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (faculty_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS mail_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      body TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS mail_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      recipient_user_id INTEGER NOT NULL,
      folder TEXT DEFAULT 'inbox',
      read_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES mail_threads(id),
      FOREIGN KEY (recipient_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      audience_role TEXT,
      section_code TEXT,
      department TEXT,
      created_by_user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_user_id INTEGER NOT NULL,
      recipient_user_id INTEGER NOT NULL,
      body TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_user_id) REFERENCES users(id),
      FOREIGN KEY (recipient_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS profile_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS institution_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      event_type TEXT NOT NULL,
      actor_user_id INTEGER,
      details TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS workflow_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'SUBMITTED',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      department TEXT,
      requester_user_id INTEGER NOT NULL,
      assigned_user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      FOREIGN KEY (requester_user_id) REFERENCES users(id),
      FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      actor_user_id INTEGER,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES workflow_cases(id),
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      window_started_at INTEGER NOT NULL,
      locked_until INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_student_user_id ON students(user_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id, course_id, semester);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_user_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_assignment_scope ON assignments(section_code, semester, course_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_mail_recipient_folder ON mail_recipients(recipient_user_id, folder, read_at);
    CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient ON messages(sender_user_id, recipient_user_id, id);
    CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread ON messages(recipient_user_id, is_read, id);
    CREATE INDEX IF NOT EXISTS idx_workflow_cases_user ON workflow_cases(requester_user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_workflow_steps_case ON workflow_steps(case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_institution_events_entity ON institution_events(entity_type, entity_id, created_at);
