using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Nocturne.Core;

public sealed class TaskSession : IAsyncDisposable
{
    private readonly ITaskBackend backend;
    private readonly IClientStorage storage;
    private long epoch;
    private int pending;
    private bool fromCache = true, serverPending, importing, disposed;
    private readonly HashSet<string> pendingIds = [];
    private List<(string Source, TodoItem Item)> localItems = [];
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    public event Action? Changed;
    public Account? User { get; private set; }
    public IReadOnlyList<TodoItem> Items { get; private set; } = [];
    public bool Ready { get; private set; }
    public string Message { get; private set; } = "";
    public TaskFilter Filter { get; private set; }
    public int Completed => Items.Count(t => t.Done);
    public int Remaining => Items.Count - Completed;
    public int Percent => Items.Count == 0 ? 0 : (int)Math.Round(Completed * 100d / Items.Count, MidpointRounding.AwayFromZero);
    public IEnumerable<TodoItem> Visible => Items.Where(t => Filter == TaskFilter.All || (Filter == TaskFilter.Completed ? t.Done : !t.Done));
    public int ImportCount => localItems.Count;
    public bool CanImport => Ready && !fromCache && !importing && ImportCount > 0;
    public bool CanClear => Ready && pending == 0 && Completed > 0;
    public string SyncStatus => !Ready ? "Connecting to your saved tasks…" : pending > 0 || serverPending
        ? "Saving changes… Keep this tab open until synced." : fromCache
        ? "Offline — reconnect to sync your tasks." : "Synced to your account";

    public TaskSession(ITaskBackend backend, IClientStorage storage)
    {
        this.backend = backend; this.storage = storage;
        backend.Snapshot += Receive; backend.Error += ReceiveError;
    }
    private bool Current(long version) => !disposed && epoch == version && User is not null;
    private void Notify() => Changed?.Invoke();
    public bool IsPending(string id) => pendingIds.Contains(id);
    public void SetFilter(TaskFilter filter) { Filter = filter; Notify(); }

    public async Task SwitchAccountAsync(Account? user)
    {
        var version = ++epoch;
        User = user is { IsAnonymous: false } && !string.IsNullOrWhiteSpace(user.Uid) ? user : null;
        Items = []; Ready = false; pending = 0; pendingIds.Clear(); localItems = [];
        Filter = TaskFilter.All; fromCache = true; serverPending = false; importing = false; Message = ""; Notify();
        await backend.StopAsync();
        if (!Current(version)) return;
        var account = User!;
        await LoadLocalAsync(account, version);
        if (!Current(version)) return;
        try { await backend.WatchAsync(account.Uid, version); }
        catch { if (Current(version)) { Message = "Couldn’t load your tasks. Check your connection and refresh."; Notify(); } }
    }
    private void Receive(CloudSnapshot snapshot)
    {
        if (!Current(snapshot.Epoch)) return;
        Items = snapshot.Items.Where(Valid).OrderBy(t => t.CreatedAt ?? 0).ThenBy(t => t.Id, StringComparer.Ordinal).ToArray();
        fromCache = snapshot.FromCache; serverPending = snapshot.HasPendingWrites;
        if (!fromCache) Ready = true;
        Notify();
    }
    private void ReceiveError(long version, string code)
    {
        if (!Current(version)) return;
        Ready = false; Message = code == "permission-denied" ? "Please sign in again to access your saved tasks." : "Couldn’t load your tasks. Check your connection and refresh."; Notify();
    }
    private static bool Valid(TodoItem item) => !string.IsNullOrWhiteSpace(item.Id) && item.Id.Length <= 128
        && !string.IsNullOrWhiteSpace(item.Text) && item.Text.Length <= 240 && item.Category is "Work" or "Personal";
    private async Task<bool> MutateAsync(Func<string, Task> operation, string? id = null)
    {
        if (User is null || !Ready || (id is not null && pendingIds.Contains(id))) return false;
        var version = epoch; var uid = User.Uid;
        pending++; if (id is not null) pendingIds.Add(id); Message = ""; Notify();
        try { await operation(uid); return Current(version); }
        catch { if (Current(version)) Message = "Couldn’t save the change. Check your connection and try again."; return false; }
        finally { if (Current(version)) { pending--; if (id is not null) pendingIds.Remove(id); Notify(); } }
    }
    public Task<bool> AddAsync(string text, string category)
    {
        text = text.Trim();
        if (text.Length is < 1 or > 240 || category is not ("Work" or "Personal")) return Task.FromResult(false);
        var task = new TodoItem(Guid.NewGuid().ToString(), text, category, false);
        Filter = TaskFilter.All;
        return MutateAsync(uid => backend.AddAsync(uid, task), task.Id);
    }
    public Task<bool> ToggleAsync(TodoItem item, bool done) => MutateAsync(uid => backend.ToggleAsync(uid, item.Id, done), item.Id);
    public Task<bool> DeleteAsync(TodoItem item) => MutateAsync(uid => backend.DeleteAsync(uid, item.Id), item.Id);
    public Task<bool> ClearAsync() => !CanClear ? Task.FromResult(false) : MutateAsync(async uid =>
    {
        var version = epoch;
        foreach (var chunk in Items.Where(t => t.Done).Select(t => t.Id).ToArray().Chunk(400))
        { if (!Current(version)) return; await backend.DeleteBatchAsync(uid, chunk); }
    });
    private async Task LoadLocalAsync(Account account, long version)
    {
        try
        {
            var keys = new List<string>();
            if (await storage.GetAsync("nocturne-cloud-imported:" + account.Uid) is null) keys.Add("nocturne-todos-v2:" + account.Uid);
            if (await storage.GetAsync("nocturne-legacy-imported") is null) keys.Add("nocturne-todos-v1");
            var found = new List<(string, TodoItem)>();
            foreach (var key in keys)
            {
                var raw = await storage.GetAsync(key);
                if (raw is null) continue;
                try
                {
                    using var document = JsonDocument.Parse(raw);
                    if (document.RootElement.ValueKind != JsonValueKind.Array) continue;
                    foreach (var entry in document.RootElement.EnumerateArray())
                    {
                        try
                        {
                            if (!entry.TryGetProperty("done", out var done) || done.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) continue;
                            var item = entry.Deserialize<TodoItem>(Json);
                            if (item is null) continue;
                            item = item with { Category = item.Category == "Work" ? "Work" : "Personal" };
                            if (Valid(item)) found.Add((key, item));
                        }
                        catch (JsonException) { }
                    }
                }
                catch (JsonException) { }
            }
            if (Current(version)) { localItems = found; Notify(); }
        }
        catch { /* Browser storage is optional; the cloud list still works. */ }
    }
    public static string ImportId(string source, string id) => "import-" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(source + ":" + id)));
    public async Task ImportAsync()
    {
        if (!CanImport || User is null) return;
        var version = epoch; var account = User; var copy = localItems.ToArray(); importing = true; Notify();
        var saved = await MutateAsync(async uid =>
        {
            var items = copy.Select(pair => pair.Item with { Id = ImportId(pair.Source, pair.Item.Id) }).ToArray();
            foreach (var chunk in items.Chunk(100))
            { if (!Current(version)) return; await backend.ImportBatchAsync(uid, chunk); }
        });
        if (saved && Current(version))
        {
            try { await storage.SetAsync("nocturne-cloud-imported:" + account.Uid, "true"); if (copy.Any(p => p.Source == "nocturne-todos-v1")) await storage.SetAsync("nocturne-legacy-imported", account.Uid); } catch { }
            if (Current(version)) { localItems = []; Message = "Saved tasks imported to your account."; }
        }
        if (Current(version)) { importing = false; Notify(); }
    }
    public async ValueTask DisposeAsync()
    {
        disposed = true; ++epoch; backend.Snapshot -= Receive; backend.Error -= ReceiveError;
        await backend.StopAsync(); User = null; Items = []; localItems.Clear();
    }
}
