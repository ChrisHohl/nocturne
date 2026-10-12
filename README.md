# Nocturne

Nocturne uses Firebase Authentication to require sign-in before showing task controls. Google is the first enabled provider; Apple and phone flows are implemented but hidden until configured.

## Activation

1. Create a Firebase project on the free Spark plan and register a web app.
2. Enable Google under Authentication → Sign-in method, with a project support email.
3. Add `chrishohl.github.io` to Authentication → Settings → Authorized domains.
4. Replace `firebaseConfig = null` in `auth-config.js` with the public web app configuration from Firebase. Do not publish private credentials.
5. Publish these files together to `main`. GitHub Pages serves the root directory.

This branch intentionally leaves the Firebase config unset until provisioning succeeds. Do not merge it as a working sign-in release before configuring and testing Google sign-in.

## Storage and security scope

Task data remains in browser local storage, separated by Firebase user ID. Signing out hides the app and clears the in-memory task list. Existing unsigned tasks at `nocturne-todos-v1` are preserved and are not silently assigned to an account.

This is real identity verification with an application UI gate. GitHub Pages still serves public static files, and local storage is not encrypted or protected from someone controlling the same browser. If tasks later move to a cloud database, enforce per-user access in database security rules before deploying it; hiding the UI alone cannot secure a backend.

## Optional providers

Apple: configure an Apple Services ID, signing key, Team ID, and Firebase callback URL in the provider consoles. Keep Apple private keys out of this repository. Set `enabledProviders.apple = true` only after setup.

Phone: enable Firebase phone authentication, configure SMS billing/regions and abuse limits, then set `enabledProviders.phone = true`. The client verifies a code through Firebase and requires reCAPTCHA; it does not use a local fake code. Phone numbers are sent to Google for abuse prevention, disclosed before sending a code.

## Verification

Checks cover JavaScript syntax, account storage isolation, sign-out cleanup, stale submission rejection, preservation of unsigned task data, and refusal to show task controls when Firebase configuration is missing. Live Google sign-in requires a configured Firebase project and an interactive provider test.
