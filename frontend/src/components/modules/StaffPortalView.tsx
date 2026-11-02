import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/apiClient';

export const StaffPortalView: React.FC = () => {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/staff/leaves').then((res)=>(res.ok?res.json():{leaves:[]})).then((data)=>setLeaves(data.leaves||[])).finally(()=>setLoading(false));
  }, []);

  if (loading) return <div className='p-6'>Loading...</div>;

  return (
    <div className='min-h-screen bg-white px-6 py-8'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <div><h1 className='text-2xl font-semibold'>Staff Self-Service Portal</h1><p className='mt-1 text-sm text-gray-600'>Employment info, leave, documents and schedule</p></div>
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <div className='rounded-xl border p-6 shadow-sm'><h2 className='text-lg font-semibold'>My Leave Applications</h2><div className='mt-4 space-y-2'>{leaves.slice(0,5).map((leave:any)=>(<div key={leave._id} className='rounded-lg border p-3'><div className='flex items-center justify-between'><span className='text-sm font-medium'>{leave.leaveType}</span><span className='text-xs text-gray-600'>{leave.status}</span></div><p className='mt-1 text-xs text-gray-600'>{leave.reason}</p></div>))}{leaves.length===0&&<p className='text-sm text-gray-500'>No leave applications</p>}</div></div>
          <div className='rounded-xl border p-6 shadow-sm'><h2 className='text-lg font-semibold'>Quick Actions</h2><div className='mt-4 grid grid-cols-1 gap-2'><button className='rounded-lg border px-4 py-2 text-left text-sm hover:bg-slate-50'>Apply for Leave</button><button className='rounded-lg border px-4 py-2 text-left text-sm hover:bg-slate-50'>View Attendance</button><button className='rounded-lg border px-4 py-2 text-left text-sm hover:bg-slate-50'>My Documents</button><button className='rounded-lg border px-4 py-2 text-left text-sm hover:bg-slate-50'>My Profile</button></div></div>
        </div>
      </div>
    </div>
  );
};

export default StaffPortalView;
