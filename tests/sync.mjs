import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
sdk.setLogLevel('silent');
const source=fs.readFileSync(new URL('../task-store.js',import.meta.url),'utf8');
const {createTaskStore}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env=await initializeTestEnvironment({projectId:'demo-nocturne',firestore:{host:'127.0.0.1',port:8087,rules:fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
const claims={firebase:{sign_in_provider:'google.com'}};
const a1=env.authenticatedContext('alice',claims).firestore();
const a2=env.authenticatedContext('alice',claims).firestore();
const b=env.authenticatedContext('bob',claims).firestore();
const guest=env.unauthenticatedContext().firestore();
const anon=env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).firestore();
const store1=createTaskStore(a1,sdk,'alice'),store2=createTaskStore(a2,sdk,'alice');
let seen=[];const stop=store2.listen(items=>{seen=items;},error=>{throw error;});
const waitFor=async predicate=>{const started=Date.now();while(!predicate()){if(Date.now()-started>10000)throw new Error('Realtime sync timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
const alicePath='users/alice/tasks/first';
const valid={text:'Private task',category:'Personal',done:false,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()};
try {
  await assertFails(sdk.getDocs(sdk.collection(guest,'users','alice','tasks')));
  await assertFails(sdk.setDoc(sdk.doc(guest,alicePath),valid));
  await assertFails(sdk.setDoc(sdk.doc(anon,'users/anon/tasks/test'),valid));
  await store1.add({id:'first',text:'Private task',category:'Personal'});
  await waitFor(()=>seen.some(t=>t.id==='first'));
  assert.equal(seen[0].text,'Private task');
  await assertFails(sdk.getDoc(sdk.doc(b,alicePath)));
  await assertFails(sdk.getDocs(sdk.collection(b,'users','alice','tasks')));
  await assertFails(sdk.setDoc(sdk.doc(b,alicePath),valid));
  await assertFails(sdk.updateDoc(sdk.doc(b,alicePath),{done:true,updatedAt:sdk.serverTimestamp()}));
  await assertFails(sdk.deleteDoc(sdk.doc(b,alicePath)));
  const invalids=[{text:'x'.repeat(241)},{text:42},{done:'yes'},{category:'Admin'},{ownerId:'bob'},{isAdmin:true},{extraData:'pollution'},{createdAt:sdk.Timestamp.fromMillis(1)},{updatedAt:sdk.Timestamp.fromMillis(1)}];
  for(const change of invalids){
    await assertFails(sdk.setDoc(sdk.doc(a1,'users/alice/tasks/invalid'),{...valid,...change}));
    await assertFails(sdk.updateDoc(sdk.doc(a1,alicePath),{...change,updatedAt:change.updatedAt||sdk.serverTimestamp()}));
  }
  await assertFails(sdk.setDoc(sdk.doc(a1,'users/alice/tasks/missing'),{text:'Missing fields'}));
  await assertFails(sdk.setDoc(sdk.doc(a1,alicePath),{text:'Missing fields'}));
  await assertFails(sdk.setDoc(sdk.doc(a1,'users/alice/tasks/test/nested/private'),valid));
  await assertFails(sdk.getDoc(sdk.doc(a1,'users/bob')));
  await assertFails(sdk.getDocs(sdk.collectionGroup(a1,'tasks')));
  await assertFails(sdk.setDoc(sdk.doc(a1,'users/alice/tasks/'+ 'x'.repeat(129)),valid));
  await store2.toggle('first',true);await waitFor(()=>seen.some(t=>t.id==='first'&&t.done));
  await store1.toggle('first',false);await waitFor(()=>seen.some(t=>t.id==='first'&&!t.done));
  await store2.toggle('first',true);await waitFor(()=>seen.some(t=>t.id==='first'&&t.done));
  await Promise.all([store1.add({id:'left',text:'Device 1',category:'Work'}),store2.add({id:'right',text:'Device 2',category:'Personal'})]);
  await waitFor(()=>seen.length===3);
  await store1.importTasks([{id:'imported',text:'Local task',category:'Personal',done:false}]);
  await store2.toggle('imported',true);
  await store1.importTasks([{id:'imported',text:'Outdated local task',category:'Personal',done:false}]);
  const imported=(await sdk.getDoc(sdk.doc(a1,'users/alice/tasks/imported'))).data();
  assert.equal(imported.text,'Local task');assert.equal(imported.done,true);
  await store2.clear(['first','imported']);await waitFor(()=>seen.length===2);
  await store1.remove('left');await waitFor(()=>seen.length===1&&seen[0].id==='right');
  assert.equal((await sdk.getDocs(sdk.collection(b,'users','bob','tasks'))).size,0);
  console.log('PASS: realtime cross-device add/complete/delete, concurrent adds, idempotent import, account isolation, anonymous denial, schema/types/sizes, immutable timestamps, and nested path denial.');
} finally {stop();await env.cleanup();}

