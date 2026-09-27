"use client";

import React, { useEffect, useState } from 'react';

const panel = 'dogfood-panel rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm';
const input = 'dogfood-input w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none';
const button = 'dogfood-button rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50';
const secondary = 'dogfood-secondary rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 disabled:opacity-50';

export default function DogfoodAdvanced({event, role, request, onImported}) {
  const [records, setRecords] = useState([]);
  const [hooks, setHooks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [file, setFile] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const eventId = event?.id;

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const refresh = async () => {
    if (!eventId) return;
    const recordPath = role === 'admin' ? 'records' : 'my-records';
    const recordResponse = await request(`/events/${eventId}/${recordPath}`);
    setRecords(recordResponse.records);
    if (role === 'admin') {
      const [webhookResponse, deliveryResponse] = await Promise.all([
        request(`/events/${eventId}/webhooks`),
        request(`/events/${eventId}/webhooks/deliveries`),
      ]);
      setHooks(webhookResponse.webhooks);
      setDeliveries(deliveryResponse.deliveries);
    }
  };

  useEffect(() => {
    let active = true;
    if (!eventId) return undefined;
    refresh().catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [eventId, role, event?.published_at]);

  const act = async (action, message) => {
    setBusy(true);
    setNotice('');
    try {
      const result = await action();
      await refresh();
      setNotice(typeof message === 'function' ? message(result) : message);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  if (!eventId) return null;
  const embedCode = `<iframe src="${origin}/embed/events/${encodeURIComponent(eventId)}" title="${event.name.replaceAll('"', '&quot;')} projects" width="100%" height="520" loading="lazy" style="border:0;border-radius:16px"></iframe>`;
  const recordUrl = record => `/certificates/${record.id}?sig=${record.signature}`;

  return <div className="space-y-5">
    {records.length > 0 && <section className={panel}>
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-lg font-black">Verified records</h3><span className="text-xs font-bold text-gray-500">{records.length} issued</span></div>
      <p className="mt-1 text-sm text-gray-500">Records are signed when results are published. Anyone with the link can verify one on this portal.</p>
      <div className="mt-4 grid max-h-96 gap-2 overflow-auto md:grid-cols-2">{records.map(record => <a className="dogfood-record-link" key={record.id} href={recordUrl(record)} target="_blank" rel="noopener noreferrer">
        <span>{record.kind === 'judge' ? 'JUDGE RECORD' : 'PROJECT CERTIFICATE'}</span>
        <strong>{record.payload.judge_name || record.payload.project_title}</strong>
        <small>View verified document ↗</small>
      </a>)}</div>
    </section>}
    {role === 'admin' && <>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={panel}>
          <h3 className="text-lg font-black">Move your data</h3>
          <p className="mt-1 text-sm text-gray-500">Download an event archive or import tracks, prizes, teams and projects from JSON. Existing accounts regain matching team memberships.</p>
          <div className="mt-4 flex flex-wrap gap-2"><a className={button} href={`/dogfood-api/events/${eventId}/export.json`}>Export event JSON ↓</a><a className={secondary} href={`/dogfood-api/events/${eventId}/export.csv`}>Results CSV ↓</a></div>
          <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); if (!file) return; act(async () => {
            const payload = JSON.parse(await file.text());
            const result = await request(`/events/${eventId}/import.json`, 'POST', payload);
            await onImported();
            return result;
          }, result => `Imported ${result.teams_created} teams, ${result.projects_created} projects, ${result.tracks_created} tracks and ${result.prizes_created} prizes. ${result.members_added} members restored${result.members_skipped ? `; ${result.members_skipped} accounts were unavailable` : ''}.`); }}>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">Import JSON file<input className={`${input} mt-2`} type="file" accept=".json,application/json" onChange={event=>setFile(event.target.files?.[0] || null)} /></label>
            <button className={secondary} disabled={!file || busy || !!event.published_at}>Import event data</button>
            {event.published_at && <p className="text-xs text-gray-500">Published events are frozen; import into a new event.</p>}
          </form>
        </section>
        <section className={panel}>
          <h3 className="text-lg font-black">Embed the gallery</h3>
          <p className="mt-1 text-sm text-gray-500">The public widget shows submitted projects and runs without sign-in.</p>
          <textarea className={`${input} mt-4 font-mono text-xs`} readOnly rows="4" value={embedCode} aria-label="Gallery embed code" onFocus={event=>event.target.select()} />
          <div className="mt-3 flex flex-wrap gap-2"><button className={secondary} onClick={()=>act(()=>navigator.clipboard.writeText(embedCode), 'Embed code copied.')}>Copy embed code</button><a className={secondary} href={`/embed/events/${eventId}`} target="_blank" rel="noopener noreferrer">Preview widget ↗</a></div>
          <a className="mt-4 inline-block text-xs font-bold text-indigo-700 underline" href="/dogfood-api/openapi.json" target="_blank" rel="noopener noreferrer">Read REST API specification ↗</a>
        </section>
      </div>
      <section className={panel}>
        <h3 className="text-lg font-black">Webhooks</h3>
        <p className="mt-1 text-sm text-gray-500">Deliver signed JSON event activity to an HTTPS endpoint, or a loopback URL for local testing. The signing secret appears once.</p>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();act(async()=>{
          const created = await request(`/events/${eventId}/webhooks`, 'POST', {url:webhookUrl});
          setNewSecret(created.secret);setWebhookUrl('');
        },'Webhook created.');}}>
          <input className={`${input} min-w-[260px] flex-1`} type="url" value={webhookUrl} onChange={event=>setWebhookUrl(event.target.value)} placeholder="https://example.org/webhook" required />
          <button className={button} disabled={busy}>Add webhook</button>
        </form>
        {newSecret && <p className="mt-3 break-all rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Copy this signing secret now: <code>{newSecret}</code></p>}
        <div className="mt-4 space-y-2">{hooks.map(hook=><div className="dogfood-activity-row" key={hook.id}><div><strong>{hook.url}</strong><span>{hook.active ? 'Active' : 'Paused'}</span></div><button className={secondary} disabled={busy} onClick={()=>act(()=>request(`/events/${eventId}/webhooks/${hook.id}`,'PATCH',{active:!hook.active}), hook.active?'Webhook paused.':'Webhook enabled.')}>{hook.active?'Pause':'Enable'}</button></div>)}{!hooks.length&&<p className="text-sm text-gray-500">No webhooks configured.</p>}</div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">Delivery log</h4><button className={secondary} disabled={busy || !deliveries.some(item=>!item.delivered_at)} onClick={()=>act(()=>request(`/events/${eventId}/webhooks/deliveries/retry`,'POST',{}),'Queued deliveries retried.')}>Retry pending</button></div>
        <div className="mt-3 max-h-52 space-y-2 overflow-auto">{deliveries.slice(0,20).map(item=><div className="dogfood-activity-row" key={item.id}><div><strong>{item.action.replaceAll('_',' ')}</strong><span>{item.delivered_at ? 'Delivered' : item.last_error || 'Pending'} · {item.attempts} attempts</span></div></div>)}{!deliveries.length&&<p className="text-sm text-gray-500">No deliveries yet.</p>}</div>
      </section>
    </>}
    {notice && <p className="rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-800" role="status">{notice}</p>}
  </div>;
}
