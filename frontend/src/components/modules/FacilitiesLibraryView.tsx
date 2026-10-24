import React, { useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { formatNPR } from "../../lib/nepaliCalendar";
import { EmptyState } from "../ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faBuilding,
  faClock,
  faServer,
} from "@fortawesome/free-solid-svg-icons";

/**
 * Library & Facilities.
 *
 * The library catalog and circulation records are institutional
 * data. They are not stored in the browser and this workspace no
 * longer simulates writes: the CollegeOS API does not yet expose
 * library endpoints, so the module reports that gap instead of
 * pretending a book was cataloged or a loan was returned.
 *
 * Server implementation required (proposed, not yet created):
 *   - `backend/src/models/LibraryItem.js` (catalog documents)
 *   - `backend/src/models/LibraryLoan.js` (circulation + fines)
 *   - `backend/src/routes/library.js` (CRUD + loan/return, RBAC
 *     via the existing `library.view` grant)
 *   - register the routes in `backend/src/app.js`
 */
export const FacilitiesLibraryView: React.FC = () => {
  const { currentRole, language } = useCollegeOS();
  const [activeTab, setActiveTab] = useState<"library" | "facilities">(
    "library",
  );

  const isStudent = currentRole === "student";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto bg-white min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FontAwesomeIcon
              icon={faBookOpen}
              className="text-blue-600 text-lg"
            />
            <span>Library &amp; Facilities Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Institutional library book circulation, fines, and campus room
            facilities
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md">
            <button
              onClick={() => setActiveTab("library")}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === "library"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Library Catalog
            </button>
            <button
              onClick={() => setActiveTab("facilities")}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === "facilities"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Circulation &amp; Fines
            </button>
          </div>
        </div>
      </div>

      {activeTab === "library" ? (
        <EmptyState
          icon={faServer}
          title="Library catalog is not yet connected"
          description="The CollegeOS API does not expose library endpoints yet, so catalog records cannot be stored in the institution database from this workspace. Adding books here would only create browser-side entries that vanish on refresh, so the action is disabled until the server module ships."
        />
      ) : (
        <EmptyState
          icon={faClock}
          title="Circulation records are not yet connected"
          description="Loans, returns and fines are institutional records and must persist in the institution database. The CollegeOS API does not expose circulation endpoints yet, so this workspace shows no records rather than simulating them."
        />
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1.5">
        <p className="font-semibold text-slate-800 flex items-center gap-1.5">
          <FontAwesomeIcon icon={faBuilding} className="text-slate-500" />
          Facilities note
        </p>
        <p>
          Campus room and facility booking is administered by the facilities
          office. {isStudent ? "Students can request facility time through" : "Staff can manage facility bookings through"} the
          workflow module until the facilities API is available.
        </p>
        <p className="font-mono text-slate-400">
          Currency: {formatNPR(0, language)} · Records pending server
          implementation
        </p>
      </div>
    </div>
  );
};
