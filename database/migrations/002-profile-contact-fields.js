export function migrateProfileContactFields(db) {
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((column) => column.name),
  );

  for (const column of ["address", "emergency_contact"]) {
    if (!columns.has(column)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
    }
  }
}
