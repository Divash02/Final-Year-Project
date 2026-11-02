import { requireAuth, requirePermission } from '../middleware/auth.js';
import { LibraryBook, LibraryLoan } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function registerLibraryRoutes(app) {
  app.get('/api/library/dashboard', requireAuth, asyncHandler(async (req, res) => {
    const totalBooks = await LibraryBook.countDocuments({ isActive: true });
    const agg = await LibraryBook.aggregate([{ '': { 'isActive': true } }, { '': { '_id': null, 'total': { '': '' }, 'available': { '': '' } } }]);
    const statsAgg = agg[0] || { total: 0, available: 0 };
    const borrowed = await LibraryLoan.countDocuments({ status: { '': ['issued', 'overdue'] } });
    const overdue = await LibraryLoan.countDocuments({ status: 'overdue' });
    const members = await LibraryLoan.distinct('member');
    res.json({ stats: { totalBooks, totalCopies: statsAgg.total, availableCopies: statsAgg.available, borrowed, overdue, activeMembers: members.length } });
  }));
  app.get('/api/library/books', requireAuth, asyncHandler(async (req, res) => {
    const search = req.query.search; const category = req.query.category; const filter = { isActive: true };
    if (category) filter.category = category;
    if (search) { filter[''] = [{ title: { '': search, '': 'i' } }, { author: { '': search, '': 'i' } }, { isbn: { '': search, '': 'i' } }]; }
    const books = await LibraryBook.find(filter).sort({ createdAt: -1 });
    res.json({ books });
  }));
  app.post('/api/library/books', requireAuth, requirePermission('library.manage'), asyncHandler(async (req, res) => {
    const body = req.body; if (!body.title) return res.status(400).json({ error: 'Title required' });
    const totalCopies = Number(body.totalCopies) || 0;
    const book = await LibraryBook.create({ isbn: body.isbn || '', title: body.title, author: body.author || '', publisher: body.publisher || '', category: body.category || '', edition: body.edition || '', publicationYear: body.publicationYear || null, totalCopies, availableCopies: totalCopies, isActive: true });
    res.json({ book });
  }));
  app.put('/api/library/books/:id', requireAuth, requirePermission('library.manage'), asyncHandler(async (req, res) => {
    const book = await LibraryBook.findById(req.params.id); if (!book) return res.status(404).json({ error: 'Book not found' });
    const body = req.body; ['title','author','publisher','category','edition','publicationYear','isbn','totalCopies','availableCopies','isActive'].forEach((k) => { if (body[k] !== undefined) book[k] = body[k]; });
    await book.save(); res.json({ book });
  }));
  app.get('/api/library/loans', requireAuth, asyncHandler(async (req, res) => {
    const loans = await LibraryLoan.find({ member: req.user.id }).populate('book').sort({ createdAt: -1 });
    res.json({ loans });
  }));
  app.post('/api/library/issue', requireAuth, requirePermission('library.manage'), asyncHandler(async (req, res) => {
    const { bookId, memberId, dueDate } = req.body; if (!bookId || !memberId || !dueDate) return res.status(400).json({ error: 'Missing fields' });
    const book = await LibraryBook.findById(bookId); if (!book || book.availableCopies < 1) return res.status(400).json({ error: 'Book not available' });
    const loan = await LibraryLoan.create({ book: bookId, member: memberId, issuedBy: req.user.id, issueDate: new Date(), dueDate: new Date(dueDate), status: 'issued' });
    book.availableCopies -= 1; await book.save(); res.json({ loan });
  }));
  app.post('/api/library/return', requireAuth, requirePermission('library.manage'), asyncHandler(async (req, res) => {
    const { loanId } = req.body; if (!loanId) return res.status(400).json({ error: 'Loan required' });
    const loan = await LibraryLoan.findById(loanId).populate('book'); if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status === 'returned') return res.status(400).json({ error: 'Already returned' });
    loan.status = 'returned'; loan.returnDate = new Date(); await loan.save();
    if (loan.book) { const book = await LibraryBook.findById(loan.book._id || loan.book); if (book) { book.availableCopies += 1; await book.save(); } }
    res.json({ loan });
  }));
}
