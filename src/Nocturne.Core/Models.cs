namespace Nocturne.Core;

public sealed record Account(string Uid, string DisplayName, bool IsAnonymous = false);
public sealed record TodoItem(string Id, string Text, string Category, bool Done, long? CreatedAt = null);
public sealed record CloudSnapshot(long Epoch, TodoItem[] Items, bool FromCache, bool HasPendingWrites = false);
public enum TaskFilter { All, Active, Completed }

public interface ITaskBackend
{
    event Action<CloudSnapshot>? Snapshot;
    event Action<long, string>? Error;
    Task WatchAsync(string uid, long epoch);
    Task StopAsync();
    Task AddAsync(string uid, TodoItem item);
    Task ToggleAsync(string uid, string id, bool done);
    Task DeleteAsync(string uid, string id);
    Task DeleteBatchAsync(string uid, string[] ids);
    Task ImportBatchAsync(string uid, TodoItem[] items);
}
public interface IClientStorage
{
    Task<string?> GetAsync(string key);
    Task SetAsync(string key, string value);
}

public static class AuthMessages
{
    public static string For(string code) => code switch
    {
        "auth/popup-blocked" => "Allow the sign-in popup, then try again.",
        "auth/popup-closed-by-user" => "Sign-in was closed. Try again when you’re ready.",
        "auth/network-request-failed" => "Check your connection and try again.",
        "auth/unauthorized-domain" => "Sign-in is not available at this address yet.",
        "auth/operation-not-allowed" => "This sign-in method is not available yet.",
        "auth/invalid-verification-code" => "That code is incorrect. Please try again.",
        "auth/code-expired" => "The code has expired. Request a new one.",
        "auth/too-many-requests" => "Too many attempts. Please wait before trying again.",
        "auth/account-exists-with-different-credential" => "Use the sign-in method you used to create your account.",
        _ => "Sign-in couldn’t finish. Please try again."
    };
}
