import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../services/apiClient';

export const LeaveApprovalWorkspace: React.FC = () => {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [tab, setTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => {
    setLoading(true);
    apiFetch('/hr/leaves').then((res)=>(res.ok?res.json():{leaves:[]})).then((data)=>setLeaves(data.leaves||[])).finally(()=>setLoading(false));
  };
  useEffect(()=>{load();},[]);
  const act = async (id:string, action:string) => {
    setMsg('');
    try {
      const res = await apiFetch('/hr/leaves/' + id + '/action', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,comments:comment})});
      if(res.ok){ setMsg('Updated'); setComment(''); load(); } else { const err=await res.json().catch(()=>({error:'Failed'})); setMsg(err.error||'Failed'); }
    } catch(e:any){ setMsg(e.message||'Failed'); }
  };
  const filtered = leaves.filter((l:any)=> l.status === tab);
  if (loading) return <div className='p-6'>Loading...</div>;
  return (<div className='min-h-screen bg-white px-6 py-8'><div className='mx-auto max-w-7xl space-y-6'><div><h1 className='text-2xl font-semibold'>Leave Approval Workspace</h1><p className='mt-1 text-sm text-gray-600'>Review and process leave applications</p></div><div className='flex gap-4 border-b'>{['pending','approved','rejected'].map(t=>(<button key={t} onClick={()=>setTab(t)} className={tab===t?'border-b-2 border-blue-600 px-3 py-2 text-sm font-medium':'px-3 py-2 text-sm text-gray-600'}>{t} ({leaves.filter((l:any)=>l.status===t).length})</button>))}</div>{msg && <p className='text-sm text-gray-600'>{msg}</p>}<div className='rounded-xl border shadow-sm overflow-x-auto'><table className='w-full text-sm'><thead className='bg-slate-50'><tr><th className='p-3 text-left'>Employee</th><th className='p-3 text-left'>Category</th><th className='p-3 text-left'>Dates</th><th className='p-3 text-left'>Reason</th><th className='p-3 text-left'>Status</th><th className='p-3 text-left'>Actions</th></tr></thead><tbody>{filtered.map((leave:any)=>(<tr key={leave._id} className='border-t'><td className='p-3'>{leave.employee && leave.employee.firstName ? leave.employee.firstName+' '+leave.employee.lastName : '-'}</td><td className='p-3'>{leave.leaveType}</td><td className='p-3'>{leave.startDate?new Date(leave.startDate).toLocaleDateString():''} - {leave.endDate?new Date(leave.endDate).toLocaleDateString():''}</td><td className='p-3'>{leave.reason}</td><td className='p-3'>{leave.status}</td><td className='p-3'>{tab==='pending' && (<div className='flex gap-2'><button onClick={()=>act(leave._id,'approve')} className='rounded bg-green-600 px-2 py-1 text-xs text-white'>Approve</button><button onClick={()=>act(leave._id,'reject')} className='rounded bg-red-600 px-2 py-1 text-xs text-white'>Reject</button></div>)}</td></tr>))}{filtered.length===0 && <tr><td colSpan={6} className='p-4 text-center text-gray-500'>No applications</td></tr>}</tbody></table></div>{tab==='pending' && <div className='rounded-xl border p-4'><label className='text-sm'>Approval Comments</label><textarea className='mt-1 w-full rounded border p-2 text-sm' rows={3} value={comment} onChange={(e)=>setComment(e.target.value)}/></div>}</div></div>);
};
export default LeaveApprovalWorkspace;
