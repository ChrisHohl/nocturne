using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Nocturne.Client;
using Nocturne.Client.Services;
using Nocturne.Core;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddScoped<FirebaseClient>();
builder.Services.AddScoped<TaskSession>(sp => new TaskSession(sp.GetRequiredService<FirebaseClient>(), sp.GetRequiredService<FirebaseClient>()));

await builder.Build().RunAsync();
