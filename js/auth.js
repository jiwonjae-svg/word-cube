// auth.js - Authentication module supporting Firebase Auth + offline mode

import {
  initStorage, getIsOnline, getFirebaseAuth,
  setDoc, getDoc, generateId
} from './firebase-config.js';

const USER_SESSION_KEY = 'wordcube_user_session';

let currentUser = null;
let onAuthChangeCallbacks = [];

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
      return { success: false, error: err.message };
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
      return { success: false, error: err.message };
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
      const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(getFirebaseAuth(), provider);
      // Profile will be handled by auth state listener
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
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
