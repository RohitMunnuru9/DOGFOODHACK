import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DogfoodAdvanced from './DogfoodAdvanced';
import ClayOverview from './ClayOverview';
import dynamic from 'next/dynamic';
const ArcadeDashboard = dynamic(() => import('./Arcade'), {ssr:false, loading:()=><ClaySkeleton label="Opening the arcade"/>});
import {ClaySelect, ClayDateTime, ClayNumber, ClayProgress, ClaySkeleton, useClayMotion} from './ClayUI';
import {motion, useReducedMotion} from 'framer-motion';
import {getDemoSession, setDemoSession} from './demoSession';
import {LayoutDashboard, FolderOpen, Users, ClipboardCheck, Trophy, MessageCircle, Settings, ArrowUpRight, Plus, Layers, ArrowRight, Gamepad2} from 'lucide-react';

const root = '/dogfood-api';
const panel = 'dogfood-panel rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm';
const input = 'dogfood-input w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const button = 'dogfood-button rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'dogfood-secondary rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50';
const dateValue = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const dateLabel = value => value ? new Date(value).toLocaleString() : 'Not set';
const projectFormValues = form => {
  const values = Object.fromEntries(new FormData(form));
  return {...values,
    custom_answers: Object.fromEntries(Object.entries(values).filter(([key])=>key.startsWith('answer.')).map(([key,value])=>[key.slice(7),value])),
    tech_tags: String(values.tech_tags || '').split(',').map(item=>item.trim()).filter(Boolean),
    image_urls: String(values.image_urls || '').split(/[\n,]/).map(item=>item.trim()).filter(Boolean)};
};

async function request(path, method = 'GET', body) {
  const token = getDemoSession();
  const response = await fetch(root + path, {
    method, credentials: 'same-origin',
    headers: {...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.headers.get('Content-Type')?.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

const roleFormValues = form => {
  const data = new FormData(form);
  const tracks = data.getAll('track_ids').filter(Boolean);
  return {...Object.fromEntries(data), track_ids: tracks.length ? tracks : null};
};

function JudgeTracks({tracks}) {
  return <label className="grid gap-1 text-xs font-bold text-gray-500">Judge tracks (none selected means all)
    <ClaySelect multiple name="track_ids" className={input} aria-label="Judge tracks">
      {tracks?.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
    </ClaySelect>
  </label>;
}

function Field({label, children}) {
  return <label className="block space-y-1.5 text-xs font-bold uppercase tracking-wide text-gray-500"><span>{label}</span>{children}</label>;
}

function CommunityPanel({event, selectedProject, canModerate, ownTeamId, commentsRef}) {
  const [ballot, setBallot] = useState(null);
  const [voteResults, setVoteResults] = useState(null);
  const [comments, setComments] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const votingOpen = event?.status === 'voting' &&
    (!event.voting_close || Date.now() < new Date(event.voting_close).getTime());

  useEffect(() => {
    let active = true;
    setBallot(null);
    setVoteResults(null);
    if (event && votingOpen) request(`/events/${event.id}/ballot`)
      .then(value => { if (active) setBallot(value); })
      .catch(error => { if (active) setFeedback(error.message); });
    if (event?.published_at) request(`/events/${event.id}/community-results`)
      .then(value => { if (active) setVoteResults(value.results); })
      .catch(error => { if (active) setFeedback(error.message); });
    return () => { active = false; };
  }, [event?.id, event?.status, event?.voting_close, event?.published_at, votingOpen]);

  const loadComments = async () => {
    if (selectedProject) setComments((await request(`/projects/${selectedProject.id}/comments`)).comments);
  };
  useEffect(() => {
    let active = true;
    setComments([]);
    if (selectedProject) request(`/projects/${selectedProject.id}/comments`)
      .then(value => { if (active) setComments(value.comments); })
      .catch(error => { if (active) setFeedback(error.message); });
    return () => { active = false; };
  }, [selectedProject?.id]);

  const act = async (action) => {
    setBusy(true);
    try { await action(); setFeedback('Saved.'); }
    catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  };

  return <div className="grid gap-5 lg:grid-cols-2">
    {(votingOpen || voteResults) && <section className={panel}>
      <h3 className="text-lg font-black">Community voting</h3>
      {votingOpen && <>
        <p className="mt-1 text-sm text-gray-500">One vote per account. Ballot order is randomized. You cannot vote for your own team.</p>
        {ballot?.has_voted ? <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-bold text-green-700">Your vote is recorded. Results stay hidden until publication.</p> :
          <div className="mt-4 max-h-80 space-y-2 overflow-auto">{ballot?.projects?.map(project =>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3" key={project.id}>
              <div><strong className="text-sm">{project.title}</strong><p className="line-clamp-2 text-xs text-gray-500">{project.summary}</p></div>
              <button className={secondary} disabled={busy || project.team_id === ownTeamId} onClick={() => act(async () => {
                await request(`/events/${event.id}/votes`, 'POST', {project_id: project.id});
                setBallot(await request(`/events/${event.id}/ballot`));
              })}>{project.team_id === ownTeamId ? 'Your team' : 'Vote'}</button>
            </div>)}</div>}
      </>}
      {voteResults && <div className="mt-4 space-y-2">{voteResults.map(result =>
        <p className="flex justify-between border-b border-gray-100 py-2 text-sm" key={result.project_id}>
          <span>{result.title}</span><strong>{result.votes} votes</strong>
        </p>)}</div>}
    </section>}
    <section className={panel} ref={commentsRef}>
      <h3 className="text-lg font-black">Project comments</h3>
      {!selectedProject ? <p className="mt-2 text-sm text-gray-500">Choose a submitted project in the gallery to read and add comments.</p> : <>
        <p className="mt-1 text-sm font-bold text-indigo-700">{selectedProject.title}</p>
        <div className="mt-4 max-h-72 space-y-3 overflow-auto">{comments.length ? comments.map(comment =>
          <article key={comment.id} className="rounded-xl bg-gray-50 p-3 text-sm">
            <div className="flex justify-between gap-2"><strong>{comment.author}</strong><span className="text-xs text-gray-400">{dateLabel(comment.created_at)}</span></div>
            <p className="mt-1 whitespace-pre-wrap break-words">{comment.body}</p>
            {canModerate && <button className="mt-2 text-xs font-bold text-red-600" disabled={busy}
              onClick={() => act(async () => { await request(`/comments/${comment.id}`, 'PATCH', {status:'hidden'}); await loadComments(); })}>Hide comment</button>}
          </article>) : <p className="text-sm text-gray-500">No comments yet.</p>}</div>
        <form className="mt-4 space-y-2" onSubmit={event => { event.preventDefault(); const form = event.currentTarget;
          act(async () => { await request(`/projects/${selectedProject.id}/comments`, 'POST', {body:new FormData(form).get('body')}); form.reset(); await loadComments(); }); }}>
          <textarea className={input} name="body" maxLength="1000" minLength="2" required rows="2" placeholder="Add a comment" />
          <button className={button} disabled={busy}>Post comment</button>
        </form>
      </>}
      {feedback && <div className="fixed bottom-36 left-4 z-[120] flex max-w-sm items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-700 shadow-xl" role="status"><span>{feedback}</span><button type="button" className="ml-auto text-lg leading-none" aria-label="Dismiss community notification" onClick={()=>setFeedback('')}>×</button></div>}
    </section>
  </div>;
}

function ReviewCard({review, event, onSaved}) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const closed = Boolean(event?.published_at ||
    (event?.judging_close && Date.now() >= new Date(event.judging_close).getTime()));

  const submit = async (formEvent) => {
    formEvent.preventDefault();
    const values = Object.fromEntries(new FormData(formEvent.currentTarget));
    const scores = Object.fromEntries(review.criteria.map(criterion =>
      [criterion.code, Number(values[criterion.code])]));
    setSaving(true);
    setFeedback(null);
    try {
      await request(`/assignments/${review.assignment_id}/review`, 'PUT',
        {scores, comment: values.comment, submit: true});
      setFeedback({message: 'Review saved. Your scores are recorded for this project.', error: false});
      await onSaved();
    } catch (failure) {
      setFeedback({message: failure.message, error: true});
    } finally {
      setSaving(false);
    }
  };

  return <form className="rounded-2xl border border-gray-100 bg-gray-50 p-5" onSubmit={submit}>
    <div className="mb-3 flex flex-wrap justify-between gap-2">
      <h4 className="font-black">{review.project_title}</h4>
      <a className="text-sm font-bold text-indigo-700 underline" href={`/projects/${review.project_id}`} target="_blank" rel="noopener noreferrer">Read full submission ↗</a>
      <span className="text-xs font-bold text-indigo-600">{review.review_status === 'submitted' ?
        `Submitted ${dateLabel(review.submitted_at)}` : 'Pending review'}</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{review.criteria.map(criterion =>
      <Field key={criterion.code} label={`${criterion.label} · weight ${criterion.weight}`}>
        <ClayNumber className={input} name={criterion.code}
          min={criterion.min_score} max={criterion.max_score} step="0.1"
          defaultValue={review.scores[criterion.code] ?? ''} required disabled={closed} />
      </Field>)}</div>
    <textarea className={`${input} mt-3`} name="comment" defaultValue={review.comment || ''}
      placeholder="Review notes" rows="2" disabled={closed} />
    <button className={`${button} mt-3`} disabled={saving || closed}>
      {saving ? 'Saving review…' : review.review_status === 'submitted' ? 'Update review' : 'Submit review'}
    </button>
    {closed && <p className="mt-2 text-xs text-gray-500">Judging is closed for this event.</p>}
    {feedback && <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${feedback.error ?
      'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
      role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
  </form>;
}

function IntegrityPanel({reviews, audit}) {
  const completed = reviews.filter(item => item.review_status === 'submitted');
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className={panel}>
      <div className="flex items-baseline justify-between gap-3"><h3 className="text-lg font-black">Review integrity</h3><span className="text-xs font-bold text-gray-500">{completed.length} completed / {reviews.length} assigned</span></div>
      <p className="mt-1 text-sm text-gray-500">Organizer view of individual reviews and raw weighted scores.</p>
      <div className="mt-4 max-h-80 space-y-2 overflow-auto">{reviews.slice(0,30).map(item => <article className="dogfood-activity-row" key={item.assignment_id}>
        <div><strong>{item.project_title}</strong><span>{item.judge_name} · {item.review_status || 'Pending'}</span></div>
        <b>{item.raw_score == null ? '—' : Number(item.raw_score).toFixed(2)}</b>
        {item.comment && <p>{item.comment}</p>}
      </article>)}{!reviews.length && <p className="text-sm text-gray-500">No assignments yet.</p>}</div>
    </section>
    <section className={panel}>
      <h3 className="text-lg font-black">Event audit</h3><p className="mt-1 text-sm text-gray-500">Role decisions, reviews, votes, moderation and deadline actions.</p>
      <div className="mt-4 max-h-80 space-y-2 overflow-auto">{audit.slice(0,30).map(item => <article className="dogfood-activity-row" key={item.id}>
        <div><strong>{item.action.replaceAll('_', ' ')}</strong><span>{dateLabel(item.at)}{item.detail ? ` · ${item.detail}` : ''}</span></div>
      </article>)}{!audit.length && <p className="text-sm text-gray-500">No activity yet.</p>}</div>
    </section>
  </div>;
}

function DogfoodContent({role}) {
  const [view,setView]=useState(role==='admin'?'overview':role==='jury'?'judging':'submissions');
  const [displayedView,setDisplayedView]=useState(view);
  const [transitioning,setTransitioning]=useState(false);
  const reduced=useReducedMotion();
  useEffect(()=>{if(view===displayedView){setTransitioning(false);return;}setTransitioning(true);const timer=setTimeout(()=>{setDisplayedView(view);setTransitioning(false);},reduced?0:140);return()=>clearTimeout(timer);},[view,displayedView,reduced]);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [detail, setDetail] = useState(null);
  const [projects, setProjects] = useState([]);
  const [teams, setTeams] = useState([]);
  const [judges, setJudges] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [batchResult, setBatchResult] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [rubric, setRubric] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [reviewAudit, setReviewAudit] = useState([]);
  const [audit, setAudit] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryTrack, setGalleryTrack] = useState('');
  const [galleryLimit, setGalleryLimit] = useState(6);
  const [selectedCommunityProject, setSelectedCommunityProject] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const commentsRef = useRef(null);
  const workspaceRef = useRef(null);
  const mainRef = useRef(null);
  useLayoutEffect(()=>{mainRef.current?.scrollTo({top:0,left:0,behavior:'instant'});},[displayedView,eventId]);
  useClayMotion(workspaceRef);
  const loadGeneration = useRef(0);

  const notify = (text, failed = false) => { setMessage(failed ? '' : text); setError(failed ? text : ''); };
  const run = async action => {
    setBusy(true);
    try { await action(); await loadEvent(); notify('Saved successfully.'); }
    catch (failure) { notify(failure.message, true); }
    finally { setBusy(false); }
  };

  const loadEvents = async () => {
    const all = (await request('/events')).events;
    const list = all.filter(event => role === 'admin' ? event.can_manage : role === 'jury' ? event.can_judge : true);
    setEvents(list);
    setEventId(current => current || (role === 'admin' ? list.find(e => e.id === 'evt_01')?.id :
      role === 'jury' ? list.find(e => e.id === 'evt_review_demo')?.id : list.find(e => e.id === 'evt_demo')?.id) || list[0]?.id || '');
  };

  const loadEvent = async () => {
    if (!eventId) return;
    const generation = ++loadGeneration.current;
    const [nextDetail, nextProjects, nextRubric] = await Promise.all([
      request(`/events/${eventId}`), request(`/events/${eventId}/projects`),
      request(`/events/${eventId}/rubric`).catch(failure => {
        if (failure.message === 'No active rubric') return null;
        throw failure;
      }),
    ]);
    let adminData, nextTeams, nextReviews;
    if (role === 'admin') adminData = await Promise.all([
      request(`/events/${eventId}/judges`), request(`/events/${eventId}/assignments`),
      request(`/events/${eventId}/progress`), request(`/events/${eventId}/results`),
      request(`/events/${eventId}/reviews`), request(`/events/${eventId}/audit`),
    ]);
    nextTeams = await request(`/events/${eventId}/teams`);
    if (role === 'jury') nextReviews = await request(`/judges/${me.id}/scores`);
    // Publish a complete event view only if it still belongs to the current selection.
    if (generation !== loadGeneration.current) return;
    setDetail(nextDetail);
    setProjects(nextProjects.projects);
    setRubric(nextRubric);
    if (adminData) {
      const [nextJudges, nextAssignments, nextProgress, nextResults, nextAuditReviews, nextAudit] = adminData;
      setJudges(nextJudges.judges); setAssignments(nextAssignments.assignments);
      setProgress(nextProgress); setResults(nextResults);
      setReviewAudit(nextAuditReviews.reviews); setAudit(nextAudit.events);
    }
    if (nextTeams) setTeams(nextTeams.teams);
    if (nextReviews) setReviews(nextReviews.assignments.filter(a => a.event_id === eventId));
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const identity = await request('/me');
        if (!active) return;
        setMe(identity.user);
        if (identity.user) await loadEvents();
        if (active) setReady(true);
      } catch (failure) { if (active) { setReady(true); notify(failure.message, true); } }
    })();
    return () => { active = false; };
  }, [role]);

  useEffect(() => {
    let active = true;
    setDetail(null); setProjects([]); setTeams([]); setReviews([]); setRubric(null);
    setJudges([]); setAssignments([]); setProgress(null); setResults(null);
    setReviewAudit([]); setAudit([]); setBatchResult(null); setInviteLink('');
    setGalleryTrack(''); setSelectedCommunityProject(''); notify('');
    if (ready && me && eventId) loadEvent().catch(failure => { if (active) notify(failure.message, true); });
    return () => { active = false; loadGeneration.current++; };
  }, [ready, me?.id, eventId, role]);
  useEffect(() => {
    if (role !== 'admin' || !eventId) return undefined;
    let active = true;
    const interval = setInterval(async () => {
      try { const next = await request(`/events/${eventId}/progress`); if (active) setProgress(next); } catch (_) { /* keep last value */ }
    }, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [role, eventId]);
  useEffect(() => { setCriteria(rubric?.criteria?.map(c => ({code:c.code,label:c.label,weight:c.weight,min_score:c.min_score,max_score:c.max_score})) || []); }, [rubric?.rubric?.id]);
  useEffect(() => { setQuestions(detail?.questions || []); }, [detail]);

  const event = detail?.event;
  const submissionsOpen = event?.status === 'open' && Date.now() >= new Date(event.starts_at).getTime() &&
    Date.now() < new Date(event.submissions_close).getTime();
  const beforeSubmissionDeadline = event && Date.now() < new Date(event.submissions_close).getTime();
  const ownTeam = teams.find(team => team.is_member);
  const ownProject = ownTeam && projects.find(project => project.team_id === ownTeam.id && !project.source_fixture_id);
  const submitted = useMemo(() => projects.filter(project => project.status === 'submitted' &&
    project.title.toLowerCase().includes(gallerySearch.toLowerCase()) &&
    (!galleryTrack || project.track_id === galleryTrack)), [projects, gallerySearch, galleryTrack]);
  useEffect(() => setGalleryLimit(6), [gallerySearch, galleryTrack, eventId]);

  if (!ready) return <div className="clay-boot"><ClaySkeleton/></div>;
  if (!me) return <div className={panel}><h2 className="text-xl font-black text-gray-800">Local event account</h2>
    <p className="mt-2 text-sm text-gray-500">Sign in with a local account to use the event workspace.</p>
    <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={e => {e.preventDefault(); const values=Object.fromEntries(new FormData(e.currentTarget)); run(async()=>{setDemoSession('');const signedIn=await request('/login','POST',values);if(signedIn.demo_session)setDemoSession(signedIn.demo_session);setMe((await request('/me')).user);await loadEvents();});}}>
      <input className={input} name="email" type="email" placeholder="Email" required/><input className={input} name="password" type="password" placeholder="Password" required/><button className={button}>Sign in</button></form></div>;

  const tabs=[['overview','Overview',LayoutDashboard],['submissions','Submissions',FolderOpen],['teams','Teams',Users],['judging','Judging',ClipboardCheck],['results','Results',Trophy],['community','Community',MessageCircle],['arcade','Arcade',Gamepad2],...(role==='admin'?[['settings','Settings',Settings]]:[])];
  const names={arcade:'Take a little play break.',overview:'Event overview',submissions:role==='contestant'?'Your next big idea':'Submissions',teams:'Better, together.',judging:role==='jury'?'Give good ideas a fair chance.':'The judging room',results:'Let the work speak.',community:'A little conversation.',settings:'Make it your event.'};
  const subtitles={arcade:'Six games, your best scores, and a little friendly competition. Scores stay in this browser.',overview:'Everything you need to keep the event moving.',submissions:'A space for the things you are building.',teams:'Good things happen when the right people meet.',judging:'Thoughtful feedback. Clear criteria. Every project counts.',results:'Thoughtfully scored. Transparently shared.',community:'Discover projects, leave feedback, and join the conversation.',settings:'Dates, invitations, questions, and the details that matter.'};
  return <div className="clay-shell" ref={workspaceRef}>
    <aside className="clay-sidebar"><div className="clay-sidebar-heading"><span className="clay-mini-icon peach"><Layers size={18}/></span><span>Event workspace<small>Make room for good ideas.</small></span></div>
      <div className="clay-event-picker"><span className="clay-eyebrow">CURRENT EVENT</span><ClaySelect className={input} value={eventId} disabled={busy} onChange={e=>setEventId(e.target.value)} aria-label="Select event">{events.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</ClaySelect></div>
      <nav className="clay-sidebar-nav" aria-label="Event navigation">{tabs.map(([id,label,Icon])=><button key={id} type="button" aria-current={view===id?'page':undefined} onClick={()=>setView(id)}>{view===id&&<motion.span layoutId="event-nav-highlight" className="clay-nav-highlight" transition={{type:'spring',stiffness:350,damping:32}}/>}<Icon size={19}/><span>{label}</span>{id==='submissions'&&projects.length>0&&<small>{projects.length}</small>}</button>)}</nav>
      <div className="clay-sidebar-footer"><span className="clay-avatar peach">{me.name?.slice(0,1)}</span><span><strong>{me.name}</strong><small>{role==='admin'?'Organizer':role==='jury'?'Judge':'Participant'}</small></span><span className="clay-status-dot"/></div>
    </aside>
    <div className="clay-main" ref={mainRef} id="workspace-main" tabIndex={-1}>
      <header className="clay-page-header"><div><span className="clay-eyebrow">{event?.name || 'YOUR EVENT WORKSPACE'}</span><motion.h1 key={view} initial={{opacity:0,y:reduced?0:5}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:.25}}>{names[view]}</motion.h1><p>{subtitles[view]}</p></div><div className="clay-header-actions"><a className={secondary} href={eventId?`/events/${eventId}/projects`:'/projects'}>View public gallery <ArrowUpRight size={16}/></a>{role==='admin'&&<button className={button} onClick={()=>setView(view==='settings'?'judging':'settings')}><Plus size={16}/>{view==='settings'?'Invite judges':'Manage event'}</button>}</div></header>
      {busy&&<div className="clay-busy-line" role="status" aria-label="Saving changes"><span/></div>}
      {(error || message) && <div className={`clay-toast ${error?'is-error':''}`} role={error?'alert':'status'}><span className="clay-status-dot"/><span>{error || message}</span><button type="button" aria-label="Dismiss notification" onClick={()=>notify('')}>×</button></div>}
      {event&&<div className="clay-phase-strip"><div className="clay-phase-steps">{[['open','Submissions'],['judging','Judging'],['voting','Community vote'],['published','Results']].map(([id,label],i)=><div className={event.status===id?'is-current':''} key={id}><span>{event.status===id?'✓':i+1}</span><strong>{label}</strong></div>)}</div><span className="clay-deadline">{submissionsOpen?'Closes':'Submission deadline'} <strong>{dateLabel(event.submissions_close)}</strong></span></div>}
      {eventId&&!detail&&!error?<ClaySkeleton label="Loading event"/>:<div className={`clay-view-stage ${transitioning?'is-changing':''}`} inert={transitioning||undefined}>
        <div className="clay-view" hidden={displayedView!=='arcade'}>{displayedView==='arcade'&&<ArcadeDashboard user={{...me,uid:me.id,displayName:me.name}} customUserName={me.name}/>}</div>
        <div className="clay-view" hidden={displayedView!=='overview'}>{event?<ClayOverview event={event} projects={projects} teams={teams} judges={judges} progress={progress} reviews={reviews} role={role} navigate={setView}/>:<section className={panel}><h3>Your next event starts here.</h3><p className="clay-muted">{role==='jury'?'Your assigned events will appear when an organizer invites you.':'Create an event or choose another workspace to get started.'}</p>{role==='admin'&&<button className={button} onClick={()=>setView('settings')}>Create an event <Plus size={16}/></button>}</section>}</div>
        <div className="clay-view" hidden={displayedView!=='submissions'}>    {role === 'contestant' && <div className="grid gap-5 lg:grid-cols-2"><section className={panel}><h3 className="text-lg font-black">Your team</h3>{ownTeam?<><p className="mt-2 text-lg font-bold text-indigo-700">{ownTeam.name} · {ownTeam.member_count}/4</p><button className={`${secondary} mt-4`} disabled={busy || !submissionsOpen || ownTeam.member_count >= 4 || ownTeam.created_by !== me.id} onClick={()=>run(async()=>{const invite=await request(`/teams/${ownTeam.id}/invites`,'POST',{});setInviteLink(`${window.location.origin}${invite.invite_path}`);})}>Create team invite</button>{inviteLink&&<p className="mt-3 break-all text-xs text-indigo-700">{inviteLink}</p>}</>:<form className="mt-4 flex gap-2" onSubmit={e=>{e.preventDefault();run(()=>request(`/events/${eventId}/teams`,'POST',{name:new FormData(e.currentTarget).get('name')}));}}><input className={input} name="name" placeholder="Team name" required disabled={!submissionsOpen}/><button className={button} disabled={busy || !submissionsOpen}>Create team</button></form>}{!submissionsOpen&&<p className="mt-3 text-xs text-gray-500">Team changes are available while submissions are open.</p>}</section>
      <section className={panel}><h3 className="text-lg font-black">Project submission</h3>{!ownTeam?<p className="mt-2 text-sm text-gray-500">Create a team first.</p>:<form key={ownProject?.id || eventId} className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();const v=projectFormValues(e.currentTarget);run(async()=>{if(ownProject) await request(`/projects/${ownProject.id}`,'PATCH',v);else await request(`/events/${eventId}/projects`,'POST',{...v,team_id:ownTeam.id,submit:false});});}}>
        <input className={input} name="title" defaultValue={ownProject?.title || ''} placeholder="Project title" required/>
        <input className={input} name="tagline" defaultValue={ownProject?.tagline || ''} placeholder="One-line tagline" maxLength="160" />
        <ClaySelect className={input} name="track_id" aria-label="Project track" disabled={ownProject?.track_locked} defaultValue={ownProject?.track_id || detail?.tracks?.[0]?.id}>{detail?.tracks?.map(track=><option value={track.id} key={track.id}>{track.name}</option>)}</ClaySelect>
        {ownProject?.track_locked&&<p className="text-xs text-gray-500">The track is fixed because judges have been assigned. You can edit the other project details until submissions close.</p>}
        <textarea className={input} name="summary" defaultValue={ownProject?.summary || ''} placeholder="Short summary" rows="2"/>
        <textarea className={input} name="description" defaultValue={ownProject?.description || ''} placeholder="Full project story: the problem, approach and what you built" rows="4"/>
        <div className="grid gap-3 sm:grid-cols-2"><input className={input} name="repo_url" defaultValue={ownProject?.repo_url || ''} placeholder="Repository URL" type="url"/><input className={input} name="live_url" defaultValue={ownProject?.live_url || ''} placeholder="Live project URL" type="url"/><input className={input} name="demo_url" defaultValue={ownProject?.demo_url || ''} placeholder="Demo video URL" type="url"/><input className={input} name="thumbnail_url" defaultValue={ownProject?.thumbnail_url || ''} placeholder="Thumbnail URL" type="url"/></div>
        <input className={input} name="tech_tags" defaultValue={ownProject?.tech_tags?.join(', ') || ''} placeholder="Tech tags, comma separated" />
        {detail?.questions?.map(question=><Field key={question.code} label={`${question.label}${question.required?' (required)':''}`}><textarea className={input} name={`answer.${question.code}`} defaultValue={ownProject?.custom_answers?.[question.code] || ''} maxLength={2000} rows={3}/></Field>)}
        <textarea className={input} name="image_urls" defaultValue={ownProject?.image_urls?.join('\n') || ''} placeholder="Gallery image URLs, one per line (up to 8)" rows="2" />
        <div className="flex gap-2"><button className={secondary} disabled={busy || !submissionsOpen}>Save {ownProject?'changes':'draft'}</button>{ownProject?.status==='draft'&&<button className={button} type="button" disabled={busy || !submissionsOpen} onClick={click=>{const form=click.currentTarget.closest('form');if(!form.reportValidity())return;const values=projectFormValues(form);run(async()=>{await request(`/projects/${ownProject.id}`,'PATCH',values);await request(`/projects/${ownProject.id}/submit`,'POST',{});});}}>Submit project</button>}</div><p className="text-xs text-gray-500">{ownProject?.status || 'No draft yet'} · deadline {dateLabel(event?.submissions_close)}{!submissionsOpen&&' · submissions closed'}</p></form>}</section></div>}

     <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black">Public project gallery</h3><p className="text-sm text-gray-500">Browse submissions without an account.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{submitted.length} projects</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><input className={input} value={gallerySearch} onChange={e=>setGallerySearch(e.target.value)} placeholder="Search projects" aria-label="Search projects"/><ClaySelect className={input} value={galleryTrack} onChange={e=>setGalleryTrack(e.target.value)} aria-label="Filter by track"><option value="">All tracks</option>{detail?.tracks?.map(track=><option value={track.id} key={track.id}>{track.name}</option>)}</ClaySelect></div>
      <div className="dogfood-gallery-grid mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{submitted.slice(0,galleryLimit).map(project=><article className="rounded-2xl border border-gray-100 bg-gray-50 p-4" key={project.id}>{project.thumbnail_url&&<img className="dogfood-gallery-thumb" src={project.thumbnail_url} alt="" loading="lazy" onError={event=>{event.currentTarget.hidden=true;}} />}<h4 className="font-black"><a href={`/projects/${project.id}`} target="_blank" rel="noopener noreferrer">{project.title} ↗</a></h4>{project.tagline&&<strong className="mt-1 text-xs text-orange-700">{project.tagline}</strong>}<p className="mt-2 line-clamp-3 text-sm text-gray-500">{project.summary}</p>{project.tech_tags?.length>0&&<div className="mt-3 flex flex-wrap gap-1">{project.tech_tags.slice(0,4).map(tag=><span className="dogfood-tech-tag" key={tag}>{tag}</span>)}</div>}{project.duplicate_of&&<span className="mt-2 block text-xs font-bold text-orange-600">Duplicate flagged</span>}<div className="mt-3 flex flex-wrap gap-3">{project.repo_url&&<a className="text-xs font-bold text-indigo-600 hover:underline" href={project.repo_url} target="_blank" rel="noopener noreferrer">Repository ↗</a>}{project.live_url&&<a className="text-xs font-bold text-indigo-600 hover:underline" href={project.live_url} target="_blank" rel="noopener noreferrer">Live demo ↗</a>}</div><button className={`${secondary} mt-3 block`} onClick={()=>{setSelectedCommunityProject(project.id);setView('community');setTimeout(()=>commentsRef.current?.scrollIntoView({behavior:'smooth',block:'center'}),220);}}>Comments</button></article>)}</div>
      {submitted.length > galleryLimit && <button type="button" className="dogfood-gallery-more" onClick={()=>setGalleryLimit(current=>current+6)}>Show more projects <span>{galleryLimit} of {submitted.length} shown ↘</span></button>}
    </section>
</div>
        <div className="clay-view" hidden={displayedView!=='teams'}><section className={panel}><div className="clay-section-heading"><h3>Event teams</h3>{role==='contestant'&&<button className={secondary} onClick={()=>setView('submissions')}>Manage your team <ArrowRight size={15}/></button>}</div><div className="clay-team-grid">{teams.map(team=><article className="clay-team-tile" key={team.id} data-tilt><span className="clay-mini-icon sage"><Users size={22}/></span><h4>{team.name}</h4><p>{team.member_count} of 4 members</p><ClayProgress value={team.member_count/4*100} label={`${team.name} capacity`}/>{team.is_member&&<span className="clay-badge sage">Your team</span>}</article>)}</div>{!teams.length&&<div className="clay-empty"><Users size={30}/><h4>The first team could be yours.</h4><p>Teams will appear here when participants join.</p></div>}</section></div>
        <div className="clay-view" hidden={displayedView!=='judging'}>{role==='admin'&&<>      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panel}><h3 className="text-lg font-black">Judge invitations</h3><p className="mb-4 text-sm text-gray-500">Create an email-specific link for a judge or participant.</p>
          <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const v=roleFormValues(e.currentTarget);run(async()=>{const invite=await request(`/events/${eventId}/role-invites`,'POST',v);setInviteLink(`${window.location.origin}${invite.invite_path}`);});}}>
            <JudgeTracks tracks={detail?.tracks} />
            <input className={`${input} flex-1`} name="email" type="email" placeholder="Email address" required/><ClaySelect className={`${input} w-auto`} name="role"><option>judge</option><option>participant</option><option>organizer</option></ClaySelect><button className={button} disabled={busy}>Invite</button></form>
          {inviteLink?.includes('/role-invite/') && <p className="mt-3 break-all rounded-xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700">{inviteLink}</p>}
          <h4 className="mt-6 font-bold">Add an existing account</h4><p className="mb-3 text-xs text-gray-500">Grant a role to an account already registered in this portal.</p>
          <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const v=roleFormValues(e.currentTarget);run(()=>request(`/events/${eventId}/roles`,'POST',v));}}>
            <JudgeTracks tracks={detail?.tracks} />
            <input className={`${input} flex-1`} name="email" type="email" placeholder="Registered email" required/><ClaySelect className={`${input} w-auto`} name="role"><option>judge</option><option>participant</option><option>organizer</option></ClaySelect><button className={secondary} disabled={busy}>Add role</button></form>
          <h4 className="mt-6 font-bold">Balance judge assignments</h4>
          <form className="my-3 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const count=Number(new FormData(e.currentTarget).get('reviews_per_project'));run(async()=>setBatchResult(await request(`/events/${eventId}/assignments/batch`,'POST',{reviews_per_project:count})));}}>
            <Field label="Reviews per project"><ClayNumber className={input} name="reviews_per_project"  min="1" max="10" defaultValue="3" required /></Field>
            <button className={button} disabled={busy || !event || !!event.published_at}>Assign batch</button>
          </form>
          {batchResult && <div role="status" className="rounded-xl bg-indigo-50 p-3 text-sm"><p>{batchResult.created} new assignments.</p>{batchResult.shortfalls.map(item=><p key={item.project_id}>{item.title}: needs {item.missing} more eligible judges.</p>)}</div>}
          <h4 className="mt-6 font-bold">Assign a submitted project</h4><form className="mt-3 grid gap-2" onSubmit={e=>{e.preventDefault();run(()=>request(`/events/${eventId}/assignments`,'POST',Object.fromEntries(new FormData(e.currentTarget))));}}>
            <ClaySelect className={input} name="project_id" required>{projects.filter(p=>p.status==='submitted'&&!p.duplicate_of).map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</ClaySelect>
            <ClaySelect className={input} name="judge_user_id" required>{judges.map(j=><option value={j.id} key={j.id}>{j.name} · {j.email}</option>)}</ClaySelect><button className={secondary} disabled={busy || !judges.length || !projects.some(p=>p.status==='submitted'&&!p.duplicate_of) || !!event?.published_at}>Assign judge</button></form>
        </section>
        <section className={panel}><h3 className="text-lg font-black">Weighted rubric <span className="text-indigo-600">v{rubric?.rubric?.version}</span></h3><p className="mb-4 text-sm text-gray-500">Reviews keep the rubric version used when first saved.</p>
          <div className="space-y-2">{criteria.map((criterion,index)=><div className="grid grid-cols-[1fr_80px_32px] items-center gap-2" key={`${criterion.code}-${index}`}><input className={input} value={criterion.label} onChange={e=>setCriteria(criteria.map((c,i)=>i===index?{...c,label:e.target.value}:c))}/><ClayNumber className={input} min="0.1" max="100" step="0.1" value={criterion.weight} onChange={e=>setCriteria(criteria.map((c,i)=>i===index?{...c,weight:Number(e.target.value)}:c))}/><button className="font-bold text-red-500" onClick={()=>setCriteria(criteria.filter((_,i)=>i!==index))} aria-label={`Remove ${criterion.label}`}>×</button></div>)}</div>
          <div className="mt-4 flex gap-2"><button className={secondary} disabled={!!event?.published_at} onClick={()=>setCriteria([...criteria,{code:`criterion_${criteria.length+1}`,label:'New criterion',weight:1,min_score:1,max_score:5}])}>Add criterion</button><button className={button} disabled={busy || !criteria.length || !!event?.published_at} onClick={()=>run(()=>request(`/events/${eventId}/rubric`,'POST',{criteria}))}>Activate rubric</button></div>
        </section>
      </div>
 <section className={panel}><h3 className="text-lg font-black">Judging progress</h3><div className="mt-4 grid grid-cols-3 gap-3">{[['Assigned',progress?.assigned],['Completed',progress?.completed],['Pending',progress?.pending]].map(([label,value])=><div className="rounded-2xl bg-indigo-50 p-4" key={label}><strong className="text-2xl text-indigo-700">{value ?? 0}</strong><p className="text-xs text-gray-500">{label}</p></div>)}</div><div className="mt-4 space-y-2 text-sm">{progress?.judges?.map(j=><p key={j.judge_user_id} className="flex justify-between"><span>{j.judge_name}</span><strong>{j.completed}/{j.assigned}</strong></p>)}</div></section>
<IntegrityPanel reviews={reviewAudit} audit={audit}/></>}    {role === 'jury' && <section className={panel}><h3 className="text-lg font-black">Assigned reviews</h3><p className="mb-4 text-sm text-gray-500">Only your assigned scores are available here.</p><div className="space-y-4">{reviews.map(review=><ReviewCard key={review.assignment_id} review={review} event={event} onSaved={loadEvent} />)}{!reviews.length&&<p className="text-sm text-gray-500">No assignments for this event yet.</p>}</div></section>}

{role==='contestant'&&<section className={panel}><h3>Thoughtful judging, private reviews.</h3><p>Judges review their assigned projects here. Published scores will appear in Results.</p></section>}</div>
        <div className="clay-view" hidden={displayedView!=='results'}>{role==='admin'?<>        <section className={panel}><div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-black">Results</h3><a className={secondary} href={`/dogfood-api/events/${eventId}/export.csv`}>Export CSV</a></div><p className="mt-2 text-sm text-gray-500">{results?.published?'Published snapshot':'Organizer preview; hidden from visitors.'}</p><div className="mt-4 max-h-64 space-y-2 overflow-auto text-sm">{results?.results?.slice(0,30).map(result=><p key={result.project_id} className="flex justify-between border-b border-gray-100 py-1"><span>{result.title}</span><strong>{result.adjusted_score == null?'Pending':Number(result.adjusted_score).toFixed(2)}</strong></p>)}</div><button className={`${button} mt-4`} disabled={busy || !!event?.published_at || !!beforeSubmissionDeadline} onClick={()=>run(()=>request(`/events/${eventId}/publish`,'POST',{}))}>Publish results</button>{beforeSubmissionDeadline&&<p className="mt-2 text-xs text-gray-500">Available after submissions close on {dateLabel(event.submissions_close)}.</p>}</section></>:<section className={panel}><h3>{event?.published_at?'The results are in.':'Good work takes a little time.'}</h3><p className="clay-muted">{event?.published_at?'Explore the published scores and celebrate the teams.':'Scores stay private until the organizer publishes the results.'}</p>{event?.published_at&&<a className={button} href={`/events/${eventId}/projects#results`}>View published judging results <ArrowUpRight size={16}/></a>}</section>}</div>
        <div className="clay-view" hidden={displayedView!=='community'}>{role==='admin'&&<>      {event && <section className={`${panel} mb-5`}><h3 className="text-lg font-black">Community voting access</h3>
        <p className="my-2 text-sm text-gray-500">Use email-bound invitations to limit voting to your approved voters. Deliver each private link to its named recipient. No email service is required.</p>
        <form key={`${eventId}:${detail.voting_policy}`} className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const mode=new FormData(e.currentTarget).get('mode');run(()=>request(`/events/${eventId}/voting-policy`,'PUT',{mode}));}}>
          <ClaySelect className={input} name="mode" aria-label="Voting access" defaultValue={detail.voting_policy} disabled={detail.voting_policy_locked}><option value="authenticated">Any signed-in account</option><option value="invitation">Email-bound invitation only</option></ClaySelect>
          <button className={button} disabled={busy || detail.voting_policy_locked}>Save voting access</button>
        </form>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const email=new FormData(e.currentTarget).get('email');run(async()=>{const invitation=await request(`/events/${eventId}/voter-invites`,'POST',{email});setInviteLink(`${window.location.origin}${invitation.invite_path}`);});}}>
          <input className={input} name="email" type="email" placeholder="Voter email" required/><button className={secondary} disabled={busy || !!event.published_at}>Create voter invitation</button>
        </form>
        {inviteLink?.includes('/vote-invite/') && <p className="mt-2 break-all text-sm">{inviteLink}</p>}
      </section>}
</>}    <CommunityPanel key={`community:${eventId}`} event={event} selectedProject={projects.find(project => project.id === selectedCommunityProject && project.status === 'submitted')} canModerate={role === 'admin'} ownTeamId={ownTeam?.id} commentsRef={commentsRef} />
</div>
        {role==='admin'&&<div className="clay-view" hidden={displayedView!=='settings'}>      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panel}><h3 className="text-lg font-black">Create an event</h3><p className="mb-4 text-sm text-gray-500">Set dates, tracks and prizes for another hackathon.</p>
          <form className="grid gap-3" onSubmit={e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));run(async()=>{const created=await request('/events','POST',{name:v.name,description:v.description,starts_at:new Date(v.starts_at).toISOString(),submissions_close:new Date(v.submissions_close).toISOString(),judging_close:v.judging_close?new Date(v.judging_close).toISOString():null,voting_close:v.voting_close?new Date(v.voting_close).toISOString():null,tracks:v.tracks.split(',').map(x=>x.trim()).filter(Boolean),prizes:v.prizes.split(',').map(x=>x.trim()).filter(Boolean).map(title=>({title}))});await loadEvents();setEventId(created.id);});}}>
            <input className={input} name="name" placeholder="Event name" required/><textarea className={input} name="description" placeholder="Description" rows="2"/>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Starts"><ClayDateTime className={input} name="starts_at"  required/></Field><Field label="Submissions close"><ClayDateTime className={input} name="submissions_close"  required/></Field><Field label="Judging close"><ClayDateTime className={input} name="judging_close" /></Field><Field label="Voting close"><ClayDateTime className={input} name="voting_close" /></Field></div>
            <input className={input} name="tracks" placeholder="Tracks, comma separated" required/><input className={input} name="prizes" placeholder="Prizes, comma separated"/><button className={button} disabled={busy}>Create event</button>
          </form></section>
        <section className={panel}><h3 className="text-lg font-black">Event controls</h3><p className="mb-4 text-sm text-gray-500">Deadlines and phase changes are enforced by the server.</p>
          {event && <form className="grid gap-3" key={eventId} onSubmit={e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));run(()=>request(`/events/${eventId}`,'PATCH',{submissions_close:new Date(v.submissions_close).toISOString(),judging_close:v.judging_close?new Date(v.judging_close).toISOString():null,voting_close:v.voting_close?new Date(v.voting_close).toISOString():null,status:v.status}));}}>
            <Field label="Submissions close"><ClayDateTime className={input} name="submissions_close"  defaultValue={dateValue(event.submissions_close)} required/></Field>
            <Field label="Judging close"><ClayDateTime className={input} name="judging_close"  defaultValue={dateValue(event.judging_close)}/></Field>
            <Field label="Voting close"><ClayDateTime className={input} name="voting_close"  defaultValue={dateValue(event.voting_close)}/></Field>
            <ClaySelect className={input} name="status" defaultValue={event.status}>{(event.published_at?['published']:['draft','open','judging','voting']).map(value=><option key={value}>{value}</option>)}</ClaySelect>
            <button className={secondary} disabled={busy || !!event.published_at}>Save settings</button>{event.published_at&&<p className="text-xs text-gray-500">Published results lock event dates and phase.</p>}</form>}
        </section>
      </div>
       {event && <section className={`${panel} mb-5`}><h3 className="text-lg font-black">Submission questions</h3>
        <p className="my-2 text-sm text-gray-500">Answers are part of the public project. Questions lock when the first project is submitted.</p>
        {questions.map((question,index)=><div className="my-3 flex flex-wrap items-center gap-3" key={question.code}>
          <label className="flex-1">Question label<input aria-label={`Question ${index+1}`} className={`${input} block`} value={question.label} disabled={detail.questions_locked} onChange={e=>setQuestions(questions.map((q,i)=>i===index?{...q,label:e.target.value}:q))}/></label>
          <label><input type="checkbox" checked={!!question.required} disabled={detail.questions_locked} onChange={e=>setQuestions(questions.map((q,i)=>i===index?{...q,required:e.target.checked}:q))}/> Required</label>
          <button className={secondary} disabled={detail.questions_locked} onClick={()=>setQuestions(questions.filter((_,i)=>i!==index))}>Remove question {index+1}</button>
        </div>)}
        <div className="flex gap-2"><button className={secondary} disabled={detail.questions_locked || questions.length>=20} onClick={()=>setQuestions([...questions,{code:`question_${Date.now()}`,label:'',required:false}])}>Add question</button>
          <button className={button} disabled={busy || detail.questions_locked} onClick={()=>run(()=>request(`/events/${eventId}/questions`,'PUT',{questions}))}>Save questions</button></div>
      </section>}
     <DogfoodAdvanced key={`advanced:${eventId}`} event={event} role={role} request={request} onImported={loadEvent} /></div>}
        {role!=='admin'&&<div className="clay-view" hidden={displayedView!=='results'}>    <DogfoodAdvanced key={`advanced:${eventId}`} event={event} role={role} request={request} onImported={loadEvent} /></div>}
      </div>}
    </div>
  </div>;
}

class DogfoodErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = {error: null}; }
  static getDerivedStateFromError(error) { return {error}; }
  render() {
    if (this.state.error) return <div className={panel} role="alert">Unable to open this event tab: {this.state.error.message}</div>;
    return this.props.children;
  }
}

export default function DogfoodWorkspace(props) {
  return <DogfoodErrorBoundary><DogfoodContent {...props}/></DogfoodErrorBoundary>;
}
