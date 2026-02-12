// auth.js - Authentication module supporting Firebase Auth + offline mode

import {
  initStorage, getIsOnline, getFirebaseAuth,
  setDoc, getDoc, generateId, queryCollection
} from './firebase-config.js';

// ===== Admin Configuration =====
// Fallback admin emails (used when Firestore config is unavailable)
const FALLBACK_ADMIN_EMAILS = ['admin@wordcube.com'];
let adminEmails = [...FALLBACK_ADMIN_EMAILS];

// Load admin emails from Firestore config
async function loadAdminEmails() {
  try {
    const config = await getDoc('config', 'admin');
    if (config && Array.isArray(config.emails) && config.emails.length > 0) {
      adminEmails = config.emails;
    }
  } catch (err) {
    console.warn('[Auth] Failed to load admin config from Firestore, using fallback', err);
  }
}

const USER_SESSION_KEY = 'wordcube_user_session';
const REMEMBER_ME_KEY = 'wordcube_remember_me';

let currentUser = null;
let onAuthChangeCallbacks = [];

// ===== Rate Limiting =====
const rateLimitMap = new Map();
function checkRateLimit(action, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  const key = action;
  if (!rateLimitMap.has(key)) rateLimitMap.set(key, []);
  const attempts = rateLimitMap.get(key).filter(t => now - t < windowMs);
  if (attempts.length >= maxAttempts) {
    return false; // rate limited
  }
  attempts.push(now);
  rateLimitMap.set(key, attempts);
  return true;
}

// ===== Secure Password Hashing (offline mode) =====
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'wordcube_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Map Firebase error codes to user-friendly messages
function friendlyError(firebaseMessage) {
  const code = firebaseMessage.match(/\(([^)]+)\)/)?.[1] || '';
  const map = {
    'auth/email-already-in-use': 'This email is already registered. Please log in or use a different email.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Invalid email or password. Please try again.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
    'auth/account-exists-with-different-credential': 'An account with this email already exists using a different sign-in method.',
    'auth/requires-recent-login': 'Please log in again to perform this action.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
  };
  return map[code] || firebaseMessage.replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?\s*$/, '') || 'An error occurred. Please try again.';
}

// Generate a unique 8-character code for user profile display
function generateUserCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Initialize auth system
export async function initAuth() {
  await initStorage();

  // Load admin emails from Firestore
  await loadAdminEmails();

  // Check for existing session
  const savedSession = loadSession();
  if (savedSession) {
    currentUser = savedSession;
    notifyAuthChange();
  }

  // If Firebase is online, listen for auth state changes
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      onAuthStateChanged(getFirebaseAuth(), async (user) => {
        if (user) {
          // Load or create user profile
          let profile = await getDoc('users', user.uid);
          if (!profile) {
            const country = await detectCountryFromIP();
            profile = {
              id: user.uid,
              email: user.email,
              name: user.displayName || 'Player',
              country,
              code: generateUserCode(),
              avatar: user.photoURL || null,
              createdAt: Date.now()
            };
            await setDoc('users', user.uid, profile);
          }
          currentUser = profile;
          saveSession(currentUser);
          notifyAuthChange();
        } else if (!savedSession) {
          currentUser = null;
          clearSession();
          notifyAuthChange();
        }
      });
    } catch (err) {
      console.warn('[Auth] Failed to set up Firebase auth listener', err);
    }
  }

  return currentUser;
}

// Register with email/password
export async function register(email, password, displayName) {
  if (!checkRateLimit('register', 3, 60000)) {
    return { success: false, error: 'Too many registration attempts. Please wait a minute.' };
  }

  const detectedCountry = await detectCountryFromIP();

  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await updateProfile(cred.user, { displayName });

      const profile = {
        id: cred.user.uid,
        email,
        name: displayName,
        country: detectedCountry,
        code: generateUserCode(),
        avatar: null,
        createdAt: Date.now()
      };
      await setDoc('users', cred.user.uid, profile);
      currentUser = profile;
      saveSession(currentUser);
      notifyAuthChange();
      return { success: true, user: currentUser };
    } catch (err) {
      return { success: false, error: friendlyError(err.message) };
    }
  }

  // Offline registration
  const existingUsers = JSON.parse(localStorage.getItem('wordcube_offline_users') || '[]');
  if (existingUsers.find(u => u.email === email)) {
    return { success: false, error: 'Email already registered' };
  }

  const uid = generateId();
  const hashedPw = await hashPassword(password);
  const profile = {
    id: uid,
    email,
    name: displayName,
    country: detectedCountry,
    code: generateUserCode(),
    avatar: null,
    password: hashedPw,
    createdAt: Date.now()
  };

  existingUsers.push(profile);
  localStorage.setItem('wordcube_offline_users', JSON.stringify(existingUsers));
  await setDoc('users', uid, profile);

  const { password: _, ...safeProfile } = profile;
  currentUser = safeProfile;
  saveSession(currentUser);
  notifyAuthChange();
  return { success: true, user: currentUser };
}

// Login with email/password
export async function login(email, password) {
  if (!checkRateLimit('login', 5, 60000)) {
    return { success: false, error: 'Too many login attempts. Please wait a minute.' };
  }

  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      let profile = await getDoc('users', cred.user.uid);
      if (!profile) {
        const country = await detectCountryFromIP();
        profile = {
          id: cred.user.uid,
          email: cred.user.email,
          name: cred.user.displayName || 'Player',
          country,
          code: generateUserCode(),
          avatar: cred.user.photoURL || null,
          createdAt: Date.now()
        };
        await setDoc('users', cred.user.uid, profile);
      }
      currentUser = profile;
      saveSession(currentUser);
      notifyAuthChange();
      return { success: true, user: currentUser };
    } catch (err) {
      return { success: false, error: friendlyError(err.message) };
    }
  }

  // Offline login
  const existingUsers = JSON.parse(localStorage.getItem('wordcube_offline_users') || '[]');
  const hashedPw = await hashPassword(password);
  // Support both old btoa and new SHA-256 hashed passwords
  const user = existingUsers.find(u => u.email === email && (u.password === hashedPw || (u.password.length < 64 && (() => { try { return atob(u.password) === password; } catch { return false; } })())));
  if (!user) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Migrate old btoa passwords to SHA-256 hash
  if (user.password !== hashedPw) {
    user.password = hashedPw;
    localStorage.setItem('wordcube_offline_users', JSON.stringify(existingUsers));
  }

  const { password: _, ...safeProfile } = user;
  currentUser = safeProfile;
  saveSession(currentUser);
  notifyAuthChange();
  return { success: true, user: currentUser };
}

// Google OAuth login
export async function loginWithGoogle() {
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getAdditionalUserInfo } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const provider = new GoogleAuthProvider();
      try {
        const result = await signInWithPopup(getFirebaseAuth(), provider);
        const additionalInfo = getAdditionalUserInfo(result);
        const isNewUser = additionalInfo ? additionalInfo.isNewUser : false;
        return { success: true, isNewUser };
      } catch (popupErr) {
        // If popup failed (blocked, closed, or COOP issues), fall back to redirect
        const popupCodes = ['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/internal-error'];
        const errCode = popupErr.code || '';
        if (popupCodes.includes(errCode) || popupErr.message?.includes('Cross-Origin')) {
          console.log('[Auth] Popup failed, falling back to redirect');
          await signInWithRedirect(getFirebaseAuth(), provider);
          return { success: true, redirect: true };
        }
        throw popupErr;
      }
    } catch (err) {
      return { success: false, error: friendlyError(err.message || err.code || 'Google sign-in failed') };
    }
  }

  return { success: false, error: 'Google sign-in requires Firebase configuration' };
}

// Handle Google OAuth redirect result (called on page load)
export async function handleGoogleRedirect() {
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { getRedirectResult, getAdditionalUserInfo } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const result = await getRedirectResult(getFirebaseAuth());
      if (result && result.user) {
        const additionalInfo = getAdditionalUserInfo(result);
        const isNewUser = additionalInfo ? additionalInfo.isNewUser : false;
        return { success: true, isNewUser };
      }
    } catch (err) {
      console.warn('[Auth] Redirect result error:', err);
      return { success: false, error: friendlyError(err.message) };
    }
  }
  return { success: false };
}

// Logout
export async function logout() {
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      await signOut(getFirebaseAuth());
    } catch (err) {
      console.warn('[Auth] Firebase signOut error', err);
    }
  }

  currentUser = null;
  clearSession();
  notifyAuthChange();
}

// Delete user account (requires password re-authentication)
export async function deleteAccount(password) {
  if (!currentUser) return { success: false, error: 'Not logged in' };

  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { EmailAuthProvider, reauthenticateWithCredential, deleteUser } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const user = getFirebaseAuth().currentUser;
      if (!user) return { success: false, error: 'No authenticated user' };

      // Re-authenticate before deletion
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      // Delete user data from Firestore
      const userId = currentUser.id;
      try {
        // We can't delete docs from client without knowing IDs,
        // but we can delete the user profile
        await setDoc('users', userId, { deleted: true, deletedAt: Date.now() });
      } catch (err) {
        console.warn('[Auth] Failed to mark user data as deleted', err);
      }

      // Delete Firebase Auth account
      await deleteUser(user);

      // Clear local state
      currentUser = null;
      clearSession();
      localStorage.removeItem(REMEMBER_ME_KEY);
      notifyAuthChange();
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyError(err.message) };
    }
  }

  // Offline deletion
  const existingUsers = JSON.parse(localStorage.getItem('wordcube_offline_users') || '[]');
  const hashedPw = await hashPassword(password);
  const userIdx = existingUsers.findIndex(u => u.id === currentUser.id && u.password === hashedPw);
  if (userIdx === -1) {
    return { success: false, error: 'Incorrect password' };
  }
  existingUsers.splice(userIdx, 1);
  localStorage.setItem('wordcube_offline_users', JSON.stringify(existingUsers));

  currentUser = null;
  clearSession();
  localStorage.removeItem(REMEMBER_ME_KEY);
  notifyAuthChange();
  return { success: true };
}

// Update user profile
export async function updateProfile(updates) {
  if (!currentUser) return { success: false, error: 'Not logged in' };

  currentUser = { ...currentUser, ...updates };
  await setDoc('users', currentUser.id, currentUser);
  saveSession(currentUser);
  notifyAuthChange();
  return { success: true, user: currentUser };
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Send password reset email
export async function sendPasswordReset(email) {
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      await sendPasswordResetEmail(getFirebaseAuth(), email);
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyError(err.message) };
    }
  }
  return { success: false, error: 'Password reset requires Firebase configuration (online mode)' };
}

// Send Firebase email verification to current user
export async function sendVerificationEmail() {
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { sendEmailVerification } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const user = getFirebaseAuth().currentUser;
      if (user) {
        // Use ActionCodeSettings to redirect back to app after verification
        const actionCodeSettings = {
          url: window.location.origin,
          handleCodeInApp: true
        };
        await sendEmailVerification(user, actionCodeSettings);
        return { success: true };
      }
      return { success: false, error: 'No authenticated user' };
    } catch (err) {
      return { success: false, error: friendlyError(err.message) };
    }
  }
  return { success: false, error: 'Email verification requires Firebase configuration (online mode)' };
}

// Apply email verification action code from URL
export async function applyEmailVerificationCode(oobCode) {
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { applyActionCode } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      await applyActionCode(getFirebaseAuth(), oobCode);
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyError(err.message) };
    }
  }
  return { success: false, error: 'Requires online mode' };
}

// Check if current user's email is verified
export function isEmailVerified() {
  if (getIsOnline() && getFirebaseAuth()) {
    const user = getFirebaseAuth().currentUser;
    return user ? user.emailVerified : false;
  }
  return true; // Offline mode: skip verification
}

// Reload current user to refresh emailVerified status
export async function reloadCurrentUser() {
  if (getIsOnline() && getFirebaseAuth()) {
    const user = getFirebaseAuth().currentUser;
    if (user) {
      await user.reload();
      return user.emailVerified;
    }
  }
  return false;
}

// Check if email is already registered
export async function checkEmailExists(email) {
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { fetchSignInMethodsForEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const methods = await fetchSignInMethodsForEmail(getFirebaseAuth(), email);
      return methods.length > 0;
    } catch (err) {
      console.warn('[Auth] Email check failed', err);
      return false;
    }
  }
  // Offline check
  const users = JSON.parse(localStorage.getItem('wordcube_offline_users') || '[]');
  return users.some(u => u.email === email);
}

// Register auth state change callback
export function onAuthChange(callback) {
  onAuthChangeCallbacks.push(callback);
  // Immediately call with current state
  callback(currentUser);
}

function notifyAuthChange() {
  for (const cb of onAuthChangeCallbacks) {
    try { cb(currentUser); } catch (e) { console.error(e); }
  }
}

// Remember-me preference
export function setRememberMe(value) {
  if (value) {
    localStorage.setItem(REMEMBER_ME_KEY, '1');
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
  }
}

export function getRememberMe() {
  return localStorage.getItem(REMEMBER_ME_KEY) === '1';
}

// Session persistence
function saveSession(user) {
  try {
    const data = JSON.stringify(user);
    if (getRememberMe()) {
      localStorage.setItem(USER_SESSION_KEY, data);
    } else {
      sessionStorage.setItem(USER_SESSION_KEY, data);
    }
  } catch (e) {}
}

function loadSession() {
  try {
    // Check both storages — localStorage for remember-me, sessionStorage for session-only
    const localData = localStorage.getItem(USER_SESSION_KEY);
    if (localData) return JSON.parse(localData);
    const sessionData = sessionStorage.getItem(USER_SESSION_KEY);
    if (sessionData) return JSON.parse(sessionData);
    return null;
  } catch { return null; }
}

function clearSession() {
  try {
    localStorage.removeItem(USER_SESSION_KEY);
    sessionStorage.removeItem(USER_SESSION_KEY);
  } catch {}
}

// ===== IP-based Country Detection =====
export async function detectCountryFromIP() {
  // Check cache first
  const cached = localStorage.getItem('wordcube_detected_country');
  if (cached) {
    try {
      const { code, ts } = JSON.parse(cached);
      // Cache for 24h
      if (Date.now() - ts < 86400000 && code) return code;
    } catch {}
  }

  try {
    // Primary API (supports CORS)
    const res = await fetch('https://ipapi.co/country/', { signal: AbortSignal.timeout(5000) });
    const code = (await res.text()).trim();
    if (code.length === 2) {
      localStorage.setItem('wordcube_detected_country', JSON.stringify({ code, ts: Date.now() }));
      return code;
    }
  } catch {
    try {
      // Fallback API
      const res = await fetch('https://api.country.is/', { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      const code = data.country || 'US';
      localStorage.setItem('wordcube_detected_country', JSON.stringify({ code, ts: Date.now() }));
      return code;
    } catch {}
  }
  return 'US';
}

// ===== Admin Check =====
export function isAdmin(user) {
  if (!user) return false;
  return adminEmails.includes(user.email);
}

// ===== Activity Logging =====
export async function logActivity(action, details = {}) {
  const user = getCurrentUser();
  const logEntry = {
    action,
    userId: user?.id || 'anonymous',
    userName: user?.name || 'Anonymous',
    details: JSON.stringify(details).substring(0, 500),
    timestamp: Date.now(),
    date: new Date().toISOString()
  };
  try {
    await setDoc('logs', generateId(), logEntry);
  } catch (err) {
    console.warn('[Auth] Log write failed', err);
  }
}

// ===== Presence System =====
let presenceInterval = null;

export async function startPresence() {
  const user = getCurrentUser();
  if (!user) return;

  const updatePresence = async () => {
    const u = getCurrentUser();
    if (!u) return;
    await setDoc('presence', u.id, {
      userId: u.id,
      userName: u.name || 'Player',
      lastActive: Date.now(),
      status: 'online'
    });
  };

  await updatePresence();
  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = setInterval(updatePresence, 30000); // every 30s
}

export async function stopPresence() {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
  const user = getCurrentUser();
  if (user) {
    await setDoc('presence', user.id, {
      userId: user.id,
      userName: user.name || 'Player',
      lastActive: Date.now(),
      status: 'offline'
    });
  }
}

export async function getOnlineUsers() {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const allPresence = await queryCollection('presence', {
    where: [{ field: 'lastActive', op: '>=', value: fiveMinAgo }],
    orderBy: { field: 'lastActive', direction: 'desc' }
  });
  return allPresence;
}

// ===== Announcements =====
export async function postAnnouncement(title, content) {
  const user = getCurrentUser();
  if (!user || !isAdmin(user)) return { success: false, error: 'Not authorized' };

  await setDoc('announcements', generateId(), {
    title,
    content,
    author: user.name || 'Admin',
    date: new Date().toISOString(),
    timestamp: Date.now(),
    active: true
  });
  return { success: true };
}

export async function getLatestAnnouncement() {
  const announcements = await queryCollection('announcements', {
    where: [{ field: 'active', op: '==', value: true }],
    orderBy: { field: 'timestamp', direction: 'desc' },
    limit: 1
  });
  return announcements.length > 0 ? announcements[0] : null;
}

export async function getActivityLogs(limit = 50) {
  return queryCollection('logs', {
    orderBy: { field: 'timestamp', direction: 'desc' },
    limit
  });
}
