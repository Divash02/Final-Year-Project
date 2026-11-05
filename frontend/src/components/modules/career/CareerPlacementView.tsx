import React, { useState } from 'react';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Table } from '../../ui/Table';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBriefcase, faGraduationCap, faBuilding, faPaperPlane, faPlus } from '@fortawesome/free-solid-svg-icons';

export const CareerPlacementView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'opportunities'|'applications'|'employers'|'placements'>('opportunities');
  const [showPost, setShowPost] = useState(false);
  const [opportunities] = useState([
    { _id:'1', title:'Software Engineer Intern', company:'Tech Solutions Ltd', type:'internship', location:'Kathmandu', deadline:'2026-12-01', eligibility:'BSc CSIT/BE IT', salary:'NPR 15,000' },
    { _id:'2', title:'Graduate Trainee - Finance', company:'Global Bank', type:'fulltime', location:'Pokhara', deadline:'2026-11-20', eligibility:'BBA/BBM', salary:'NPR 40,000' },
  ]);
  const [applications] = useState([
    { _id:'a1', opportunity:{title:'Software Engineer Intern', company:'Tech Solutions Ltd'}, appliedDate:'2026-10-15', status:'shortlisted' },
  ]);

  return (
    <div className='cos-page'>
      <PageHeader 
        title="Career & Placement Services" 
        description="Internships, jobs, employers, applications and placements"
        icon={faBriefcase}
        actions={<Button onClick={()=>setShowPost(true)}><FontAwesomeIcon icon={faPlus} className='mr-2'/>Post Opportunity</Button>}
      />

      <div className='cos-grid-4'>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Active Opportunities</p><p className='text-2xl font-semibold mt-1'>{opportunities.length}</p></div><FontAwesomeIcon icon={faBriefcase} className='text-primary-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>My Applications</p><p className='text-2xl font-semibold mt-1'>{applications.length}</p></div><FontAwesomeIcon icon={faPaperPlane} className='text-blue-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Employers</p><p className='text-2xl font-semibold mt-1'>12</p></div><FontAwesomeIcon icon={faBuilding} className='text-emerald-600 text-xl'/></div></div></Card>
        <Card><div className='p-4'><div className='flex items-center justify-between'><div><p className='text-sm text-slate-600'>Placed</p><p className='text-2xl font-semibold mt-1'>45</p></div><FontAwesomeIcon icon={faGraduationCap} className='text-amber-600 text-xl'/></div></div></Card>
      </div>

      <div className='flex gap-2 border-b'>
        <button onClick={()=>setActiveTab('opportunities')} className={`px-4 py-2 text-sm ${activeTab==='opportunities'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Job Opportunities</button>
        <button onClick={()=>setActiveTab('applications')} className={`px-4 py-2 text-sm ${activeTab==='applications'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>My Applications</button>
        <button onClick={()=>setActiveTab('employers')} className={`px-4 py-2 text-sm ${activeTab==='employers'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Employers</button>
        <button onClick={()=>setActiveTab('placements')} className={`px-4 py-2 text-sm ${activeTab==='placements'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}>Placements</button>
      </div>

      {activeTab === 'opportunities' && (
        <Card title="Available Opportunities" icon={faBriefcase}>
          <Table
            columns={[
              { key:'title', header:'Position', render:(r:any)=>(<div><p className='font-medium'>{r.title}</p><p className='text-xs text-slate-500'>{r.company}</p></div>) },
              { key:'type', header:'Type', render:(r:any)=><span className='capitalize'>{r.type}</span> },
              { key:'location', header:'Location', render:(r:any)=>r.location },
              { key:'eligibility', header:'Eligibility', render:(r:any)=><span className='text-sm'>{r.eligibility}</span> },
              { key:'salary', header:'Salary/Stipend', render:(r:any)=>r.salary },
              { key:'deadline', header:'Deadline', render:(r:any)=><span className='text-sm text-amber-600'>{r.deadline}</span> },
              { key:'actions', header:'Actions', render:()=> <Button size='sm'><FontAwesomeIcon icon={faPaperPlane} className='mr-1'/>Apply</Button> },
            ]}
            data={opportunities}
            emptyMessage='No opportunities available'
          />
        </Card>
      )}

      {activeTab === 'applications' && (
        <Card title="My Applications" icon={faPaperPlane}>
          <Table
            columns={[
              { key:'opportunity', header:'Position', render:(r:any)=>(<div><p className='font-medium'>{r.opportunity.title}</p><p className='text-xs text-slate-500'>{r.opportunity.company}</p></div>) },
              { key:'appliedDate', header:'Applied On', render:(r:any)=>new Date(r.appliedDate).toLocaleDateString() },
              { key:'status', header:'Status', render:(r:any)=><span className={`px-2 py-1 rounded text-xs ${r.status==='shortlisted'?'bg-emerald-100 text-emerald-700':r.status==='applied'?'bg-blue-100 text-blue-700':'bg-slate-100'}`}>{r.status}</span> },
            ]}
            data={applications}
            emptyMessage='No applications yet'
          />
        </Card>
      )}

      {activeTab === 'employers' && <Card title="Partner Employers" icon={faBuilding}><div className='p-6 text-center text-slate-500'>Employer directory coming soon</div></Card>}
      {activeTab === 'placements' && <Card title="Placement Records" icon={faGraduationCap}><div className='p-6 text-center text-slate-500'>Placement records coming soon</div></Card>}

      <Modal isOpen={showPost} onClose={()=>setShowPost(false)} title="Post Job/Internship Opportunity">
        <div className='space-y-3'>
          <Input label="Job Title" placeholder='e.g., Software Engineer' />
          <Input label="Company Name" placeholder='Company/Organization' />
          <div className='grid grid-cols-2 gap-3'>
            <div><label className='text-sm font-medium'>Type</label><select className='w-full mt-1 px-3 py-2 border rounded-lg'><option value='internship'>Internship</option><option value='fulltime'>Full Time</option><option value='parttime'>Part Time</option></select></div>
            <Input label="Location" placeholder='City/Country' />
          </div>
          <Input label="Eligibility Criteria" placeholder='e.g., BSc CSIT, Minimum GPA 3.0' />
          <div className='grid grid-cols-2 gap-3'>
            <Input label="Salary/Stipend" placeholder='NPR or range' />
            <Input label="Application Deadline" type='date' />
          </div>
          <div><label className='text-sm font-medium'>Job Description</label><textarea className='w-full mt-1 px-3 py-2 border rounded-lg' rows={4} placeholder='Describe role, responsibilities...' /></div>
          <div className='flex justify-end gap-2 pt-4'>
            <Button variant='secondary' onClick={()=>setShowPost(false)}>Cancel</Button>
            <Button onClick={()=>setShowPost(false)}>Post Opportunity</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CareerPlacementView;
