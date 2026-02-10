// auth.js - Authentication module supporting Firebase Auth + offline mode

import {
  initStorage, getIsOnline, getFirebaseAuth,
  setDoc, getDoc, generateId
} from './firebase-config.js';

const USER_SESSION_KEY = 'wordcube_user_session';

let currentUser = null;
let onAuthChangeCallbacks = [];

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
            profile = {
              id: user.uid,
              email: user.email,
              name: user.displayName || 'Player',
              country: 'US',
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
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await updateProfile(cred.user, { displayName });

      const profile = {
        id: cred.user.uid,
        email,
        name: displayName,
        country: 'US',
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
  const profile = {
    id: uid,
    email,
    name: displayName,
    country: 'US',
    code: generateUserCode(),
    avatar: null,
    password: btoa(password), // Simple encoding for offline (NOT secure, for demo only)
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
  if (getIsOnline() && getFirebaseAuth()) {
    try {
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      let profile = await getDoc('users', cred.user.uid);
      if (!profile) {
        profile = {
          id: cred.user.uid,
          email: cred.user.email,
          name: cred.user.displayName || 'Player',
          country: 'US',
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
  const user = existingUsers.find(u => u.email === email && atob(u.password) === password);
  if (!user) {
    return { success: false, error: 'Invalid email or password' };
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
      const { GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(getFirebaseAuth(), provider);
      const additionalInfo = getAdditionalUserInfo(result);
      const isNewUser = additionalInfo ? additionalInfo.isNewUser : false;
      return { success: true, isNewUser };
    } catch (err) {
      return { success: false, error: friendlyError(err.message) };
    }
  }

  return { success: false, error: 'Google sign-in requires Firebase configuration' };
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
        await sendEmailVerification(user);
        return { success: true };
      }
      return { success: false, error: 'No authenticated user' };
    } catch (err) {
      return { success: false, error: friendlyError(err.message) };
    }
  }
  return { success: false, error: 'Email verification requires Firebase configuration (online mode)' };
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

// Session persistence
function saveSession(user) {
  try {
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
  } catch (e) {}
}

function loadSession() {
  try {
    const data = localStorage.getItem(USER_SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

function clearSession() {
  try { localStorage.removeItem(USER_SESSION_KEY); } catch {}
}
