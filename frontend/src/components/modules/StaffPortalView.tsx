import React, { useEffect, useState } from 'react';
import { PageHeader } from '../ui/PageHeader';
import { Card } from '../ui/Card';
import { Table } from '../ui/Table';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { apiFetch } from '../../services/apiClient';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faIdCard, faCalendarPlus, faFileLines, faUser, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../ui/ToastContainer';

export const StaffPortalView: React.FC = () => {
  const { showToast } = useToast();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApplyLeave, setShowApplyLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType:'casual', startDate:'', endDate:'', reason:'', supportingDocument:'' });
  const [submitting, setSubmitting] = useState(false);

  const loadLeaves = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/staff/leaves');
      if (res.ok) {
        const data = await res.json();
        setLeaves(data.leaves || []);
      }
    } catch (e:any) {
      showToast(e.message || 'Failed to load leaves', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLeaves(); }, []);

  const handleApplyLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/staff/leaves/apply', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(leaveForm) });
      if (!res.ok) {
        const err = await res.json().catch(()=>({error:'Failed to apply leave'}));
        showToast(err.error || 'Failed to apply leave', 'error');
        return;
      }
      showToast('Leave application submitted successfully', 'success');
      setShowApplyLeave(false);
      setLeaveForm({ leaveType:'casual', startDate:'', endDate:'', reason:'', supportingDocument:'' });
      loadLeaves();
    } catch (e:any) {
      showToast(e.message || 'Failed to apply leave', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status:string) => {
    const styles: any = {
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-red-100 text-red-700',
      cancelled: 'bg-slate-100 text-slate-700'
    };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || styles.pending}`}>{status}</span>;
  };

  return (
    <div className='cos-page'>
      <PageHeader 
        title="Staff Self-Service Portal" 
        description="Employment information, leave management, documents and schedule"
        icon={faIdCard}
        actions={<Button onClick={()=>setShowApplyLeave(true)}><FontAwesomeIcon icon={faCalendarPlus} className='mr-2'/>Apply for Leave</Button>}
      />

      <div className='cos-grid-4'>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Total Applications</p><p className='text-2xl font-semibold mt-1'>{leaves.length}</p></div><FontAwesomeIcon icon={faFileLines} className='text-primary-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Pending</p><p className='text-2xl font-semibold mt-1 text-amber-600'>{leaves.filter((l:any)=>l.status==='pending').length}</p></div><FontAwesomeIcon icon={faCalendarPlus} className='text-amber-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Approved</p><p className='text-2xl font-semibold mt-1 text-emerald-600'>{leaves.filter((l:any)=>l.status==='approved').length}</p></div><FontAwesomeIcon icon={faCheckCircle} className='text-emerald-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Rejected</p><p className='text-2xl font-semibold mt-1 text-red-600'>{leaves.filter((l:any)=>l.status==='rejected').length}</p></div><FontAwesomeIcon icon={faFileLines} className='text-red-600 text-xl'/></div></div></Card>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <div className='lg:col-span-2'>
          <Card title="My Leave Applications" icon={faCalendarPlus}>
            <Table
              columns={[
                { key:'leaveType', header:'Leave Type', render:(r:any)=>(<span className='capitalize'>{r.leaveType}</span>) },
                { key:'dates', header:'Duration', render:(r:any)=>(<div><p className='text-sm'>{r.startDate?new Date(r.startDate).toLocaleDateString():'-'} to {r.endDate?new Date(r.endDate).toLocaleDateString():'-'}</p></div>) },
                { key:'reason', header:'Reason', render:(r:any)=><span className='text-sm text-slate-600 line-clamp-1'>{r.reason}</span> },
                { key:'status', header:'Status', render:(r:any)=>getStatusBadge(r.status) },
                { key:'approvedBy', header:'Approved By', render:(r:any)=>r.approvedBy ? `${r.approvedBy.firstName} ${r.approvedBy.lastName}` : '-' },
              ]}
              data={leaves}
              loading={loading}
              emptyMessage='No leave applications yet'
            />
          </Card>
        </div>
        <div>
          <Card title="Quick Actions" icon={faUser}>
            <div className='p-4 space-y-2'>
              <Button fullWidth variant='secondary' onClick={()=>setShowApplyLeave(true)}><FontAwesomeIcon icon={faCalendarPlus} className='mr-2'/>Apply for Leave</Button>
              <Button fullWidth variant='secondary'><FontAwesomeIcon icon={faFileLines} className='mr-2'/>View Attendance</Button>
              <Button fullWidth variant='secondary'><FontAwesomeIcon icon={faFileLines} className='mr-2'/>My Documents</Button>
              <Button fullWidth variant='secondary'><FontAwesomeIcon icon={faUser} className='mr-2'/>My Profile</Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal isOpen={showApplyLeave} onClose={()=>setShowApplyLeave(false)} title="Apply for Leave">
        <div className='space-y-3'>
          <div>
            <label className='text-sm font-medium'>Leave Type</label>
            <select className='w-full mt-1 px-3 py-2 border rounded-lg' value={leaveForm.leaveType} onChange={(e)=>setLeaveForm({...leaveForm,leaveType:e.target.value})}>
              <option value='casual'>Casual Leave</option>
              <option value='sick'>Sick Leave</option>
              <option value='earned'>Earned Leave</option>
              <option value='maternity'>Maternity Leave</option>
              <option value='paternity'>Paternity Leave</option>
              <option value='unpaid'>Unpaid Leave</option>
              <option value='other'>Other</option>
            </select>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <Input label="Start Date" type='date' value={leaveForm.startDate} onChange={(e:any)=>setLeaveForm({...leaveForm,startDate:e.target.value})} required />
            <Input label="End Date" type='date' value={leaveForm.endDate} onChange={(e:any)=>setLeaveForm({...leaveForm,endDate:e.target.value})} required />
          </div>
          <div>
            <label className='text-sm font-medium'>Reason <span className='text-red-500'>*</span></label>
            <textarea className='w-full mt-1 px-3 py-2 border rounded-lg' rows={4} value={leaveForm.reason} onChange={(e)=>setLeaveForm({...leaveForm,reason:e.target.value})} placeholder='Provide reason for leave...' />
          </div>
          <Input label="Supporting Document (URL)" value={leaveForm.supportingDocument} onChange={(e:any)=>setLeaveForm({...leaveForm,supportingDocument:e.target.value})} placeholder='Optional' />
          <div className='flex justify-end gap-2 pt-4'>
            <Button variant='secondary' onClick={()=>setShowApplyLeave(false)}>Cancel</Button>
            <Button onClick={handleApplyLeave} disabled={submitting}>{submitting?'Submitting...':'Submit Application'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StaffPortalView;

