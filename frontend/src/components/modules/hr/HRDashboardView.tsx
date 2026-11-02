import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../services/apiClient';
import { HREmployeeProfile } from './HREmployeeProfile';

export const HRDashboardView: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard'|'directory'|'profile'|'onboard'>('dashboard');
  const [selectedEmployee, setSelectedEmployee] = useState<string|null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [onboardForm, setOnboardForm] = useState({userId:'',employeeId:'',department:'',designation:'',roleType:'staff',employmentType:'permanent',reportingManager:'',joiningDate:''});
  const [onboardMsg, setOnboardMsg] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch('/hr/dashboard').then((res)=>(res.ok?res.json():null)),
      apiFetch('/hr/employees').then((res)=>(res.ok?res.json():{employees:[]})),
    ]).then(([d,e])=>{ if(d&&d.stats)setStats(d.stats); if(e?.employees)setEmployees(e.employees); }).finally(()=>setLoading(false));
  }, []);

  const handleOnboard = async () => {
    setOnboardMsg('');
    try {
      const res = await apiFetch('/hr/employees', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(onboardForm)});
      if(res.ok){ setOnboardMsg('Employee created/linked successfully'); setShowOnboard(false); const refreshed = await apiFetch('/hr/employees'); if(refreshed.ok){ const data=await refreshed.json(); if(data.employees)setEmployees(data.employees); }}
      else { const err=await res.json().catch(()=>({error:'Failed'})); setOnboardMsg(err.error||'Failed'); }
    } catch(e:any){ setOnboardMsg(e.message||'Failed'); }
  };

  if (loading) return <div className='p-6'>Loading...</div>;
  if (view === 'profile' && selectedEmployee) return <HREmployeeProfile employeeId={selectedEmployee} onBack={()=>{setView('directory');setSelectedEmployee(null);}} />;

  return (
    <div className='min-h-screen bg-white px-6 py-8'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <div className='flex items-center justify-between'><div><h1 className='text-2xl font-semibold'>HR and Staff Management</h1><p className='mt-1 text-sm text-gray-600'>Workforce dashboard and employee lifecycle</p></div><div className='flex gap-2'><button onClick={()=>setView('dashboard')} className='rounded-lg border px-3 py-1.5 text-sm'>Dashboard</button><button onClick={()=>setView('directory')} className='rounded-lg border px-3 py-1.5 text-sm'>Directory</button><button onClick={()=>setShowOnboard(true)} className='rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white'>Onboard Employee</button></div></div>

        {view === 'dashboard' && (
          <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
            <div className='rounded-xl border p-4 shadow-sm'><p className='text-sm'>Total Employees</p><p className='mt-2 text-2xl font-semibold'>{stats?.totalEmployees||0}</p></div>
            <div className='rounded-xl border p-4 shadow-sm'><p className='text-sm'>Faculty</p><p className='mt-2 text-2xl font-semibold'>{stats?.facultyCount||0}</p></div>
            <div className='rounded-xl border p-4 shadow-sm'><p className='text-sm'>Staff</p><p className='mt-2 text-2xl font-semibold'>{stats?.staffCount||0}</p></div>
            <div className='rounded-xl border p-4 shadow-sm'><p className='text-sm'>Pending Leave</p><p className='mt-2 text-2xl font-semibold'>{stats?.pendingLeaves||0}</p></div>
          </div>
        )}

        {view === 'directory' && (
          <div className='rounded-xl border shadow-sm'>
            <div className='border-b p-4'><h2 className='text-lg font-semibold'>Employee Directory</h2></div>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50'><tr><th className='p-3 text-left'>Employee</th><th className='p-3 text-left'>ID</th><th className='p-3 text-left'>Department</th><th className='p-3 text-left'>Designation</th><th className='p-3 text-left'>Status</th><th className='p-3 text-left'>Actions</th></tr></thead>
                <tbody>
                  {employees.map((emp:any)=>(
                    <tr key={emp._id} className='border-t'>
                      <td className='p-3'>{emp.user?.firstName} {emp.user?.lastName}</td>
                      <td className='p-3'>{emp.employeeId}</td>
                      <td className='p-3'>{emp.department}</td>
                      <td className='p-3'>{emp.designation}</td>
                      <td className='p-3'>{emp.employmentStatus}</td>
                      <td className='p-3'><button onClick={()=>{setSelectedEmployee(emp._id);setView('profile');}} className='text-blue-600'>View Profile</button></td>
                    </tr>
                  ))}
                  {employees.length===0 && <tr><td colSpan={6} className='p-4 text-center text-gray-500'>No employees</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showOnboard && (
          <div className='fixed inset-0 bg-black/40 flex items-center justify-center'>
            <div className='w-full max-w-lg rounded-xl bg-white p-6 shadow-lg space-y-4'>
              <div className='flex items-center justify-between'><h2 className='text-lg font-semibold'>Employee Onboarding</h2><button onClick={()=>setShowOnboard(false)}>×</button></div>
              <div className='grid grid-cols-1 gap-3'>
                <input className='rounded border p-2 text-sm' placeholder='User ID (existing User)' value={onboardForm.userId} onChange={(e)=>setOnboardForm({...onboardForm,userId:e.target.value})}/>
                <input className='rounded border p-2 text-sm' placeholder='Employee ID' value={onboardForm.employeeId} onChange={(e)=>setOnboardForm({...onboardForm,employeeId:e.target.value})}/>
                <input className='rounded border p-2 text-sm' placeholder='Department' value={onboardForm.department} onChange={(e)=>setOnboardForm({...onboardForm,department:e.target.value})}/>
                <input className='rounded border p-2 text-sm' placeholder='Designation' value={onboardForm.designation} onChange={(e)=>setOnboardForm({...onboardForm,designation:e.target.value})}/>
                <select className='rounded border p-2 text-sm' value={onboardForm.roleType} onChange={(e)=>setOnboardForm({...onboardForm,roleType:e.target.value})}><option value='staff'>Staff</option><option value='faculty'>Faculty</option><option value='teaching'>Teaching</option><option value='non-teaching'>Non-Teaching</option></select>
                <select className='rounded border p-2 text-sm' value={onboardForm.employmentType} onChange={(e)=>setOnboardForm({...onboardForm,employmentType:e.target.value})}><option value='permanent'>Permanent</option><option value='contract'>Contract</option><option value='probation'>Probation</option><option value='temporary'>Temporary</option><option value='part-time'>Part-Time</option></select>
              </div>
              {onboardMsg && <p className='text-sm text-gray-600'>{onboardMsg}</p>}
              <div className='flex justify-end gap-2'><button onClick={()=>setShowOnboard(false)} className='rounded border px-3 py-1.5 text-sm'>Cancel</button><button onClick={handleOnboard} className='rounded bg-blue-600 px-3 py-1.5 text-sm text-white'>Create/Link</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRDashboardView;
