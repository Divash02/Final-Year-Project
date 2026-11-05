import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { formatNPR } from "../../lib/nepaliCalendar";
import { useToast } from "../ui/ToastContainer";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { EmptyState as BaseEmptyState, EmptyStateProps } from "../ui/EmptyState";
import { faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { Spinner } from "../ui/Spinner";
import {
  FacilityReservation,
  FacilityRoom,
  LibraryBook,
  LibraryCopy,
  LibraryDashboard,
  LibraryFine,
  LibraryLoan,
  LibraryPolicy,
  LibraryReservation,
  libraryApi,
} from "../../services/libraryApi";

type Workspace = "library" | "facilities";
type LibraryTab = "overview" | "catalog" | "copies" | "circulation" | "reservations" | "fines" | "policy";

const EmptyState: React.FC<Omit<EmptyStateProps, "icon"> & { icon?: EmptyStateProps["icon"] }> = ({ icon = faBookOpen, ...props }) => (
  <BaseEmptyState icon={icon} {...props} />
);

const libraryTabs: Array<{ id: LibraryTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "catalog", label: "Catalog" },
  { id: "copies", label: "Book Copies" },
  { id: "circulation", label: "Circulation" },
  { id: "reservations", label: "Reservations" },
  { id: "fines", label: "Fines & Payments" },
  { id: "policy", label: "Policies" },
];

function displayTitle(book: LibraryBook | string) {
  return typeof book === "string" ? book : book?.title || "Book";
}

function displayCopy(copy: LibraryCopy | string) {
  return typeof copy === "string" ? copy : copy?.accessionNumber || "Copy";
}

function dateLabel(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NP", { dateStyle: "medium", timeZone: "Asia/Kathmandu" }).format(new Date(value));
}

export const FacilitiesLibraryView: React.FC = () => {
  const { currentRole, language } = useCollegeOS();
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState<Workspace>("library");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<LibraryDashboard | null>(null);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [copies, setCopies] = useState<LibraryCopy[]>([]);
  const [loans, setLoans] = useState<LibraryLoan[]>([]);
  const [borrowerSearch, setBorrowerSearch] = useState("");
  const [borrowers, setBorrowers] = useState<Array<{ userId: string; name: string; identifier: string; category: string; activeLoans: number; outstandingFinesNpr: number }>>([]);
  const [reservations, setReservations] = useState<LibraryReservation[]>([]);
  const [fines, setFines] = useState<LibraryFine[]>([]);
  const [policies, setPolicies] = useState<LibraryPolicy[]>([]);
  const [bookSearch, setBookSearch] = useState("");
  const [rooms, setRooms] = useState<FacilityRoom[]>([]);
  const [facilityReservations, setFacilityReservations] = useState<FacilityReservation[]>([]);
  const [facilityDashboard, setFacilityDashboard] = useState<{ metrics: Record<string, number>; upcomingReservations: FacilityReservation[]; recentMaintenance: unknown[] } | null>(null);

  const isLibraryManager = ["super_admin", "campus_admin"].includes(currentRole);
  const isFinanceManager = ["super_admin", "campus_admin", "finance_officer"].includes(currentRole);
  const isFacilitiesManager = ["super_admin", "campus_admin", "dean", "hod", "registrar", "faculty"].includes(currentRole);
  const canRequestFacilities = ["super_admin", "campus_admin", "dean", "hod", "program_coordinator", "registrar", "faculty", "student"].includes(currentRole);

  const loadLibrary = useCallback(async () => {
    setError("");
    const results = await Promise.allSettled([
      libraryApi.dashboard(),
      libraryApi.books({ search: bookSearch }),
      libraryApi.loans(),
      libraryApi.reservations(),
      libraryApi.fines(),
      libraryApi.policies(),
      isLibraryManager ? libraryApi.copies() : Promise.resolve({ copies: [], total: 0 }),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      setError(failed.reason instanceof Error ? failed.reason.message : "Could not load library records.");
    }
    if (results[0].status === "fulfilled") setDashboard(results[0].value);
    if (results[1].status === "fulfilled") setBooks(results[1].value.books || []);
    if (results[2].status === "fulfilled") setLoans(results[2].value.loans || []);
    if (results[3].status === "fulfilled") setReservations(results[3].value.reservations || []);
    if (results[4].status === "fulfilled") setFines(results[4].value.fines || []);
    if (results[5].status === "fulfilled") setPolicies(results[5].value.policies || []);
    if (results[6].status === "fulfilled") setCopies(results[6].value.copies || []);
  }, [bookSearch, isLibraryManager]);

  const loadFacilities = useCallback(async () => {
    setError("");
    const results = await Promise.allSettled([
      libraryApi.rooms(),
      libraryApi.facilityReservations(),
      libraryApi.facilityDashboard(),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      setError(failed.reason instanceof Error ? failed.reason.message : "Could not load facilities records.");
    }
    if (results[0].status === "fulfilled") setRooms(results[0].value.rooms || []);
    if (results[1].status === "fulfilled") setFacilityReservations(results[1].value.reservations || []);
    if (results[2].status === "fulfilled") setFacilityDashboard(results[2].value);
  }, []);

  useEffect(() => {
    setLoading(true);
    const load = workspace === "library" ? loadLibrary() : loadFacilities();
    void load.finally(() => setLoading(false));
  }, [workspace, loadLibrary, loadFacilities]);

  useEffect(() => {
    if (!isLibraryManager || libraryTab !== "circulation" || borrowerSearch.trim().length < 2) {
      setBorrowers([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      libraryApi.borrowers(borrowerSearch.trim())
        .then((result) => { if (active) setBorrowers(result.borrowers || []); })
        .catch((searchError: Error) => notify("Borrower search failed", searchError.message, "error"));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [borrowerSearch, isLibraryManager, libraryTab]);

  const notify = (title: string, detail: string, variant: "success" | "info" | "warning" | "error" = "info") => {
    toast({ message: title, detail, variant });
  };

  const runAction = async (action: () => Promise<unknown>, successMessage: string, refresh = true) => {
    setBusy(true);
    try {
      await action();
      notify("Complete", successMessage, "success");
      if (refresh) await (workspace === "library" ? loadLibrary() : loadFacilities());
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "The request could not be completed.";
      notify("Action failed", message, "error");
    } finally {
      setBusy(false);
    }
  };

  const submitBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runAction(
      () => libraryApi.createBook({
        title: String(form.get("title") || ""),
        isbn: String(form.get("isbn") || ""),
        author: String(form.get("author") || ""),
        publisher: String(form.get("publisher") || ""),
        category: String(form.get("category") || ""),
        shelfLocation: String(form.get("shelfLocation") || ""),
      }),
      "Catalog title added.",
    );
    formElement.reset();
  };

  const submitCopies = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const bookId = String(form.get("bookId") || "");
    await runAction(
      () => libraryApi.addCopies(bookId, {
        count: Number(form.get("count") || 1),
        accessionNumber: String(form.get("accessionNumber") || "") || undefined,
        branch: String(form.get("branch") || "Main Library"),
        shelfLocation: String(form.get("shelfLocation") || ""),
      }),
      "Physical copy inventory updated.",
    );
    formElement.reset();
  };

  const submitIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      () => libraryApi.issue(String(form.get("copyId") || ""), String(form.get("memberId") || "")),
      "Book issued and loan recorded.",
    );
    event.currentTarget.reset();
  };

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(() => libraryApi.createFacilityReservation({
      roomId: String(form.get("roomId") || ""),
      date: String(form.get("date") || ""),
      startTime: String(form.get("startTime") || ""),
      endTime: String(form.get("endTime") || ""),
      purpose: String(form.get("purpose") || ""),
      expectedParticipants: Number(form.get("participants") || 1),
    }), "Facility booking request submitted.");
    event.currentTarget.reset();
  };

  const outstandingOwnFines = useMemo(() => fines.filter((fine) => fine.outstandingNpr > 0), [fines]);

  return (
    <div className="mx-auto min-h-full max-w-7xl space-y-6 bg-neutral-50 p-5 lg:p-8">
      <header className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Institutional Operations</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">Library &amp; Facilities</h1>
          <p className="mt-1 text-sm text-neutral-600">Persistent catalog, circulation, fines, rooms, and booking requests.</p>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-neutral-200 bg-white p-1">
          {(["library", "facilities"] as const).map((item) => (
            <button key={item} onClick={() => setWorkspace(item)} className={`rounded-md px-4 py-2 text-sm font-medium ${workspace === item ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}>
              {item === "library" ? "Library" : "Facilities"}
            </button>
          ))}
        </div>
      </header>

      {workspace === "library" ? (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Library workspace">
            {libraryTabs.map((tab) => (
              <button key={tab.id} onClick={() => setLibraryTab(tab.id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${libraryTab === tab.id ? "border-indigo-700 bg-indigo-700 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"}`}>
                {tab.label}
              </button>
            ))}
          </nav>

          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error} <button className="ml-2 underline" onClick={() => void loadLibrary()}>Retry</button></div>}
          {loading ? <div className="flex justify-center p-16"><Spinner size={24} /></div> : (
            <>
              {libraryTab === "overview" && (
                <section className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Titles", dashboard?.inventory.titles ?? 0],
                      ["Physical Copies", dashboard?.inventory.copies ?? 0],
                      ["Available", dashboard?.inventory.availableCopies ?? 0],
                      ["Overdue Loans", dashboard?.circulation.overdueLoans ?? 0],
                      ["Active Loans", dashboard?.circulation.activeLoans ?? 0],
                      ["Pending Reservations", dashboard?.circulation.pendingReservations ?? 0],
                      ["Fine Balance", formatNPR(dashboard?.finance.outstandingFinesNpr ?? 0, language)],
                      ["Fines Collected", formatNPR(dashboard?.finance.finesCollectedNpr ?? 0, language)],
                    ].map(([label, value]) => <Card key={String(label)} className="p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-2 text-xl font-semibold text-neutral-900">{value}</p></Card>)}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="p-5">
                      <h2 className="mb-3 text-sm font-semibold">Recent Circulation</h2>
                      {dashboard?.recentLoans.length ? <div className="divide-y divide-neutral-100">{dashboard.recentLoans.slice(0, 6).map((loan) => <div key={loan._id} className="flex justify-between gap-3 py-2 text-sm"><span>{displayTitle(loan.book)} <span className="block text-xs text-neutral-500">{loan.member?.firstName} {loan.member?.lastName}</span></span><Badge variant={loan.status === "overdue" ? "danger" : "neutral"} size="sm">{loan.status}</Badge></div>)}</div> : <EmptyState title="No circulation yet" description="Issued and returned books will appear here." />}
                    </Card>
                    <Card className="p-5">
                      <h2 className="mb-3 text-sm font-semibold">Popular Titles &amp; Low Stock</h2>
                      {dashboard?.popularTitles.length ? dashboard.popularTitles.map((book) => <div key={book.title} className="flex justify-between border-b border-neutral-100 py-2 text-sm"><span>{book.title}</span><span className="text-neutral-500">{book.circulationCount} loans</span></div>) : <EmptyState title="No popular titles yet" description="Circulation activity will populate this list." />}
                      {dashboard?.lowStockTitles.length ? <p className="mt-3 text-xs text-amber-700">{dashboard.lowStockTitles.length} title(s) have two or fewer copies.</p> : null}
                    </Card>
                  </div>
                </section>
              )}

              {libraryTab === "catalog" && (
                <section className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder="Search title, author, ISBN, publisher, or category" className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" />
                    <Button variant="outline" size="sm" onClick={() => void loadLibrary()}>Search</Button>
                  </div>
                  {isLibraryManager && <Card className="p-4"><form onSubmit={submitBook} className="grid gap-2 sm:grid-cols-3">
                    <input name="title" required placeholder="Book title" className="rounded-md border px-3 py-2 text-sm" />
                    <input name="isbn" placeholder="ISBN" className="rounded-md border px-3 py-2 text-sm" />
                    <input name="author" placeholder="Author(s)" className="rounded-md border px-3 py-2 text-sm" />
                    <input name="publisher" placeholder="Publisher" className="rounded-md border px-3 py-2 text-sm" />
                    <input name="category" placeholder="Category" className="rounded-md border px-3 py-2 text-sm" />
                    <div className="flex gap-2"><input name="shelfLocation" placeholder="Default shelf" className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" /><Button type="submit" size="sm" disabled={busy}>Add title</Button></div>
                  </form></Card>}
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-100 text-xs text-neutral-600"><tr><th className="p-3">Title</th><th className="p-3">ISBN</th><th className="p-3">Author / Publisher</th><th className="p-3">Category</th><th className="p-3">Copies</th><th className="p-3">Availability</th></tr></thead><tbody className="divide-y divide-neutral-100">{books.map((book) => <tr key={book._id}><td className="p-3 font-medium">{book.title}</td><td className="p-3">{book.isbn || "—"}</td><td className="p-3">{book.author || book.publisher || "—"}</td><td className="p-3">{book.category || "—"}</td><td className="p-3">{book.totalCopies}</td><td className="p-3">{book.availableCopies} available</td></tr>)}</tbody></table></div>
                    {!books.length && <EmptyState title="No catalog titles found" description="Add a title or adjust your search." />}
                  </Card>
                </section>
              )}

              {libraryTab === "copies" && (
                <section className="space-y-4">
                  {isLibraryManager && <Card className="p-4"><form onSubmit={submitCopies} className="grid gap-2 sm:grid-cols-3">
                    <select name="bookId" required className="rounded-md border bg-white px-3 py-2 text-sm"><option value="">Select title</option>{books.map((book) => <option value={book._id} key={book._id}>{book.title}</option>)}</select>
                    <input name="count" type="number" min="1" max="100" defaultValue="1" required className="rounded-md border px-3 py-2 text-sm" />
                    <input name="accessionNumber" placeholder="Accession number (for one copy)" className="rounded-md border px-3 py-2 text-sm" />
                    <input name="branch" defaultValue="Main Library" className="rounded-md border px-3 py-2 text-sm" />
                    <input name="shelfLocation" placeholder="Shelf location" className="rounded-md border px-3 py-2 text-sm" />
                    <Button type="submit" size="sm" disabled={busy}>Add copies</Button>
                  </form></Card>}
                  <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-100 text-xs text-neutral-600"><tr><th className="p-3">Accession</th><th className="p-3">Title</th><th className="p-3">Branch / Shelf</th><th className="p-3">Borrower</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-neutral-100">{copies.map((copy) => <tr key={copy._id}><td className="p-3 font-mono">{copy.accessionNumber}</td><td className="p-3">{displayTitle(copy.book)}</td><td className="p-3">{copy.branch} / {copy.shelfLocation || "—"}</td><td className="p-3">{copy.currentBorrower ? `${copy.currentBorrower.firstName} ${copy.currentBorrower.lastName}` : "—"}</td><td className="p-3"><Badge variant={copy.status === "Available" ? "success" : "neutral"} size="sm">{copy.status}</Badge></td></tr>)}</tbody></table>{!copies.length && <EmptyState title="No physical copies registered" description="Add copies after cataloging book titles." />}</Card>
                </section>
              )}

              {libraryTab === "circulation" && (
                <section className="space-y-4">
                  {isLibraryManager && <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">Issue a Copy</h2><form onSubmit={submitIssue} className="grid gap-2 sm:grid-cols-3">
                    <select name="copyId" required className="rounded-md border bg-white px-3 py-2 text-sm"><option value="">Select available copy</option>{copies.filter((copy) => copy.status === "Available").map((copy) => <option key={copy._id} value={copy._id}>{copy.accessionNumber} · {displayTitle(copy.book)}</option>)}</select>
                    <div className="space-y-1">
                      <input value={borrowerSearch} onChange={(event) => setBorrowerSearch(event.target.value)} placeholder="Search borrower by name, ID, or email" className="w-full rounded-md border px-3 py-2 text-sm" />
                      <select name="memberId" required className="w-full rounded-md border bg-white px-3 py-2 text-sm"><option value="">Select eligible borrower</option>{borrowers.map((borrower) => <option key={borrower.userId} value={borrower.userId}>{borrower.name} · {borrower.identifier} · {borrower.activeLoans} active</option>)}</select>
                    </div>
                    <Button type="submit" size="sm" disabled={busy}>Issue book</Button>
                  </form><p className="mt-2 text-xs text-neutral-500">Eligibility, circulation limits, fines, and copy availability are checked by the server.</p></Card>}
                  <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-100 text-xs text-neutral-600"><tr><th className="p-3">Book</th><th className="p-3">Copy</th>{isLibraryManager && <th className="p-3">Borrower</th>}<th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-neutral-100">{loans.map((loan) => <tr key={loan._id}><td className="p-3">{displayTitle(loan.book)}</td><td className="p-3 font-mono">{displayCopy(loan.copy)}</td>{isLibraryManager && <td className="p-3">{loan.member ? `${loan.member.firstName} ${loan.member.lastName}` : "—"}</td>}<td className="p-3">{dateLabel(loan.dueDate)}</td><td className="p-3"><Badge variant={loan.status === "overdue" ? "danger" : loan.status === "issued" ? "warning" : "neutral"} size="sm">{loan.status}</Badge></td><td className="p-3"><div className="flex gap-2">{loan.status === "issued" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void runAction(() => libraryApi.renewLoan(loan._id), "Loan renewed.")}>Renew</Button>}{isLibraryManager && ["issued", "overdue"].includes(loan.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void runAction(() => libraryApi.returnLoan(loan._id), "Book return recorded.")}>Return</Button>}</div></td></tr>)}</tbody></table>{!loans.length && <EmptyState title="No loans found" description="Loans and returns will appear here." />}</Card>
                </section>
              )}

              {libraryTab === "reservations" && (
                <section className="space-y-4">
                  <Card className="p-4"><form onSubmit={(event) => { event.preventDefault(); const bookId = String(new FormData(event.currentTarget).get("bookId") || ""); void runAction(() => libraryApi.createReservation(bookId), "Reservation added to the queue."); }} className="flex flex-col gap-2 sm:flex-row">
                    <select name="bookId" required className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"><option value="">Select a title to reserve</option>{books.map((book) => <option key={book._id} value={book._id}>{book.title} ({book.availableCopies} available)</option>)}</select><Button type="submit" size="sm" disabled={busy}>Reserve title</Button>
                  </form></Card>
                  <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-100 text-xs text-neutral-600"><tr><th className="p-3">Book</th><th className="p-3">Queue</th><th className="p-3">Status</th><th className="p-3">Expires</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-neutral-100">{reservations.map((item) => <tr key={item._id}><td className="p-3">{displayTitle(item.book)}</td><td className="p-3">{item.queuePosition}</td><td className="p-3">{item.status}</td><td className="p-3">{dateLabel(item.expiresAt)}</td><td className="p-3">{["waiting", "ready"].includes(item.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void runAction(() => libraryApi.cancelReservation(item._id), "Reservation cancelled.")}>Cancel</Button>}</td></tr>)}</tbody></table>{!reservations.length && <EmptyState title="No reservations" description="Reserve a title to join its waiting list." />}</Card>
                </section>
              )}

              {libraryTab === "fines" && (
                <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-100 text-xs text-neutral-600"><tr><th className="p-3">Borrower</th><th className="p-3">Type / Reason</th><th className="p-3">Fine</th><th className="p-3">Outstanding</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-neutral-100">{fines.map((fine) => <tr key={fine._id}><td className="p-3">{fine.member ? `${fine.member.firstName} ${fine.member.lastName}` : "You"}</td><td className="p-3">{fine.type}<span className="block text-xs text-neutral-500">{fine.reason}</span></td><td className="p-3">{formatNPR(fine.amountNpr, language)}</td><td className="p-3">{formatNPR(fine.outstandingNpr, language)}</td><td className="p-3">{fine.status}</td><td className="p-3"><div className="flex flex-wrap gap-2">{isFinanceManager && fine.outstandingNpr > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => void runAction(() => libraryApi.payFine(fine._id, fine.outstandingNpr), "Authorized cash payment recorded.")}>Record cash payment</Button>}{isFinanceManager && fine.outstandingNpr > 0 && <FineWaiverAction fine={fine} busy={busy} onWaive={(amount, reason) => runAction(() => libraryApi.waiveFine(fine._id, amount, reason), "Fine waiver recorded.")} />}</div></td></tr>)}</tbody></table>{!fines.length && <EmptyState title="No fines" description="Outstanding and settled library charges appear here." />}{!isFinanceManager && outstandingOwnFines.length > 0 && <p className="p-3 text-xs text-neutral-500">Online payment is not available here. Payments are shown after an authorized institutional payment is recorded.</p>}</Card>
              )}

              {libraryTab === "policy" && (
                <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-100 text-xs text-neutral-600"><tr><th className="p-3">Borrower Category</th><th className="p-3">Max Books</th><th className="p-3">Loan Days</th><th className="p-3">Renewals</th><th className="p-3">Fine / Day</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-neutral-100">{policies.map((policy) => <PolicyRow key={policy._id} policy={policy} editable={isLibraryManager} busy={busy} onSave={(update) => runAction(() => libraryApi.updatePolicy(policy.borrowerCategory, update), "Borrowing policy updated.")} />)}</tbody></table>{!policies.length && <EmptyState title="No active borrowing policies" description="An authorized library administrator must configure circulation policies." />}</Card>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral" size="sm">Rooms: {facilityDashboard?.metrics.totalRooms ?? rooms.length}</Badge>
            <Badge variant="success" size="sm">Available: {facilityDashboard?.metrics.availableRooms ?? 0}</Badge>
            <Badge variant="warning" size="sm">Pending: {facilityDashboard?.metrics.pendingReservations ?? facilityReservations.filter((reservation) => reservation.status === "Pending").length}</Badge>
            <Badge variant="danger" size="sm">Maintenance: {facilityDashboard?.metrics.pendingMaintenance ?? 0}</Badge>
          </div>
          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error} <button className="ml-2 underline" onClick={() => void loadFacilities()}>Retry</button></div>}
          {loading ? <div className="flex justify-center p-16"><Spinner size={24} /></div> : (
            <div className="space-y-4">
              {canRequestFacilities && <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Request a Room Booking</h2><form onSubmit={submitBooking} className="grid gap-2 sm:grid-cols-3">
                <select name="roomId" required className="rounded-md border bg-white px-3 py-2 text-sm"><option value="">Select available room</option>{rooms.filter((room) => !["Maintenance", "Unavailable"].includes(room.status)).map((room) => <option key={room._id} value={room._id}>{room.name} · {room.building || ""} · capacity {room.capacity}</option>)}</select>
                <input name="date" type="date" min={new Date().toISOString().slice(0, 10)} required className="rounded-md border px-3 py-2 text-sm" />
                <input name="participants" type="number" min="1" defaultValue="1" required placeholder="Expected participants" className="rounded-md border px-3 py-2 text-sm" />
                <input name="startTime" type="time" required className="rounded-md border px-3 py-2 text-sm" />
                <input name="endTime" type="time" required className="rounded-md border px-3 py-2 text-sm" />
                <input name="purpose" required placeholder="Purpose of booking" className="rounded-md border px-3 py-2 text-sm" />
                <div className="sm:col-span-3"><Button type="submit" size="sm" disabled={busy}>Submit request</Button></div>
              </form><p className="mt-2 text-xs text-neutral-500">Bookings are checked against room hours, capacity, maintenance closures, and pending or approved reservations on the server.</p></Card>}
              <Card className="overflow-x-auto"><h2 className="p-4 pb-0 text-sm font-semibold">Room Booking Schedule</h2><table className="mt-3 w-full text-left text-sm"><thead className="bg-neutral-100 text-xs text-neutral-600"><tr><th className="p-3">Room</th><th className="p-3">Date</th><th className="p-3">Time</th><th className="p-3">Purpose</th><th className="p-3">Requested by</th><th className="p-3">Status</th><th className="p-3">Approval</th></tr></thead><tbody className="divide-y divide-neutral-100">{facilityReservations.map((reservation) => <tr key={reservation._id}><td className="p-3">{typeof reservation.roomId === "string" ? reservation.roomId : `${reservation.roomId.name} ${reservation.roomId.roomNumber}`}</td><td className="p-3">{dateLabel(reservation.date)}</td><td className="p-3">{reservation.startTime}–{reservation.endTime}</td><td className="p-3">{reservation.purpose}</td><td className="p-3">{reservation.requesterName}</td><td className="p-3"><Badge variant={reservation.status === "Approved" ? "success" : reservation.status === "Rejected" ? "danger" : "warning"} size="sm">{reservation.status}</Badge></td><td className="p-3">{isFacilitiesManager && reservation.status === "Pending" && <div className="flex gap-1"><Button size="sm" disabled={busy} onClick={() => void runAction(() => libraryApi.updateFacilityReservation(reservation._id, "Approved", "Approved by facilities reviewer."), "Booking approved.")}>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void runAction(() => libraryApi.updateFacilityReservation(reservation._id, "Rejected", "Rejected by facilities reviewer."), "Booking rejected.")}>Reject</Button></div>}</td></tr>)}</tbody></table>{!facilityReservations.length && <EmptyState title="No room bookings" description="Booking requests and their decisions will appear here." />}</Card>
              <Card className="p-5"><h2 className="mb-2 text-sm font-semibold">Facilities register</h2>{rooms.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{rooms.map((room) => <div key={room._id} className="rounded-lg border border-neutral-200 p-3"><p className="font-medium">{room.name}</p><p className="text-xs text-neutral-500">{room.building || "Campus"} · {room.roomNumber} · capacity {room.capacity}</p><p className="mt-1 text-xs">{room.status} · {room.openingTime}–{room.closingTime}</p></div>)}</div> : <EmptyState title="No facilities registered" description="Authorized facilities staff can register buildings and rooms in the Facilities workspace." />}</Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const FineWaiverAction: React.FC<{
  fine: LibraryFine;
  busy: boolean;
  onWaive: (amount: number, reason: string) => Promise<void>;
}> = ({ fine, busy, onWaive }) => {
  const [amount, setAmount] = useState(String(fine.outstandingNpr));
  const [reason, setReason] = useState("");
  return (
    <form className="flex flex-wrap gap-1" onSubmit={(event) => {
      event.preventDefault();
      const value = Number(amount);
      if (value > 0 && reason.trim()) void onWaive(value, reason.trim());
    }}>
      <input aria-label="Waiver amount NPR" type="number" min="0.01" max={fine.outstandingNpr} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-24 rounded border px-2 py-1 text-xs" />
      <input aria-label="Waiver reason" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Waiver reason" className="w-28 rounded border px-2 py-1 text-xs" />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>Waive</Button>
    </form>
  );
};

const PolicyRow: React.FC<{
  policy: LibraryPolicy;
  editable: boolean;
  busy: boolean;
  onSave: (update: Partial<LibraryPolicy>) => Promise<void>;
}> = ({ policy, editable, busy, onSave }) => {
  const [values, setValues] = useState({
    maxBooks: String(policy.maxBooks),
    loanDays: String(policy.loanDays),
    renewalLimit: String(policy.renewalLimit),
    finePerDayNpr: String(policy.finePerDayNpr),
  });
  return (
    <tr>
      <td className="p-3 font-medium capitalize">{policy.borrowerCategory}</td>
      {[["maxBooks", values.maxBooks], ["loanDays", values.loanDays], ["renewalLimit", values.renewalLimit], ["finePerDayNpr", values.finePerDayNpr]].map(([key, value]) => (
        <td key={key} className="p-3">{editable ? <input type="number" min="0" value={value} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className="w-20 rounded border px-2 py-1" /> : value}</td>
      ))}
      <td className="p-3">{editable && <Button size="sm" variant="outline" disabled={busy} onClick={() => void onSave({ maxBooks: Number(values.maxBooks), loanDays: Number(values.loanDays), renewalLimit: Number(values.renewalLimit), finePerDayNpr: Number(values.finePerDayNpr) })}>Save</Button>}</td>
    </tr>
  );
};
