# Nocturne

Nocturne is a .NET 10 Blazor WebAssembly app. C# and Razor handle the interface, task state, filtering, validation, progress, account separation, and local-task import. The small JavaScript bridge in `src/Nocturne.Client/wwwroot/js/firebase-bridge.js` is limited to Firebase's browser SDK and browser storage. Google sign-in and realtime task sync retain the existing Firebase project and data format.

## Build and publish

Install the .NET 10 SDK, then run:

```text
dotnet run --project tests/Nocturne.Core.Tests/Nocturne.Core.Tests.csproj
dotnet run --project src/Nocturne.Client/Nocturne.Client.csproj
dotnet publish src/Nocturne.Client/Nocturne.Client.csproj -c Release -o artifacts/site
```

GitHub Pages uses the GitHub Actions source. `.github/workflows/pages.yml` tests the C# core, builds the app, sets the `/nocturne/` base path, and publishes `artifacts/site/wwwroot`. C# source remains in the repository; the browser runs compiled .NET WebAssembly. The initial download is larger than the former plain JavaScript app.

## Configuration

Firebase project: `nocturne-e4a34`. Public web app identifiers are in `src/Nocturne.Client/wwwroot/appsettings.json`. Do not publish service-account or provider private keys.

Google sign-in is configured in `firebase.json`. Deploy authentication configuration with `npx -y firebase-tools@latest deploy --only auth --project nocturne-e4a34 --config firebase.json`. The domain `chrishohl.github.io` remains configured in Firebase Authentication's Authorized domains settings.

## Storage and security scope

Tasks are stored in Cloud Firestore at `users/{uid}/tasks/{taskId}`. Signing in with the same Google account on another device loads the same list. Realtime listeners keep additions, completion changes, and deletions synchronized. Each task is a separate document, so changes on another device do not replace an entire task list.

Firestore Security Rules allow only the authenticated owner to read or write their task path, reject anonymous access, validate text/type/category/field limits, and protect creation timestamps. The database uses Standard edition in `us-central1`. Deploy its rules/indexes before publishing app changes with `npx -y firebase-tools@latest deploy --only firestore --project nocturne-e4a34 --config firebase.json`.

Saved tasks from the previous browser-local versions can be imported with the in-app import button after signing in. Import uses deterministic IDs and transactions to skip existing cloud documents. It preserves original local data and does not silently assign unsigned tasks to an account. Import markers hide already-imported local lists.

The web client uses memory caching. If connectivity drops after loading, writes may wait until reconnection; keep the tab open until the status says "Synced to your account." Pending writes are not guaranteed to survive closing the tab. Signing out unsubscribes listeners and clears the rendered task list.

## Optional providers

Apple: configure an Apple Services ID, signing key, Team ID, and Firebase callback URL in the provider consoles. Keep Apple private keys out of this repository. Set `Providers:Apple` to true in `appsettings.json` only after setup.

Phone: enable Firebase phone authentication, configure SMS billing/regions and abuse limits, then set `Providers:Phone` to true. The client verifies a code through Firebase and requires reCAPTCHA. Phone numbers are sent to Google for abuse prevention, disclosed before sending a code.

## Verification

Emulator tests cover two-device realtime add/complete/delete, simultaneous additions, idempotent import, account isolation, anonymous/unauthenticated denial, and schema/timestamp validation. UI lifecycle checks cover loading, rejected-write recovery, import, and sign-out cleanup. Production rules are compiled before deployment. These tests do not replace review before broader public use.

Run validation with `npm install`, `npm run test:ui`, and `npm test`. The cloud integration tests use a demo project in the local Firestore emulator and never write to production. Java 21 or newer is required for the emulator.
