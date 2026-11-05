import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Table } from '../../ui/Table';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { apiFetch } from '../../../services/apiClient';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faSearch, faPlus, faArrowRightArrowLeft, faChartBar } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../ui/ToastContainer';

export const LibraryLearningResourcesView: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'catalogue'|'myloans'|'manage'>('catalogue');
  const [stats, setStats] = useState<any>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showAddBook, setShowAddBook] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [bookForm, setBookForm] = useState({ title:'', author:'', isbn:'', category:'', publisher:'', totalCopies:1 });
  const [issueForm, setIssueForm] = useState({ bookId:'', memberId:'', dueDate:'' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, booksRes, loansRes] = await Promise.all([
        apiFetch('/library/dashboard').then(r=>r.ok?r.json():null),
        apiFetch(`/library/books?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`).then(r=>r.ok?r.json():{books:[]}),
        apiFetch('/library/loans').then(r=>r.ok?r.json():{loans:[]}),
      ]);
      if (statsRes?.stats) setStats(statsRes.stats);
      if (booksRes?.books) setBooks(booksRes.books);
      if (loansRes?.loans) setLoans(loansRes.loans);
    } catch (e:any) {
      showToast(e.message || 'Failed to load library data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
  }, [search, category]);

  const handleAddBook = async () => {
    try {
      const res = await apiFetch('/library/books', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bookForm) });
      if (!res.ok) { const err = await res.json().catch(()=>({error:'Failed'})); showToast(err.error||'Failed', 'error'); return; }
      showToast('Book added successfully', 'success');
      setShowAddBook(false);
      setBookForm({ title:'', author:'', isbn:'', category:'', publisher:'', totalCopies:1 });
      loadData();
    } catch (e:any) { showToast(e.message||'Failed', 'error'); }
  };

  const handleIssue = async () => {
    try {
      const res = await apiFetch('/library/issue', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(issueForm) });
      if (!res.ok) { const err = await res.json().catch(()=>({error:'Failed'})); showToast(err.error||'Failed', 'error'); return; }
      showToast('Book issued successfully', 'success');
      setShowIssue(false);
      setIssueForm({ bookId:'', memberId:'', dueDate:'' });
      loadData();
    } catch (e:any) { showToast(e.message||'Failed', 'error'); }
  };

  const handleReturn = async (loanId:string) => {
    try {
      const res = await apiFetch('/library/return', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ loanId }) });
      if (!res.ok) { const err = await res.json().catch(()=>({error:'Failed'})); showToast(err.error||'Failed', 'error'); return; }
      showToast('Book returned successfully', 'success');
      loadData();
    } catch (e:any) { showToast(e.message||'Failed', 'error'); }
  };

  return (
    <div className='cos-page'>
      <PageHeader 
        title="Library & Learning Resources" 
        description="Catalogue, digital resources, borrowing, returns and fines"
        icon={faBook}
        actions={
          <div className='flex gap-2'>
            <Button variant='secondary' onClick={()=>setActiveTab('manage')}>Manage</Button>
            <Button onClick={()=>setShowAddBook(true)}><FontAwesomeIcon icon={faPlus} className='mr-2'/>Add Book</Button>
            <Button onClick={()=>setShowIssue(true)}><FontAwesomeIcon icon={faArrowRightArrowLeft} className='mr-2'/>Issue Book</Button>
          </div>
        }
      />

      {stats && (
        <div className='cos-grid-4'>
          <Card><div className='p-4'><p className='text-sm text-slate-600'>Total Books</p><p className='text-2xl font-semibold mt-1'>{stats.totalBooks||0}</p></div></Card>
          <Card><div className='p-4'><p className='text-sm text-slate-600'>Total Copies</p><p className='text-2xl font-semibold mt-1'>{stats.totalCopies||0}</p></div></Card>
          <Card><div className='p-4'><p className='text-sm text-slate-600'>Available</p><p className='text-2xl font-semibold mt-1 text-emerald-600'>{stats.availableCopies||0}</p></div></Card>
          <Card><div className='p-4'><p className='text-sm text-slate-600'>Borrowed/Overdue</p><p className='text-2xl font-semibold mt-1 text-amber-600'>{stats.borrowed||0} / {stats.overdue||0}</p></div></Card>
        </div>
      )}

      <div className='flex gap-2 border-b'>
        <button onClick={()=>setActiveTab('catalogue')} className={`px-4 py-2 text-sm ${activeTab==='catalogue'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Catalogue</button>
        <button onClick={()=>setActiveTab('myloans')} className={`px-4 py-2 text-sm ${activeTab==='myloans'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>My Loans</button>
        <button onClick={()=>setActiveTab('manage')} className={`px-4 py-2 text-sm ${activeTab==='manage'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Manage</button>
      </div>

      {activeTab === 'catalogue' && (
        <Card title="Book Catalogue" icon={faBook} headerAction={
          <div className='flex gap-2'>
            <Input placeholder='Search books...' value={search} onChange={(e:any)=>setSearch(e.target.value)} leftIcon={faSearch} className='w-64' />
            <Input placeholder='Category' value={category} onChange={(e:any)=>setCategory(e.target.value)} className='w-40' />
          </div>
        }>
          <Table
            columns={[
              { key:'title', header:'Title', render:(r:any)=>(<div><p className='font-medium'>{r.title}</p><p className='text-xs text-slate-500'>{r.author}</p></div>) },
              { key:'isbn', header:'ISBN', render:(r:any)=>r.isbn||'-' },
              { key:'category', header:'Category', render:(r:any)=>r.category||'-' },
              { key:'publisher', header:'Publisher', render:(r:any)=>r.publisher||'-' },
              { key:'copies', header:'Availability', render:(r:any)=>(<span className={r.availableCopies>0?'text-emerald-600':'text-red-600'}>{r.availableCopies}/{r.totalCopies} available</span>) },
            ]}
            data={books}
            loading={loading}
            emptyMessage='No books found'
          />
        </Card>
      )}

      {activeTab === 'myloans' && (
        <Card title="My Borrowing History" icon={faArrowRightArrowLeft}>
          <Table
            columns={[
              { key:'book', header:'Book', render:(r:any)=>(<div><p className='font-medium'>{r.book?.title}</p><p className='text-xs text-slate-500'>{r.book?.author}</p></div>) },
              { key:'issueDate', header:'Issued', render:(r:any)=>r.issueDate?new Date(r.issueDate).toLocaleDateString():'-' },
              { key:'dueDate', header:'Due Date', render:(r:any)=>r.dueDate?new Date(r.dueDate).toLocaleDateString():'-' },
              { key:'status', header:'Status', render:(r:any)=>(<span className={`px-2 py-1 rounded text-xs ${r.status==='returned'?'bg-slate-100':r.status==='overdue'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>{r.status}</span>) },
              { key:'returnDate', header:'Returned', render:(r:any)=>r.returnDate?new Date(r.returnDate).toLocaleDateString():'-' },
            ]}
            data={loans}
            loading={loading}
            emptyMessage='No loans found'
          />
        </Card>
      )}

      {activeTab === 'manage' && (
        <Card title="Library Management" icon={faChartBar}>
          <div className='p-4 space-y-4'>
            <div className='flex gap-2'>
              <Button onClick={()=>setShowAddBook(true)}><FontAwesomeIcon icon={faPlus} className='mr-2'/>Add New Book</Button>
              <Button onClick={()=>setShowIssue(true)}><FontAwesomeIcon icon={faArrowRightArrowLeft} className='mr-2'/>Issue Book</Button>
            </div>
            <p className='text-sm text-slate-600'>Use the Issue Book action to lend books to members. Use Return action from loans panel.</p>
          </div>
        </Card>
      )}

      <Modal isOpen={showAddBook} onClose={()=>setShowAddBook(false)} title="Add New Book">
        <div className='space-y-3'>
          <Input label="Title" value={bookForm.title} onChange={(e:any)=>setBookForm({...bookForm,title:e.target.value})} required />
          <Input label="Author" value={bookForm.author} onChange={(e:any)=>setBookForm({...bookForm,author:e.target.value})} />
          <Input label="ISBN" value={bookForm.isbn} onChange={(e:any)=>setBookForm({...bookForm,isbn:e.target.value})} />
          <Input label="Category" value={bookForm.category} onChange={(e:any)=>setBookForm({...bookForm,category:e.target.value})} />
          <Input label="Publisher" value={bookForm.publisher} onChange={(e:any)=>setBookForm({...bookForm,publisher:e.target.value})} />
          <Input label="Total Copies" type='number' value={bookForm.totalCopies} onChange={(e:any)=>setBookForm({...bookForm,totalCopies:Number(e.target.value)})} />
          <div className='flex justify-end gap-2 pt-4'>
            <Button variant='secondary' onClick={()=>setShowAddBook(false)}>Cancel</Button>
            <Button onClick={handleAddBook}>Add Book</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showIssue} onClose={()=>setShowIssue(false)} title="Issue Book">
        <div className='space-y-3'>
          <div>
            <label className='text-sm font-medium'>Select Book</label>
            <select className='w-full mt-1 px-3 py-2 border rounded-lg' value={issueForm.bookId} onChange={(e)=>setIssueForm({...issueForm,bookId:e.target.value})}>
              <option value=''>Choose book...</option>
              {books.filter((b:any)=>b.availableCopies>0).map((b:any)=>(<option key={b._id} value={b._id}>{b.title} ({b.availableCopies} available)</option>))}
            </select>
          </div>
          <Input label="Member/User ID" value={issueForm.memberId} onChange={(e:any)=>setIssueForm({...issueForm,memberId:e.target.value})} required />
          <Input label="Due Date" type='date' value={issueForm.dueDate} onChange={(e:any)=>setIssueForm({...issueForm,dueDate:e.target.value})} required />
          <div className='flex justify-end gap-2 pt-4'>
            <Button variant='secondary' onClick={()=>setShowIssue(false)}>Cancel</Button>
            <Button onClick={handleIssue}>Issue Book</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LibraryLearningResourcesView;
