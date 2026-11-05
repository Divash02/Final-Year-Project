import React, { useState } from 'react';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Table } from '../../ui/Table';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHotel, faBed, faUsers, faClipboardCheck, faWrench, faPlus } from '@fortawesome/free-solid-svg-icons';

export const HostelAccommodationView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'applications'|'rooms'|'allocations'|'maintenance'>('applications');
  const [showApply, setShowApply] = useState(false);
  const [applications] = useState([
    { _id:'1', student:{name:'Ram Sharma'}, roomType:'double', academicYear:'2026/27', appliedDate:'2026-10-20', status:'pending' },
    { _id:'2', student:{name:'Sita Poudel'}, roomType:'single', academicYear:'2026/27', appliedDate:'2026-10-18', status:'approved' },
  ]);
  const [rooms] = useState([
    { _id:'r1', block:'A Block', roomNo:'101', type:'double', capacity:2, occupied:1, status:'available' },
    { _id:'r2', block:'A Block', roomNo:'102', type:'single', capacity:1, occupied:1, status:'occupied' },
  ]);

  return (
    <div className='cos-page'>
      <PageHeader 
        title="Hostel & Accommodation" 
        description="Applications, rooms, allocations, residents and maintenance"
        icon={faHotel}
        actions={<Button onClick={()=>setShowApply(true)}><FontAwesomeIcon icon={faPlus} className='mr-2'/>Apply for Accommodation</Button>}
      />

      <div className='cos-grid-4'>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Pending Applications</p><p className='text-2xl font-semibold mt-1 text-amber-600'>{applications.filter(a=>a.status==='pending').length}</p></div><FontAwesomeIcon icon={faClipboardCheck} className='text-amber-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Total Rooms</p><p className='text-2xl font-semibold mt-1'>{rooms.length}</p></div><FontAwesomeIcon icon={faBed} className='text-primary-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Available Rooms</p><p className='text-2xl font-semibold mt-1 text-emerald-600'>{rooms.filter(r=>r.status==='available').length}</p></div><FontAwesomeIcon icon={faBed} className='text-emerald-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Residents</p><p className='text-2xl font-semibold mt-1'>{rooms.reduce((sum,r)=>sum+r.occupied,0)}</p></div><FontAwesomeIcon icon={faUsers} className='text-blue-600 text-xl'/></div></div></Card>
      </div>

      <div className='flex gap-2 border-b'>
        <button onClick={()=>setActiveTab('applications')} className={`px-4 py-2 text-sm ${activeTab==='applications'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Applications</button>
        <button onClick={()=>setActiveTab('rooms')} className={`px-4 py-2 text-sm ${activeTab==='rooms'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Rooms</button>
        <button onClick={()=>setActiveTab('allocations')} className={`px-4 py-2 text-sm ${activeTab==='allocations'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Allocations</button>
        <button onClick={()=>setActiveTab('maintenance')} className={`px-4 py-2 text-sm ${activeTab==='maintenance'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Maintenance</button>
      </div>

      {activeTab === 'applications' && (
        <Card title="Accommodation Applications" icon={faClipboardCheck}>
          <Table
            columns={[
              { key:'student', header:'Student', render:(r:any)=><span className='font-medium'>{r.student.name}</span> },
              { key:'roomType', header:'Room Type', render:(r:any)=><span className='capitalize'>{r.roomType}</span> },
              { key:'academicYear', header:'Academic Year', render:(r:any)=>r.academicYear },
              { key:'appliedDate', header:'Applied On', render:(r:any)=>new Date(r.appliedDate).toLocaleDateString() },
              { key:'status', header:'Status', render:(r:any)=><span className={`px-2 py-1 rounded text-xs ${r.status==='approved'?'bg-emerald-100 text-emerald-700':r.status==='pending'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{r.status}</span> },
              { key:'actions', header:'Actions', render:(r:any)=> r.status==='pending' ? <div className='flex gap-1'><Button size='sm' variant='primary'>Approve</Button><Button size='sm' variant='danger'>Reject</Button></div> : <span className='text-sm text-slate-500'>-</span> },
            ]}
            data={applications}
            emptyMessage='No applications'
          />
        </Card>
      )}

      {activeTab === 'rooms' && (
        <Card title="Room Management" icon={faBed}>
          <Table
            columns={[
              { key:'block', header:'Block', render:(r:any)=>r.block },
              { key:'roomNo', header:'Room No', render:(r:any)=><span className='font-medium'>{r.roomNo}</span> },
              { key:'type', header:'Type', render:(r:any)=><span className='capitalize'>{r.type}</span> },
              { key:'capacity', header:'Capacity', render:(r:any)=>r.capacity },
              { key:'occupied', header:'Occupied', render:(r:any)=>r.occupied },
              { key:'status', header:'Status', render:(r:any)=><span className={`px-2 py-1 rounded text-xs ${r.status==='available'?'bg-emerald-100 text-emerald-700':'bg-slate-100'}`}>{r.status}</span> },
            ]}
            data={rooms}
            emptyMessage='No rooms'
          />
        </Card>
      )}

      {activeTab === 'allocations' && <Card title="Room Allocations" icon={faUsers}><div className='p-6 text-center text-slate-500'>Allocation management coming soon</div></Card>}
      {activeTab === 'maintenance' && <Card title="Hostel Maintenance" icon={faWrench}><div className='p-6 text-center text-slate-500'>Maintenance requests coming soon</div></Card>}

      <Modal isOpen={showApply} onClose={()=>setShowApply(false)} title="Apply for Hostel Accommodation">
        <div className='space-y-3'>
          <Input label="Student ID" placeholder='Enter student ID' />
          <div className='grid grid-cols-2 gap-3'>
            <div><label className='text-sm font-medium'>Room Type</label><select className='w-full mt-1 px-3 py-2 border rounded-lg'><option value='single'>Single</option><option value='double'>Double</option><option value='triple'>Triple</option></select></div>
            <Input label="Academic Year" placeholder='e.g., 2026/27' />
          </div>
          <Input label="Preferred Block (Optional)" placeholder='e.g., A Block' />
          <div><label className='text-sm font-medium'>Special Requirements</label><textarea className='w-full mt-1 px-3 py-2 border rounded-lg' rows={3} placeholder='Any medical or other requirements...' /></div>
          <div className='flex justify-end gap-2 pt-4'>
            <Button variant='secondary' onClick={()=>setShowApply(false)}>Cancel</Button>
            <Button onClick={()=>setShowApply(false)}>Submit Application</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default HostelAccommodationView;
