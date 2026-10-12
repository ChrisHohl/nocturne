import { createTaskStore } from './task-store.js';
export function startTasks(user,{db,sdk}) {
const $=id=>document.getElementById(id), store=createTaskStore(db,sdk,user.uid);
let tasks=[],active=true,ready=false,filter='all',pending=0,fromCache=true,importing=false;
const pendingIds=new Set(), localKey='nocturne-todos-v2:'+user.uid, importKey='nocturne-cloud-imported:'+user.uid, legacyKey='nocturne-todos-v1';
let sources=[];
function readLocal(key) { try { const saved=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(saved)?saved.filter(t=>t&&typeof t.id==='string'&&typeof t.text==='string'&&t.text.trim()&&t.text.length<=240&&typeof t.done==='boolean').map(t=>({...t,category:t.category==='Work'?'Work':'Personal',source:key})):[];}catch{return [];} }
try {if(!localStorage.getItem(importKey))sources.push(...readLocal(localKey));if(!localStorage.getItem('nocturne-legacy-imported'))sources.push(...readLocal(legacyKey));}catch{}
$('date').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
function syncStatus(){if(active)$('sync-status').textContent=!ready?'Connecting to your saved tasks…':pending?'Saving changes… Keep this tab open until synced.':fromCache?'Offline — reconnect to sync your tasks.':'Synced to your account';}
function controls() {
$('input').disabled=!ready;$('category').disabled=!ready;$('form').querySelector('button').disabled=!ready;$('clear').disabled=!ready||pending>0;
$('import-tasks').hidden=!sources.length;$('import-tasks').disabled=!ready||importing||fromCache;
$('import-tasks').textContent='Import '+sources.length+' saved task'+(sources.length===1?'':'s')+' from this device';
}
function render(){
if(!active)return;
const complete=tasks.filter(t=>t.done).length,remaining=tasks.length-complete,visible=tasks.filter(t=>filter==='all'||(filter==='done'?t.done:!t.done));
$('list').replaceChildren();
for(const t of visible){
const row=document.createElement('div');row.className='task'+(t.done?' done':'');
const check=document.createElement('input');check.type='checkbox';check.className='check';check.checked=t.done;check.disabled=!ready||pendingIds.has(t.id);
check.setAttribute('aria-label','Mark '+t.text+' '+(t.done?'active':'complete'));check.onchange=()=>mutate(()=>store.toggle(t.id,check.checked),t.id);
const content=document.createElement('div');content.className='tasktext';
const title=document.createElement('div');title.className='title';title.textContent=t.text;
const pill=document.createElement('span');pill.className='pill';pill.textContent=t.category;content.append(title,pill);
const del=document.createElement('button');del.className='delete';del.textContent='×';del.disabled=check.disabled;del.setAttribute('aria-label','Delete '+t.text);del.onclick=()=>mutate(()=>store.remove(t.id),t.id);
row.append(check,content,del);$('list').append(row);
}
if(!visible.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=!ready?'Loading your tasks…':filter==='done'?'Your completed tasks will appear here.':filter==='active'?'All clear. Enjoy a little breathing room.':'A fresh start. Add your first task above.';$('list').append(empty);}
$('count').textContent=tasks.length+' total';$('remaining').textContent=remaining+' task'+(remaining===1?'':'s')+' remaining';
const percent=tasks.length?Math.round(complete/tasks.length*100):0;$('percent').textContent=percent;$('progress').style.width=percent+'%';
$('progressText').textContent=tasks.length?complete+' of '+tasks.length+' tasks complete. '+(remaining?'Small steps. Steady progress.':'Everything done. Take a breath.'):'Your next small step starts here.';
$('clear').hidden=!complete;controls();
}
async function mutate(action,id){
if(!active||!ready||(id&&pendingIds.has(id)))return false;
pending++;if(id)pendingIds.add(id);$('status').textContent='';syncStatus();render();
try{await action();return true;}catch(error){if(active)$('status').textContent=error.code==='permission-denied'?'Your session cannot save these tasks. Sign out and sign in again.':'Couldn’t save the change. Check your connection and try again.';return false;}
finally{pending--;if(id)pendingIds.delete(id);if(active){syncStatus();render();}}
}
function setFilter(){document.querySelectorAll('[data-filter]').forEach(b=>{const selected=b.dataset.filter===filter;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);});}
setFilter();document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{if(active){filter=b.dataset.filter;setFilter();render();}});
$('form').onsubmit=e=>{e.preventDefault();if(!active||!ready)return;const text=$('input').value.trim();if(!text)return;const task={id:crypto.randomUUID(),text,category:$('category').value};$('input').value='';filter='all';setFilter();mutate(()=>store.add(task),task.id).then(ok=>{if(active&&!ok&&!$('input').value)$('input').value=text;});$('input').focus();};
$('clear').onclick=()=>{if(active&&pending===0)mutate(()=>store.clear(tasks.filter(t=>t.done).map(t=>t.id)));};
$('import-tasks').onclick=async()=>{
if(!active||!ready||fromCache||importing||!sources.length)return;importing=true;controls();const copy=sources.slice();
const ok=await mutate(async()=>{
const items=await Promise.all(copy.map(async t=>{const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t.source+':'+t.id));return {id:'import-'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),text:t.text,category:t.category,done:t.done};}));
if(!active)throw new Error('Session changed');await store.importTasks(items);
});
if(ok){try{localStorage.setItem(importKey,'true');if(copy.some(t=>t.source===legacyKey))localStorage.setItem('nocturne-legacy-imported',user.uid);}catch{}if(active){sources=[];$('status').textContent='Saved tasks imported to your account.';}}
importing=false;if(active)render();
};
syncStatus();render();
const unsubscribe=store.listen((items,metadata)=>{if(!active)return;tasks=items;fromCache=metadata.fromCache;if(!fromCache)ready=true;syncStatus();render();},error=>{if(!active)return;ready=false;$('sync-status').textContent='Cloud sync unavailable';$('status').textContent=error.code==='permission-denied'?'Please sign in again to access your saved tasks.':'Couldn’t load your tasks. Check your connection and refresh.';render();});
return ()=>{active=false;unsubscribe();tasks=[];sources=[];pendingIds.clear();$('list').replaceChildren();$('input').value='';$('status').textContent='';$('sync-status').textContent='';$('form').onsubmit=null;$('clear').onclick=null;$('import-tasks').onclick=null;$('import-tasks').hidden=true;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=null);};
}

