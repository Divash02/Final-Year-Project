import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../services/apiClient';

export const HREmployeeProfile: React.FC<{employeeId: string, onBack: () => void}> = ({employeeId, onBack}) => {
  const [employee, setEmployee] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch('/hr/employees/' + employeeId).then((res)=>(res.ok?res.json():null)).then((data)=>{ if(data && data.employee) setEmployee(data.employee); }).finally(()=>setLoading(false));
  }, [employeeId]);
  if (loading) return <div className='p-6'>Loading...</div>;
  if (!employee) return <div className='p-6'><button onClick={onBack} className='text-sm text-blue-600'>Back</button><p className='mt-2'>Employee not found</p></div>;
  const user = employee.user || {};
  return (<div className='min-h-screen bg-white px-6 py-8'><div className='mx-auto max-w-7xl space-y-6'><div><button onClick={onBack} className='text-sm text-blue-600'>Back to Directory</button></div><div className='rounded-xl border p-6 shadow-sm'><div className='flex items-center gap-4'>{user.avatarUrl ? <img src={user.avatarUrl} alt='' className='h-16 w-16 rounded-full object-cover'/> : <div className='h-16 w-16 rounded-full bg-slate-200'/>}<div><h1 className='text-2xl font-semibold'>{user.firstName} {user.lastName}</h1><p className='text-sm text-gray-600'>{employee.employeeId} - {employee.department} - {employee.designation}</p></div></div></div><div className='flex gap-4 border-b'>{['overview','employment','department','attendance','leave','documents','workload','activity'].map(t=>(<button key={t} onClick={()=>setTab(t)} className={tab===t?'border-b-2 border-blue-600 px-3 py-2 text-sm font-medium':'px-3 py-2 text-sm text-gray-600'}>{t}</button>))}</div><div className='rounded-xl border p-6 shadow-sm'>{tab==='overview' && (<div className='grid grid-cols-1 gap-4 md:grid-cols-2'><div><p className='text-xs text-gray-500'>Employee ID</p><p className='text-sm'>{employee.employeeId}</p></div><div><p className='text-xs text-gray-500'>College Email</p><p className='text-sm'>{user.collegeEmail||user.email}</p></div><div><p className='text-xs text-gray-500'>Department</p><p className='text-sm'>{employee.department}</p></div><div><p className='text-xs text-gray-500'>Designation</p><p className='text-sm'>{employee.designation}</p></div><div><p className='text-xs text-gray-500'>Employment Status</p><p className='text-sm'>{employee.employmentStatus}</p></div><div><p className='text-xs text-gray-500'>Employment Type</p><p className='text-sm'>{employee.employmentType}</p></div><div><p className='text-xs text-gray-500'>Joining Date</p><p className='text-sm'>{employee.joiningDate?new Date(employee.joiningDate).toLocaleDateString():'-'}</p></div></div>)}{tab!=='overview' && <p className='text-sm text-gray-600'>No data available</p>}</div></div></div>);
};
export default HREmployeeProfile;
