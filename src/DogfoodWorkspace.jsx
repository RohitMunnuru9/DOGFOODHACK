import React, { useEffect, useMemo, useRef, useState } from 'react';
import DogfoodAdvanced from './DogfoodAdvanced';

const root = '/dogfood-api';
const demo = {
  admin: 'organizer@demo.local',
  jury: 'marek.nowak@example.org',
  contestant: 'participant@demo.local',
};
const panel = 'dogfood-panel rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm';
const input = 'dogfood-input w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const button = 'dogfood-button rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'dogfood-secondary rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50';
const dateValue = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const dateLabel = value => value ? new Date(value).toLocaleString() : 'Not set';
const projectFormValues = form => {
  const values = Object.fromEntries(new FormData(form));
  return {...values,
    tech_tags: String(values.tech_tags || '').split(',').map(item=>item.trim()).filter(Boolean),
    image_urls: String(values.image_urls || '').split(/[\n,]/).map(item=>item.trim()).filter(Boolean)};
};

async function request(path, method = 'GET', body) {
  const response = await fetch(root + path, {
    method, credentials: 'same-origin',
    headers: body === undefined ? {} : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.headers.get('Content-Type')?.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

function Field({label, children}) {
  return <label className="block space-y-1.5 text-xs font-bold uppercase tracking-wide text-gray-500"><span>{label}</span>{children}</label>;
}

function PortalSculpture() {
  const move = event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--pointer-x', `${((event.clientX - bounds.left) / bounds.width - .5) * 18}px`);
    event.currentTarget.style.setProperty('--pointer-y', `${((event.clientY - bounds.top) / bounds.height - .5) * 18}px`);
  };
  const reset = event => {
    event.currentTarget.style.setProperty('--pointer-x', '0px');
    event.currentTarget.style.setProperty('--pointer-y', '0px');
  };

  return <div className="dogfood-hero__art" onPointerMove={move} onPointerLeave={reset} aria-hidden="true">
    <div className="dogfood-art-grid" />
    <div className="dogfood-art-orbit dogfood-art-orbit--outer" />
    <div className="dogfood-art-orbit dogfood-art-orbit--inner" />
    <div className="dogfood-art-card">
      <div className="dogfood-art-card__top"><span className="dogfood-art-card__brand">D<span>✳</span>F</span><span>THE PROJECT SPACE ↗</span></div>
      <div className="dogfood-art-card__visual"><span className="dogfood-art-card__sun"/><span className="dogfood-art-card__hill dogfood-art-card__hill--back"/><span className="dogfood-art-card__hill dogfood-art-card__hill--front"/><span className="dogfood-art-card__spark">✳</span></div>
      <div className="dogfood-art-card__bottom"><span>01 / CREATE & SUBMIT</span><strong>From idea to impact.</strong><small>One place to build, share and be seen.</small></div>
    </div>
    <span className="dogfood-art-caption">DOGFOOD / 2026</span>
  </div>;
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
      <span className="text-xs font-bold text-indigo-600">{review.review_status === 'submitted' ?
        `Submitted ${dateLabel(review.submitted_at)}` : 'Pending review'}</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{review.criteria.map(criterion =>
      <Field key={criterion.code} label={`${criterion.label} · weight ${criterion.weight}`}>
        <input className={input} name={criterion.code} type="number"
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

function DogfoodContent({role, preview = false}) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [detail, setDetail] = useState(null);
  const [projects, setProjects] = useState([]);
  const [teams, setTeams] = useState([]);
  const [judges, setJudges] = useState([]);
  const [assignments, setAssignments] = useState([]);
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
  const progressRef = useRef(null);

  const notify = (text, failed = false) => { setMessage(failed ? '' : text); setError(failed ? text : ''); };
  const run = async action => {
    setBusy(true);
    try { await action(); await loadEvent(); notify('Saved successfully.'); }
    catch (failure) { notify(failure.message, true); }
    finally { setBusy(false); }
  };

  const loadEvents = async () => {
    const list = (await request('/events')).events;
    setEvents(list);
    setEventId(current => current || (role === 'admin' ? list.find(e => e.id === 'evt_01')?.id :
      role === 'jury' ? list.find(e => e.id === 'evt_review_demo')?.id : list.find(e => e.id === 'evt_demo')?.id) || list[0]?.id || '');
  };

  const loadEvent = async () => {
    if (!eventId) return;
    const event = await request(`/events/${eventId}`);
      setDetail(event);
      setProjects((await request(`/events/${eventId}/projects`)).projects);
      try { setRubric(await request(`/events/${eventId}/rubric`)); }
      catch (failure) { if (failure.message === 'No active rubric') setRubric(null); else throw failure; }
      if (role === 'admin') {
        const [nextJudges, nextAssignments, nextProgress, nextResults, nextReviews, nextAudit] = await Promise.all([
          request(`/events/${eventId}/judges`), request(`/events/${eventId}/assignments`),
          request(`/events/${eventId}/progress`), request(`/events/${eventId}/results`),
          request(`/events/${eventId}/reviews`), request(`/events/${eventId}/audit`),
        ]);
        setJudges(nextJudges.judges);
        setAssignments(nextAssignments.assignments);
        setProgress(nextProgress);
        setResults(nextResults);
        setReviewAudit(nextReviews.reviews);
        setAudit(nextAudit.events);
      }
      if (role === 'contestant') setTeams((await request(`/events/${eventId}/teams`)).teams);
      if (role === 'jury') {
        const identity = await request('/me');
        setReviews((await request(`/judges/${identity.user.id}/scores`)).assignments.filter(a => a.event_id === eventId));
      }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (preview && demo[role]) await request('/login', 'POST', {email: demo[role], password: 'dogfood-demo-2026'});
        const identity = await request('/me');
        if (!active) return;
        setMe(identity.user);
        setReady(true);
        if (identity.user) await loadEvents();
      } catch (failure) { if (active) { setReady(true); notify(failure.message, true); } }
    })();
    return () => { active = false; };
  }, [role, preview]);

  useEffect(() => { if (ready && me && eventId) loadEvent().catch(failure => notify(failure.message, true)); }, [ready, me?.id, eventId, role]);
  useEffect(() => {
    const scroller = workspaceRef.current?.closest('.custom-scrollbar');
    if (!scroller) return;
    const update = () => {
      const distance = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.min(1, scroller.scrollTop / distance)})`;
    };
    scroller.addEventListener('scroll', update, {passive: true});
    update();
    return () => scroller.removeEventListener('scroll', update);
  }, [role, ready]);
  useEffect(() => {
    if (role !== 'admin' || !eventId) return undefined;
    const interval = setInterval(async () => {
      try { setProgress(await request(`/events/${eventId}/progress`)); } catch (_) { /* keep last value */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [role, eventId]);
  useEffect(() => { setCriteria(rubric?.criteria?.map(c => ({code:c.code,label:c.label,weight:c.weight,min_score:c.min_score,max_score:c.max_score})) || []); }, [rubric?.rubric?.id]);

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

  if (!ready) return <div className={panel}>Loading DOGFOOD event data…</div>;
  if (!me) return <div className={panel}><h2 className="text-xl font-black text-gray-800">Local event account</h2>
    <p className="mt-2 text-sm text-gray-500">Sign in with a local account to use the event workspace.</p>
    <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={e => {e.preventDefault(); const values=Object.fromEntries(new FormData(e.currentTarget)); run(async()=>{await request('/login','POST',values);setMe((await request('/me')).user);await loadEvents();});}}>
      <input className={input} name="email" type="email" placeholder="Email" required/><input className={input} name="password" type="password" placeholder="Password" required/><button className={button}>Sign in</button></form></div>;

  const roleHeadline = role === 'admin' ? <>Make room for <em>big ideas.</em></> :
    role === 'jury' ? <>Find the ideas <em>that matter.</em></> :
      <>Make your next <em>idea real.</em></>;
  const roleDescription = role === 'admin' ? 'Bring your event to life. Keep teams, judging and every moment moving.' :
    role === 'jury' ? 'Discover what teams are building and give their work the attention it deserves.' :
      'Your team, your project and the whole event. Everything starts here.';

  return <div className="dogfood-workspace space-y-6 pb-12 text-gray-800" ref={workspaceRef}>
    <div className="dogfood-scroll-progress" ref={progressRef} aria-hidden="true" />
    <div className="dogfood-hero">
      <div className="dogfood-hero__content">
        <p className="dogfood-eyebrow"><span className="dogfood-eyebrow__number">D/F · 26</span><span className="dogfood-live-dot" aria-hidden="true" /> THE HACKATHON SPACE</p>
        <p className="dogfood-hero__event">DOGFOOD 2026 <span>↗</span></p>
        <h2 className="dogfood-hero__title">{roleHeadline}</h2>
        <p className="dogfood-hero__description">{roleDescription}</p>
        <button className="dogfood-hero__cta" type="button" onClick={()=>document.getElementById('dogfood-content')?.scrollIntoView({behavior:'smooth',block:'start'})}>Explore workspace <span>↘</span></button>
      </div>
      <PortalSculpture />
    </div>
    <div className="dogfood-utilitybar">
      <div className="dogfood-hero__switcher"><span>CURRENT EVENT</span><select className={`${input} w-full`} value={eventId} onChange={e=>setEventId(e.target.value)} aria-label="Select event">
        {events.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></div>
      <div className="dogfood-phase-rail" aria-label="Event stages">
        {['open','judging','voting','published'].map((phase,index)=><span key={phase} className={`dogfood-phase ${event?.status === phase ? 'is-current' : ''}`}><span>{String(index+1).padStart(2,'0')}</span>{phase === 'open' ? 'Build' : phase === 'judging' ? 'Review' : phase === 'voting' ? 'Vote' : 'Results'}</span>)}
      </div>
    </div>
    {(error || message) && <div className={`fixed bottom-20 left-4 z-[120] flex max-w-sm items-start gap-3 rounded-2xl border p-4 text-sm font-semibold shadow-xl ${error ?
      'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}
      role={error ? 'alert' : 'status'}><span>{error || message}</span><button type="button" className="ml-auto text-lg leading-none" aria-label="Dismiss notification" onClick={()=>notify('')}>×</button></div>}
    <div className="dogfood-section-lead" id="dogfood-content"><span>01 / THE WORKSPACE</span><strong>{role === 'admin' ? 'Set the stage.' : role === 'jury' ? 'Thoughtful reviews start here.' : 'Make it real.'}</strong><span>SCROLL TO EXPLORE ↓</span></div>
    {event && <div className="grid gap-4 sm:grid-cols-3">
      {[['Event status',event.status],['Submissions close',new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(event.submissions_close))],['Your role',role === 'admin' ? 'Organizer' : role === 'jury' ? 'Judge' : 'Participant']].map(([label,value],index)=><div className={`${panel} dogfood-stat`} style={{'--stat-index':index}} key={label}><p className="text-xs font-bold uppercase tracking-widest text-gray-400">{label}</p><strong className="mt-2 block text-lg text-indigo-700">{value}</strong></div>)}
    </div>}

    {role === 'admin' && <>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panel}><h3 className="text-lg font-black">Create an event</h3><p className="mb-4 text-sm text-gray-500">Set dates, tracks and prizes for another hackathon.</p>
          <form className="grid gap-3" onSubmit={e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));run(async()=>{const created=await request('/events','POST',{name:v.name,description:v.description,starts_at:new Date(v.starts_at).toISOString(),submissions_close:new Date(v.submissions_close).toISOString(),judging_close:v.judging_close?new Date(v.judging_close).toISOString():null,voting_close:v.voting_close?new Date(v.voting_close).toISOString():null,tracks:v.tracks.split(',').map(x=>x.trim()).filter(Boolean),prizes:v.prizes.split(',').map(x=>x.trim()).filter(Boolean).map(title=>({title}))});await loadEvents();setEventId(created.id);});}}>
            <input className={input} name="name" placeholder="Event name" required/><textarea className={input} name="description" placeholder="Description" rows="2"/>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Starts"><input className={input} name="starts_at" type="datetime-local" required/></Field><Field label="Submissions close"><input className={input} name="submissions_close" type="datetime-local" required/></Field><Field label="Judging close"><input className={input} name="judging_close" type="datetime-local"/></Field><Field label="Voting close"><input className={input} name="voting_close" type="datetime-local"/></Field></div>
            <input className={input} name="tracks" placeholder="Tracks, comma separated" required/><input className={input} name="prizes" placeholder="Prizes, comma separated"/><button className={button} disabled={busy}>Create event</button>
          </form></section>
        <section className={panel}><h3 className="text-lg font-black">Event controls</h3><p className="mb-4 text-sm text-gray-500">Deadlines and phase changes are enforced by the server.</p>
          {event && <form className="grid gap-3" key={eventId} onSubmit={e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));run(()=>request(`/events/${eventId}`,'PATCH',{submissions_close:new Date(v.submissions_close).toISOString(),judging_close:v.judging_close?new Date(v.judging_close).toISOString():null,voting_close:v.voting_close?new Date(v.voting_close).toISOString():null,status:v.status}));}}>
            <Field label="Submissions close"><input className={input} name="submissions_close" type="datetime-local" defaultValue={dateValue(event.submissions_close)} required/></Field>
            <Field label="Judging close"><input className={input} name="judging_close" type="datetime-local" defaultValue={dateValue(event.judging_close)}/></Field>
            <Field label="Voting close"><input className={input} name="voting_close" type="datetime-local" defaultValue={dateValue(event.voting_close)}/></Field>
            <select className={input} name="status" defaultValue={event.status}>{(event.published_at?['published']:['draft','open','judging','voting']).map(value=><option key={value}>{value}</option>)}</select>
            <button className={secondary} disabled={busy || !!event.published_at}>Save settings</button>{event.published_at&&<p className="text-xs text-gray-500">Published results lock event dates and phase.</p>}</form>}
        </section>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panel}><h3 className="text-lg font-black">Judge invitations</h3><p className="mb-4 text-sm text-gray-500">Create an email-specific link for a judge or participant.</p>
          <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));run(async()=>{const invite=await request(`/events/${eventId}/role-invites`,'POST',v);setInviteLink(`${window.location.origin}${invite.invite_path}`);});}}>
            <input className={`${input} flex-1`} name="email" type="email" placeholder="Email address" required/><select className={`${input} w-auto`} name="role"><option>judge</option><option>participant</option><option>organizer</option></select><button className={button} disabled={busy}>Invite</button></form>
          {inviteLink && <p className="mt-3 break-all rounded-xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700">{inviteLink}</p>}
          <h4 className="mt-6 font-bold">Add an existing account</h4><p className="mb-3 text-xs text-gray-500">Grant a role to an account already registered in this portal.</p>
          <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));run(()=>request(`/events/${eventId}/roles`,'POST',v));}}>
            <input className={`${input} flex-1`} name="email" type="email" placeholder="Registered email" required/><select className={`${input} w-auto`} name="role"><option>judge</option><option>participant</option><option>organizer</option></select><button className={secondary} disabled={busy}>Add role</button></form>
          <h4 className="mt-6 font-bold">Assign a submitted project</h4><form className="mt-3 grid gap-2" onSubmit={e=>{e.preventDefault();run(()=>request(`/events/${eventId}/assignments`,'POST',Object.fromEntries(new FormData(e.currentTarget))));}}>
            <select className={input} name="project_id" required>{projects.filter(p=>p.status==='submitted'&&!p.duplicate_of).map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select>
            <select className={input} name="judge_user_id" required>{judges.map(j=><option value={j.id} key={j.id}>{j.name} · {j.email}</option>)}</select><button className={secondary} disabled={busy || !judges.length || !projects.some(p=>p.status==='submitted'&&!p.duplicate_of) || !!event?.published_at}>Assign judge</button></form>
        </section>
        <section className={panel}><h3 className="text-lg font-black">Weighted rubric <span className="text-indigo-600">v{rubric?.rubric?.version}</span></h3><p className="mb-4 text-sm text-gray-500">Reviews keep the rubric version used when first saved.</p>
          <div className="space-y-2">{criteria.map((criterion,index)=><div className="grid grid-cols-[1fr_80px_32px] items-center gap-2" key={`${criterion.code}-${index}`}><input className={input} value={criterion.label} onChange={e=>setCriteria(criteria.map((c,i)=>i===index?{...c,label:e.target.value}:c))}/><input className={input} type="number" min="0.1" max="100" step="0.1" value={criterion.weight} onChange={e=>setCriteria(criteria.map((c,i)=>i===index?{...c,weight:Number(e.target.value)}:c))}/><button className="font-bold text-red-500" onClick={()=>setCriteria(criteria.filter((_,i)=>i!==index))} aria-label={`Remove ${criterion.label}`}>×</button></div>)}</div>
          <div className="mt-4 flex gap-2"><button className={secondary} disabled={!!event?.published_at} onClick={()=>setCriteria([...criteria,{code:`criterion_${criteria.length+1}`,label:'New criterion',weight:1,min_score:1,max_score:5}])}>Add criterion</button><button className={button} disabled={busy || !criteria.length || !!event?.published_at} onClick={()=>run(()=>request(`/events/${eventId}/rubric`,'POST',{criteria}))}>Activate rubric</button></div>
        </section>
      </div>
      <div className="grid gap-5 lg:grid-cols-2"><section className={panel}><h3 className="text-lg font-black">Judging progress</h3><div className="mt-4 grid grid-cols-3 gap-3">{[['Assigned',progress?.assigned],['Completed',progress?.completed],['Pending',progress?.pending]].map(([label,value])=><div className="rounded-2xl bg-indigo-50 p-4" key={label}><strong className="text-2xl text-indigo-700">{value ?? 0}</strong><p className="text-xs text-gray-500">{label}</p></div>)}</div><div className="mt-4 space-y-2 text-sm">{progress?.judges?.map(j=><p key={j.judge_user_id} className="flex justify-between"><span>{j.judge_name}</span><strong>{j.completed}/{j.assigned}</strong></p>)}</div></section>
        <section className={panel}><div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-black">Results</h3><a className={secondary} href={`/dogfood-api/events/${eventId}/export.csv`}>Export CSV</a></div><p className="mt-2 text-sm text-gray-500">{results?.published?'Published snapshot':'Organizer preview; hidden from visitors.'}</p><div className="mt-4 max-h-64 space-y-2 overflow-auto text-sm">{results?.results?.slice(0,30).map(result=><p key={result.project_id} className="flex justify-between border-b border-gray-100 py-1"><span>{result.title}</span><strong>{result.adjusted_score == null?'Pending':Number(result.adjusted_score).toFixed(2)}</strong></p>)}</div><button className={`${button} mt-4`} disabled={busy || !!event?.published_at || !!beforeSubmissionDeadline} onClick={()=>run(()=>request(`/events/${eventId}/publish`,'POST',{}))}>Publish results</button>{beforeSubmissionDeadline&&<p className="mt-2 text-xs text-gray-500">Available after submissions close on {dateLabel(event.submissions_close)}.</p>}</section></div>
      <IntegrityPanel reviews={reviewAudit} audit={audit} />
    </>}

    {role === 'contestant' && <div className="grid gap-5 lg:grid-cols-2"><section className={panel}><h3 className="text-lg font-black">Your team</h3>{ownTeam?<><p className="mt-2 text-lg font-bold text-indigo-700">{ownTeam.name} · {ownTeam.member_count}/4</p><button className={`${secondary} mt-4`} disabled={busy || !submissionsOpen || ownTeam.member_count >= 4 || ownTeam.created_by !== me.id} onClick={()=>run(async()=>{const invite=await request(`/teams/${ownTeam.id}/invites`,'POST',{});setInviteLink(`${window.location.origin}${invite.invite_path}`);})}>Create team invite</button>{inviteLink&&<p className="mt-3 break-all text-xs text-indigo-700">{inviteLink}</p>}</>:<form className="mt-4 flex gap-2" onSubmit={e=>{e.preventDefault();run(()=>request(`/events/${eventId}/teams`,'POST',{name:new FormData(e.currentTarget).get('name')}));}}><input className={input} name="name" placeholder="Team name" required disabled={!submissionsOpen}/><button className={button} disabled={busy || !submissionsOpen}>Create team</button></form>}{!submissionsOpen&&<p className="mt-3 text-xs text-gray-500">Team changes are available while submissions are open.</p>}</section>
      <section className={panel}><h3 className="text-lg font-black">Project submission</h3>{!ownTeam?<p className="mt-2 text-sm text-gray-500">Create a team first.</p>:<form key={ownProject?.id || eventId} className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();const v=projectFormValues(e.currentTarget);run(async()=>{if(ownProject) await request(`/projects/${ownProject.id}`,'PATCH',v);else await request(`/events/${eventId}/projects`,'POST',{...v,team_id:ownTeam.id,submit:false});});}}>
        <input className={input} name="title" defaultValue={ownProject?.title || ''} placeholder="Project title" required/>
        <input className={input} name="tagline" defaultValue={ownProject?.tagline || ''} placeholder="One-line tagline" maxLength="160" />
        <select className={input} name="track_id" defaultValue={ownProject?.track_id || detail?.tracks?.[0]?.id}>{detail?.tracks?.map(track=><option value={track.id} key={track.id}>{track.name}</option>)}</select>
        <textarea className={input} name="summary" defaultValue={ownProject?.summary || ''} placeholder="Short summary" rows="2"/>
        <textarea className={input} name="description" defaultValue={ownProject?.description || ''} placeholder="Full project story: the problem, approach and what you built" rows="4"/>
        <div className="grid gap-3 sm:grid-cols-2"><input className={input} name="repo_url" defaultValue={ownProject?.repo_url || ''} placeholder="Repository URL" type="url"/><input className={input} name="live_url" defaultValue={ownProject?.live_url || ''} placeholder="Live project URL" type="url"/><input className={input} name="demo_url" defaultValue={ownProject?.demo_url || ''} placeholder="Demo video URL" type="url"/><input className={input} name="thumbnail_url" defaultValue={ownProject?.thumbnail_url || ''} placeholder="Thumbnail URL" type="url"/></div>
        <input className={input} name="tech_tags" defaultValue={ownProject?.tech_tags?.join(', ') || ''} placeholder="Tech tags, comma separated" />
        <textarea className={input} name="image_urls" defaultValue={ownProject?.image_urls?.join('\n') || ''} placeholder="Gallery image URLs, one per line (up to 8)" rows="2" />
        <div className="flex gap-2"><button className={secondary} disabled={busy || !submissionsOpen}>Save {ownProject?'changes':'draft'}</button>{ownProject?.status==='draft'&&<button className={button} type="button" disabled={busy || !submissionsOpen} onClick={click=>{const form=click.currentTarget.closest('form');if(!form.reportValidity())return;const values=projectFormValues(form);run(async()=>{await request(`/projects/${ownProject.id}`,'PATCH',values);await request(`/projects/${ownProject.id}/submit`,'POST',{});});}}>Submit project</button>}</div><p className="text-xs text-gray-500">{ownProject?.status || 'No draft yet'} · deadline {dateLabel(event?.submissions_close)}{!submissionsOpen&&' · submissions closed'}</p></form>}</section></div>}

    {role === 'jury' && <section className={panel}><h3 className="text-lg font-black">Assigned reviews</h3><p className="mb-4 text-sm text-gray-500">Only your assigned scores are available here.</p><div className="space-y-4">{reviews.map(review=><ReviewCard key={review.assignment_id} review={review} event={event} onSaved={loadEvent} />)}{!reviews.length&&<p className="text-sm text-gray-500">No assignments for this event yet.</p>}</div></section>}

    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black">Public project gallery</h3><p className="text-sm text-gray-500">Browse submissions without an account.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{submitted.length} projects</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><input className={input} value={gallerySearch} onChange={e=>setGallerySearch(e.target.value)} placeholder="Search projects" aria-label="Search projects"/><select className={input} value={galleryTrack} onChange={e=>setGalleryTrack(e.target.value)} aria-label="Filter by track"><option value="">All tracks</option>{detail?.tracks?.map(track=><option value={track.id} key={track.id}>{track.name}</option>)}</select></div>
      <div className="dogfood-gallery-grid mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{submitted.slice(0,galleryLimit).map(project=><article className="rounded-2xl border border-gray-100 bg-gray-50 p-4" key={project.id}>{project.thumbnail_url&&<img className="dogfood-gallery-thumb" src={project.thumbnail_url} alt="" loading="lazy" onError={event=>{event.currentTarget.hidden=true;}} />}<h4 className="font-black">{project.title}</h4>{project.tagline&&<strong className="mt-1 text-xs text-orange-700">{project.tagline}</strong>}<p className="mt-2 line-clamp-3 text-sm text-gray-500">{project.summary}</p>{project.tech_tags?.length>0&&<div className="mt-3 flex flex-wrap gap-1">{project.tech_tags.slice(0,4).map(tag=><span className="dogfood-tech-tag" key={tag}>{tag}</span>)}</div>}{project.duplicate_of&&<span className="mt-2 block text-xs font-bold text-orange-600">Duplicate flagged</span>}<div className="mt-3 flex flex-wrap gap-3">{project.repo_url&&<a className="text-xs font-bold text-indigo-600 hover:underline" href={project.repo_url} target="_blank" rel="noopener noreferrer">Repository ↗</a>}{project.live_url&&<a className="text-xs font-bold text-indigo-600 hover:underline" href={project.live_url} target="_blank" rel="noopener noreferrer">Live demo ↗</a>}</div><button className={`${secondary} mt-3 block`} onClick={()=>{setSelectedCommunityProject(project.id);setTimeout(()=>commentsRef.current?.scrollIntoView({behavior:'smooth',block:'center'}),60);}}>Comments</button></article>)}</div>
      {submitted.length > galleryLimit && <button type="button" className="dogfood-gallery-more" onClick={()=>setGalleryLimit(current=>current+6)}>Show more projects <span>{galleryLimit} of {submitted.length} shown ↘</span></button>}
    </section>
    <CommunityPanel event={event} selectedProject={projects.find(project => project.id === selectedCommunityProject && project.status === 'submitted')} canModerate={role === 'admin'} ownTeamId={ownTeam?.id} commentsRef={commentsRef} />
    <DogfoodAdvanced event={event} role={role} request={request} onImported={loadEvent} />
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
