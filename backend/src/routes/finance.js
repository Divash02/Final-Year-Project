import { getUserRoles, logAudit } from "../db.js";
import { Invoice, Payment, Student, User } from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

function isFinanceStaff(user) {
  const roles = getUserRoles(user);
  return roles.some((role) =>
    ["finance_officer", "super_admin"].includes(role)
  );
}

export function registerFinanceRoutes(app) {
  app.get(
    "/api/finance/students",
    requireAuth,
    requirePermission("finance.invoice.create"),
    async (req, res) => {
      try {
        const query = String(req.query.q || "").trim();
        const filter = {};
        if (query) {
          const regex = new RegExp(query, "i");
          filter.$or = [{ studentId: regex }, { firstName: regex }, { lastName: regex }];
        }

        const students = await Student.find(filter).populate("user").limit(200);
        const formatted = students.map((s) => ({
          userId: s.user?._id?.toString() || s._id.toString(),
          studentId: s.studentId,
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.collegeEmail || s.email,
        }));
        res.json({ students: formatted });
      } catch (err) {
        res.status(500).json({ error: "Failed to search students for billing." });
      }
    }
  );

  app.get(
    "/api/invoices",
    requireAuth,
    requirePermission("finance.invoice.view"),
    async (req, res) => {
      try {
        const staff = isFinanceStaff(req.user);
        const filter = {};
        if (!staff) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (student) {
            filter.student = student._id;
          } else {
            filter.studentUser = req.user._id || req.user.id;
          }
        }

        const invoices = await Invoice.find(filter)
          .populate("student studentUser")
          .sort({ createdAt: -1 })
          .limit(500);

        const formatted = invoices.map((i) => ({
          id: i._id.toString(),
          invoice_number: i.invoiceNumber,
          title: i.title,
          category: i.category,
          total_amount: i.totalAmount,
          paid_amount: i.paidAmount,
          balance_due: Math.max(0, i.totalAmount - i.paidAmount),
          due_date: i.dueDate,
          status: i.status,
          first_name: i.student?.firstName || i.studentUser?.firstName || "",
          last_name: i.student?.lastName || i.studentUser?.lastName || "",
          student_id: i.student?.studentId || "",
          created_at: i.createdAt.toISOString(),
        }));

        res.json({ invoices: formatted });
      } catch (err) {
        res.status(500).json({ error: "Failed to load invoices." });
      }
    }
  );

  app.post(
    "/api/invoices",
    requireAuth,
    requirePermission("finance.invoice.create"),
    async (req, res) => {
      try {
        const { studentId, title, amount, dueDate, category = "Tuition" } = req.body || {};
        const invoiceAmount = Number(amount);
        if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
          return res.status(400).json({ error: "Invoice amount must be a positive number." });
        }
        if (!String(title || "").trim()) {
          return res.status(400).json({ error: "Invoice title is required." });
        }
        let student = await Student.findOne({ studentId });
        if (!student && studentId.match(/^[0-9a-fA-F]{24}$/)) {
          student = await Student.findById(studentId);
        }
        if (!student) return res.status(404).json({ error: "Student not found." });

        const count = await Invoice.countDocuments();
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

        const invoice = await Invoice.create({
          invoiceNumber,
          student: student._id,
          studentUser: student.user,
          title: String(title).trim(),
          category,
          totalAmount: invoiceAmount,
          paidAmount: 0,
          dueDate: String(dueDate || "").trim(),
          status: "PENDING",
        });

        student.feeBalanceDue = (student.feeBalanceDue || 0) + invoiceAmount;
        await student.save();

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "INVOICE_CREATED",
          module: "finance",
          resource: "invoice",
          resourceId: invoice._id.toString(),
          details: `Invoice ${invoiceNumber} created for ${student.studentId} amount: ${invoiceAmount}.`,
        });

        res.status(201).json({ success: true, invoice });
      } catch (err) {
        res.status(500).json({ error: "Failed to create invoice." });
      }
    }
  );

  app.get(
    "/api/payments",
    requireAuth,
    requirePermission("finance.invoice.view"),
    async (req, res) => {
      try {
        const staff = isFinanceStaff(req.user);
        const filter = {};
        if (!staff) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (student) filter.student = student._id;
        }

        const payments = await Payment.find(filter)
          .populate("invoice student")
          .sort({ createdAt: -1 })
          .limit(500);

        const formatted = payments.map((p) => ({
          id: p._id.toString(),
          receipt_number: p.receiptNumber,
          invoice_number: p.invoice?.invoiceNumber,
          amount: p.amount,
          method: p.method,
          status: p.status,
          transaction_id: p.transactionId,
          first_name: p.student?.firstName,
          last_name: p.student?.lastName,
          student_id: p.student?.studentId,
          created_at: p.createdAt.toISOString(),
        }));

        res.json({ payments: formatted });
      } catch (err) {
        res.status(500).json({ error: "Failed to load payments." });
      }
    }
  );

  app.post(
    "/api/payments",
    requireAuth,
    requirePermission("finance.payment.record"),
    async (req, res) => {
      try {
        const { invoiceId, amount, method = "esewa", transactionId } = req.body || {};
        const invoice = await Invoice.findById(invoiceId).populate("student");
        if (!invoice) return res.status(404).json({ error: "Invoice not found." });

        const paymentAmount = Number(amount);
        const balanceDue = Math.max(
          0,
          invoice.totalAmount - (invoice.paidAmount || 0),
        );
        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
          return res
            .status(400)
            .json({ error: "Payment amount must be a positive number." });
        }
        if (paymentAmount > balanceDue) {
          return res.status(400).json({
            error: `Payment amount exceeds the outstanding balance of ${balanceDue}.`,
          });
        }
        if (
          ![
            "esewa",
            "khalti",
            "connectips",
            "cash",
            "bank_transfer",
            "stripe",
          ].includes(method)
        ) {
          return res.status(400).json({ error: "Unsupported payment method." });
        }

        const count = await Payment.countDocuments();
        const receiptNumber = `RCP-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

        const payment = await Payment.create({
          receiptNumber,
          invoice: invoice._id,
          student: invoice.student?._id || invoice.student,
          studentUser: invoice.studentUser,
          amount: paymentAmount,
          method,
          transactionId: transactionId ? String(transactionId).trim() : `TXN-${Date.now()}`,
          status: "SUCCESS",
          receivedBy: req.user._id || req.user.id,
        });

        invoice.paidAmount = (invoice.paidAmount || 0) + paymentAmount;
        if (invoice.paidAmount >= invoice.totalAmount) {
          invoice.status = "PAID";
        } else {
          invoice.status = "PARTIALLY_PAID";
        }
        await invoice.save();

        if (invoice.student) {
          await Student.findByIdAndUpdate(invoice.student._id || invoice.student, {
            $inc: { feeBalanceDue: -paymentAmount },
          });
        }

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "PAYMENT_RECORDED",
          module: "finance",
          resource: "payment",
          resourceId: payment._id.toString(),
          details: `Payment recorded: ${receiptNumber} amount: ${paymentAmount} for invoice: ${invoice.invoiceNumber}.`,
        });

        res.status(201).json({
          success: true,
          payment: {
            id: payment._id.toString(),
            receipt_number: payment.receiptNumber,
            invoice_number: invoice.invoiceNumber,
            amount: payment.amount,
            method: payment.method,
            status: payment.status,
            transaction_id: payment.transactionId,
            first_name: invoice.student?.firstName || "",
            last_name: invoice.student?.lastName || "",
            student_id: invoice.student?.studentId || "",
            created_at: payment.createdAt.toISOString(),
          },
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to process payment." });
      }
    }
  );
}
