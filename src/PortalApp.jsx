'use client';

import React, {useEffect, useState} from 'react';
import DogfoodWorkspace from './DogfoodWorkspace';
import LandingShowcase from './LandingShowcase';
import {motion, MotionConfig} from 'framer-motion';
import {ArrowUpRight, LogOut, Layers} from 'lucide-react';
import {ClaySkeleton} from './ClayUI';

const field = 'dogfood-input';
const button = 'dogfood-button';

async function api(path, body) {
  const response = await fetch(`/dogfood-api/${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? {} : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function PortalApp() {
  const [identity, setIdentity] = useState(null);
  const [role, setRole] = useState('contestant');
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const next = await api('me');
    setIdentity(next);
    return next;
  };
  useEffect(() => { refresh().catch(failure => setError(failure.message)); }, []);

  const authenticate = async (body, mode = register ? 'register' : 'login', preferredRole) => {
    setBusy(true); setError('');
    try {
      await api(mode, body);
      const next = await refresh();
      setRole(preferredRole || (next.user.is_admin || next.roles.some(item => item.role === 'organizer') ? 'admin' :
        next.roles.some(item => item.role === 'judge') ? 'jury' : 'contestant'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true); setError('');
    try { await api('logout', {}); await refresh(); setRole('contestant'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  return <MotionConfig reducedMotion="user"><div className={`clay-app${identity?.user ? ' clay-app--workspace' : ''}`} onInvalidCapture={event=>{event.preventDefault();event.target.setAttribute('aria-invalid','true');event.target.focus();setError(event.target.validationMessage);}} onInput={event=>{if(event.target.validity?.valid)event.target.removeAttribute('aria-invalid');}}>
    <a className="clay-skip" href="#workspace-main">Skip to content</a>
    <header className="clay-topbar">
      <a href="/" className="clay-brand"><span className="clay-brand-mark"><Layers size={21}/></span>DOGFOOD<span className="clay-year">2026</span></a>
      {identity?.user && <nav aria-label="Workspace" className="clay-role-tabs">
          {Object.entries({contestant:'Participate',jury:'Judge',admin:'Organize'}).map(([value,label]) =>
            <button key={value} aria-pressed={role === value} onClick={() => setRole(value)}>{role===value&&<motion.span layoutId="role-highlight" className="clay-role-highlight" transition={{type:'spring',stiffness:420,damping:36}}/>}<span>{label}</span></button>)}
        </nav>}
      <nav className="clay-account-nav" aria-label="Main navigation">
        {identity&&!identity.user&&<a href="#watch-demo" className="clay-watch-link">Watch the demo</a>}
        <a href="/projects" className="clay-gallery-link">Public gallery <ArrowUpRight size={15}/></a>
        {identity?.user && <><span data-testid="account-email">{identity.user.email}</span>
          <button className="clay-signout" onClick={logout} disabled={busy}><LogOut size={16}/><span>Sign out</span></button></>}
      </nav>
    </header>
    {error && <p role="alert" className="mx-auto my-4 max-w-3xl rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {!identity ? <main className="clay-boot"><ClaySkeleton label="Connecting to your portal"/></main> : !identity.user ?
      <main className="clay-landing" id="workspace-main"><div className="clay-auth-layout">
        <div className="clay-auth-story"><span className="clay-eyebrow">A LITTLE STRUCTURE. A LOT OF POSSIBILITY.</span><h2>Good ideas.<br/>Great company.</h2><p>A calmer space to build together, share your work, and discover what comes next.</p><img className="clay-landing-hero" src="/landing/build-together-clay.png" alt="A handmade clay laptop and interlocking blocks on a warm white tabletop" width="1536" height="1024" fetchPriority="high"/><span className="clay-auth-foot">THE DOGFOOD HACKATHON · 2026</span></div>
        <motion.div className="clay-auth-card" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.35}}>
        <p className="clay-eyebrow">YOUR WORKSPACE IS WAITING</p>
        <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mb-6 clay-muted">One account for your teams, events, and judging invitations.</p>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault(); authenticate(Object.fromEntries(new FormData(event.currentTarget)));
        }}>
          {register && <label className="grid gap-1">Name<input className={field} name="name" required minLength={2} autoComplete="name" /></label>}
          <label className="grid gap-1">Email<input className={field} name="email" type="email" required autoComplete="email" /></label>
          <label className="grid gap-1">Password<input className={field} name="password" type="password" required minLength={register ? 10 : undefined} autoComplete={register ? 'new-password' : 'current-password'} /></label>
          <button className={button} disabled={busy} aria-busy={busy}>{busy&&<span className="clay-spinner"/>}{register ? 'Create account' : 'Sign in'}<ArrowUpRight size={16}/></button>
        </form>
        <button className="mt-4 font-bold underline" onClick={() => {setRegister(!register); setError('');}}>
          {register ? 'Already registered? Sign in' : 'New here? Create an account'}
        </button>
        {identity.demo_mode && <section className="clay-demo-accounts">
          <h2 className="font-bold">Try a demo account</h2>
          <p className="my-2 text-sm">These accounts share the local sample events. Choose one explicitly to explore.</p>
          <div className="flex flex-wrap gap-2">{[['Organizer','organizer@demo.local','admin'],['Judge','marek.nowak@example.org','jury'],['Participant','participant@demo.local','contestant']].map(([label,email,workspace]) =>
            <button key={email} className={`dogfood-secondary clay-demo-${workspace}`} disabled={busy} onClick={() => authenticate({email,password:'dogfood-demo-2026'},'login',workspace)}>{label}</button>)}</div>
        </section>}
        </motion.div></div><LandingShowcase/></main> : <main className="clay-workspace-root">
        <DogfoodWorkspace key={`${identity.user.id}:${role}`} role={role} />
      </main>}
  </div></MotionConfig>;
}
