const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto;
class Element {
  constructor(){this.value='';this.children=[];this.style={};this.dataset={};this.classList={toggle(){}};this.button={};}
  append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(){}focus(){}querySelector(){return this.button;}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
let next,error,stopped=false,writes=0,rejectWrite=false,imports=[];
const store={listen:(onNext,onError)=>{next=onNext;error=onError;return()=>stopped=true;},add:async()=>{writes++;if(rejectWrite)throw new Error('network');},toggle:async()=>{},remove:async()=>{},clear:async()=>{},importTasks:async items=>imports=items};
const cache=new Map([['nocturne-todos-v2:alice',JSON.stringify([{id:'local',text:'Saved task',category:'Work',done:false}])]]);
const context=vm.createContext({createTaskStore:()=>store,document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>new Element()},localStorage:{getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)},crypto,TextEncoder,Date,Uint8Array,console});
const code=fs.readFileSync(require('node:path').join(__dirname,'../tasks.js'),'utf8').replace(/^import .*;\n/,'').replace('export function','function');vm.runInContext(code,context);
(async()=>{
  const dispose=context.startTasks({uid:'alice'},{db:{},sdk:{}});
  get('category').value='Personal';get('input').value='Before loading';get('form').onsubmit({preventDefault(){}});assert.equal(writes,0);assert.equal(get('input').disabled,true);
  next([],{fromCache:true});assert.equal(get('input').disabled,true);
  next([],{fromCache:false});assert.equal(get('input').disabled,false);assert.match(get('sync-status').textContent,/Synced/);
  get('input').value='New task';get('form').onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(writes,1);
  rejectWrite=true;get('input').value='Failed task';get('form').onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(get('input').value,'Failed task');assert.match(get('status').textContent,/Couldn’t save/);
  await get('import-tasks').onclick();assert.equal(imports.length,1);assert.equal(imports[0].text,'Saved task');assert.equal(imports[0].id.length,71);assert.equal(cache.get('nocturne-cloud-imported:alice'),'true');assert.equal(get('import-tasks').hidden,true);
  const staleSubmit=get('form').onsubmit;dispose();assert.equal(stopped,true);assert.equal(get('list').children.length,0);
  next([{id:'secret',text:'Late private task',done:false}],{fromCache:false});assert.equal(get('list').children.length,0);
  get('input').value='Stale write';staleSubmit({preventDefault(){}});assert.equal(writes,2);
  console.log('PASS: initial loading gate, cache readiness, cloud write, failed-save recovery, deterministic local import, sign-out unsubscribe, and stale account callback rejection.');
})().catch(err=>{console.error(err);process.exitCode=1;});

