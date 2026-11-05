import React, { useState } from 'react';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Table } from '../../ui/Table';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faCalendarAlt, faPlus, faCheck, faUserPlus } from '@fortawesome/free-solid-svg-icons';

export const StudentClubsEventsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'clubs'|'events'|'myclubs'>('clubs');
  const [clubs] = useState([
    { _id:'1', name:'Coding Club', category:'Technical', members:45, president:'Aarav Shrestha', status:'active' },
    { _id:'2', name:'Literary Society', category:'Cultural', members:32, president:'Bina Tamang', status:'active' },
    { _id:'3', name:'Sports Club', category:'Sports', members:67, president:'Ravi KC', status:'active' },
  ]);
  const [events] = useState([
    { _id:'e1', title:'Hackathon 2026', club:'Coding Club', date:'2026-11-15', venue:'Auditorium', registered:28, status:'upcoming' },
    { _id:'e2', title:'Poetry Contest', club:'Literary Society', date:'2026-11-10', venue:'Seminar Hall', registered:15, status:'upcoming' },
  ]);

  return (
    <div className='cos-page'>
      <PageHeader 
        title="Student Clubs & Events" 
        description="Clubs, events, registrations and participation"
        icon={faUsers}
        actions={<Button><FontAwesomeIcon icon={faPlus} className='mr-2'/>Create Club</Button>}
      />

      <div className='cos-grid-4'>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Active Clubs</p><p className='text-2xl font-semibold mt-1'>{clubs.length}</p></div><FontAwesomeIcon icon={faUsers} className='text-primary-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Upcoming Events</p><p className='text-2xl font-semibold mt-1 text-amber-600'>{events.filter(e=>e.status==='upcoming').length}</p></div><FontAwesomeIcon icon={faCalendarAlt} className='text-amber-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Total Members</p><p className='text-2xl font-semibold mt-1 text-emerald-600'>{clubs.reduce((s,c)=>s+c.members,0)}</p></div><FontAwesomeIcon icon={faUserPlus} className='text-emerald-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Registrations</p><p className='text-2xl font-semibold mt-1 text-blue-600'>{events.reduce((s,e)=>s+e.registered,0)}</p></div><FontAwesomeIcon icon={faCheck} className='text-blue-600 text-xl'/></div></div></Card>
      </div>

      <div className='flex gap-2 border-b'>
        <button onClick={()=>setActiveTab('clubs')} className={`px-4 py-2 text-sm ${activeTab==='clubs'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Browse Clubs</button>
        <button onClick={()=>setActiveTab('events')} className={`px-4 py-2 text-sm ${activeTab==='events'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Events</button>
        <button onClick={()=>setActiveTab('myclubs')} className={`px-4 py-2 text-sm ${activeTab==='myclubs'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>My Clubs</button>
      </div>

      {activeTab === 'clubs' && (
        <Card title="Student Clubs" icon={faUsers}>
          <Table
            columns={[
              { key:'name', header:'Club Name', render:(r:any)=>(<div><p className='font-medium'>{r.name}</p><p className='text-xs text-slate-500'>{r.category}</p></div>) },
              { key:'president', header:'President', render:(r:any)=>r.president },
              { key:'members', header:'Members', render:(r:any)=><span className='font-medium'>{r.members}</span> },
              { key:'status', header:'Status', render:(r:any)=><span className='px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700'>{r.status}</span> },
              { key:'actions', header:'Actions', render:()=> <Button size='sm'><FontAwesomeIcon icon={faUserPlus} className='mr-1'/>Request Membership</Button> },
            ]}
            data={clubs}
            emptyMessage='No clubs'
          />
        </Card>
      )}

      {activeTab === 'events' && (
        <Card title="Upcoming Events" icon={faCalendarAlt}>
          <Table
            columns={[
              { key:'title', header:'Event', render:(r:any)=>(<div><p className='font-medium'>{r.title}</p><p className='text-xs text-slate-500'>by {r.club}</p></div>) },
              { key:'date', header:'Date', render:(r:any)=><span className='text-amber-600'>{r.date}</span> },
              { key:'venue', header:'Venue', render:(r:any)=>r.venue },
              { key:'registered', header:'Registered', render:(r:any)=><span className='font-medium'>{r.registered}</span> },
              { key:'actions', header:'Actions', render:()=> <Button size='sm'>Register</Button> },
            ]}
            data={events}
            emptyMessage='No events'
          />
        </Card>
      )}

      {activeTab === 'myclubs' && <Card title="My Memberships" icon={faUsers}><div className='p-6 text-center text-slate-500'>You are not a member of any club yet. Browse clubs to join.</div></Card>}
    </div>
  );
};

export default StudentClubsEventsView;
