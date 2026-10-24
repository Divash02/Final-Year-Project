export function migrateFinanceRecords(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      student_user_id INTEGER NOT NULL,
      term_name TEXT NOT NULL,
      subtotal INTEGER NOT NULL CHECK (subtotal > 0),
      discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
      total_amount INTEGER NOT NULL CHECK (total_amount > 0),
      paid_amount INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
      due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ISSUED'
        CHECK (status IN ('ISSUED','PARTIALLY_PAID','PAID','OVERDUE','VOID')),
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_user_id) REFERENCES users(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS finance_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      receipt_number TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      method TEXT NOT NULL CHECK (method IN ('cash','esewa','khalti','stripe','connectips')),
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
        CHECK (status IN ('PENDING_VERIFICATION','VERIFIED','REJECTED')),
      recorded_by_user_id INTEGER NOT NULL,
      verified_by_user_id INTEGER,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (recorded_by_user_id) REFERENCES users(id),
      FOREIGN KEY (verified_by_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_student_status
      ON invoices(student_user_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_finance_payments_invoice_status
      ON finance_payments(invoice_id, status, created_at);
  `);
}
