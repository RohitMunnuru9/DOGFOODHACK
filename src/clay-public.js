/* Progressive enhancement: forms and filters still work without JavaScript. */
document.querySelectorAll('select').forEach((select, index) => {
  const wrapper=document.createElement('div');wrapper.className='clay-public-select';
  const button=document.createElement('button');button.type='button';button.setAttribute('role','combobox');button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-label',select.getAttribute('aria-label') || (select.name==='track'?'Filter by track':select.name));
  const text=document.createElement('span'),chevron=document.createElement('span');chevron.textContent='⌄';button.append(text,chevron);
  const list=document.createElement('div');list.className='clay-public-options';list.id=`public-options-${index}`;list.setAttribute('role','listbox');list.hidden=true;document.body.append(list);
  select.before(wrapper);wrapper.append(button,select);select.hidden=true;select.tabIndex=-1;
  let active=select.selectedIndex,open=false,typed='',timer;
  const refresh=()=>{text.textContent=select.selectedOptions[0]?.textContent || 'Choose an option';button.disabled=select.disabled;};
  const close=()=>{open=false;list.hidden=true;button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');};
  const render=()=>{list.replaceChildren();[...select.options].forEach((option,i)=>{const row=document.createElement('div');row.id=`public-option-${index}-${i}`;row.setAttribute('role','option');row.setAttribute('aria-selected',String(option.selected));row.className=i===active?'active':'';row.textContent=option.textContent;row.addEventListener('mousedown',e=>e.preventDefault());row.addEventListener('click',()=>pick(i));list.append(row);});button.setAttribute('aria-activedescendant',`public-option-${index}-${active}`);list.children[active]?.scrollIntoView({block:'nearest'});};
  const show=()=>{open=true;list.hidden=false;button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',list.id);const r=button.getBoundingClientRect();const width=Math.min(Math.max(r.width,220),innerWidth-24);list.style.width=`${width}px`;list.style.left=`${Math.max(12,Math.min(r.left,innerWidth-width-12))}px`;list.style.top=`${Math.min(r.bottom+8,Math.max(12,innerHeight-280))}px`;render();};
  const pick=i=>{if(!select.options[i] || select.options[i].disabled)return;select.selectedIndex=i;refresh();close();select.dispatchEvent(new Event('change',{bubbles:true}));};
  button.addEventListener('click',()=>open?close():show());
  button.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();active=e.key==='Home'?0:e.key==='End'?select.options.length-1:Math.max(0,Math.min(select.options.length-1,active+(e.key==='ArrowDown'?1:-1)));show();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(open)pick(active);else show();}else if(e.key==='Escape'||e.key==='Tab')close();else if(e.key.length===1){typed+=e.key.toLowerCase();clearTimeout(timer);timer=setTimeout(()=>typed='',600);const found=[...select.options].findIndex(o=>o.textContent.toLowerCase().startsWith(typed));if(found>=0){active=found;show();}}});
  document.addEventListener('pointerdown',e=>{if(!wrapper.contains(e.target)&&!list.contains(e.target))close();});button.addEventListener('blur',close);window.addEventListener('resize',close);window.addEventListener('scroll',close);select.addEventListener('change',refresh);refresh();
});
const loading=document.createElement('div');loading.className='clay-public-loading';document.body.append(loading);
document.addEventListener('click',event=>{const a=event.target.closest('a');if(a&&a.origin===location.origin&&!a.target&&!a.hash)loading.classList.add('active');});
window.addEventListener('pageshow',()=>loading.classList.remove('active'));
document.addEventListener('invalid',event=>{
  event.preventDefault();
  const field=event.target;
  field.setAttribute('aria-invalid','true');
  let message=document.getElementById('message') || field.form?.querySelector('.clay-validation');
  if(!message && field.form){message=document.createElement('p');message.className='flash error clay-validation';field.form.prepend(message);}
  if(message){message.setAttribute('role','alert');message.textContent=field.validationMessage;}
  (field.form?.querySelector(':invalid') || field).focus();
},true);
document.addEventListener('input',event=>{if(event.target.validity?.valid)event.target.removeAttribute('aria-invalid');});
