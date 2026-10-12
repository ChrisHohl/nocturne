import { firebaseConfig, enabledProviders } from './auth-config.js';
import { startTasks } from './tasks.js';

const $ = id => document.getElementById(id);
let auth, sdk, disposeTasks, verifier, confirmation, busy = false;
const status = message => { $('auth-status').textContent = message; };
function setBusy(value) {
  busy = value;
  ['google-sign-in', 'apple-sign-in', 'phone-sign-in', 'send-code', 'verify-code', 'change-number'].forEach(id => { $(id).disabled = value || !auth; });
}
function resetPhone() {
  confirmation = null;
  $('phone-form').hidden = true;
  $('code-form').hidden = true;
  $('phone-number').value = '';
  $('verification-code').value = '';
  if (verifier) { verifier.clear(); verifier = null; }
}
function messageFor(error) {
  const messages = {
    'auth/popup-blocked': 'Allow the sign-in popup, then try again.',
    'auth/popup-closed-by-user': 'Sign-in was closed. Try again when you’re ready.',
    'auth/cancelled-popup-request': 'Another sign-in window is already open.',
    'auth/network-request-failed': 'Check your connection and try again.',
    'auth/invalid-verification-code': 'That code is incorrect. Please try again.',
    'auth/code-expired': 'The code has expired. Request a new one.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
    'auth/invalid-phone-number': 'Enter a phone number with its country code, such as +15551234567.',
    'auth/unauthorized-domain': 'Sign-in is not available at this address yet. Please contact the app owner.',
    'auth/operation-not-allowed': 'This sign-in method is not available yet.',
    'auth/account-exists-with-different-credential': 'Use the sign-in method you used when you created your account.',
    'auth/quota-exceeded': 'Phone sign-in is temporarily unavailable. Try another sign-in method.'
  };
  return messages[error?.code] || 'Sign-in couldn’t finish. Please try again.';
}
async function social(provider) {
  if (!auth || busy) return;
  setBusy(true); status('Opening secure sign-in…');
  try { await sdk.signInWithPopup(auth, provider); }
  catch (error) { status(messageFor(error)); }
  finally { setBusy(false); }
}
$('google-sign-in').onclick = () => { if (sdk && enabledProviders.google) social(new sdk.GoogleAuthProvider()); };
$('apple-sign-in').onclick = () => {
  if (!sdk || !enabledProviders.apple) return;
  const provider = new sdk.OAuthProvider('apple.com');
  provider.addScope('email'); provider.addScope('name'); social(provider);
};
$('phone-sign-in').onclick = () => {
  if (!auth || busy || !enabledProviders.phone) return;
  resetPhone(); $('phone-form').hidden = false; $('phone-number').focus(); status('Enter your phone number to receive a verification code.');
};
$('change-number').onclick = () => { if (!busy) $('phone-sign-in').click(); };
$('phone-form').onsubmit = async event => {
  event.preventDefault();
  if (!auth || busy || !enabledProviders.phone) return;
  const phone = $('phone-number').value.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) { status('Include your country code, such as +15551234567.'); return; }
  setBusy(true); status('Complete the security check to receive your code.');
  try {
    if (verifier) verifier.clear();
    verifier = new sdk.RecaptchaVerifier(auth, 'recaptcha', { size: 'normal' });
    confirmation = await sdk.signInWithPhoneNumber(auth, phone, verifier);
    $('phone-form').hidden = true; $('code-form').hidden = false;
    $('verification-code').focus(); status('Code sent. Enter the six-digit code.');
  } catch (error) {
    status(messageFor(error));
    if (verifier) { verifier.clear(); verifier = null; }
  } finally { setBusy(false); }
};
$('code-form').onsubmit = async event => {
  event.preventDefault(); if (!confirmation || busy) return;
  const code = $('verification-code').value.trim();
  if (!/^\d{6}$/.test(code)) { status('Enter the six-digit verification code.'); return; }
  setBusy(true); status('Verifying your code…');
  try { await confirmation.confirm(code); }
  catch (error) { status(messageFor(error)); }
  finally { setBusy(false); }
};
$('sign-out').onclick = async () => {
  if (!auth) return;
  $('sign-out').disabled = true;
  try { await sdk.signOut(auth); }
  catch { $('status').textContent = 'Sign-out couldn’t finish. Check your connection and try again.'; }
  finally { $('sign-out').disabled = false; }
};
async function initialize() {
  if (!firebaseConfig?.apiKey || !firebaseConfig?.authDomain || !firebaseConfig?.projectId) {
    status('Sign-in is being set up. Please check back soon.'); return;
  }
  try {
    const [appSdk, authSdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js')
    ]);
    sdk = authSdk; auth = sdk.getAuth(appSdk.initializeApp(firebaseConfig));
    auth.useDeviceLanguage();
    await sdk.setPersistence(auth, sdk.browserLocalPersistence);
    $('google-sign-in').hidden = !enabledProviders.google;
    $('apple-sign-in').hidden = !enabledProviders.apple;
    $('phone-sign-in').hidden = !enabledProviders.phone;
    sdk.onAuthStateChanged(auth, user => {
      if (disposeTasks) { disposeTasks(); disposeTasks = null; }
      $('task-app').hidden = true;
      $('account').hidden = true;
      $('auth-screen').hidden = false;
      $('tagline').hidden = false;
      resetPhone();
      if (user && !user.isAnonymous) {
        disposeTasks = startTasks(user);
        $('account-name').textContent = user.displayName || user.email || user.phoneNumber || 'Your account';
        $('auth-screen').hidden = true; $('tagline').hidden = true;
        $('task-app').hidden = false; $('account').hidden = false;
      } else { status('Choose a sign-in method to continue.'); }
      setBusy(false);
    }, () => { status('Sign-in is unavailable. Refresh the page to try again.'); });
  } catch { status('Sign-in is unavailable. Check your connection and refresh the page.'); }
}
initialize();
