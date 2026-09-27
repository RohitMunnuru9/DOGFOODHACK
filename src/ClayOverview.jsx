import React from 'react';
import {ArrowUpRight, ArrowRight, FolderOpen, Users, CheckCheck, Clock3} from 'lucide-react';
import {ClayProgress} from './ClayUI';

export default function ClayOverview({event,projects,teams,judges,progress,reviews,role,navigate}) {
  const completed=role==='jury'?reviews.filter(r=>r.review_status==='submitted').length:progress?.completed || 0;
  const total=role==='jury'?reviews.length:progress?.assigned || 0;
  const percent=total?Math.round(completed/total*100):0;
  const draft=projects.filter(p=>p.status==='draft').length;
  const unassigned=progress?.judges?.filter(j=>!j.assigned).length || 0;
  const metrics=[[FolderOpen,projects.length,'projects','peach'],[Users,role==='admin'?judges.length:teams.length,role==='admin'?'judges':'teams','sage'],[CheckCheck,`${completed} / ${total}`,'reviews completed','sand']];
  return <>
    <div className="clay-metrics" data-tilt>{metrics.map(([Icon,value,label,color])=><div key={label}><span className={`clay-metric-icon ${color}`}><Icon size={22}/></span><span><strong>{value}</strong><small>{label}</small></span></div>)}</div>
    <div className="clay-overview-grid">
      <section className="dogfood-panel clay-submissions-panel" data-tilt>
        <div className="clay-section-heading"><div><span className="clay-eyebrow">WHAT PEOPLE ARE BUILDING</span><h3>Recent submissions</h3></div><button className="clay-icon-button" aria-label="View all submissions" onClick={()=>navigate('submissions')}><ArrowUpRight size={20}/></button></div>
        {projects.length?<div className="clay-table-scroll"><table className="clay-table"><thead><tr><th>Project</th><th>Team</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{[...projects].sort((a,b)=>new Date(b.updated_at || b.created_at)-new Date(a.updated_at || a.created_at)).slice(0,6).map((p,i)=><tr key={p.id}><td><a href={`/projects/${p.id}`} onClick={e=>{if(p.status!=='submitted'){e.preventDefault();navigate('submissions');}}}><span className={`clay-project-mark color-${i%4}`}>{p.title.slice(0,1)}</span><strong>{p.title}</strong></a></td><td>{teams.find(t=>t.id===p.team_id)?.name || 'Event team'}</td><td><span className={`clay-badge ${p.status==='submitted'?'sage':'sand'}`}>{p.status==='submitted'?'Submitted':'Draft'}</span></td><td><ArrowUpRight size={14}/></td></tr>)}</tbody></table></div>:<div className="clay-empty"><FolderOpen size={30}/><h4>Room for the next big idea.</h4><p>Projects will appear here as teams start building.</p><button className="dogfood-secondary" onClick={()=>navigate(role==='admin'?'settings':'submissions')}>{role==='admin'?'Set up your event':'Start a submission'}<ArrowRight size={15}/></button></div>}
        {projects.length>0&&<button className="clay-text-button" onClick={()=>navigate('submissions')}>View all submissions <ArrowRight size={15}/></button>}
      </section>
      <div className="clay-overview-aside">
        <section className="dogfood-panel" data-tilt><h3>Judging progress</h3><div className="clay-progress-summary"><div className="clay-progress-ring" style={{'--completion':`${percent}%`}}><strong>{percent}<small>%</small></strong></div><div><strong>{Math.max(0,total-completed)} reviews remaining</strong><p>{completed} of {total} completed</p></div></div><ClayProgress value={percent} label="Completed reviews"/>
          <div className="clay-judge-list">{progress?.judges?.slice(0,3).map(j=><div key={j.judge_user_id}><span className="clay-avatar">{j.judge_name.split(' ').map(w=>w[0]).slice(0,2).join('')}</span><span>{j.judge_name}</span><small>{j.completed}/{j.assigned}</small></div>)}</div><button className="dogfood-secondary w-full" onClick={()=>navigate('judging')}>{role==='jury'?'Open your reviews':'Manage assignments'}<ArrowRight size={15}/></button>
        </section>
        <section className="dogfood-panel" data-tilt><h3>Needs attention</h3><button className="clay-attention-row" onClick={()=>navigate('submissions')}><span className="clay-mini-icon sand"><Clock3 size={18}/></span><span>{draft?`${draft} projects still in draft`:'Submissions are up to date'}</span><ArrowRight size={15}/></button><button className="clay-attention-row" onClick={()=>navigate('judging')}><span className="clay-mini-icon peach"><Users size={18}/></span><span>{unassigned?`${unassigned} judges need assignments`:total?'Keep reviews moving':'Ready to set up judging'}</span><ArrowRight size={15}/></button></section>
      </div>
    </div>
    <div className="clay-overview-note"><span className="clay-status-dot"/><span>{event?.published_at?'Results are published. Time to celebrate the work.':'A little structure gives good ideas room to grow.'}</span><span>DOGFOOD / 2026</span></div>
  </>;
}
