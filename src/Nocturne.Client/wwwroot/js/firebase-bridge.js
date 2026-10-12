// Browser-only boundary: Firebase SDK calls and localStorage access.
// Rendering, filtering, validation, migration policy and state live in C#.
let auth, authSdk, cloudSdk, db, sink, stopAuth, stopTasks, verifier, confirmation, transport;
const notify = (method, ...args) => sink?.invokeMethodAsync(method, ...args).catch(() => {});
export function createTaskTransport(db, sdk) {
  const collection = uid => sdk.collection(db, 'users', uid, 'tasks');
  const ref = (uid, id) => sdk.doc(collection(uid), id);
  const stamp = () => sdk.serverTimestamp();
  const data = item => ({text:item.text, category:item.category, done:item.done, createdAt:stamp(), updatedAt:stamp()});
  return {
    listen(uid, next, error) {
      return sdk.onSnapshot(collection(uid), {includeMetadataChanges:true}, snapshot => next(
        snapshot.docs.map(doc => ({id:doc.id, text:doc.data().text, category:doc.data().category, done:doc.data().done, createdAt:doc.data().createdAt?.toMillis() ?? null})),
        snapshot.metadata), error);
    },
    add: (uid,item) => sdk.setDoc(ref(uid,item.id),data(item)),
    toggle: (uid,id,done) => sdk.updateDoc(ref(uid,id),{done,updatedAt:stamp()}),
    remove: (uid,id) => sdk.deleteDoc(ref(uid,id)),
    deleteBatch(uid,ids) {const batch=sdk.writeBatch(db);ids.forEach(id=>batch.delete(ref(uid,id)));return batch.commit();},
    importBatch(uid,items) {
      return sdk.runTransaction(db,async transaction=>{
        const existing=await Promise.all(items.map(item=>transaction.get(ref(uid,item.id))));
        items.forEach((item,index)=>{if(!existing[index].exists())transaction.set(ref(uid,item.id),data(item));});
      });
    }
  };
}
export async function initialize(config, receiver) {
  const [app,identity,cloud]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js')
  ]);
  sink=receiver;authSdk=identity;cloudSdk=cloud;
  const firebase=app.initializeApp(config);auth=identity.getAuth(firebase);db=cloud.getFirestore(firebase);
  auth.useDeviceLanguage();await identity.setPersistence(auth,identity.browserLocalPersistence);
  transport=createTaskTransport(db,cloud);
  stopAuth=identity.onAuthStateChanged(auth,user=>notify('AuthChanged',user?{uid:user.uid,displayName:user.displayName||user.email||user.phoneNumber||'Your account',isAnonymous:user.isAnonymous}:null));
}
const authCall=async operation=>{try{await operation();return null;}catch(error){return error.code||'auth/unknown';}};
export function signIn(provider) {
  const identity=provider==='apple'?new authSdk.OAuthProvider('apple.com'):new authSdk.GoogleAuthProvider();
  if(provider==='apple'){identity.addScope('email');identity.addScope('name');}
  return authCall(()=>authSdk.signInWithPopup(auth,identity));
}
export const signOut=()=>authCall(()=>authSdk.signOut(auth));
export function resetPhone(){confirmation=null;if(verifier){verifier.clear();verifier=null;}}
export function sendCode(phone){return authCall(async()=>{resetPhone();verifier=new authSdk.RecaptchaVerifier(auth,'recaptcha',{size:'normal'});confirmation=await authSdk.signInWithPhoneNumber(auth,phone,verifier);});}
export function verifyCode(code){return authCall(()=>confirmation.confirm(code));}
export function stop(){if(stopTasks){stopTasks();stopTasks=null;}}
const check=uid=>{if(!auth.currentUser||auth.currentUser.isAnonymous||auth.currentUser.uid!==uid)throw new Error('Session changed');};
export function watch(uid,epoch){stop();check(uid);stopTasks=transport.listen(uid,(items,metadata)=>notify('TasksChanged',{epoch,items,fromCache:metadata.fromCache,hasPendingWrites:metadata.hasPendingWrites}),error=>notify('TasksFailed',epoch,error.code));}
export function add(uid,item){check(uid);return transport.add(uid,item);}
export function toggle(uid,id,done){check(uid);return transport.toggle(uid,id,done);}
export function remove(uid,id){check(uid);return transport.remove(uid,id);}
export function deleteBatch(uid,ids){check(uid);return transport.deleteBatch(uid,ids);}
export function importBatch(uid,items){check(uid);return transport.importBatch(uid,items);}
export const getLocal=key=>localStorage.getItem(key);
export const setLocal=(key,value)=>localStorage.setItem(key,value);
export function dispose(){stop();resetPhone();stopAuth?.();sink=null;}
