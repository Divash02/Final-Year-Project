import React from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { formatDateForCalendar, formatNPR } from "../../lib/nepaliCalendar";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faPrint,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";

/**
 * Official payment receipt.
 *
 * Renders the persisted payment record returned by the API —
 * the receipt only exists once the payment is stored in the
 * institution database.
 */
export const ReceiptModal: React.FC = () => {
  const {
    activeReceipt,
    setActiveReceipt,
    currentTenant,
    currentCampus,
    language,
    calendarType,
  } = useCollegeOS();

  const payment = activeReceipt;

  return (
    <Modal
      isOpen={!!payment}
      onClose={() => setActiveReceipt(null)}
      title="Official Payment Receipt"
      subtitle={payment ? `Receipt No: ${payment.receiptNumber}` : ""}
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => setActiveReceipt(null)}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={faPrint}
            onClick={() => window.print()}
          >
            Print Receipt
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs text-slate-800 bg-white">
        {/* Institution Header */}
        <div className="text-center pb-3 border-b border-slate-200">
          <div className="text-sm font-bold uppercase text-slate-900">
            {currentTenant.name}
          </div>
          <div className="text-xs text-slate-500">
            {currentCampus
              ? currentCampus.name
              : "Institutional Finance Counter"}
          </div>
          <div className="inline-block mt-2 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono text-sm font-semibold">
            RECEIPT: {payment?.receiptNumber}
          </div>
        </div>

        {/* Metadata Details */}
        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 block text-xs">
              Student / Payer:
            </span>
            <span className="font-semibold text-slate-900">
              {payment?.studentName}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-xs">
              Transaction No:
            </span>
            <span className="font-mono text-slate-700">
              {payment?.paymentNumber}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-xs">
              Date ({calendarType}):
            </span>
            <span className="font-medium text-slate-800">
              {payment
                ? formatDateForCalendar(
                    payment.confirmedAt,
                    calendarType,
                    language,
                  )
                : ""}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-xs">Method:</span>
            <span className="font-semibold text-blue-700 uppercase">
              {payment?.method}
            </span>
          </div>
        </div>

        {/* Amount Box */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-center">
          <span className="text-xs uppercase font-semibold text-slate-500 block">
            Total Amount Received
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-0.5">
            {formatNPR(payment?.amount ?? 0, language)}
          </div>
          <div className="text-xs text-slate-600 italic mt-1">
            "{payment?.amountInWordsNe}"
          </div>
        </div>

        <div className="flex justify-between items-center text-sm text-slate-500 pt-2 border-t border-slate-200">
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <FontAwesomeIcon icon={faShieldHalved} />
            <span>Recorded in the Institution Database</span>
          </span>
          <span>Accounts Department</span>
        </div>
      </div>
    </Modal>
  );
};
