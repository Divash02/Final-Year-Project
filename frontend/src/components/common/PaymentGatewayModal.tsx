import React, { useEffect, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import {
  formatNPR,
  getNepaliDateFromAD,
  numberToNepaliWords,
} from "../../lib/nepaliCalendar";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCreditCard, faMoneyBillWave, faShieldHalved,
  faCheck, faArrowRight, faBuildingColumns
} from "@fortawesome/free-solid-svg-icons";
import type { Payment } from "../../types";

type PaymentMethod = "esewa" | "khalti" | "stripe" | "connectips" | "cash";

/**
 * Institutional fee payment gateway.
 *
 * Every confirmation is a real `POST /api/payments` request. The receipt
 * shown afterwards is built from the persisted record the server returned,
 * so a payment only exists once MongoDB has accepted it.
 */
export const PaymentGatewayModal: React.FC = () => {
  const {
    activePaymentModal,
    setActivePaymentModal,
    setActiveReceipt,
    language,
    currentTenant,
  } = useCollegeOS();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("esewa");
  const [isProcessing, setIsProcessing] = useState(false);
  const [customAmount, setCustomAmount] = useState<number>(
    activePaymentModal?.balanceDue ?? 0,
  );
  const [error, setError] = useState("");

  // Reset the form whenever a different invoice is opened.
  useEffect(() => {
    setCustomAmount(activePaymentModal?.balanceDue ?? 0);
    setSelectedMethod("esewa");
    setError("");
    setIsProcessing(false);
  }, [activePaymentModal?.id]);

  const invoice = activePaymentModal;

  const handlePay = async () => {
    if (!invoice) return;
    setIsProcessing(true);
    setError("");
    try {
      const result = await apiRequest<{
        payment: {
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
        };
      }>("/payments", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: Number(customAmount),
          method: selectedMethod,
        }),
      });
      const persisted = result.payment;
      const receipt: Payment = {
        id: persisted.id,
        tenantId: currentTenant.id,
        invoiceId: invoice.id,
        studentId: persisted.student_id,
        studentName: `${persisted.first_name} ${persisted.last_name}`.trim(),
        paymentNumber: persisted.transaction_id || persisted.receipt_number,
        amount: persisted.amount,
        method: persisted.method as Payment["method"],
        gatewayTransactionId: persisted.transaction_id || undefined,
        status: "CONFIRMED",
        confirmedAt: {
          bs: getNepaliDateFromAD(persisted.created_at),
          ad: persisted.created_at,
        },
        receiptNumber: persisted.receipt_number,
        amountInWordsNe: numberToNepaliWords(persisted.amount),
      };
      setActivePaymentModal(null);
      // The receipt is rendered from the persisted record, never from a
      // locally fabricated one.
      setActiveReceipt(receipt);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Payment could not be processed.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={!!invoice}
      onClose={() => setActivePaymentModal(null)}
      title="Institutional Fee Payment Gateway"
      subtitle={
        invoice
          ? `Invoice: ${invoice.invoiceNumber} • ${invoice.termName}`
          : ""
      }
      maxWidth="md"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => setActivePaymentModal(null)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handlePay()}
            disabled={isProcessing || customAmount <= 0}
            isLoading={isProcessing}
          >
            Confirm & Pay {formatNPR(customAmount, language)}
          </Button>
        </>
      }
    >
      {error && <Alert variant="error">{error}</Alert>}
      <div className="space-y-4 text-xs text-slate-800 bg-white">
        {/* Invoice Summary Box */}
        <div className="bg-slate-50 p-3.5 rounded border border-slate-200 space-y-1.5">
          <div className="flex justify-between text-slate-600">
            <span>Student:</span>
            <span className="font-semibold text-slate-900">
              {invoice?.studentName}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Total Invoiced:</span>
            <span>{formatNPR(invoice?.totalAmount ?? 0, language)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Paid to Date:</span>
            <span className="text-emerald-700 font-medium">
              {formatNPR(invoice?.paidAmount ?? 0, language)}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-200 text-sm font-bold text-slate-900">
            <span>Remaining Balance:</span>
            <span className="font-mono text-red-600">
              {formatNPR(invoice?.balanceDue ?? 0, language)}
            </span>
          </div>
        </div>

        {/* Custom Amount to pay */}
        <div>
          <label className="block text-slate-700 font-medium mb-1">
            Payment Amount (NPR)
          </label>
          <input
            type="number"
            min={1}
            max={invoice?.balanceDue ?? 0}
            value={customAmount}
            onChange={(e) =>
              setCustomAmount(
                Math.min(invoice?.balanceDue ?? 0, Number(e.target.value)),
              )
            }
            className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Regional & Global Payment Methods (eSewa / Khalti / Stripe / connectIPS / Cash) */}
        <div>
          <label className="block text-slate-700 font-medium mb-1.5">
            Select Payment Method (Regional & Global)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "esewa", name: "eSewa Wallet", desc: "Nepal #1 Digital Wallet", badge: "Regional" },
              { id: "khalti", name: "Khalti v2", desc: "NetBanking & SDK", badge: "Regional" },
              { id: "stripe", name: "Stripe International", desc: "Credit / Debit Card (USD/NPR)", badge: "Global" },
              { id: "connectips", name: "connectIPS", desc: "Direct Interbank NCHL", badge: "Interbank" },
              { id: "cash", name: "Counter Cash Receipt", desc: "Campus Cashier Desk", badge: "On-Campus" },
            ].map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMethod(m.id as PaymentMethod)}
                className={`p-2.5 rounded border text-left transition-colors ${
                  selectedMethod === m.id
                    ? "border-blue-600 bg-blue-50/60 text-blue-950 font-medium"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">{m.name}</span>
                  <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1 rounded">{m.badge}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
          <FontAwesomeIcon icon={faShieldHalved} className="text-emerald-600" />
          <span>
            Payment confirmation is recorded against the invoice in the
            institution database before a receipt is issued.
          </span>
        </div>
      </div>
    </Modal>
  );
};
