import { apiRequest } from "./apiClient";

export interface LibraryBook {
  _id: string;
  title: string;
  subtitle?: string;
  isbn?: string;
  author?: string;
  authors?: string[];
  publisher?: string;
  category?: string;
  edition?: string;
  publicationYear?: number;
  shelfLocation?: string;
  totalCopies: number;
  availableCopies: number;
  status: string;
}

export interface LibraryCopy {
  _id: string;
  accessionNumber: string;
  barcode?: string;
  branch?: string;
  shelfLocation?: string;
  status: string;
  book: LibraryBook | string;
  currentBorrower?: { firstName: string; lastName: string; email: string };
}

export interface LibraryLoan {
  _id: string;
  book: LibraryBook | string;
  copy: LibraryCopy | string;
  member?: { firstName: string; lastName: string; email: string };
  memberId?: string;
  dueDate: string;
  status: string;
  renewalCount: number;
}

export interface LibraryReservation {
  _id: string;
  book: LibraryBook | string;
  member?: { firstName: string; lastName: string };
  queuePosition: number;
  status: string;
  expiresAt?: string;
}

export interface LibraryFine {
  _id: string;
  member?: { firstName: string; lastName: string; email: string };
  type: string;
  amountNpr: number;
  outstandingNpr: number;
  status: string;
  reason: string;
}

export interface LibraryDashboard {
  inventory: { titles: number; copies: number; availableCopies: number; borrowedCopies: number };
  circulation: { issuedToday: number; returnedToday: number; activeLoans: number; overdueLoans: number; pendingReservations: number };
  finance: { outstandingFinesNpr: number; finesCollectedNpr: number; waivedFinesNpr: number };
  popularTitles: Array<{ title: string; circulationCount: number }>;
  recentLoans: LibraryLoan[];
  lowStockTitles: LibraryBook[];
  recentAcquisitions: LibraryBook[];
}

export interface FacilityRoom {
  _id: string;
  name: string;
  roomNumber: string;
  building?: string;
  buildingId?: { _id: string; name: string; code: string } | string;
  capacity: number;
  status: string;
  openingTime: string;
  closingTime: string;
}

export interface FacilityReservation {
  _id: string;
  roomId: FacilityRoom | string;
  requesterName: string;
  purpose: string;
  date: string;
  startTime: string;
  endTime: string;
  expectedParticipants?: number;
  status: string;
  history?: Array<{ action: string; note: string; actor: string; createdAt: string }>;
}

export interface LibraryPolicy {
  _id: string;
  borrowerCategory: string;
  maxBooks: number;
  loanDays: number;
  renewalLimit: number;
  finePerDayNpr: number;
  maxFineNpr: number;
  reservationAllowed: boolean;
}

export const libraryApi = {
  dashboard: () => apiRequest<LibraryDashboard>("/library/dashboard"),
  books: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest<{ books: LibraryBook[]; total: number; page: number; totalPages: number }>(`/library/books${query ? `?${query}` : ""}`);
  },
  createBook: (payload: Partial<LibraryBook>) =>
    apiRequest<{ book: LibraryBook }>("/library/books", { method: "POST", body: JSON.stringify(payload) }),
  copies: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest<{ copies: LibraryCopy[]; total: number }>(`/library/copies${query ? `?${query}` : ""}`);
  },
  addCopies: (bookId: string, payload: { count: number; accessionNumber?: string; branch?: string; shelfLocation?: string }) =>
    apiRequest<{ copies: LibraryCopy[] }>(`/library/books/${bookId}/copies`, { method: "POST", body: JSON.stringify(payload) }),
  loans: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest<{ loans: LibraryLoan[]; total: number }>(`/library/loans${query ? `?${query}` : ""}`);
  },
  borrowers: (search: string) =>
    apiRequest<{ borrowers: Array<{ userId: string; name: string; identifier: string; category: string; activeLoans: number; outstandingFinesNpr: number }> }>(`/library/borrowers?search=${encodeURIComponent(search)}`),
  issue: (copyId: string, memberId: string, dueDate?: string) =>
    apiRequest<{ loan: LibraryLoan }>("/library/loans", { method: "POST", body: JSON.stringify({ copyId, memberId, dueDate }) }),
  returnLoan: (loanId: string, condition = "Good", conditionFineNpr?: number) =>
    apiRequest<{ loan: LibraryLoan }>(`/library/loans/${loanId}/return`, { method: "POST", body: JSON.stringify({ condition, conditionFineNpr }) }),
  renewLoan: (loanId: string) =>
    apiRequest<{ loan: LibraryLoan }>(`/library/loans/${loanId}/renew`, { method: "POST", body: JSON.stringify({}) }),
  reservations: () => apiRequest<{ reservations: LibraryReservation[] }>("/library/reservations"),
  createReservation: (bookId: string) =>
    apiRequest<{ reservation: LibraryReservation }>(`/library/books/${bookId}/reservations`, { method: "POST", body: JSON.stringify({}) }),
  cancelReservation: (id: string) =>
    apiRequest<{ reservation: LibraryReservation }>(`/library/reservations/${id}/cancel`, { method: "PATCH", body: JSON.stringify({}) }),
  fines: () => apiRequest<{ fines: LibraryFine[] }>("/library/fines"),
  payFine: (id: string, amountNpr: number) =>
    apiRequest<{ payment: { receiptNumber: string } }>(`/library/fines/${id}/payments`, { method: "POST", body: JSON.stringify({ amountNpr, method: "Cash" }) }),
  waiveFine: (id: string, amountNpr: number, reason: string) =>
    apiRequest<{ fine: LibraryFine }>(`/library/fines/${id}/waive`, { method: "PATCH", body: JSON.stringify({ amountNpr, reason }) }),
  policies: () => apiRequest<{ policies: LibraryPolicy[] }>("/library/policies"),
  updatePolicy: (category: string, policy: Partial<LibraryPolicy>) =>
    apiRequest<{ policy: LibraryPolicy }>(`/library/policies/${category}`, { method: "PUT", body: JSON.stringify(policy) }),
  buildings: () => apiRequest<{ buildings: Array<{ _id: string; name: string; code: string }> }>("/facilities/buildings"),
  rooms: () => apiRequest<{ rooms: FacilityRoom[] }>("/facilities/rooms"),
  facilityDashboard: () => apiRequest<{ metrics: Record<string, number>; upcomingReservations: FacilityReservation[]; recentMaintenance: unknown[] }>("/facilities/dashboard"),
  facilityReservations: () => apiRequest<{ reservations: FacilityReservation[] }>("/facilities/reservations"),
  createFacilityReservation: (payload: { roomId: string; date: string; startTime: string; endTime: string; purpose: string; expectedParticipants: number }) =>
    apiRequest<{ reservation: FacilityReservation }>("/facilities/reservations", { method: "POST", body: JSON.stringify(payload) }),
  updateFacilityReservation: (id: string, status: string, reason: string) =>
    apiRequest<{ reservation: FacilityReservation }>(`/facilities/reservations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
};
