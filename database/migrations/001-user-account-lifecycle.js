export function migrateUserAccountLifecycle(db) {
  const userColumns = new Set(
    db
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((column) => column.name),
  );
  const userMigrations = [
    ["credential_expires_at", "TEXT"],
    ["middle_name", "TEXT"],
    ["personal_email", "TEXT"],
    ["account_status", "TEXT NOT NULL DEFAULT 'ACTIVE'"],
    ["password_status", "TEXT NOT NULL DEFAULT 'PERMANENT'"],
    ["first_login_at", "TEXT"],
    ["activated_at", "TEXT"],
    ["last_login_at", "TEXT"],
    ["last_password_changed_at", "TEXT"],
    ["created_by_user_id", "INTEGER"],
  ];

  for (const [column, declaration] of userMigrations) {
    if (!userColumns.has(column)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${column} ${declaration}`);
    }
  }

  if (!userColumns.has("account_status")) {
    db.exec(`
      UPDATE users SET account_status = CASE
        WHEN is_active = 0 THEN 'DISABLED'
        WHEN must_change_password = 1 THEN 'PASSIVE'
        ELSE 'ACTIVE'
      END,
      password_status = CASE
        WHEN must_change_password = 1 THEN 'TEMPORARY'
        ELSE 'PERMANENT'
      END
    `);
  }
}
