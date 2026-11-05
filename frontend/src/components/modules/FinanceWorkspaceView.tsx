import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../../components/ui/ToastContainer";
import { formatNPR } from "../../lib/nepaliCalendar";
import { EmptyState } from "../ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faMagnifyingGlass,
  faPlus,
  faReceipt,
} from "@fortawesome/free-solid-svg-icons";

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  title: string;
  category: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  due_date: string;
  status: string;
  description?: string;
  first_name: string;
  last_name: string;
  student_id: string;
  created_at: string;
}

interface PaymentRecord {
  id: string;
  receipt_number: string;
  invoice_number: string;
  amount: number;
  method: string;
  status: string;
  transaction_id: string | null;
  first_name: string;
  last_name: string;
  student_id: string;
  created_at: string;
}

interface StudentOption {
  userId: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export const FinanceWorkspaceView: React.FC = () => {
  const { currentUser, language } = useCollegeOS();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"invoices" | "payments">(
    "invoices",
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showPayment, setShowPayment] = useState<InvoiceRecord | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [voidingInvoice, setVoidingInvoice] = useState<InvoiceRecord | null>(null);
  const [amendTitle, setAmendTitle] = useState("");
  const [amendDescription, setAmendDescription] = useState("");
  const [amendCategory, setAmendCategory] = useState("");
  const [amendAmount, setAmendAmount] = useState("");
  const [amendDueDate, setAmendDueDate] = useState("");
  const [amendReason, setAmendReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [studentId, setStudentId] = useState("");
  const [termName, setTermName] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [discount, setDiscount] = useState("0");
  const [dueAt, setDueAt] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const permissions = new Set(currentUser?.permissions || []);
  const canCreateInvoice = permissions.has("finance.invoice.create");
  const canUpdateInvoice = permissions.has("finance.invoice.update");
  const canRecordPayment = permissions.has("finance.payment.record");

  const loadRecords = async () => {
    const [invoiceResult, paymentResult] = await Promise.all([
      apiRequest<{ invoices: InvoiceRecord[] }>("/invoices"),
      apiRequest<{ payments: PaymentRecord[] }>("/payments"),
    ]);
    setInvoices(invoiceResult.invoices);
    setPayments(paymentResult.payments);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ invoices: InvoiceRecord[] }>("/invoices"),
      apiRequest<{ payments: PaymentRecord[] }>("/payments"),
    ])
      .then(([invoiceResult, paymentResult]) => {
        if (!active) return;
        setInvoices(invoiceResult.invoices);
        setPayments(paymentResult.payments);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load finance records.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredInvoices = useMemo(() => {
    const text = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesText =
        !text ||
        invoice.invoice_number.toLowerCase().includes(text) ||
        `${invoice.first_name} ${invoice.last_name}`
          .toLowerCase()
          .includes(text);
      return matchesText && (!statusFilter || invoice.status === statusFilter);
    });
  }, [invoices, query, statusFilter]);

  const issueInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/invoices", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          title: termName,
          amount: Number(subtotal) - Number(discount || "0"),
          dueDate: dueAt,
        }),
      });
      setShowCreate(false);
      setTermName("");
      setSubtotal("");
      setDiscount("0");
      setDueAt("");
      await loadRecords();
      setNotice("Invoice issued and recorded.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Invoice creation failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!showPayment) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/payments", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: showPayment.id,
          amount: Number(paymentAmount),
          method: paymentMethod,
          transactionId: paymentReference.trim() || undefined,
        }),
      });
      setShowPayment(null);
      setPaymentAmount("");
      setPaymentReference("");
      await loadRecords();
      setActiveTab("payments");
      setNotice("Payment recorded and reconciled against the invoice.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Payment could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  };

  const beginAmendment = (invoice: InvoiceRecord) => {
    setError("");
    setAmendTitle(invoice.title);
    setAmendDescription(invoice.description || "");
    setAmendCategory(invoice.category);
    setAmendAmount(String(invoice.total_amount));
    setAmendDueDate(invoice.due_date.slice(0, 10));
    setAmendReason("");
    setEditingInvoice(invoice);
  };

  const amendInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingInvoice) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/invoices/${editingInvoice.id}/amend`, {
        method: "POST",
        body: JSON.stringify({
          title: amendTitle,
          description: amendDescription,
          category: amendCategory,
          amount: Number(amendAmount),
          dueDate: amendDueDate,
          changeNote: amendReason,
        }),
      });
      setEditingInvoice(null);
      await loadRecords();
      setNotice("Invoice amendment recorded and version history preserved.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Invoice amendment failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const voidInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!voidingInvoice) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/invoices/${voidingInvoice.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason }),
      });
      setVoidingInvoice(null);
      setVoidReason("");
      await loadRecords();
      setNotice("Invoice voided. Its historical record is retained.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Invoice could not be voided.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openCreate = async () => {
    setError("");
    try {
      const result = await apiRequest<{ students: StudentOption[] }>(
        "/finance/students",
      );
      setStudents(result.students);
      setStudentId(String(result.students[0]?.studentId || ""));
      setShowCreate(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load students.",
      );
    }
  };

  const totalInvoiced = invoices.reduce(
    (sum, invoice) => sum + invoice.total_amount,
    0,
  );
  const totalCollected = invoices.reduce(
    (sum, invoice) => sum + invoice.paid_amount,
    0,
  );  const totalOutstanding = invoices.reduce(
    (sum, invoice) => sum + invoice.balance_due,
    0,
  );

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div>
          <p className="cos-eyebrow">
            Finance
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <FontAwesomeIcon icon={faFileInvoiceDollar} /> Finance &amp;
            Invoices
          </h1>
        </div>
        {canCreateInvoice && (
          <button
            type="button"
            onClick={() => void openCreate()}
            className="inline-flex items-center gap-2 rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
          >
            <FontAwesomeIcon icon={faPlus} /> Create Invoice
          </button>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}

      <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-3">
        {[
          ["Invoiced", totalInvoiced],
          ["Collected", totalCollected],
          ["Outstanding", totalOutstanding],
        ].map(([label, amount]) => (
          <div key={String(label)} className="bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 font-mono text-lg font-semibold">
              {formatNPR(Number(amount), language)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex gap-4">
          {(["invoices", "payments"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-2 py-3 text-sm font-medium ${activeTab === tab ? "border-[var(--color-primary)] text-slate-900" : "border-transparent text-slate-500"}`}
            >
              {tab === "invoices"
                ? `Invoices (${invoices.length})`
                : `Payments (${payments.length})`}
            </button>
          ))}
        </div>
        {activeTab === "invoices" && (
          <div className="flex flex-wrap gap-2 pb-2">
            <label className="flex items-center gap-2 rounded border border-slate-300 px-2 py-1.5 text-slate-500">
              <FontAwesomeIcon icon={faMagnifyingGlass} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search invoice or student"
                className="min-w-48 text-sm text-slate-800 outline-none"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All statuses</option>
              {["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"].map(
                (status) => (
                  <option key={status}>{status}</option>
                ),
              )}
            </select>
          </div>
        )}

      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Loading finance records...
        </p>
      ) : activeTab === "invoices" ? (
        filteredInvoices.length === 0 ? (
          <EmptyState
            icon={faFileInvoiceDollar}
            title="No invoices available"
            description="No matching invoices are stored in the finance database."
          />
        ) : (
          <div className="overflow-x-auto border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Invoice</th>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Term</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Balance</th>
                  <th className="px-3 py-3">Due</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-3 py-3 font-mono">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-3 py-3">
                      {invoice.first_name} {invoice.last_name}
                    </td>
                    <td className="px-3 py-3">{invoice.title}</td>
                    <td className="px-3 py-3">{invoice.status}</td>
                    <td className="px-3 py-3">
                      {formatNPR(invoice.total_amount, language)}
                    </td>
                    <td className="px-3 py-3">
                      {formatNPR(invoice.balance_due, language)}
                    </td>
                    <td className="px-3 py-3">
                      {new Date(invoice.due_date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">
                      {canRecordPayment &&
                        invoice.balance_due > 0 &&
                        invoice.status !== "VOID" && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowPayment(invoice);
                              setPaymentAmount(String(invoice.balance_due));
                            }}
                            className="text-sm font-medium text-[var(--color-primary)]"
                          >
                            Record payment
                          </button>
                        )}
                      {canUpdateInvoice &&
                        invoice.paid_amount === 0 &&
                        invoice.status !== "VOID" && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => beginAmendment(invoice)}
                              className="text-sm font-medium text-[var(--color-primary)]"
                            >
                              Amend
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setError("");
                                setVoidReason("");
                                setVoidingInvoice(invoice);
                              }}
                              className="text-sm font-medium text-red-700"
                            >
                              Void
                            </button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : payments.length === 0 ? (
        <EmptyState
          icon={faReceipt}
          title="No payments available"
          description="No payment records are stored in the finance database."
        />
      ) : (
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Receipt</th>
                <th className="px-3 py-3">Invoice</th>
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">Method</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-3 py-3 font-mono">
                    {payment.receipt_number}
                  </td>
                  <td className="px-3 py-3">{payment.invoice_number}</td>
                  <td className="px-3 py-3">
                    {payment.first_name} {payment.last_name}
                  </td>
                  <td className="px-3 py-3">{payment.method.toUpperCase()}</td>
                  <td className="px-3 py-3">
                    {formatNPR(payment.amount, language)}
                  </td>
                  <td className="px-3 py-3">{payment.status}</td>
                  <td className="px-3 py-3" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={(event) => void issueInvoice(event)}
            className="w-full max-w-lg space-y-4 border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between">
              <h2 className="font-semibold">Create Invoice</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label className="block text-sm">
              Student
              <select
                required
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              >
                {students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.firstName} {student.lastName} · {student.studentId}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Term
              <input
                required
                maxLength={180}
                value={termName}
                onChange={(event) => setTermName(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Subtotal (NPR)
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={subtotal}
                  onChange={(event) => setSubtotal(event.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Discount (NPR)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-sm">
              Due date
              <input
                required
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || students.length === 0}
                className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Saving..." : "Issue Invoice"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={(event) => void recordPayment(event)}
            className="w-full max-w-md space-y-4 border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <h2 className="font-semibold">
              Record Payment · {showPayment.invoice_number}
            </h2>
            <label className="block text-sm">
              Amount (NPR)
              <input
                required
                type="number"
                min="1"
                max={showPayment.balance_due}
                step="1"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Method
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              >
                {["cash", "esewa", "khalti", "stripe", "connectips"].map(
                  (method) => (
                    <option key={method}>{method}</option>
                  ),
                )}
              </select>
            </label>
            <label className="block text-sm">
              Reference
              <input
                maxLength={180}
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPayment(null)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Saving..." : "Record payment"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingInvoice && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={(event) => void amendInvoice(event)}
            className="w-full max-w-lg space-y-4 border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="amend-invoice-title"
          >
            <h2 id="amend-invoice-title" className="font-semibold">
              Amend {editingInvoice.invoice_number}
            </h2>
            <p className="text-sm text-slate-600">
              The issued version remains in invoice history. Invoices with payments must use the finance adjustment workflow.
            </p>
            <label className="block text-sm">
              Description
              <input required maxLength={180} value={amendTitle} onChange={(event) => setAmendTitle(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm">
              Details
              <textarea value={amendDescription} onChange={(event) => setAmendDescription(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2" rows={3} />
            </label>
            <label className="block text-sm">
              Charge category
              <input required maxLength={80} value={amendCategory} onChange={(event) => setAmendCategory(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Amount (NPR)
                <input required type="number" min="1" step="1" value={amendAmount} onChange={(event) => setAmendAmount(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm">
                Due date
                <input required type="date" value={amendDueDate} onChange={(event) => setAmendDueDate(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2" />
              </label>
            </div>
            <label className="block text-sm">
              Amendment reason
              <textarea required maxLength={500} value={amendReason} onChange={(event) => setAmendReason(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2" rows={2} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingInvoice(null)} className="rounded border border-slate-300 px-3 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={busy} className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Record amendment"}</button>
            </div>
          </form>
        </div>
      )}

      {voidingInvoice && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={(event) => void voidInvoice(event)}
            className="w-full max-w-md space-y-4 border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-invoice-title"
          >
            <h2 id="void-invoice-title" className="font-semibold">
              Void {voidingInvoice.invoice_number}?
            </h2>
            <p className="text-sm text-slate-600">The invoice remains in the student's history but is no longer payable.</p>
            <label className="block text-sm">
              Reason
              <textarea required maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2" rows={3} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setVoidingInvoice(null)} className="rounded border border-slate-300 px-3 py-2 text-sm">Keep invoice</button>
              <button type="submit" disabled={busy} className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Void invoice"}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
