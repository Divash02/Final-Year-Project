import React, { useState } from 'react';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Table } from '../../ui/Table';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGraduationCap, faUserGraduate, faRoute, faCertificate, faUsers, faChartLine } from '@fortawesome/free-solid-svg-icons';

export const StudentLifecycleView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'progression'|'graduation'|'alumni'>('progression');
  const [students] = useState([
    { _id:'1', name:'Aarav Shrestha', studentId:'STU-2023-001', program:'BSc CSIT', semester:6, status:'active', gpa:3.7 },
    { _id:'2', name:'Bina Tamang', studentId:'STU-2022-045', program:'BBA', semester:8, status:'active', gpa:3.9 },
  ]);

  return (
    <div className='cos-page'>
      <PageHeader 
        title="Student Lifecycle Management" 
        description="Admission through enrolment, progression, graduation and alumni"
        icon={faRoute}
        actions={<Button variant='secondary'>Generate Reports</Button>}
      />

      <div className='cos-grid-4'>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Active Students</p><p className='text-2xl font-semibold mt-1'>1,245</p></div><FontAwesomeIcon icon={faUsers} className='text-primary-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Promoted This Year</p><p className='text-2xl font-semibold mt-1 text-emerald-600'>892</p></div><FontAwesomeIcon icon={faChartLine} className='text-emerald-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Graduation Eligible</p><p className='text-2xl font-semibold mt-1 text-blue-600'>156</p></div><FontAwesomeIcon icon={faUserGraduate} className='text-blue-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Alumni</p><p className='text-2xl font-semibold mt-1'>3,420</p></div><FontAwesomeIcon icon={faGraduationCap} className='text-amber-600 text-xl'/></div></div></Card>
      </div>

      <div className='flex gap-2 border-b'>
        <button onClick={()=>setActiveTab('progression')} className={`px-4 py-2 text-sm ${activeTab==='progression'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Progression & Promotion</button>
        <button onClick={()=>setActiveTab('graduation')} className={`px-4 py-2 text-sm ${activeTab==='graduation'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Graduation Eligibility</button>
        <button onClick={()=>setActiveTab('alumni')} className={`px-4 py-2 text-sm ${activeTab==='alumni'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Alumni Management</button>
      </div>

      {activeTab === 'progression' && (
        <Card title="Student Progression" icon={faChartLine}>
          <Table
            columns={[
              { key:'name', header:'Student', render:(r:any)=>(<div><p className='font-medium'>{r.name}</p><p className='text-xs text-slate-500'>{r.studentId}</p></div>) },
              { key:'program', header:'Program', render:(r:any)=>r.program },
              { key:'semester', header:'Current Semester', render:(r:any)=>r.semester },
              { key:'gpa', header:'GPA', render:(r:any)=><span className='font-medium'>{r.gpa}</span> },
              { key:'status', header:'Status', render:(r:any)=><span className='px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700'>{r.status}</span> },
              { key:'actions', header:'Actions', render:()=> <Button size='sm' variant='secondary'>Review Progress</Button> },
            ]}
            data={students}
            emptyMessage='No students'
          />
        </Card>
      )}

      {activeTab === 'graduation' && (
        <Card title="Graduation Eligibility Check" icon={faUserGraduate}>
          <div className='p-6 space-y-4'>
            <p className='text-sm text-slate-600'>Students meeting credit requirements and academic standing for graduation.</p>
            <Table
              columns={[
                { key:'name', header:'Student', render:(r:any)=>(<div><p className='font-medium'>{r.name}</p><p className='text-xs text-slate-500'>{r.studentId}</p></div>) },
                { key:'program', header:'Program', render:(r:any)=>r.program },
                { key:'gpa', header:'CGPA', render:(r:any)=><span className='font-medium'>{r.gpa}</span> },
                { key:'actions', header:'Actions', render:()=> <Button size='sm'><FontAwesomeIcon icon={faCertificate} className='mr-1'/>Clear for Graduation</Button> },
              ]}
              data={students.filter(s=>s.semester>=7)}
              emptyMessage='No eligible students'
            />
          </div>
        </Card>
      )}

      {activeTab === 'alumni' && <Card title="Alumni Directory" icon={faGraduationCap}><div className='p-6 text-center text-slate-500'>Alumni records and networking coming soon</div></Card>}
    </div>
  );
};

export default StudentLifecycleView;
