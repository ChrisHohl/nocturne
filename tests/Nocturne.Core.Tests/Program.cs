using Nocturne.Core;

static void Check(bool value, string message) { if (!value) throw new Exception(message); }
var cloud = new FakeCloud(); var storage = new MemoryStorage();
storage.Values["nocturne-todos-v2:alice"] = "[{\"id\":\"local\",\"text\":\"Saved task\",\"category\":\"Work\",\"done\":false}]";
await using var session = new TaskSession(cloud, storage);
await session.SwitchAccountAsync(new("alice", "Alice"));
Check(!session.Ready && !await session.AddAsync("Before load", "Personal"), "Initial load gate failed");
cloud.Emit([], true); Check(!session.Ready, "Empty cache unlocked tasks");
cloud.Emit([], false); Check(session.Ready, "Server snapshot did not unlock tasks");
Check(!await session.AddAsync(" ","Personal") && !await session.AddAsync(new('x',241),"Personal") && !await session.AddAsync("Task","Admin"), "Validation failed");
Check(await session.AddAsync("  A task  ","Personal"), "Add failed");
Check(cloud.Added!.Text == "A task", "Whitespace not normalized");
cloud.Emit([new("a","A","Personal",false,200),new("b","B","Work",true,100)], false);
Check(session.Items[0].Id == "b" && session.Completed == 1 && session.Percent == 50, "Sorting or stats failed");
session.SetFilter(TaskFilter.Active);Check(session.Visible.Single().Id=="a", "Active filter failed");
session.SetFilter(TaskFilter.Completed);Check(session.Visible.Single().Id=="b", "Completed filter failed");
Check(session.ImportCount == 1 && session.CanImport, "Import offer missing");
await session.ImportAsync();Check(cloud.Imported.Single().Id == TaskSession.ImportId("nocturne-todos-v2:alice","local"), "Import identity changed");
Check(session.ImportCount==0 && storage.Values.ContainsKey("nocturne-cloud-imported:alice"), "Import marker missing");
var expectedHash = "import-" + Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("nocturne-todos-v2:alice:local")));
Check(TaskSession.ImportId("nocturne-todos-v2:alice","local") == expectedHash, "JS migration identity is incompatible");
var oldEpoch=cloud.Epoch;
cloud.Hold=new(TaskCreationOptions.RunContinuationsAsynchronously);
var pending=session.AddAsync("Pending Alice task","Work");Check(session.SyncStatus.Contains("Saving"), "Pending status missing");
await session.SwitchAccountAsync(new("bob","Bob"));cloud.Emit([],false);
cloud.Hold.SetResult();await pending;cloud.Hold=null;
Check(session.User!.Uid=="bob" && session.SyncStatus.StartsWith("Synced"), "Old mutation corrupted new session");
cloud.EmitAt(oldEpoch,[new("secret","Alice secret","Work",false)]);
Check(session.Items.Count==0,"Late old-user snapshot leaked tasks");
await session.SwitchAccountAsync(new("anon","Guest",true));Check(session.User is null,"Anonymous user unlocked tasks");
await session.SwitchAccountAsync(null);Check(session.Items.Count==0 && !session.Ready,"Sign-out cleanup failed");
Console.WriteLine("PASS: C# validation, filtering, stats, deterministic import, loading/cache state, pending saves, account switching, late callback rejection, anonymous gate and sign-out.");

sealed class MemoryStorage : IClientStorage {
    public Dictionary<string,string> Values {get;}=[];
    public Task<string?> GetAsync(string key)=>Task.FromResult(Values.GetValueOrDefault(key));
    public Task SetAsync(string key,string value){Values[key]=value;return Task.CompletedTask;}
}
sealed class FakeCloud : ITaskBackend {
    public event Action<CloudSnapshot>? Snapshot;
    public event Action<long,string>? Error {add{} remove{}}
    public long Epoch; public TodoItem? Added; public List<TodoItem> Imported=[]; public TaskCompletionSource? Hold;
    public void Emit(TodoItem[] items,bool cache)=>Snapshot?.Invoke(new(Epoch,items,cache));
    public void EmitAt(long epoch,TodoItem[] items)=>Snapshot?.Invoke(new(epoch,items,false));
    public Task WatchAsync(string uid,long epoch){Epoch=epoch;return Task.CompletedTask;}
    public Task StopAsync()=>Task.CompletedTask;
    public async Task AddAsync(string uid,TodoItem item){Added=item;if(Hold is not null)await Hold.Task;}
    public Task ToggleAsync(string uid,string id,bool done)=>Task.CompletedTask;
    public Task DeleteAsync(string uid,string id)=>Task.CompletedTask;
    public Task DeleteBatchAsync(string uid,string[] ids)=>Task.CompletedTask;
    public Task ImportBatchAsync(string uid,TodoItem[] items){Imported.AddRange(items);return Task.CompletedTask;}
}
