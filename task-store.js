// Independent task documents avoid overwriting another device's entire list.
export function createTaskStore(db, sdk, uid) {
  const tasks = sdk.collection(db, 'users', uid, 'tasks');
  const ref = id => sdk.doc(tasks, id);
  const stamp = () => sdk.serverTimestamp();
  return {
    listen(next, error) {
      return sdk.onSnapshot(tasks, { includeMetadataChanges: true }, snapshot => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        items.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0) || a.id.localeCompare(b.id));
        next(items, snapshot.metadata);
      }, error);
    },
    add(task) { return sdk.setDoc(ref(task.id), {text:task.text, category:task.category, done:false, createdAt:stamp(), updatedAt:stamp()}); },
    toggle(id, done) { return sdk.updateDoc(ref(id), {done, updatedAt:stamp()}); },
    remove(id) { return sdk.deleteDoc(ref(id)); },
    async clear(ids) {
      for (let offset=0;offset<ids.length;offset+=400) {
        const batch=sdk.writeBatch(db);
        ids.slice(offset,offset+400).forEach(id=>batch.delete(ref(id)));
        await batch.commit();
      }
    },
    async importTasks(items) {
      // Import only missing documents. Retrying never overwrites a newer cloud task.
      for (let offset=0;offset<items.length;offset+=100) {
        const part=items.slice(offset,offset+100);
        await sdk.runTransaction(db, async transaction => {
          const existing=await Promise.all(part.map(item=>transaction.get(ref(item.id))));
          part.forEach((item,index)=>{
            if (!existing[index].exists()) transaction.set(ref(item.id), {
              text:item.text, category:item.category, done:item.done, createdAt:stamp(), updatedAt:stamp()
            });
          });
        });
      }
    }
  };
}
