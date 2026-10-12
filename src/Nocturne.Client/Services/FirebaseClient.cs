using Microsoft.JSInterop;
using Nocturne.Core;

namespace Nocturne.Client.Services;

public sealed class FirebaseClient(IJSRuntime js, IConfiguration configuration) : ITaskBackend, IClientStorage, IAsyncDisposable
{
    private IJSObjectReference? module;
    private DotNetObjectReference<FirebaseClient>? reference;
    public event Action<CloudSnapshot>? Snapshot;
    public event Action<long, string>? Error;
    public event Func<Account?, Task>? AccountChanged;
    public bool AppleEnabled => configuration.GetValue<bool>("Providers:Apple");
    public bool PhoneEnabled => configuration.GetValue<bool>("Providers:Phone");
    public async Task InitializeAsync()
    {
        module = await js.InvokeAsync<IJSObjectReference>("import", "./js/firebase-bridge.js");
        reference = DotNetObjectReference.Create(this);
        await module.InvokeVoidAsync("initialize", new
        {
            apiKey = configuration["Firebase:ApiKey"], authDomain = configuration["Firebase:AuthDomain"],
            projectId = configuration["Firebase:ProjectId"], appId = configuration["Firebase:AppId"]
        }, reference);
    }
    [JSInvokable] public async Task AuthChanged(Account? user)
    { if (AccountChanged is { } handlers) foreach (Func<Account?, Task> handler in handlers.GetInvocationList()) await handler(user); }
    [JSInvokable] public void TasksChanged(CloudSnapshot snapshot) => Snapshot?.Invoke(snapshot);
    [JSInvokable] public void TasksFailed(long epoch, string code) => Error?.Invoke(epoch, code);
    public Task<string?> SignInAsync(string provider) => module!.InvokeAsync<string?>("signIn", provider).AsTask();
    public Task<string?> SignOutAsync() => module!.InvokeAsync<string?>("signOut").AsTask();
    public Task<string?> SendCodeAsync(string phone) => module!.InvokeAsync<string?>("sendCode", phone).AsTask();
    public Task<string?> VerifyCodeAsync(string code) => module!.InvokeAsync<string?>("verifyCode", code).AsTask();
    public Task ResetPhoneAsync() => module!.InvokeVoidAsync("resetPhone").AsTask();
    public Task WatchAsync(string uid, long epoch) => module!.InvokeVoidAsync("watch", uid, epoch).AsTask();
    public Task StopAsync() => module is null ? Task.CompletedTask : module.InvokeVoidAsync("stop").AsTask();
    public Task AddAsync(string uid, TodoItem item) => module!.InvokeVoidAsync("add", uid, item).AsTask();
    public Task ToggleAsync(string uid, string id, bool done) => module!.InvokeVoidAsync("toggle", uid, id, done).AsTask();
    public Task DeleteAsync(string uid, string id) => module!.InvokeVoidAsync("remove", uid, id).AsTask();
    public Task DeleteBatchAsync(string uid, string[] ids) => module!.InvokeVoidAsync("deleteBatch", uid, ids).AsTask();
    public Task ImportBatchAsync(string uid, TodoItem[] items) => module!.InvokeVoidAsync("importBatch", uid, items).AsTask();
    public Task<string?> GetAsync(string key) => module!.InvokeAsync<string?>("getLocal", key).AsTask();
    public Task SetAsync(string key, string value) => module!.InvokeVoidAsync("setLocal", key, value).AsTask();
    public async ValueTask DisposeAsync()
    {
        if (module is not null) { await module.InvokeVoidAsync("dispose"); await module.DisposeAsync(); }
        reference?.Dispose();
    }
}
