'use client';

import React, {useEffect, useState} from 'react';
import DogfoodWorkspace from './DogfoodWorkspace';

const field = 'rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900';
const button = 'rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-50';

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

  return <div className="min-h-screen bg-[#f5f2e9] text-[#17342d]">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d8dfd1] px-6 py-5">
      <a href="/" className="text-2xl font-black tracking-tight">DOGFOOD / 2026</a>
      <nav className="flex flex-wrap items-center gap-4" aria-label="Main navigation">
        <a href="/projects" className="font-bold">Public gallery</a>
        {identity?.user && <><span data-testid="account-email">{identity.user.email}</span>
          <button className={button} onClick={logout} disabled={busy}>Sign out</button></>}
      </nav>
    </header>
    {error && <p role="alert" className="mx-auto my-4 max-w-3xl rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {!identity ? <p role="status" className="p-8">Connecting to your portal…</p> : !identity.user ?
      <main className="mx-auto max-w-lg px-6 py-12">
        <p className="text-sm font-bold uppercase tracking-widest">Build. Submit. Judge.</p>
        <h1 className="my-4 text-4xl font-black">{register ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mb-6">One account for your teams, events, and judging invitations.</p>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault(); authenticate(Object.fromEntries(new FormData(event.currentTarget)));
        }}>
          {register && <label className="grid gap-1">Name<input className={field} name="name" required minLength={2} autoComplete="name" /></label>}
          <label className="grid gap-1">Email<input className={field} name="email" type="email" required autoComplete="email" /></label>
          <label className="grid gap-1">Password<input className={field} name="password" type="password" required minLength={register ? 10 : undefined} autoComplete={register ? 'new-password' : 'current-password'} /></label>
          <button className={button} disabled={busy}>{register ? 'Create account' : 'Sign in'}</button>
        </form>
        <button className="mt-4 font-bold underline" onClick={() => {setRegister(!register); setError('');}}>
          {register ? 'Already registered? Sign in' : 'New here? Create an account'}
        </button>
        {identity.demo_mode && <section className="mt-8 rounded-2xl border border-[#d8dfd1] p-5">
          <h2 className="font-bold">Try a demo account</h2>
          <p className="my-2 text-sm">These accounts share the local sample events. Choose one explicitly to explore.</p>
          <div className="flex flex-wrap gap-2">{[['Organizer','organizer@demo.local','admin'],['Judge','marek.nowak@example.org','jury'],['Participant','participant@demo.local','contestant']].map(([label,email,workspace]) =>
            <button key={email} className={button} disabled={busy} onClick={() => authenticate({email,password:'dogfood-demo-2026'},'login',workspace)}>{label}</button>)}</div>
        </section>}
      </main> : <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <nav aria-label="Workspace" className="mb-6 flex flex-wrap gap-3">
          {Object.entries({contestant:'Participate',jury:'Judge',admin:'Organize'}).map(([value,label]) =>
            <button key={value} aria-pressed={role === value} className={`${button} ${role === value ? '' : 'bg-gray-600'}`} onClick={() => setRole(value)}>{label}</button>)}
        </nav>
        <DogfoodWorkspace key={`${identity.user.id}:${role}`} role={role} />
      </main>}
  </div>;
}
