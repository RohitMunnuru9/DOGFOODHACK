'use client';

import React, {Children, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {Check, ChevronDown, ChevronLeft, ChevronRight, CalendarDays, Upload, Plus, Minus} from 'lucide-react';

export function ClayPopover({open, anchor, onClose, children, className='', ...props}) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, className.includes('calendar') ? 310 : 220), innerWidth-24);
      const below = innerHeight-rect.bottom-18;
      const above = rect.top-18;
      const height = Math.min(className.includes('calendar') ? 430 : 320, Math.max(below, above));
      setPosition({left:Math.max(12, Math.min(rect.left, innerWidth-width-12)), width,
        maxHeight:Math.max(160,height), ...(below >= height || below >= above ? {top:rect.bottom+8} : {bottom:innerHeight-rect.top+8})});
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const outside = e => {if(className.includes('calendar') && e.target.closest('.clay-popover'))return;if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose();};
    const keys = e => {if (e.key === 'Escape') {e.preventDefault(); onClose(); anchor.current?.focus();}};
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', keys);
    return () => {window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',keys);};
  }, [open, anchor, onClose, className]);
  if (typeof document === 'undefined') return null;
  return createPortal(<AnimatePresence>{open && position && <motion.div ref={ref} className={`clay-popover ${className}`} style={position}
    initial={{opacity:0,y:reduced?0:5,scale:reduced?1:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:3}} transition={{duration:reduced?0:.18}}
    {...props}>{children}</motion.div>}</AnimatePresence>, document.body);
}

export function ClaySelect({children, value, defaultValue, onChange, name, multiple=false, disabled=false, className='', required, ...props}) {
  const options = Children.toArray(children).filter(React.isValidElement).map(child=>({value:String(child.props.value ?? child.props.children),label:child.props.children,disabled:child.props.disabled}));
  const [local, setLocal] = useState(defaultValue ?? (multiple ? [] : options[0]?.value ?? ''));
  const current = value === undefined ? local : value;
  const chosen = multiple ? (Array.isArray(current) ? current : []) : [String(current ?? '')];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const anchor = useRef(null);
  const id = useId();
  const typeahead = useRef('');
  const timer = useRef(null);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{if(disabled) setOpen(false);},[disabled]);
  useEffect(()=>{
    if (value === undefined && !multiple && !options.some(o=>o.value === String(local))) setLocal(options[0]?.value ?? '');
  },[children, value, multiple, local]);
  useEffect(()=>{if(open) document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'});},[open,active,id]);
  const close = () => setOpen(false);
  const pick = index => {
    const option=options[index]; if (!option || option.disabled) return;
    const next=multiple ? (chosen.includes(option.value) ? chosen.filter(v=>v!==option.value) : [...chosen,option.value]) : option.value;
    setLocal(next); onChange?.({target:{value:next,name},currentTarget:{value:next,name}});
    if(!multiple) setOpen(false);
    anchor.current?.focus();
  };
  const label = multiple ? (chosen.length ? options.filter(o=>chosen.includes(o.value)).map(o=>o.label).join(', ') : 'All tracks') : options.find(o=>o.value===String(current))?.label || 'Choose an option';
  return <span className="clay-select-wrap">
    {name && (multiple ? chosen : [current ?? '']).map((v,i)=><input key={i} type="hidden" name={name} value={v} disabled={disabled}/>)}
    <button {...props} ref={anchor} type="button" role="combobox" data-value={multiple?chosen.join(','):current} aria-expanded={open} aria-controls={open?id:undefined} aria-haspopup="listbox" aria-required={required || undefined}
      aria-label={props['aria-label'] || (name ? name.replaceAll('_',' ') : undefined)} aria-activedescendant={open?`${id}-${active}`:undefined}
      className={`${className} clay-select`} disabled={disabled || !options.length} onClick={()=>{setActive(Math.max(0,options.findIndex(o=>chosen.includes(o.value))));setOpen(!open);}}
      onBlur={e=>{if(!e.relatedTarget?.closest('.clay-popover')) setOpen(false);}}
      onKeyDown={e=>{
        if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
          e.preventDefault();setOpen(true);
          const delta=e.key==='ArrowUp'?-1:1;
          setActive(i=>e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,open?i+delta:options.findIndex(o=>chosen.includes(o.value)))));
        } else if(e.key==='Enter' || e.key===' ') {e.preventDefault();if(open) pick(active);else setOpen(true);}
        else if(e.key==='Escape') {e.preventDefault();setOpen(false);}
        else if(e.key==='Tab') setOpen(false);
        else if(e.key.length===1) {typeahead.current+=e.key.toLowerCase();clearTimeout(timer.current);timer.current=setTimeout(()=>typeahead.current='',600);const i=options.findIndex(o=>String(o.label).toLowerCase().startsWith(typeahead.current));if(i>=0){setActive(i);setOpen(true);}}
      }}><span>{label}</span><ChevronDown size={16} className={open?'is-open':''}/></button>
    <ClayPopover open={open} anchor={anchor} onClose={close} role="listbox" id={id} aria-label={`${props['aria-label'] || name || 'Select'} options`} aria-multiselectable={multiple || undefined}>
      {multiple && <div className="clay-option-note">Select tracks · none means all</div>}
      {options.map((option,index)=><div role="option" id={`${id}-${index}`} data-value={option.value} key={option.value} aria-selected={chosen.includes(option.value)} aria-disabled={option.disabled || undefined}
        className={`clay-option ${index===active?'is-active':''}`} onPointerMove={()=>setActive(index)} onMouseDown={e=>e.preventDefault()} onClick={()=>pick(index)}>
        <span>{option.label}</span>{chosen.includes(option.value)&&<Check size={15}/>}</div>)}
    </ClayPopover>
  </span>;
}

const stamp = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const validLocalDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date=new Date(value);
  return !Number.isNaN(date.getTime()) && `${stamp(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}` === value;
};
export function ClayDateTime({value, defaultValue='', onChange, className='', ...props}) {
  const [local,setLocal]=useState(defaultValue);
  const current=value ?? local;
  const [open,setOpen]=useState(false);
  const [month,setMonth]=useState(()=>new Date(defaultValue || Date.now()));
  const anchor=useRef(null);
  const field=useRef(null);
  const grid=useRef(null);
  const id=useId();
  useEffect(()=>{if(!open)return;const timer=setTimeout(()=>{const dialog=document.getElementById(id);(dialog?.querySelector('button[aria-pressed="true"]') || dialog?.querySelector('.clay-calendar-grid button'))?.focus();},40);return()=>clearTimeout(timer);},[open,id]);
  const change=next=>{setLocal(next);onChange?.({target:{value:next,name:props.name}});};
  const valid=validLocalDate(current);
  useEffect(()=>{field.current?.setCustomValidity(current && !valid ? 'Enter a valid local date and time.' : '');},[current,valid]);
  const selected=valid?new Date(current):new Date();
  const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const offset=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;
  const pick=day=>change(`${stamp(new Date(month.getFullYear(),month.getMonth(),day))}T${valid?current.slice(11):'09:00'}`);
  return <span className="clay-date-wrap">
    <input {...props} ref={field} className={`${className} clay-date-input`} type="text" inputMode="text" value={current} placeholder="YYYY-MM-DDTHH:mm"
      pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}" onChange={e=>change(e.target.value)}/>
    <button ref={anchor} type="button" className="clay-calendar-trigger" aria-label={`Open ${props.name?.replaceAll('_',' ') || 'date'} calendar`} aria-expanded={open} aria-controls={open?id:undefined} disabled={props.disabled}
      onClick={()=>{if(!open)setMonth(new Date(selected.getFullYear(),selected.getMonth(),1));setOpen(!open);}}><CalendarDays size={18}/></button>
    <ClayPopover open={open} anchor={anchor} onClose={()=>setOpen(false)} className="clay-calendar" role="dialog" aria-label="Choose date and time" id={id}>
      <div className="clay-calendar-header"><button type="button" aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={18}/></button><strong aria-live="polite">{month.toLocaleDateString('en',{month:'long',year:'numeric'})}</strong><button type="button" aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={18}/></button></div>
      <div className="clay-calendar-grid" ref={grid} onKeyDown={e=>{const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(delta){e.preventDefault();const cells=[...grid.current.querySelectorAll('button')];cells[Math.max(0,Math.min(cells.length-1,cells.indexOf(document.activeElement)+delta))]?.focus();}}}>
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=><span key={d}>{d}</span>)}
        {Array.from({length:offset},(_,i)=><i key={`space${i}`}/>)}
        {Array.from({length:days},(_,i)=>{const day=i+1;const date=stamp(new Date(month.getFullYear(),month.getMonth(),day));return <button key={day} type="button" aria-label={date} aria-pressed={current.slice(0,10)===date} className={date===stamp(new Date())?'is-today':''} onClick={()=>pick(day)}>{day}</button>;})}
      </div>
      <div className="clay-calendar-time"><span>Local time</span><ClaySelect aria-label="Hour" value={valid?current.slice(11,13):'09'} onChange={e=>change(`${valid?current.slice(0,10):stamp(selected)}T${e.target.value}:${valid?current.slice(14):'00'}`)}>{Array.from({length:24},(_,i)=><option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}</option>)}</ClaySelect><b>:</b><ClaySelect aria-label="Minute" value={valid?current.slice(14):'00'} onChange={e=>change(`${valid?current.slice(0,10):stamp(selected)}T${valid?current.slice(11,13):'09'}:${e.target.value}`)}>{Array.from({length:60},(_,i)=><option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}</option>)}</ClaySelect></div>
      <div className="clay-calendar-footer"><button type="button" onClick={()=>{const d=new Date();setMonth(d);change(`${stamp(d)}T09:00`);}}>Today</button>{!props.required&&<button type="button" onClick={()=>change('')}>Clear</button>}<button type="button" className="clay-small-primary" onClick={()=>{setOpen(false);anchor.current?.focus();}}>Done</button></div>
    </ClayPopover>
  </span>;
}

export function ClayNumber({value,defaultValue='',onChange,className='',...props}) {
  const [local,setLocal]=useState(defaultValue);
  const current=value ?? local;
  const change=v=>{setLocal(v);onChange?.({target:{value:String(v),name:props.name}});};
  const step=direction=>{const next=Number((Number(current || 0)+direction*Number(props.step || 1)).toFixed(4));change(Math.max(Number(props.min ?? -Infinity),Math.min(Number(props.max ?? Infinity),next)));};
  return <span className="clay-number"><input {...props} type="number" className={className} value={current} onChange={e=>change(e.target.value)}/><span className="clay-stepper"><button type="button" aria-label={`Increase ${props.name || props['aria-label'] || 'value'}`} disabled={props.disabled || (props.max!==undefined&&Number(current)>=Number(props.max))} onClick={()=>step(1)}><Plus size={12}/></button><button type="button" aria-label={`Decrease ${props.name || props['aria-label'] || 'value'}`} disabled={props.disabled || (props.min!==undefined&&Number(current)<=Number(props.min))} onClick={()=>step(-1)}><Minus size={12}/></button></span></span>;
}

export function ClayUpload({onChange, label='Import JSON file', ...props}) {
  const [filename,setFilename]=useState('Choose a JSON archive');
  return <label className="clay-upload"><Upload size={22}/><span><strong>{label}</strong><small>{filename}</small></span><input {...props} type="file" aria-label={label} onChange={e=>{setFilename(e.target.files?.[0]?.name || 'Choose a JSON archive');onChange?.(e);}}/></label>;
}

export function ClayProgress({value=0,label='Progress'}) {
  const reduced=useReducedMotion();
  const safe=Math.max(0,Math.min(100,Number(value)||0));
  return <div className="clay-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safe)}><motion.span initial={{scaleX:0}} animate={{scaleX:safe/100}} transition={{duration:reduced?0:.8,ease:[.22,1,.36,1]}}/></div>;
}

export function ClaySkeleton({label='Loading workspace'}) {
  return <div className="clay-skeleton" role="status" aria-label={label}><span className="sr-only">{label}</span><div className="clay-skeleton-title"/><div className="clay-skeleton-metrics"/>{Array.from({length:4},(_,i)=><div className="clay-skeleton-row" key={i}/>)}</div>;
}

export function useClayMotion(ref) {
  const reduced=useReducedMotion();
  useEffect(()=>{
    const root=ref.current;if(!root || reduced || !matchMedia('(pointer:fine)').matches) return;
    let card,frame;
    const reset=()=>{if(card){card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y');card=null;}};
    const move=e=>{const target=e.target.closest('[data-tilt]');if(target!==card){reset();card=target;}if(!card)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!card)return;const r=card.getBoundingClientRect();card.style.setProperty('--tilt-x',`${-(e.clientY-r.top-r.height/2)/r.height*2}deg`);card.style.setProperty('--tilt-y',`${(e.clientX-r.left-r.width/2)/r.width*2}deg`);});};
    root.addEventListener('pointermove',move);root.addEventListener('pointerleave',reset);
    return()=>{cancelAnimationFrame(frame);reset();root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',reset);};
  });
}
